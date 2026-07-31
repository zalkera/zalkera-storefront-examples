#!/usr/bin/env node
/**
 * 잘커라 스토어프론트 validator (MVP).
 *
 * AI 가 만든 스토어프론트에서 흔한 보안·정합 실수를 정적으로 잡는다(llms.txt §5). CI 에 걸어
 * 회귀를 막는다. 사용: `node scripts/validate-storefront.mjs [srcDir]` (기본 ./src).
 *
 * 검사:
 *  E1  "use client" 파일에서 @zalkera/client 를 값으로 import  → baseUrl/토큰 노출 위험.
 *  E2  "use client" 파일에서 서버 클라이언트 싱글턴(lib/zalkera) import → 같은 위험.
 *  W1  클라이언트 싱글턴 파일이 하나도 없음 → 서버 사이드 호출 패턴 미구현 의심.
 *  C1  ISR-우선 게이트(memo31 §0-12) — SEO 라우트 page 가 per-page SSR(동적 렌더)을 강제하면 실패.
 *      codegen 산출물이 홈·목록·상세·콘텐츠 페이지를 동적SSR 로 만들면 CI 를 red 로 만들어 미배포.
 *      정당화된 예외는 파일에 `// zalkera-allow-dynamic: <이유>` 마커를 두면 경고로 강등된다.
 *  C1b layout 폭발반경 게이트 — layout/template 이 **import 로 도달하는 서버 모듈**에서 동적 API 를
 *      쓰면 실패. C1 과 달리 파일 하나가 아니라 import 그래프를 본다.
 *  S1  error   — .tsx 에서 죽은 레거시 토큰 `var(--oneq-` 참조. → `bg-primary`/`text-primary` 유틸리티로.
 *  S2  warning — JSX 인라인 `style={{`(CSS 변수 주입 `style={{"--` 은 면제). 스타일은 유틸리티 클래스로.
 *  S3  error   — src/app/globals.css 부재 또는 root layout 이 그걸 import 하지 않음(배선 회귀 방지).
 *  S4  warning — className 색 임의값(`bg-[#`·`text-[#`·`border-[#`). 테넌트 색은 토큰 경유가 규약.
 *  S5  warning — src/app/globals.css 외의 .css 파일 존재(단일 CSS 원칙).
 *  C2  error   — 섹션 렌더러 switch 가 계약(@zalkera/client SECTION_CONTRACT)을 덮지 못함. 계약에 있는
 *      타입을 렌더러가 모르면 그 섹션은 **조용히 안 그려진다**(미지 타입 스킵이 계약이라 에러도 안 난다).
 *  S8  error   — **표현 계약(L1) 배선 부재**(declared 전용·memo109). globals.css 의 `@theme`+`--color-primary`
 *      정의와 root layout 의 테마 주입(`parseThemeColors(` 호출 + `<html>` style)을 센다. 이게 없으면 콘솔의
 *      "말로 색 바꾸기"가 **성공 보고를 내고 화면은 그대로**인 거짓성공이 된다 — validator 가 여태 L1 의
 *      심장을 한 번도 안 봤다(memo107 §4.2 가 '거짓 양성의 잔여'로 인정하고 미뤄 둔 자리).
 *  S6  error   — 남의 토큰 어휘(shadcn 기본 변수명) 클래스 사용. shadcn 소스를 발췌해 올 때 재작성 표를
 *      적용하지 않으면 `bg-card`·`text-muted-foreground` 같은 **정의되지 않은 토큰**을 참조해 색이 조용히
 *      빠진다. 우리 @theme 이 토큰 정본이고 shadcn 변수층은 반입하지 않는다(memo102 §4.1).
 *  N1~N5      — **콘텐츠 파일 계약**(어휘 계약 rev 4 `contentFile` · 선언 `zalkera.content`). 사이트의
 *      얼굴(페이지·섹션·문구·이미지 선택·내비)이 `content/` 아래 json 으로 살 때, 그 파일이 조용히
 *      안 그려지는 형상을 잡는다. 아래 '콘텐츠 조건화' 참고 — **선언한 레포에서만 error** 다.
 *
 * ── 스택 조건화(memo75) ──────────────────────────────────────────
 * E1/E2/W1(헤드리스 계약·스택무관)·C1/C1b(Next App Router 전제)는 **상시** 적용한다.
 * S1~S5(Tailwind+토큰 전제)는 레포의 스택 선언에 따라 3모드로 게이팅한다(선두에서 1회 판정):
 *
 *   모드       판정                                               S1  S2  S3  S4  S5
 *   declared   package.json zalkera.styling === "tailwind-tokens"  E   E   E   E   W    (토큰 계약 모드)
 *   inferred   선언 부재 + deps/devDeps 에 tailwindcss 있음        W   W   W   W   W    (위생 모드)
 *   none       그 외(다른 선언값·tailwindcss 도 없음)             –   –   –   –   –    (스킵)
 *
 * ── 콘텐츠 조건화(memo129 §1.3) ─────────────────────────────────
 * 같은 3모드를 `content` 축에 그대로 적용한다. **계약을 안 지킨 레포도 돌아야 한다**(오너 정본 전제 1
 * "강제할 수 없다") — 문구를 tsx 에 직접 든 레포도 개시·발행·codegen 이 전부 정상이고, 검사는 레포가
 * **스스로 선언했을 때만** 격상된다.
 *
 *   모드       판정                                               N1~N5
 *   declared   package.json zalkera.content === "source"          E      (콘텐츠 계약 모드)
 *   inferred   선언 부재 + content/pages/*.json 이 실재           W      (형상은 있는데 선언이 없다)
 *   none       그 외(다른 선언값 · content 디렉터리 없음)         –      (스킵)
 *
 *  N1  content/index.ts(매니페스트) 부재 — 정적 import 가 없으면 HMR 도 standalone 트레이싱도 없다.
 *  N2  content/pages/*.json 파싱 실패 또는 최상위가 객체 아님.
 *  N3  매니페스트와 파일의 어긋남 — 파일은 있는데 매니페스트에 없으면 **그 페이지는 존재하지 않는다**
 *      (라우트도 sitemap 도 모른다). 반대로 매니페스트만 있고 파일이 없으면 빌드가 깨진다.
 *  N4  섹션 형상 — `sections` 가 배열이 아님 · `type` 이 문자열 아님 · 계약에 없는 타입(렌더러가
 *      조용히 스킵한다) · `config` 가 객체 아님 · **`sortOrder` 잔존**(순서 축 이중화 — 배열이 순서다).
 *  N5  참조 무결 — 에셋이 `public/` 루트 절대 경로가 아니거나 그 파일이 실재하지 않음 · 계약이 필수로
 *      선언한 참조(`requiredRefs`)를 안 가리킴 · **id 형 키 직기입**(`assetId`·`productIds` — 숫자 id 는
 *      테넌트 스코프라 소스에 적으면 그 소스가 다른 테넌트에서 의미를 잃는다).
 *      상품 `handle` 이 실재하는지는 **여기서 못 판정한다** — 카탈로그는 DB(레인 B)에 있다. 그 축의
 *      잣대는 산출물(개시된 사이트)이지 소스가 아니다.
 *
 *  D1  AGENTS.md 가 **없는 파일을 가리킴**. codegen 이 가장 먼저 읽는 문서라 죽은 좌표는 곧 탐색 토큰이다
 *      (2026-07-30 기준선 실측: 낡은 좌표 때문에 에이전트가 콘텐츠 계약 대신 라우트를 새로 짰다).
 *  D2  설치된 `@zalkera/client` 의 llms.txt 가 **본보기로 지목한 경로**가 이 레포에 없음 — 레시피가
 *      실물을 앞지른 상태(memo125 요건 5). **본보기 레포에서만** 돈다.
 *      D1·D2 는 우리 계약(styling·content 중 하나)을 선언한 레포에서 error, 그 밖에선 warning 이다.
 *
 * declared 는 Managed 토큰 계약 라인이라 S2/S4 를 error 로 격상한다(리터럴 색·인라인 style 이
 * '말로 색 바꾸기'를 무력화하는 라인). inferred(우리 계약 미선언 Tailwind 레포)는 경고까지만,
 * none(vanilla·bootstrap 등)은 인라인·리터럴이 그 레포의 정상이라 S 전부 스킵한다.
 * 마커(zalkera-allow-inline-style·zalkera-allow-dynamic — 구 oneque-/oneq- 도 수용)·CSS변수 주입
 * 면제는 모든 모드에서 유지.
 */
import {readdirSync, readFileSync, statSync} from "node:fs";
import {createRequire} from "node:module";
import {basename, dirname, join, relative, resolve, sep} from "node:path";

const root = process.argv[2] ?? "./src";

/**
 * shadcn 기본 토큰 어휘(재작성 표의 좌변·memo102 §4.1). 우리 @theme 에 없는 이름이라 클래스가 생성되지
 * 않는다 — 색이 빠진 채로 조용히 배포되는 종류의 사고라 declared 모드에서 error 다.
 * 주의: 우리 `muted` 는 **글자색**이라 `bg-muted`(shadcn 은 배경)와 의미가 다르다.
 */
const FOREIGN_TOKEN_CLASSES = [
    "bg-card", "bg-popover", "bg-muted", "bg-accent", "bg-destructive",
    "text-card-foreground", "text-popover-foreground", "text-muted-foreground", "text-accent-foreground",
    "text-destructive", "ring-ring", "border-input",
];
const errors = [];
const warnings = [];
const layoutFiles = [];
const cssFiles = [];
let singletonFound = false;

/**
 * 스타일 규약 모드 판정(memo75 §5) — validator 선두에서 1회. srcDir 상위 최근접 package.json 의
 * `zalkera.styling` 선언을 읽는다(구 `oneque.styling` 도 수용 — 리네임 이행기):
 *   declared : zalkera.styling === "tailwind-tokens"          → 토큰 계약 모드(S2/S4 error 격상)
 *   inferred : 선언 부재 + deps/devDeps 에 tailwindcss 있음   → 위생 모드(S 전부 warning)
 *   none     : 그 외(다른 선언값·tailwindcss 도 없음)         → S 전부 스킵
 * package.json 을 못 찾거나 파싱 실패하면 none(안전 — S 안 들이댄다).
 * 백엔드는 스택을 모른다 — 선언은 레포 안에 살고 validator 가 현장에서 읽는다(memo75 §2).
 */
function detectStyleMode(srcDir) {
    let dir = resolve(srcDir);
    for (let i = 0; i < 12; i++) {
        const pkgPath = join(dir, "package.json");
        try {
            if (statSync(pkgPath).isFile()) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
                const styling = pkg?.zalkera?.styling ?? pkg?.oneque?.styling;
                if (styling === "tailwind-tokens") return "declared";
                if (styling !== undefined) return "none"; // 검사 규칙 없는 다른 선언값 = 잘커라 스타일 규약 없음
                const deps = {...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {})};
                return Object.prototype.hasOwnProperty.call(deps, "tailwindcss") ? "inferred" : "none";
            }
        } catch {
            /* 부재·파싱 실패 — 상위 디렉터리로 */
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return "none";
}

const STYLE_MODE = detectStyleMode(root);

/**
 * 콘텐츠 규약 모드 판정(memo129 §1.3) — [detectStyleMode] 와 **같은 모양**이다.
 *
 * 다른 점 하나: 추론의 근거가 의존성이 아니라 **형상**이다(`content/pages/*.json` 실재). 콘텐츠는
 * 패키지로 안 오므로 deps 로는 알 수 없고, 그 형상을 갖췄다는 것 자체가 "이 계약을 쓰는 중"의 신호다.
 * 선언하지 않은 레포를 error 로 막지 않는 이유는 스타일 축과 같다 — 전제 1("강제할 수 없다").
 *
 *   declared : zalkera.content === "source"      → N 규칙 error
 *   inferred : 선언 부재 + content/pages/*.json  → N 규칙 warning
 *   none     : 그 외                              → N 규칙 스킵
 */
function detectContentMode(srcDir) {
    const repoRoot = resolve(srcDir, "..");
    let declared;
    let dir = resolve(srcDir);
    for (let i = 0; i < 12; i++) {
        const pkgPath = join(dir, "package.json");
        try {
            if (statSync(pkgPath).isFile()) {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
                declared = pkg?.zalkera?.content ?? pkg?.oneque?.content;
                break;
            }
        } catch {
            /* 부재·파싱 실패 — 상위 디렉터리로 */
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    if (declared === "source") return "declared";
    if (declared !== undefined) return "none"; // sections-db 등 — 이 레포에 콘텐츠 파일 계약이 없다
    return contentPageFiles(repoRoot).length > 0 ? "inferred" : "none";
}

/** `content/pages/*.json` 전량(정렬). 없으면 빈 배열 — 디렉터리 부재는 오류가 아니다. */
function contentPageFiles(repoRoot) {
    const dir = join(repoRoot, "content", "pages");
    try {
        return readdirSync(dir)
            .filter((n) => n.endsWith(".json"))
            .sort()
            .map((n) => join(dir, n));
    } catch {
        return [];
    }
}

const CONTENT_MODE = detectContentMode(root);

/**
 * D1·D2 — **문서가 가리키는 좌표가 실물인가**(memo129 T-C · memo125 요건 5·6).
 *
 * codegen 은 레포 루트 `AGENTS.md` 를 **가장 먼저** 읽는다. 그 문서가 없는 파일을 가리키면 에이전트는
 * 없는 것을 찾다가 제 좌표를 짜 버린다 — 2026-07-30 토큰 기준선 실측에서 실제로 났다(페이지 신설
 * 지시에서 에이전트가 콘텐츠 계약 대신 라우트를 새로 짰다). 죽은 좌표는 문서 위생 문제가 아니라
 * **토큰 원가**다. 사람 리뷰로는 두 번 놓쳤으므로(parse.ts 회수·`ui/` 축약 경로) 기계가 센다.
 *
 * 무엇을 검사 대상으로 삼는가 — **오탐이 나면 이 검사는 무력화된다**(µ주석이 붙어 조용히 꺼진다).
 * 그래서 "명백히 이 레포의 파일 경로"인 백틱 토큰만 본다:
 *   ⑴ 백틱 안 · `/` 포함 · 확장자(ts/tsx/js/jsx/mjs/cjs/json/css/md)로 끝남
 *   ⑵ 자리표시자·글로브 문자 없음(`<slug>`·`**`·`{id}` 는 경로가 아니라 패턴이다 — 문자 집합으로 배제)
 *   ⑶ 다른 레포·설치물·생성물이 아님(`doc/` = 백엔드 정본 · `node_modules/` · `.zalkera/` = 팩 산출물 ·
 *      절대경로 · `@scope/` 패키지 경로)
 * 남는 것은 전부 레포 루트 기준 상대 경로여야 한다. **디렉터리는 안 센다** — `public/` 처럼 팩이
 * 만들어 주는 자리가 있어 존재 판정이 참이 아니다.
 */
const DOC_PATH_TOKEN = /^[A-Za-z0-9_.\-/[\]]+\.(?:tsx?|jsx?|mjs|cjs|json|css|md)$/;
const DOC_PATH_SKIP_PREFIX = ["doc/", "node_modules/", ".zalkera/", "@", "/", "http"];

/** 문서 본문에서 이 레포의 파일을 가리키는 것으로 판정되는 백틱 토큰. */
function docPathTokens(text, only) {
    const seen = new Set();
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
        const tok = m[1];
        if (!tok.includes("/")) continue;
        if (!DOC_PATH_TOKEN.test(tok)) continue;
        if (DOC_PATH_SKIP_PREFIX.some((p) => tok.startsWith(p))) continue;
        if (only && !only.test(tok)) continue;
        seen.add(tok);
    }
    return [...seen].sort();
}

function fileExists(path) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

/**
 * D 규칙의 심각도 — 좌표의 실재는 **사실 판정**이라 어느 레포에서도 참이지만, 남의 레포 문서에
 * 에러를 던지지는 않는다(전제 1 "강제할 수 없다"). 우리 계약을 하나라도 선언한 레포에서만 error 다.
 */
function docsSink() {
    return STYLE_MODE === "declared" || CONTENT_MODE === "declared" ? errors : warnings;
}

/**
 * D1 — 레포 루트 `AGENTS.md` 의 좌표 실재.
 * D2 — 설치된 `@zalkera/client` 의 `llms.txt` 가 지목한 **본보기 좌표**의 실재. 이 레포가 그 본보기라
 *      (`@zalkera/storefront-template`) 여기서만 돈다 — 남의 레포에 우리 레시피의 경로를 들이대면
 *      전부 오탐이다. `src/app|components|lib/` 로 좁히는 것은 llms.txt 가 client 자신의 소스
 *      (`sections.ts` 등)도 언급하기 때문이고, 그 셋이 템플릿 형상의 서브트리다.
 */
function checkDocCoordinates() {
    const repoRoot = resolve(root, "..");
    const sink = docsSink();

    const agents = join(repoRoot, "AGENTS.md");
    if (fileExists(agents)) {
        for (const tok of docPathTokens(readFileSync(agents, "utf8"))) {
            if (!fileExists(join(repoRoot, tok))) {
                sink.push(
                    `[D1] AGENTS.md 가 없는 파일을 가리킵니다: \`${tok}\` — codegen 이 이 문서를 가장 먼저 ` +
                        `읽습니다. 실물 경로로 고치거나, 이제 없는 파일이면 경로 표기를 지우세요.`,
                );
            }
        }
    }

    // D2 — 본보기 레포 전용.
    let isExemplar = false;
    try {
        isExemplar = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).name === "@zalkera/storefront-template";
    } catch {
        isExemplar = false;
    }
    if (!isExemplar) return;

    const llms = join(repoRoot, "node_modules", "@zalkera", "client", "llms.txt");
    if (!fileExists(llms)) return; // 미설치 — 없는 것을 센 척하지 않는다.
    for (const tok of docPathTokens(readFileSync(llms, "utf8"), /^src\/(app|components|lib)\//)) {
        if (!fileExists(join(repoRoot, tok))) {
            sink.push(
                `[D2] llms.txt 가 본보기로 지목한 \`${tok}\` 이 이 레포에 없습니다 — 레시피가 실물을 ` +
                    `앞질렀거나(공표 먼저) 본보기가 그 파일을 지웠습니다. 어느 쪽인지 확인해 한쪽을 맞추세요.`,
            );
        }
    }
}

/** N 규칙 위반을 담을 배열 — declared 면 errors, inferred 면 warnings, none 이면 null(스킵). */
function contentSink() {
    if (CONTENT_MODE === "none") return null;
    return CONTENT_MODE === "declared" ? errors : warnings;
}

/**
 * S 규칙 위반을 담을 배열을 모드별 심각도로 고른다. null 이면 스킵(none 모드).
 *   declared → S1~S4 는 errors, S5 는 warnings / inferred → 전부 warnings / none → null(스킵)
 */
function styleSink(rule) {
    if (STYLE_MODE === "none") return null;
    if (STYLE_MODE === "declared") return rule === "S5" ? warnings : errors;
    return warnings; // inferred — 전부 경고
}

/**
 * ISR-우선 게이트 대상에서 빼는 라우트 세그먼트(app 하위 디렉터리명).
 * 이들은 SEO 페이지가 아니라 **정당하게 동적/세션/쓰기**인 인터랙티브 경로다:
 *  - api      : BFF route handler(ACTION 서버 함수·페이지 아님·revalidate 엔드포인트 포함)
 *  - cart/checkout/mypage/account : 세션·쓰기 인터랙티브
 *  - login/auth                   : 인증 플로우
 *  - orders                       : 주문 조회(토큰·연락처로 식별하는 세션성 조회)
 * 그 외 app 하위의 page.* = 공개 SEO 라우트(홈·목록·상세·콘텐츠)로 간주해 ISR/static 을 강제한다.
 */
const SEO_EXCLUDE_SEGMENTS = new Set(["api", "cart", "checkout", "mypage", "account", "login", "auth", "orders"]);

// 세그먼트 정규화: 라우트 그룹 `(group)`·동적 `[slug]` 껍데기를 벗겨 이름만 비교한다.
function normalizeSegment(seg) {
    return seg.replace(/^\((.*)\)$/, "$1").replace(/^\[+\.*(.*?)\]+$/, "$1");
}

// app/ 하위의 page 파일인지 + SEO(비제외) 라우트인지 판정.
function isSeoPageFile(file) {
    if (!/^page\.(ts|tsx|js|jsx)$/.test(basename(file))) return false;
    const relFromRoot = relative(root, file);
    const segments = relFromRoot.split(sep);
    if (segments[0] !== "app") return false; // src/app 아래만
    // app 과 파일명(page.*) 사이의 디렉터리 세그먼트만 검사.
    const dirSegments = segments.slice(1, -1).map(normalizeSegment);
    return !dirSegments.some((s) => SEO_EXCLUDE_SEGMENTS.has(s));
}

// SEO page 에서 금지되는 per-page SSR 유발 패턴들.
const SSR_FORBIDDEN = [
    {re: /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/, why: `export const dynamic = "force-dynamic" (전 요청 SSR 강제)`},
    {re: /export\s+const\s+revalidate\s*=\s*0\b/, why: `export const revalidate = 0 (ISR 무력화·매 요청 재생성)`},
    {re: /\bcookies\s*\(/, why: `page 레벨 cookies() 호출 (동적 렌더 opt-in — 세션값은 클라이언트 컴포넌트로)`},
    {re: /\bheaders\s*\(/, why: `page 레벨 headers() 호출 (동적 렌더 opt-in)`},
    {re: /cache\s*:\s*["']no-store["']/, why: `fetch(..., { cache: "no-store" }) (캐시 불가·매 요청 fetch)`},
    {re: /next\s*:\s*\{[^}]*\brevalidate\s*:\s*0\b/, why: `fetch(..., { next: { revalidate: 0 } }) (ISR 무력화)`},
];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            walk(full);
        } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
            check(full);
            if (isLayoutFile(full)) layoutFiles.push(full);
        } else if (name.endsWith(".css")) {
            cssFiles.push(full);
        }
    }
}

// ── C1b: layout 폭발반경 게이트 ──────────────────────────────────
//
// 왜 파일 하나가 아니라 그래프인가: 실제로 터졌던 사고가 그 모양이었다. `cookies()` 는 layout 안이
// 아니라 layout 이 import 한 `SiteHeader`(당시 async RSC) 안에 있었고, 그게 **전 라우트**를 요청마다
// 동적 렌더로 끌고 갔다(SiteHeader.tsx 주석에 기록). layout 파일만 훑는 검사는 그 사고를 못 잡는다 —
// 안심만 주는 게이트는 없느니만 못하다.
//
// 폭발반경이 C1 과 다르다: page 의 동적화는 그 라우트 1개, layout 의 동적화는 그 서브트리 전부다.

/**
 * layout/template 파일인가(app 하위). 라우트 그룹 `(shop)`·병렬 라우트 `@slot` 어디에 있든 잡는다.
 *
 * C1 의 SEO 제외 세그먼트(cart·mypage·login…)는 layout 에도 적용한다. `app/mypage/layout.tsx` 의
 * 인증 게이트(`cookies()` + redirect)는 표준 Next 패턴이고, 그 폭발반경은 **어차피 동적인**
 * mypage 서브트리뿐이다 — 이 게이트 자신의 논리로도 잡을 이유가 없다.
 */
function isLayoutFile(file) {
    if (!/^(layout|template)\.(ts|tsx|js|jsx)$/.test(basename(file))) return false;
    const segments = relative(root, file).split(sep);
    if (segments[0] !== "app") return false;
    return !segments.slice(1, -1).map(normalizeSegment).some((s) => SEO_EXCLUDE_SEGMENTS.has(s));
}

/**
 * 서버 렌더를 요청마다 강제하는 어휘. Next 의 동적 opt-in 은 열거적이다 — 태그만 실은 fetch 는
 * 여기 없다(그래서 layout 의 `getSiteConfig({tags})` 는 정적성을 깨지 않는다).
 *
 * `corpus` 가 규칙마다 다른 이유 — **이게 없으면 규칙이 조용히 죽는다**:
 *  - "code": 문자열 리터럴을 지운 사본. 호출형(`cookies()`) 검출용. 문자열을 지워야
 *    `` throw new Error(`cookies() 를 못 읽었습니다`) `` 같은 메시지가 오탐이 안 된다.
 *  - "text": 주석만 지운 사본. **값이 문자열 안에 있는** 규칙용(`"force-dynamic"`·`"no-store"`).
 *    이들을 "code" 에서 돌리면 정규식이 찾는 그 문자열이 검출 전에 `""` 로 소거돼
 *    **영원히 매치되지 않는다**(실제로 그렇게 만들었다가 검수에서 잡혔다 — import 추출에서 밟은
 *    것과 같은 함정을 검출 쪽에 남겨뒀었다). 이 규칙들은 `export const dynamic =`·`cache:` 같은
 *    앞머리를 요구하므로 단순 메시지 문자열엔 걸리지 않는다.
 */
const DYNAMIC_API = [
    {re: /\bcookies\s*\(/, why: "cookies()", corpus: "code"},
    {re: /\bheaders\s*\(/, why: "headers()", corpus: "code"},
    {re: /\bdraftMode\s*\(/, why: "draftMode()", corpus: "code"},
    {re: /\bconnection\s*\(/, why: "connection()", corpus: "code"},
    {re: /\b(?:unstable_noStore|noStore)\s*\(/, why: "unstable_noStore()", corpus: "code"},
    {re: /export\s+const\s+revalidate\s*=\s*0\b/, why: "export const revalidate = 0", corpus: "code"},
    {re: /next\s*:\s*\{[^}]*\brevalidate\s*:\s*0\b/, why: "fetch(..., {next: {revalidate: 0}})", corpus: "code"},
    {re: /cache\s*:\s*["']no-store["']/, why: `fetch(..., {cache: "no-store"})`, corpus: "text"},
    {
        re: /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/,
        why: `export const dynamic = "force-dynamic"`,
        corpus: "text",
    },
];

/**
 * 주석을 지운 사본. 안 지우면 "예전엔 cookies() 를 읽었는데" 같은 **설명 주석**이 오탐이 된다
 * (SiteHeader 주석이 정확히 그렇다). `//` 는 URL(`http://`)과 구분하려고 앞 문자가 `:` 이 아닐 때만.
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * 주석에 더해 **문자열 리터럴까지** 지운 사본 — 호출형 규칙(`corpus: "code"`) 검출용.
 *
 * 문자열을 지우는 이유: `` throw new Error(`cookies() 를 못 읽었습니다`) `` 같은 메시지가 오탐이 된다.
 *
 * ⚠️ 두 가지를 조심해야 한다(둘 다 실제로 밟았다):
 *  1. 이 사본에서 **import 지정자를 뽑으면 안 된다** — `from "@/lib/session"` 이 `from ""` 이 돼
 *     그래프가 조용히 끊긴다. import 추출은 [stripComments] 사본에서 한다.
 *  2. 값이 문자열 안에 있는 규칙(`"force-dynamic"`)을 이 사본에서 찾으면 **영원히 못 찾는다**.
 *     그래서 DYNAMIC_API 에 `corpus` 가 있다.
 *
 * `'`·`"` 는 **개행을 넘지 못하게** 한다. 안 그러면 JSX 의 `Don't` 아포스트로피가 아래쪽 `It's` 와
 * 짝지어져 그 사이의 실코드(`cookies()` 포함)를 통째로 삼키고, 문자열 속 `//`(예: `"//cdn.example.com"`)
 * 가 닫는 따옴표를 주석으로 먹혀 고아 따옴표가 다음 줄까지 삼킨다. 삼켜진 자리는 검출이 안 된다 —
 * 조용한 거짓 음성이다. 자바스크립트 문자열은 어차피 개행을 못 넘으므로(템플릿 리터럴만 넘는다)
 * 이 제약은 정확하기도 하다.
 */
function stripCommentsAndStrings(src) {
    return stripComments(src)
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
        .replace(/"(?:\\.|[^\\"\n])*"/g, '""')
        .replace(/'(?:\\.|[^\\'\n])*'/g, "''");
}

/** `@/x`·상대경로만 해석한다. 외부 패키지(next·react·@zalkera/client)는 추적 대상이 아니다. */
function resolveImport(spec, fromFile) {
    let base;
    if (spec.startsWith("@/")) base = join(root, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
    else return null;

    for (const cand of [base, ...[".ts", ".tsx", ".js", ".jsx"].flatMap((e) => [base + e, join(base, "index" + e)])]) {
        try {
            if (statSync(cand).isFile()) return cand;
        } catch {
            /* 다음 후보 */
        }
    }
    return null;
}

/**
 * 정적 import·re-export 의 모듈 지정자. 동적 `import()`·side-effect import 는 추적하지 않는다
 * (아래 한계 주석).
 *
 * 두 가지로 가짜 간선을 막는다:
 *  - **행 머리 앵커**(`^\s*`): 진짜 import 는 문장 위치에 온다. `const SNIPPET = 'import {x} from
 *    "@/lib/session"'` 처럼 문자열 안에 든 코드 조각은 행 중간이라 안 걸린다.
 *  - **템플릿 리터럴 제거**: codegen 제품이라 코드-as-문자열이 백틱 안에 살고, 거기 든 import 는
 *    행 머리에 올 수 있다.
 *
 * `import type`/`export type` 도 **간선이 아니다** — 컴파일 시 소거돼 런타임에 그 모듈을 물지 않는다.
 * 빼지 않으면 layout 이 `import type {SessionInfo} from "@/lib/session"` 만 해도 session.ts 의
 * `cookies()` 가 잡히는 순수 오탐이 난다.
 */
function importSpecifiers(src) {
    const noTemplates = src.replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``");
    const out = [];
    for (const re of [
        /^\s*import\s+(?!type\s)[^;]*?from\s*["']([^"']+)["']/gm,
        /^\s*export\s+(?!type\s)[^;]*?from\s*["']([^"']+)["']/gm,
    ]) {
        for (const m of noTemplates.matchAll(re)) out.push(m[1]);
    }
    return out;
}

/**
 * `"use client"` 지시자를 가진 파일인가 — 즉 서버 그래프의 **경계**인가.
 *
 * 파일 **선두**에서만 판정한다(주석·BOM 은 건너뛴다). raw 전체에 `/^…/m` 을 걸면:
 *  - 템플릿 리터럴 안 행머리의 `"use client"` 가 파일 전체를 클라이언트로 오판 → 그 파일의
 *    `cookies()` 를 못 본다. codegen 제품이라 **템플릿 문자열이 현실적**이다.
 *  - BOM 이 앞서면 반대로 진짜 지시자를 못 봐서, 클라이언트 컴포넌트 체인을 서버로 오판한다.
 * 지시자는 어차피 선두에만 유효하므로 선두 판정이 정확하기도 하다.
 */
function isClientBoundary(raw) {
    return /^["']use client["']/.test(stripComments(raw).replace(/^﻿/, "").trimStart());
}

/**
 * layout 에서 시작해 서버 모듈만 따라간다. `"use client"` 파일은 **경계라서 멈춘다** — 그 아래는
 * 브라우저에서 돌고 서버 렌더를 동적으로 만들지 않는다(사고의 처방이 정확히 이 경계였다).
 * 반환: [{file, why, chain}] — chain 은 layout→…→범인 경로.
 */
function dynamicApiReachableFrom(entry) {
    const found = [];
    const seen = new Set();
    const queue = [{file: entry, chain: [entry]}];

    while (queue.length > 0) {
        const {file, chain} = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);

        let raw;
        try {
            raw = readFileSync(file, "utf8");
        } catch {
            continue;
        }
        if (isClientBoundary(raw)) continue; // 클라이언트 경계 — 여기서 끊는다.

        const text = stripComments(raw); // 주석만 제거(문자열 값·import 지정자 보존)
        const code = stripCommentsAndStrings(text); // 문자열까지 제거(호출형 검출)
        for (const {re, why, corpus} of DYNAMIC_API) {
            if (re.test(corpus === "text" ? text : code)) found.push({file, why, chain});
        }
        // import 는 문자열을 남긴 사본에서 — 지운 사본에서 뽑으면 지정자가 사라져 그래프가 끊긴다.
        for (const spec of importSpecifiers(text)) {
            const next = resolveImport(spec, file);
            if (next && !seen.has(next)) queue.push({file: next, chain: [...chain, next]});
        }
    }
    return found;
}

/** 위반마다 맞는 처방. 고정 문구를 쓰면 no-store 위반에 "세션 판정을 내려라"라고 답하게 된다. */
function remedyFor(why) {
    if (/cookies|headers|draftMode|connection/.test(why)) {
        return `세션·요청 의존 값은 클라이언트 컴포넌트(아일랜드)로 내려라 — SiteHeader + useAuthHint 가 그 선례다`;
    }
    return `layout 은 정적으로 두고, 신선도가 필요하면 태그 fetch(\`{tags}\`) + 온디맨드 revalidate 를 써라`;
}

function checkLayoutBlastRadius() {
    // 범인이 같으면 고칠 곳도 하나다 — 조상 layout 수만큼 반복 출력하지 않는다.
    const reported = new Set();
    for (const layout of layoutFiles) {
        for (const {file, why, chain} of dynamicApiReachableFrom(layout)) {
            const key = `${file}|${why}`;
            if (reported.has(key)) continue;
            reported.add(key);

            // 면제는 **범인 파일**에 붙인다 — layout 에 붙이면 그 아래 전부가 한 번에 뚫린다.
            // 신 마커 zalkera- + 구 마커(oneq-/oneque-)를 양형 수용한다(리네임 이행기).
            const allow = readFileSync(file, "utf8").match(/\/\/\s*(?:zalkera|oneque?)-allow-dynamic:\s*(.+)/);
            const path = chain.map((f) => relative(process.cwd(), f)).join(" → ");
            const detail =
                `${relative(process.cwd(), layout)} 이 ${why} 에 도달한다 → ${path}. ` +
                `layout 의 동적 API 는 **그 아래 전 라우트**를 요청마다 SSR 로 만든다`;
            if (allow) {
                warnings.push(`[C1b] ${detail} — 예외 허용(zalkera-allow-dynamic: ${allow[1].trim()}).`);
            } else {
                errors.push(
                    `[C1b] ${detail}(memo31 §0-1). ${remedyFor(why)}. 꼭 필요하면 ` +
                        `${relative(process.cwd(), file)} 에 \`// zalkera-allow-dynamic: <이유>\` 마커로 정당화하라 ` +
                        `(마커는 layout 이 아니라 **이 파일**에 붙어야 듣는다).`,
                );
            }
        }
    }
}

/**
 * C2 — 섹션 렌더러 커버리지. vendored `@zalkera/client` 의 SECTION_CONTRACT 와 SectionRenderer 의 case 를
 * 대조한다. 어휘 사본이 넷이라 사람 주석 규약으로는 갈라짐을 못 막는다는 게 실측된 교훈이라(memo102 §6),
 * 레포 안에서 확인 가능한 짝은 기계가 센다. 계약을 못 읽으면(구 client·미설치) **검사를 건너뛴다** —
 * BYO 레포에서 이 검사가 빌드를 막으면 안 되기 때문이다.
 */
/**
 * S8 — 표현 계약(L1) 배선 검사(memo109). **declared 전용**이다: S8 은 위생이 아니라 **선언의 이행 검사**라,
 * 계약을 자처하지 않은 레포에는 검사할 약속 자체가 없다(inferred·none 스킵 — S1~S5 와 게이팅이 다른 이유).
 *
 * 두 조각을 센다:
 *  - **S8-a** globals.css 의 `@theme` + `--color-primary` — 없으면 `bg-primary` 유틸리티 자체가 생성되지 않는다.
 *    4키 전수·knob 검사는 하지 않는다(정당한 변형에 오탐한다 — memo109 §2).
 *  - **S8-b** root layout 의 `parseThemeColors(` **호출** + `<html>` 의 `style` — 이 주입이 L1 의 심장이다.
 *    **문자열이 아니라 호출을 앵커로 삼는다**: layout 주석이 `themeColors` 를 담고 있어(실측) 문자열 검사는
 *    배선을 지우고 주석만 남긴 소스를 통과시킨다. import 원천(로컬 `lib/theme`·`@zalkera/client`)은 묻지 않는다.
 *
 * **한계 정직**: 존재 검사지 동작 검사가 아니다 — 호출하고 결과를 안 쓰거나 빈 객체를 실으면 통과한다.
 * "배선을 지웠다"는 잡고 "배선이 고장났다"는 못 잡는다. 나머지 반쪽은 등재 전 스모크 개시(memo107 §5.2 실효층)다.
 */
function checkThemeWiring() {
    if (STYLE_MODE !== "declared") return; // 선언 없는 레포의 주입 부재는 결함이 아니라 정상이다.

    const globalsCss = join(root, "app", "globals.css");
    let css = null;
    try {
        css = readFileSync(globalsCss, "utf8");
    } catch {
        return; // 파일 부재는 S3 가 이미 error 로 잡는다 — 같은 사실을 두 번 외치지 않는다.
    }

    // S8-a — 토큰 정의.
    if (!/@theme\b/.test(css) || !/--color-primary\s*:/.test(css)) {
        errors.push(
            `[S8] ${relative(process.cwd(), globalsCss)}: @theme 토큰 정의(--color-primary)가 없습니다 — ` +
                `bg-primary 유틸리티가 생성되지 않아 테넌트 색이 어디에도 안 실립니다.`,
        );
    }

    // S8-b — 주입 배선.
    const rootLayout = ["layout.tsx", "layout.jsx", "layout.ts", "layout.js"]
        .map((n) => join(root, "app", n))
        .find((p) => {
            try {
                return statSync(p).isFile();
            } catch {
                return false;
            }
        });
    if (!rootLayout) return; // root layout 부재는 C1 계열의 몫.

    const raw = readFileSync(rootLayout, "utf8");
    const src = stripComments(raw); // 주석은 거짓말을 한다 — 앵커를 코드에서만 찾는다.
    const injects = /parseThemeColors\s*\(/.test(src) && /<html[^>]*\sstyle=/.test(src);
    if (injects) return;

    // 탈출구 — 손으로 계약을 지키는 것도 정당하다(memo108 §1 "kit 은 자격 조건이 아니다"). 다른 이름의
    // 자기 헬퍼로 배선한 레포를 error 로 막으면 기계가 정당한 자유를 벌한다. 마커면 warning 으로 강등하고
    // 실효 확인은 스모크 개시(실효층)가 맡는다. 마커는 원문에서 찾는다(주석이 곧 마커다).
    const sink = /zalkera-allow-custom-theme-inject/.test(raw) ? warnings : errors;
    sink.push(
        `[S8] ${relative(process.cwd(), rootLayout)}: 테마 주입 배선이 없습니다 — ` +
            `parseThemeColors(...) 호출 + <html style={...}> 가 있어야 콘솔의 색 변경이 화면에 반영됩니다. ` +
            `직접 배선했다면 "// zalkera-allow-custom-theme-inject: <이유>" 마커로 사유를 남기세요.`,
    );
}

function checkSectionCoverage() {
    let contract;
    try {
        const mod = createRequire(import.meta.url)("@zalkera/client");
        contract = mod?.SECTION_CONTRACT;
    } catch {
        return; // client 미설치·구버전 — 스킵.
    }
    if (!Array.isArray(contract) || contract.length === 0) return;

    const rendererPath = join(root, "components/sections/SectionRenderer.tsx");
    let src;
    try {
        src = readFileSync(rendererPath, "utf8");
    } catch {
        return; // 렌더러가 없는 구조(BYO) — 검사 대상 아님.
    }
    const cases = new Set([...src.matchAll(/case\s+"([A-Z_]+)"/g)].map((m) => m[1]));
    const missing = contract.map((c) => c.type).filter((t) => !cases.has(t));
    if (missing.length > 0) {
        errors.push(
            `[C2] SectionRenderer 가 계약의 ${missing.join("·")} 를 안 그린다 — 미지 타입은 조용히 스킵되므로 ` +
                `콘솔에서 넣어도 화면에 안 나온다. case 를 추가하거나, 의도적 미지원이면 그 사유를 커밋에 남겨라.`,
        );
    }
}

/*
 * ── N1~N5 : 콘텐츠 파일 계약 ────────────────────────────────────────────────
 *
 * 이 규칙군이 잡는 것은 전부 **조용한 실패**다. 계약을 어긴 콘텐츠 파일은 예외를 던지지 않는다 —
 * 렌더 가드가 그 값만 떨구고 페이지는 살아 있으므로(그게 계약이다), 화면에서 섹션 하나가 사라진
 * 것을 사람이 눈으로 찾아야 한다. 여기서 죽이면 그 결함이 고객 화면이 아니라 우리 터미널에서 난다.
 *
 * 반대로 **잡지 않는 것**도 못박아 둔다: 상품 `handle` 이 카탈로그에 실재하는지는 소스만 봐서
 * 알 수 없다(DB = 레인 B). 그 축의 잣대는 개시된 산출물이다 — 여기서 추측으로 error 를 내면
 * 정상 레포가 막힌다.
 */

/** 계약 정본(설치된 `@zalkera/client` 운반체). 못 읽으면 타입 대조만 건너뛴다 — BYO 레포를 막지 않는다. */
function sectionContractMap() {
    try {
        const contract = createRequire(import.meta.url)("@zalkera/client")?.SECTION_CONTRACT;
        if (!Array.isArray(contract) || contract.length === 0) return null;
        return new Map(contract.map((c) => [c.type, c]));
    } catch {
        return null;
    }
}

/** 참조 방언 키 판정 — 백엔드 `SeedAssetReferences`·팩 게이트와 **같은 판정**이어야 한다(계약 rev 4 `dialects`). */
const isAssetRefKey = (key) => key === "asset" || (key.length > 5 && key.endsWith("Asset"));
const isProductRefKey = (key) => key === "product" || (key.length > 7 && key.endsWith("Product"));
const isProductsRefKey = (key) => key === "products" || (key.length > 8 && key.endsWith("Products"));
/** 재작성된 뒤의 id 형 키 — 소스에는 있으면 안 된다(테넌트 스코프 값). */
const isIdFormKey = (key) =>
    (key.endsWith("Id") && (isAssetRefKey(key.slice(0, -2)) || isProductRefKey(key.slice(0, -2)))) ||
    (key.endsWith("Ids") && isProductsRefKey(`${key.slice(0, -3)}s`));
/** 계약이 id 형으로 선언한 필수 참조(`productIds`)를 소스 방언 키(`products`)로 되돌린다. */
const sourceKeyOf = (idKey) => (idKey.endsWith("Ids") ? `${idKey.slice(0, -3)}s` : idKey.replace(/Id$/, ""));

/** 중첩까지 훑어 id 형 키의 경로를 모은다(`items[0].beforeAssetId` 처럼). */
function collectIdFormKeys(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectIdFormKeys(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isIdFormKey(key)) into.push(here);
            else collectIdFormKeys(value, here, into);
        }
    }
    return into;
}

/** 중첩까지 훑어 에셋 참조 값을 모은다. */
function collectAssetRefs(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectAssetRefs(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isAssetRefKey(key)) into.push({path: here, value});
            else collectAssetRefs(value, here, into);
        }
    }
    return into;
}

function checkContentContract() {
    const sink = contentSink();
    if (!sink) return;

    const repoRoot = resolve(root, "..");
    const rel = (p) => relative(process.cwd(), p);
    const files = contentPageFiles(repoRoot);

    // N1 — 매니페스트. 정적 import 가 없으면 HMR 도 standalone 트레이싱도 없다(계약 rev 4 `contentFile.manifest`).
    const manifestPath = join(repoRoot, "content", "index.ts");
    let manifest = null;
    try {
        manifest = readFileSync(manifestPath, "utf8");
    } catch {
        sink.push(
            `[N1] ${rel(manifestPath)} 가 없습니다 — 콘텐츠 매니페스트(정적 import)가 없으면 ` +
                `dev 에서 json 을 고쳐도 화면이 안 바뀌고(HMR 미발화), 빌드 산출물에 콘텐츠가 안 실립니다.`,
        );
    }

    // N3 — 매니페스트 ↔ 파일. 파일만 있으면 그 페이지는 라우트도 sitemap 도 모르는 유령이 된다.
    // **주석은 지운다** — 매니페스트의 사용법 예시가 주석 안에 import 문을 담고 있고, 그걸 실제
    // import 로 읽으면 없는 파일을 찾는 오탐이 난다(실제로 이 검사를 넣자마자 그렇게 죽었다).
    // 이 레포가 C1b·S8 에서 이미 밟은 함정과 같은 것이라 같은 처방을 쓴다.
    const declaredSlugs = manifest
        ? new Set(
              [...stripComments(manifest).matchAll(/from\s+["']\.\/pages\/([\w-]+)\.json["']/g)].map((m) => m[1]),
          )
        : null;
    if (declaredSlugs) {
        for (const file of files) {
            const slug = basename(file, ".json");
            if (!declaredSlugs.has(slug)) {
                sink.push(
                    `[N3] ${rel(file)} 를 ${rel(manifestPath)} 가 import 하지 않습니다 — ` +
                        `매니페스트에 없는 페이지는 라우트에도 sitemap 에도 없습니다(파일만 있고 아무도 못 봅니다).`,
                );
            }
        }
        for (const slug of declaredSlugs) {
            if (!files.some((f) => basename(f, ".json") === slug)) {
                sink.push(`[N3] ${rel(manifestPath)} 가 import 하는 content/pages/${slug}.json 이 없습니다 — 빌드가 깨집니다.`);
            }
        }
    }

    const contract = sectionContractMap();

    for (const file of files) {
        let page;
        try {
            page = JSON.parse(readFileSync(file, "utf8"));
        } catch (e) {
            sink.push(`[N2] ${rel(file)}: JSON 파싱 실패 — ${e.message}`);
            continue;
        }
        if (page == null || typeof page !== "object" || Array.isArray(page)) {
            sink.push(`[N2] ${rel(file)}: 최상위가 객체여야 합니다(현재 ${Array.isArray(page) ? "배열" : typeof page}).`);
            continue;
        }

        // N4 — 섹션 형상.
        const sections = page.sections;
        if (sections !== undefined && !Array.isArray(sections)) {
            sink.push(`[N4] ${rel(file)}: sections 는 배열이어야 합니다 — 배열 순서가 곧 화면 순서입니다.`);
            continue;
        }
        for (const [i, section] of (Array.isArray(sections) ? sections : []).entries()) {
            const at = `${rel(file)} sections[${i}]`;
            if (section == null || typeof section !== "object" || Array.isArray(section)) {
                sink.push(`[N4] ${at}: 섹션은 { "type": …, "config": { … } } 객체여야 합니다.`);
                continue;
            }
            if (typeof section.type !== "string" || section.type.trim() === "") {
                sink.push(`[N4] ${at}: type 은 비어 있지 않은 문자열이어야 합니다 — 렌더러가 이 섹션을 통째로 건너뜁니다.`);
                continue;
            }
            if ("sortOrder" in section) {
                sink.push(
                    `[N4] ${at}: sortOrder 는 콘텐츠 파일에 없는 키입니다 — **배열 순서가 순서**입니다(계약 rev 4). ` +
                        `남겨 두면 "순서를 바꿔"가 고쳐야 할 자리가 둘이 됩니다.`,
                );
            }
            const config = section.config;
            if (config !== undefined && (config == null || typeof config !== "object" || Array.isArray(config))) {
                sink.push(`[N4] ${at}: config 는 **객체**여야 합니다(JSON 문자열이 아닙니다 — 그건 DB 방언입니다).`);
                continue;
            }
            const spec = contract?.get(section.type);
            if (contract && !spec) {
                sink.push(
                    `[N4] ${at}: 계약에 없는 섹션 타입 "${section.type}" — 렌더러가 조용히 건너뜁니다(화면에 안 나옵니다). ` +
                        `아는 어휘는 @zalkera/client 의 SECTION_CONTRACT 에 있습니다.`,
                );
            }

            const cfg = config ?? {};
            // N5 — id 형 직기입 금지.
            for (const path of collectIdFormKeys(cfg)) {
                sink.push(
                    `[N5] ${at}: id 형 키 "${path}" — 소스는 참조형으로 씁니다(에셋 = public 루트 절대 경로 · 상품 = handle). ` +
                        `숫자 id 는 테넌트 스코프라 이 소스를 다른 곳에 올리는 순간 의미를 잃습니다.`,
                );
            }
            // N5 — 에셋 경로 실재.
            for (const {path, value} of collectAssetRefs(cfg)) {
                if (typeof value !== "string") {
                    sink.push(`[N5] ${at}: "${path}" 는 public 루트 절대 경로 문자열이어야 합니다.`);
                    continue;
                }
                if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.split("/").includes("..")) {
                    sink.push(
                        `[N5] ${at}: "${path}" = ${JSON.stringify(value)} — 레포 public/ 루트 절대 경로만 그려집니다` +
                            `(원격 URL·상대 경로·경로 탈출은 렌더에서 통째로 떨어집니다).`,
                    );
                    continue;
                }
                try {
                    statSync(join(repoRoot, "public", value));
                } catch {
                    sink.push(`[N5] ${at}: "${path}" 가 가리키는 public${value} 파일이 없습니다 — 개시하면 깨진 이미지입니다.`);
                }
            }
            // N5 — 계약 필수 참조.
            for (const idKey of spec?.requiredRefs ?? []) {
                const key = sourceKeyOf(idKey);
                const value = cfg[key];
                const filled = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim() !== "";
                if (!filled) {
                    sink.push(
                        `[N5] ${at}: ${section.type} 이 필수 참조 "${key}" 를 안 가리킵니다 — ` +
                            `렌더러가 이 섹션을 통째로 건너뜁니다(계약 ${idKey} 필수).`,
                    );
                }
            }
        }
    }
}

function check(file) {
    const src = readFileSync(file, "utf8");
    const rel = relative(process.cwd(), file);
    const isClient = /^["']use client["']/m.test(src);

    // 서버 클라이언트 싱글턴 존재 확인 — create{Zalkera,Oneque}Client 호출(구 심볼 수용).
    if (/create(?:Zalkera|Oneque)Client\s*\(/.test(src)) {
        singletonFound = true;
        if (isClient) errors.push(`[E1] ${rel}: "use client" 파일에서 createZalkeraClient 를 만든다 — baseUrl 노출.`);
    }

    if (isClient) {
        // E1: 값 import(= import type 아님)로 @zalkera/client 를 들여옴(구 @oneque/client 도 잡는다).
        const valueImport = /^import\s+(?!type\s)[^;]*from\s+["']@(?:zalkera|oneque)\/client["']/m.test(src);
        if (valueImport) {
            errors.push(`[E1] ${rel}: "use client" 파일에서 @zalkera/client 를 값으로 import 한다 (타입은 \`import type\` 으로).`);
        }
        // E2: 서버 싱글턴(lib/zalkera) import(구 lib/oneque 도 잡는다).
        if (/from\s+["'][^"']*lib\/(?:zalkera|oneque)["']/.test(src)) {
            errors.push(`[E2] ${rel}: "use client" 파일에서 서버 클라이언트 싱글턴(lib/zalkera)을 import 한다.`);
        }
    }

    // C1: ISR-우선 게이트 — SEO 라우트 page 는 per-page SSR 을 강제할 수 없다.
    if (isSeoPageFile(file) && !isClient) {
        const hits = SSR_FORBIDDEN.filter(({re}) => re.test(src)).map(({why}) => why);
        if (hits.length > 0) {
            const allow = src.match(/\/\/\s*(?:zalkera|oneque?)-allow-dynamic:\s*(.+)/);
            const detail = `${rel}: SEO 라우트가 동적SSR 을 유발한다 → ${hits.join("; ")}`;
            if (allow) {
                warnings.push(`[C1] ${detail} — 예외 허용(zalkera-allow-dynamic: ${allow[1].trim()}).`);
            } else {
                errors.push(
                    `[C1] ${detail}. SEO 페이지는 ISR(export const revalidate = N) 또는 static 이어야 한다. ` +
                        `실시간·개인화 값은 클라이언트 컴포넌트(아일랜드)로, 상태 변경은 BFF route handler 로 옮겨라. ` +
                        `동적 SSR 이 꼭 필요하면 \`// zalkera-allow-dynamic: <이유>\` 마커로 정당화하라(memo31 §0-12).`,
                );
            }
        }
    }

    // ── S 규칙: 스타일 규약 ──────────────────────────────────
    // stripComments 사본에서 검사한다(style={{·var(--oneq- 는 코드 토큰 — 문자열 값은 남겨야 잡힌다.
    // 문자열까지 지운 사본에서 찾으면 className 안의 값이 소거돼 영원히 못 잡는다).
    const text = stripComments(src);

    // S6: 남의 토큰 어휘(shadcn 기본 변수명). 재작성 표(memo102 §4.1)의 좌변이 그대로 남아 있으면 잡는다.
    // 우리에겐 정의가 없는 토큰이라 Tailwind 가 클래스를 만들지 않고 → 색이 조용히 빠진 채 배포된다.
    const s6 = styleSink("S6");
    if (s6) {
        const alien = FOREIGN_TOKEN_CLASSES.filter((t) => new RegExp(`(^|[\\s"'\`])${t}(?![\\w-])`).test(text));
        if (alien.length > 0) {
            s6.push(
                `[S6] ${rel}: 남의 토큰 어휘 ${alien.join("·")} — 우리 @theme 에 없는 이름이라 색이 빠진다. ` +
                    `재작성 표로 옮겨라(memo102 §4.1: bg-card→bg-surface, text-muted-foreground→text-muted 등).`,
            );
        }
    }

    // S1: 죽은 레거시 토큰. globals.css @theme 로 부활한 유틸리티로 대체해야 한다.
    const s1 = styleSink("S1");
    if (s1 && /\.tsx$/.test(file) && /var\(--oneq-/.test(text)) {
        s1.push(
            `[S1] ${rel}: 죽은 레거시 토큰 var(--oneq-*) 참조. ` +
                `--oneq-primary → text-primary/bg-primary, --oneq-bg → text-primary-foreground 유틸리티로 대체하라(globals.css @theme).`,
        );
    }

    // S2: JSX 인라인 style. CSS 변수 주입(style={{"--)은 정당 용례라 면제. 마커로도 억제 가능(모든 모드).
    const s2 = styleSink("S2");
    if (s2 && /style=\{\{(?!\s*["'`]--)/.test(text) && !/\/\/\s*(?:zalkera|oneque)-allow-inline-style:/.test(text)) {
        s2.push(
            `[S2] ${rel}: JSX 인라인 style={{…}} 사용 — 스타일은 Tailwind 유틸리티 클래스로 표현하라. ` +
                `정당한 동적 스타일이면 \`// zalkera-allow-inline-style: <이유>\` 마커로 억제하라.`,
        );
    }

    // S4: className 색 하드코딩(임의값). 테넌트 색은 primary 토큰 경유가 규약이다.
    const s4 = styleSink("S4");
    if (s4 && /(?:bg|text|border)-\[#/.test(text)) {
        s4.push(
            `[S4] ${rel}: className 색 임의값(bg-[#…]·text-[#…]·border-[#…]) — 브랜드색 하드코딩은 ` +
                `콘솔의 '말로 색 바꾸기'를 무력화한다. bg-primary 등 토큰을, 중립은 slate 스케일을 쓰라.`,
        );
    }
}

/**
 * S3·S5 — Tailwind 배선(단일 CSS)의 존재·정합. codegen 이 배선을 지우거나 CSS 파일을 난립시키는
 * 회귀를 막는다. 파일 존재 + import 문자열 검사면 충분하다(§5.1).
 */
function checkStyleWiring() {
    const globalsCss = join(root, "app", "globals.css");

    // S3: Tailwind 배선(globals.css 존재 + root layout import). none 모드는 스킵.
    const s3 = styleSink("S3");
    if (s3) {
        let globalsOk = false;
        try {
            globalsOk = statSync(globalsCss).isFile();
        } catch {
            globalsOk = false;
        }

        if (!globalsOk) {
            s3.push(
                `[S3] ${relative(process.cwd(), globalsCss)} 가 없습니다 — ` +
                    `Tailwind 배선(@import "tailwindcss" + @theme 토큰)이 사라졌습니다. globals.css 를 복구하세요.`,
            );
        } else {
            // root layout(app/layout.*)이 globals.css 를 import 하는지 — 안 하면 스타일이 전혀 안 실린다.
            const rootLayout = ["layout.tsx", "layout.jsx", "layout.ts", "layout.js"]
                .map((n) => join(root, "app", n))
                .find((p) => {
                    try {
                        return statSync(p).isFile();
                    } catch {
                        return false;
                    }
                });
            if (rootLayout) {
                const src = stripComments(readFileSync(rootLayout, "utf8"));
                if (!/import\s+["'][^"']*globals\.css["']/.test(src)) {
                    s3.push(
                        `[S3] ${relative(process.cwd(), rootLayout)} 이 globals.css 를 import 하지 않습니다 ` +
                            `(\`import "./globals.css"\`). 배선이 없으면 Tailwind CSS·테마 토큰이 로드되지 않습니다.`,
                    );
                }
            }
        }
    }

    // S5: globals.css 외의 CSS 파일 난립 방지(단일 CSS 원칙). none 모드는 스킵.
    const s5 = styleSink("S5");
    if (s5) {
        const globalsAbs = resolve(globalsCss);
        for (const css of cssFiles) {
            if (resolve(css) !== globalsAbs) {
                s5.push(
                    `[S5] ${relative(process.cwd(), css)} — src/app/globals.css 외의 CSS 파일. ` +
                        `단일 CSS 원칙: 스타일은 Tailwind 유틸리티 클래스로, 색·폰트는 globals.css @theme 토큰으로.`,
                );
            }
        }
    }
}

try {
    statSync(root);
} catch {
    console.error(`디렉터리를 찾을 수 없습니다: ${root}`);
    process.exit(2);
}

walk(root);
checkLayoutBlastRadius(); // walk 가 layoutFiles 를 채운 뒤에.
checkStyleWiring(); // S3·S5 — walk 가 cssFiles 를 채운 뒤에.
checkThemeWiring(); // S8 — L1 배선(declared 전용).
checkSectionCoverage();
checkContentContract(); // N1~N5 — 콘텐츠 파일 계약(선언 조건화).
checkDocCoordinates(); // D1·D2 — 문서 좌표가 실물을 가리키는가.

if (!singletonFound) warnings.push(`[W1] createZalkeraClient 싱글턴을 찾지 못했습니다 — 서버 사이드 호출 패턴이 있는지 확인하세요.`);

console.log(
    `스타일 규약 모드: ${STYLE_MODE}` +
        (STYLE_MODE === "declared"
            ? " (tailwind-tokens 계약 — S2/S4 error 격상)"
            : STYLE_MODE === "inferred"
              ? " (tailwindcss 추론 — S 전부 warning)"
              : " (스택 미선언 — S 규칙 스킵)"),
);
console.log(
    `콘텐츠 규약 모드: ${CONTENT_MODE}` +
        (CONTENT_MODE === "declared"
            ? " (content=source 계약 — N 규칙 error)"
            : CONTENT_MODE === "inferred"
              ? " (content/pages 실재·선언 부재 — N 규칙 warning)"
              : " (콘텐츠 파일 계약 없음 — N 규칙 스킵)"),
);
for (const w of warnings) console.warn("⚠️  " + w);
for (const e of errors) console.error("❌ " + e);

if (errors.length > 0) {
    console.error(`\n${errors.length}개 오류. 스토어프론트 규약 위반을 고치세요 (llms.txt §5 참고).`);
    process.exit(1);
}
console.log(`✅ 통과 — 검사한 규약 위반 없음${warnings.length ? ` (경고 ${warnings.length})` : ""}.`);
