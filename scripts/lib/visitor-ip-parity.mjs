#!/usr/bin/env node
/**
 * **방문자 IP 선언 검사** — 서버에서 IP 를 보는 API 를 부르면서 `clientIp` 를 안 넘긴 자리를 잡는다.
 *
 * ## 왜 배선 동일성(`wiring-parity.mjs`)으로는 못 잡나
 *
 * 그쪽은 **바이트 잠금**이다 — "전 팩에 같은 파일이 같은 sha 로 있어야 한다". 그래서 잠글 수 있는 것은
 * 전송층처럼 **디자인이 0인 파일**뿐이고, `src/app/orders/[orderNo]/page.tsx` 같은 **얼굴**은 팩마다
 * 갈리는 것이 정상이라 목록에 못 넣는다.
 *
 * 그런데 그 얼굴 안에 **안전 배선 한 줄**이 산다. 2026-08-10 에 정확히 그 사각에서 결함이 나왔다:
 * `@zalkera/client` 0.20.0 승급이 주문 계열에 방문자 IP 선언을 요구했는데 skeleton 의 주문 상세
 * **페이지 한 벌**만 빠졌고, 배선 동일성도 CI 도 초록이었다(그 파일은 잠금 밖이라). **팩은 회수가
 * 불가능**하므로 그 소스로 개시한 사이트는 영구히 그 상태다.
 *
 * ## 무엇을 재나 — 바이트가 아니라 **선언의 존재**
 *
 * IP 민감 호출([IP_SENSITIVE])이 있는 파일에는 `clientIp` 가 있어야 한다. 얼굴은 갈려도 되고,
 * **선언은 갈리면 안 된다**. 그래서 sha 대조가 아니라 "그 파일 안에 선언이 있는가"만 본다.
 *
 * 왜 파일 단위인가: 호출과 선언이 같은 줄에 있지 않다(보통 `access` 객체를 위에서 만들고 아래에서
 * 넘긴다). 문장 단위로 좁히면 정상 코드가 걸리고, 그러면 검사기를 끄게 된다 — 끄이는 검사기는 없는
 * 검사기보다 나쁘다.
 *
 * ## 왜 첫 홉을 직접 쓰면 안 되나
 *
 * `visitorIp()` 를 안 쓰고 `x-forwarded-for` 첫 항목을 손으로 뽑는 코드도 잡는다 — 첫 엔트리는
 * **방문자가 위조할 수 있다**(client 문서가 명시). 선언이 있는 척하면서 값이 거짓이면 IP 축 방어는
 * 없느니만 못하다(로그·rate-limit 이 공격자가 고른 값을 믿는다).
 */
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 서버에서 부르면 **백엔드가 보는 IP 가 방문자가 아니라 그 서버가 되는** 호출들.
 *
 * 근거는 `@zalkera/client` 의 d.ts 주석("서버 사이드에서 부를 때는 RequestContext.clientIp 로…").
 * 새 함수가 그 계약에 들어오면 여기 추가한다 — 목록이 낡으면 검사가 조용히 약해지므로, client 승급
 * 트랜치에서 같이 본다.
 */
const IP_SENSITIVE = [
    // RequestContext 를 직접 받는 것
    "recordPostView",
    "submitInquiry",
    "submitLead",
    // OrderAccess 를 경유하는 것 — 게스트 인가 rate-limit 이 이 축에 선다
    "getOrder",
    "getShipment",
    "cancelOrder",
    "startPayment",
    "confirmPayment",
    "completeOrder",
];

/**
 * 방문자가 위조할 수 있는 값을 손으로 뽑는 형태.
 *
 * 대문자 표기(`X-Forwarded-For`)·`x-real-ip`·`substring`/`indexOf` 추출까지 덮는다 — 재심의가
 * 그 셋으로 우회에 성공했다. 헤더 이름을 직접 만지는 것 자체가 신호이므로 추출 방법은 안 따진다.
 */
const FORGEABLE = /["'`](?:x-forwarded-for|x-real-ip|forwarded)["'`]/i;

/**
 * 주석을 지운 사본. **판정은 실행되는 코드에만** 걸어야 한다 — 재심의가 "주석 안의 `clientIp`" 하나로
 * 검사를 통과시켰다. 문자열 안의 `//` 를 지우는 오검이 있을 수 있으나, 방향은 **더 엄격해지는 쪽**이라
 * (선언을 못 본 것으로 쳐서 실패시킨다) 안전하다.
 */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function walk(dir, base = "") {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return [];
    }
    return entries.flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`],
    );
}

function sourceTrees(root) {
    const trees = [];
    const rootSrc = join(root, "src");
    if (existsSync(rootSrc)) trees.push({name: "(원본) src", dir: rootSrc});
    const presets = join(root, "presets");
    if (existsSync(presets)) {
        for (const e of readdirSync(presets, {withFileTypes: true})) {
            const dir = join(presets, e.name, "src");
            if (e.isDirectory() && existsSync(dir)) trees.push({name: `presets/${e.name}`, dir});
        }
    }
    return trees;
}

export function checkVisitorIp(root = join(HERE, "..", "..")) {
    const violations = [];
    let scanned = 0;
    let declared = 0;

    for (const tree of sourceTrees(root)) {
        for (const rel of walk(tree.dir)) {
            if (!/\.(ts|tsx)$/.test(rel) || rel.endsWith(".test.ts")) continue;
            const text = stripComments(readFileSync(join(tree.dir, rel), "utf8"));
            // `.fn(` 뿐 아니라 **구조분해로 꺼내 쓴 것**도 잡는다(`const {getOrder} = client`) —
            // 재심의가 그 형태로 검사 시야를 벗어났다.
            const hits = IP_SENSITIVE.filter(
                (fn) =>
                    new RegExp(`\\.${fn}\\s*\\(`).test(text) ||
                    new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*=`).test(text),
            );
            if (hits.length === 0) continue;
            scanned += 1;

            if (!text.includes("clientIp")) {
                violations.push({
                    tree: tree.name,
                    file: rel,
                    why: `${hits.join("·")} 를 부르는데 clientIp 선언이 없다`,
                });
                continue;
            }
            declared += 1;
            // `visitorIp` 가 **불린 적이 있는지**를 본다. 문자열만 있으면(죽은 import·이름만 언급)
            // 위조 검사가 통째로 꺼졌다(재심의 우회 ⑤).
            if (!/\bvisitorIp\s*\(/.test(text) && FORGEABLE.test(text)) {
                violations.push({
                    tree: tree.name,
                    file: rel,
                    why: "clientIp 를 visitorIp() 없이 채운다 — 방문자가 위조할 수 있는 값이다",
                });
            }
        }
    }
    return {violations, scanned, declared};
}

const isMain = process.argv[1] && process.argv[1].endsWith("visitor-ip-parity.mjs");
if (isMain) {
    const {violations, scanned, declared} = checkVisitorIp();
    if (violations.length > 0) {
        console.error("방문자 IP 선언 누락:");
        for (const v of violations) console.error(`  ${v.tree}/${v.file} — ${v.why}`);
        console.error(
            "\n선언이 없으면 백엔드가 보는 IP 가 **테넌트 서버 하나**로 뭉친다. 게스트 주문 인가는 실패를",
        );
        console.error("테넌트×IP 로 계수하므로, 한 방문자의 오입력이 그 사이트 게스트 전체를 429 로 잠근다.");
        process.exit(1);
    }
    console.log(`방문자 IP 선언 통과 — IP 민감 호출 파일 ${scanned}개, 선언 ${declared}개`);
}
