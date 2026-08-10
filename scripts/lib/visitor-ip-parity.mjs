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
 * ## 이 검사기는 **우리 레포 전용**이다 (2026-08-10 · 4차 심의)
 *
 * 한때 고객 zip 에도 실었는데 네 라운드에 걸쳐 **거짓 양성이 닫히지 않았다**(타입 전용 import · 헬퍼
 * 경유 `clientIp` · IP 무관 용도로 client 를 쓰는 파일의 동명 자기 함수). 위험이 비대칭이다 —
 * 거짓 양성은 **고객 배포를 무환불로 막고** 주석 면제도 구조적으로 불가능한데(주석을 지우므로),
 * 거짓 음성은 우리가 못 잡을 뿐이다. 게다가 이 게이트가 실제로 도는 유일한 고객 집단(BYO)이
 * 거짓 실패를 먹는 집단과 같았다(관리형은 플랫폼이 워크플로를 덮어써 아예 안 돈다).
 *
 * 그래서 배송을 걷었다. **목적은 원래 우리 팩 4벌이 갈리는 것을 막는 것**이고, 그 목적은 여기서만
 * 서면 달성된다. 고객에게는 규칙을 `AGENTS.md` 로 계속 준다(가드가 아니라 안내로).
 *
 * ## 왜 첫 홉을 직접 쓰면 안 되나
 *
 * `visitorIp()` 를 안 쓰고 `x-forwarded-for` 첫 항목을 손으로 뽑는 코드도 잡는다(**출처 추적**이 잡는다 —
 * 한때 헤더 이름을 열거하는 상수를 뒀는데, 형태를 세는 쪽은 계산된 이름에 늘 졌다). 첫 엔트리는
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

/** `clientIp: string` 같은 **타입 자리**. 값이 아니므로 출처를 물을 대상이 아니다. */
const TYPE_POSITION =
    /^\s*(?:string|number|boolean|any|unknown|null|undefined)(?:\s*\|\s*(?:string|number|boolean|any|unknown|null|undefined))*\s*;?\s*$/;

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
            // 타입만 가져다 쓰는 것은 바인딩이 아니다 — 그 파일의 `repo.getOrder(id)` 는 남의 함수다
            // (4차 심의 실측: 이 레포 자신이 `import type {OrderSummary}` 형태를 쓴다).
            const runtimeImports = text.replace(/import\s+type\s[^;]*;/g, " ");
            if (!IMPORTS_CLIENT.test(runtimeImports)) continue;

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
                // 선언+초기화(`const ip = visitorIp(h)`)와 **나중 대입**(`let ip; … ip = visitorIp(h)`)
                // 둘 다 정상 형태다. 앞의 것만 인정하면 조건부 대입이 거짓 실패한다(4차 심의).
                [...text.matchAll(/(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(?:await\s+)?visitorIp\s*\(/g)].map(
                    (m) => m[1],
                ),
            );
            // `clientIp: <식>` 과 shorthand `{clientIp}` 를 함께 본다. shorthand 는 4차 심의가
            // **위조값을 통과시킨 자리**다(`const clientIp = xff.split(",")[0]` 뒤 `{clientIp}`).
            // 값 표기만 보면 그 형태가 통째로 안 보인다 — 그래서 이름의 출처까지 따라간다.
            const values = [...text.matchAll(/clientIp\s*:\s*([^,}\n]+)/g)].map((m) => m[1]);
            // shorthand(`{clientIp}`)는 **정상 표기와 무관하게 따로 본다.** 종전엔 파일에 `clientIp:` 가
            // 하나라도 있으면 이 분기가 통째로 꺼져, 정상 한 줄 옆에 위조 shorthand 를 두면 통과했다
            // (5차 심의 관찰 O1 실측).
            if (/\{[^}]*\bclientIp\b[^}:]*\}/.test(text)) {
                // ⚠ **구조분해로 꺼내 쓴 것은 shorthand 가 아니다**(6차 심의 W-A · 실측 거짓 양성 2형태):
                //   `const {clientIp} = access.context;`  ← 값을 만드는 게 아니라 이미 만들어진 것을 읽는다
                //   `function log({clientIp}: {clientIp: string})`  ← 파라미터 표기
                // 종전엔 `const clientIp = …` 선언을 못 찾으면 **빈 문자열**을 미해결로 밀어 무조건 실패시켰다.
                // 이 검사기는 우리 레포 전용이라 고객 피해는 0 이고, **지금 레포에 그 형태가 0건**이라 오늘
                //   막고 있는 것도 없다 — 선제 수정이다(심의 경고 A: 현재형으로 쓰면 거짓이 된다).
                // ⚠ 예외는 **형태가 아니라 출처**로 판정한다(심의 차단 · 실측).
                //
                // 첫 판은 "구조분해가 파일에 있으면 면제"였다. 그런데 구조분해가 **값을 만드는** 경우가
                // 있다 — `const {clientIp} = await req.json()` · `= Object.fromEntries(url.searchParams)`.
                // 그건 방문자가 고른 값이고, 면제하면 정상 한 줄 옆에 두는 것만으로 통과한다
                // (5차에 닫은 O1 계열의 부분 재개방이었다 — 실측 C1·C2·H 전부 통과했다).
                //
                // 그래서 읽기형은 **우변을 붙잡아** 출처를 묻고, 파라미터형은 **이 파일에 출처가 해소된
                // `clientIp` 구성이 하나라도 있을 때만** 면제한다(그 파일이 값을 만들 줄 안다는 증거).
                const readForm = /(?:const|let|var)\s*\{[^}]*\bclientIp\b[^}]*\}\s*=\s*([^;\n]+)/.exec(text);
                const paramForm =
                    /function\s+\w*\s*\(\s*\{[^}]*\bclientIp\b[^}]*\}/.test(text) ||
                    /\(\s*\{[^}]*\bclientIp\b[^}]*\}\s*(?::[^)]*)?\)\s*=>/.test(text);
                const decl = /(?:const|let|var)\s+clientIp\s*=\s*([^;\n]+)/.exec(text);

                if (decl) values.push(decl[1]);
                else if (readForm) values.push(readForm[1]);
                else if (!paramForm) values.push("");
                // 파라미터형 면제의 전제: 이 파일이 어딘가에서 출처를 제대로 만든다.
                else if (!/clientIp\s*:\s*[^,}\n]*visitorIp\s*\(/.test(text)) values.push("");
            }
            const unresolved = values.filter((expr) => {
                // 우리 계약 안에서 이미 만들어진 값을 읽는 형태(`access.context` 경유)는 정상이다.
                if (/\.context\b/.test(expr)) return false;
                // 타입 표기(`clientIp: string`·`clientIp: string | undefined`)는 값이 아니다 —
                // 정규식이 그것을 값으로 읽어 **완전히 올바른 코드**를 실패시켰다(4차 심의).
                if (TYPE_POSITION.test(expr)) return false;
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
        console.error("\n선언이 없으면 백엔드가 보는 IP 가 **테넌트 서버 하나**로 뭉친다. 축마다 결과가 다르다:");
        console.error("  · 주문 인가(getOrder 등) — **실패만** 계수한다. 남의 오입력이 쌓이면 오타 한 번에");
        console.error("    403 대신 429 를 받고, 스캐너 탐지가 주문번호 축 하나로 줄어든다(IP 축은 성공을");
        console.error("    안 막지만, **주문번호 축은 실패 5회/10분으로 정답 제시자도 선차단**한다).");
        console.error("  · 문의·리드(submitInquiry/submitLead) — **모든 호출을 계수한다.** 상용 문의 한도가");
        console.error("    60초에 3건이라, 뭉치면 그 사이트의 4번째 문의 제출이 429 다(성공도 막힌다).");
        process.exit(1);
    }
    console.log(`방문자 IP 선언 통과 — IP 민감 호출 파일 ${scanned}개, 선언 ${declared}개`);
}
