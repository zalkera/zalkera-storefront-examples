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
 * **우리 클라이언트를 쓰는 파일인가.** 이 문이 없으면 고객이 자기 코드에 같은 이름을 쓰는 것만으로
 * 그 레포 CI 가 적색이 된다(`repo.getOrder(id)`). 실제 프리셋은 `@zalkera/client` 를 직접 import 하거나
 * 공유 싱글턴(`@/lib/zalkera`)을 거치므로 둘 다 받는다.
 */
const IMPORTS_CLIENT = /from\s+["'](?:@zalkera\/client|[^"']*lib\/zalkera)["']/;

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
    return (
        text
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            // **후행 주석까지** 지운다. 종전엔 행 전체 주석만 지워서 `getOrder(...); // clientIp` 가
            // 선언 보유로 통과했다(3차 심의 실측 — "주석 제거 후 판정"이 절반만 참이었다).
            // `:` 앞선 것은 남긴다 — `https://` 를 지우면 URL 이 든 정상 줄이 통째로 사라진다.
            .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    );
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
    // Next.js 정식 배치는 루트 `app/`·`pages/` 도 허용한다. 고객이 그쪽으로 옮기면 종전 판정은
    // **0개 스캔·조용히 초록**이었다(Opus 심의 경고 — 검사가 없는 것보다 나쁜 상태다).
    for (const alt of ["app", "pages"]) {
        const dir = join(root, alt);
        if (existsSync(dir)) trees.push({name: `(원본) ${alt}`, dir});
    }
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
            // 🔴 **우리 클라이언트를 쓰는 파일만 본다**(Opus 심의 차단). 종전엔 `.getOrder(` 만 보고
            // 판정해, 고객이 자기 DB 계층에 같은 이름을 쓰면(`repo.getOrder(id)` — 커머스 확장 코드에서
            // 흔한 이름이다) **그 고객 CI 가 적색이 되고 BYO 테넌트의 코드 배포가 무환불로 종결**됐다.
            // 우리가 남의 레포에 낼 수 있는 가장 나쁜 오검이라, 판정 자체를 클라이언트 바인딩으로 좁힌다.
            if (!IMPORTS_CLIENT.test(text)) continue;

            const hits = IP_SENSITIVE.filter((fn) =>
                [
                    // 평범한 호출 · 옵셔널 체이닝(`z?.getOrder?.(`)
                    `(?:\\.|\\?\\.)\\s*${fn}\\s*(?:\\?\\.)?\\s*\\(`,
                    // 대괄호 접근 — 종전엔 파일이 스캔 대상조차 안 됐다
                    `\\[\\s*["'\`]${fn}["'\`]\\s*\\]`,
                    // 구조분해로 꺼내 쓴 것
                    `(?:const|let|var)\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*=`,
                    // 별칭(`const go = z.getOrder;`) — 호출부가 다른 줄이라도 이 파일이 책임진다
                    `(?:const|let|var)\\s+\\w+\\s*=\\s*[\\w.$\\[\\]"'\`]*\\.${fn}\\b`,
                ].some((pattern) => new RegExp(pattern).test(text)),
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
            // **각 `clientIp` 가 `visitorIp()` 에서 왔는가**(Opus 심의 경고). 파일 어딘가에 visitorIp
            // 호출이 하나 있으면 통과하던 종전 판정은, 그 호출이 **다른 용도**일 때 검사가 통째로 꺼졌다.
            // 직접 호출과 변수 경유(`const ip = visitorIp(h); … clientIp: ip`) 둘 다 정상 형태이므로
            // **출처를 따라간다** — 형태를 세는 대신 값이 어디서 왔는지를 본다.
            const fromVisitorIp = new Set(
                [...text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?visitorIp\s*\(/g)].map(
                    (m) => m[1],
                ),
            );
            const unresolved = [...text.matchAll(/clientIp\s*:\s*([^,}\n]+)/g)].filter((m) => {
                const expr = m[1];
                if (/\bvisitorIp\s*\(/.test(expr)) return false;
                return ![...fromVisitorIp].some((v) => new RegExp(`\\b${v}\\b`).test(expr));
            });
            if (unresolved.length > 0) {
                violations.push({
                    tree: tree.name,
                    file: rel,
                    why: `clientIp 값이 visitorIp() 에서 오지 않는다(${unresolved.length}곳) — 출처를 보증할 수 없다`,
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
            "\n선언이 없으면 백엔드가 보는 IP 가 **테넌트 서버 하나**로 뭉친다. 게스트 주문 인가는",
        );
        console.error("**실패만** 테넌트×IP 로 계수하므로(성공은 절대 안 막힌다), 남의 오입력이 쌓이면");
        console.error("오타 한 번에 403 대신 429 를 받고, 스캐너 탐지가 주문번호 축 하나로 줄어든다.");
        process.exit(1);
    }
    console.log(`방문자 IP 선언 통과 — IP 민감 호출 파일 ${scanned}개, 선언 ${declared}개`);
}
