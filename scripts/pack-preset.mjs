#!/usr/bin/env node
/**
 * 프리셋 zip 팩 (memo102 §3.1 "1계보 N팩" · §3.2 시드 매니페스트 · §7 라이선스 게이트).
 *
 * **정본 template 체크아웃 1개 + 테마별 프리셋 디렉터리 → N개의 zip.** 테마마다 소스를 포크하지 않는
 * 것이 이 설계의 요점이라(§3.1), 코드 패치가 나가면 이 스크립트를 다시 돌려 전 테마를 재팩한다.
 * 유지보수는 여전히 1계보다.
 *
 * ── 팩 v2 (memo129 §3) ──────────────────────────────────────────────────────
 * **사이트의 얼굴은 소스가 정본이다**(memo128 §3). 그래서 프리셋이 무엇을 어디로 싣는지가 갈렸다:
 *
 *   presets/<code>/content/       → zip 의 `content/` (레포 상주 · 페이지·섹션·문구·내비)
 *   presets/<code>/public/        → zip 의 `public/`  (섹션 이미지 · 레포 상주)
 *   presets/<code>/src/           → zip 의 `src/`     (정본을 가리는 오버레이 — 이 팩의 호출 구성)
 *   presets/<code>/seed.json      → zip 의 `.zalkera/seed.json` (**테마색만**)
 *   presets/<code>/assets/        → zip 의 `.zalkera/assets/`   (섹션 config 가 참조하는 전송 이미지)
 *
 * ── 팩 v3 (memo142) — **배송물은 업무 데이터를 만들지 않는다** ────────────────
 * 시드가 고객 DB 에 상품·갈래를 만들던 경로가 닫혔다. `seed.json` 에 남는 최상위 키는 `themeColors`
 * 하나이고, 콘텐츠 섹션은 업무 축(상품·갈래)을 **가리키지 않는다**.
 *
 * 경계는 **정본 값의 거처**로 긋는다(memo142 §1): 값이 콘텐츠 파일에 사는 저작물은 **선언 섹션**의
 * 소관이고, 값이 업무 DB 에 살고 화면이 비추기만 하는 조회는 **소스가 `@zalkera/client` 를 직접 호출**해
 * 그린다. 따름정리 — 배송물은 handle 이든 갈래 slug 든 **업무 축의 고유명사를 어디에도 박지 않는다**
 * (`리빙`·`시술`은 사장이 정할 이름이다). 직접 호출이 배송 가능한 이유가 정확히 이것이다:
 * `listProducts()` 는 이름을 하나도 안 박고 그 사장의 카탈로그가 있는 대로 내놓는다.
 *
 * 그래서 아래 게이트가 **타입 이름이 아니라 키 형상**으로 건다(BUSINESS_REF) — 어휘에서 조회형 타입
 * 둘이 삭제됐지만, 같은 형태의 타입이 미래에 다시 생겨도 같은 자리에서 잡힌다.
 *
 * **변환기가 없다.** 프리셋 디렉터리가 처음부터 최종 형상을 갖고 있고 팩은 그것을 소스 트리에
 * 병합하기만 한다 — seed→content 변환 코드를 두면 그 변환기가 계약의 숨은 두 번째 정본이 된다.
 * seed v2 는 **빼기만** 했다(pages·menus 탈락): 백엔드 매퍼가 strict 라 키 추가는 개시를 중단시키지만
 * 빼기는 기본값으로 통과하므로 **백엔드 개시 코드는 한 줄도 안 바뀐다.**
 *
 * 그래서 프리셋 개시가 자기 정의 그대로가 된다 — *"플랫폼이 대신 올려주는 업로드"*(memo97 §3).
 * 소스가 얼굴의 정본이고, `.zalkera/` 는 업무 데이터의 전송 포맷이다.
 *
 * 게이트는 **팩 시점에 미리 실패한다** — 백엔드 개시 경로(memo102 §3.2-a)가 같은 캡·같은 규칙으로
 * fail-closed 라서, 상한을 넘긴 프리셋은 애초에 적재조차 안 되는 게 맞다. 여기서 막으면 팩 결함이
 * 고객 개시 순간이 아니라 우리 터미널에서 드러난다.
 *
 * 사용:
 *   node scripts/pack-preset.mjs                    # 전체 테마, version=DEFAULT_VERSION
 *   node scripts/pack-preset.mjs shop-goods         # 특정 테마만
 *   node scripts/pack-preset.mjs --version 1.1.0
 *
 * 출력: dist-presets/{code}-{version}.zip + sha256(적재 API 의 `expectedSha256` 로 그대로 보낸다).
 * zip 은 결정론적이다(고정 타임스탬프·경로 정렬) — 같은 입력이면 같은 sha 가 나온다.
 */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {deflateRawSync} from "node:zlib";
import {crc32} from "./preset-canvas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRESETS_DIR = join(ROOT, "presets");
const OUT_DIR = join(ROOT, "dist-presets");

/**
 * 캡. **두 종류가 섞여 있다** — 갈라지면 안 되는 쪽과 우리만의 위생인 쪽.
 *
 *  - `seedJsonBytes`·`assets`·`assetTotalBytes`·`assetFileBytes`·`products` : 백엔드 `SiteSeedCaps`
 *    (memo102 §3.2-a-5)와 **같은 수여야 한다.** 갈라지면 팩은 통과하는데 개시가 중단되는, 가장 늦게
 *    발견되는 종류의 결함이 된다.
 *  - `pages`·`navLinks`·`sectionsPerPage`·`configBytes` : **팩 v2 부터 우리만의 위생이다.** 콘텐츠가
 *    레포 파일로 가면서 백엔드를 안 타므로 대응하는 백엔드 캡이 없다. 그래도 남기는 이유는 상한이
 *    아니라 **정의**다 — 섹션 50개짜리 "템플릿"은 템플릿이 아니라 데이터 이관이다.
 */
const CAPS = {
    seedJsonBytes: 256 * 1024,
    assets: 24,
    assetTotalBytes: 20 * 1024 * 1024,
    // 백엔드는 이 값을 `storage.max-file-size` 설정에서 읽는다(기본 20MB). 운영이 그걸 낮추면 이 상수와
    // 조용히 갈라지므로, 설정을 바꿀 때 여기도 같이 본다.
    assetFileBytes: 20 * 1024 * 1024,
    pages: 10,
    navLinks: 30,
    sectionsPerPage: 50,
    configBytes: 64 * 1024,
    // ⚠ 상품·갈래 캡(products·categories·categoriesPerProduct·재고·텍스트 길이)은 memo142 에서
    //    **축 자체가 사라져** 백엔드 `SiteSeedCaps` 와 함께 은퇴했다. 시드는 업무 데이터를 만들지 않는다.
};

/** 백엔드 `StorageFileService.putMediaObject` 의 화이트리스트와 같다 — 래스터만, svg·영상 없음. */
const RASTER = {
    png: {type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]},
    jpg: {type: "image/jpeg", magic: [0xff, 0xd8, 0xff]},
    jpeg: {type: "image/jpeg", magic: [0xff, 0xd8, 0xff]},
    webp: {type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46], tag: {offset: 8, bytes: [0x57, 0x45, 0x42, 0x50]}},
};

/** zip 에 넣지 않는 것 — 팩 도구·시드 원본·산출물은 고객 소스가 아니다(시드는 `.zalkera/` 로 따로 들어간다). */
const SOURCE_EXCLUDES = [
    "presets/",
    // 템플릿 기본 콘텐츠(빈 매니페스트)는 빼고 **프리셋 것을 싣는다** — 아니면 두 벌이 겹친다.
    "content/",
    "dist-presets/",
    "scripts/pack-preset.mjs",
    "scripts/gen-preset-assets.mjs",
    "scripts/preset-canvas.mjs",
];

/**
 * 프리셋 버전. **시드(카피·에셋·구성)나 소스가 바뀌면 올린다** — 키에 버전이 박혀 있어(`{code}/{version}.zip`)
 * 갱신은 새 객체이고, 이미 개시한 사이트의 소스는 고객 것이라 소급 갱신이 없다(memo97 §3.1 버전 시맨틱).
 * 여기 상수로 두는 이유: 고객에게 나가는 package.json 에 우리 배포 메타를 심지 않기 위해서다.
 */
const DEFAULT_VERSION = "1.0.0";

const problems = [];
const fail = (code, message) => problems.push(`[${code}] ${message}`);

// ── 시드 검증 ────────────────────────────────────────────────────────────────

/** `asset`/`*Asset` 키의 문자열 값 = zip 상대 파일명 참조(§3.2-a-7). 백엔드 재작성 규칙과 같은 판정이다. */
const isReferenceKey = (key) => key === "asset" || (key.length > 5 && key.endsWith("Asset"));

/**
 * **업무 참조 키 형상**(memo142 §1 기계 판정). `product`/`*Product`(단수) · `products`/`*Products`(복수) ·
 * `categorySlug`. 종전에는 이 판정이 "이 handle 이 시드에 있는가"를 묻는 **해석기**였는데, 이제는
 * **금지 판정**이다 — 섹션 config 에 이 형상의 키가 있으면 그 섹션은 조회형이고, 조회의 자리는 선언이
 * 아니라 소스다.
 *
 * **타입 이름이 아니라 키 형상으로 거는 이유**: 어휘에서 `SERVICE_MENU`·`BOOKING_CTA` 가 삭제됐지만,
 * 같은 성격의 타입이 다시 생기면 이름만 다를 뿐 같은 위반이다. 형상으로 걸면 미래의 조회형도 잡힌다.
 * (판정 자체는 백엔드 `SeedProductReferences` 가 쓰던 것과 **같은 형태**를 그대로 재사용한다 — 그 규칙이
 * 이미 "무엇이 업무 참조인가"를 정확히 정의해 뒀다.)
 */
const isProductRefKey = (key) => key === "product" || (key.length > 7 && key.endsWith("Product"));
const isProductsRefKey = (key) => key === "products" || (key.length > 8 && key.endsWith("Products"));
const isBusinessRefKey = (key) => key === "categorySlug" || isProductRefKey(key) || isProductsRefKey(key);

/** 섹션 config 안의 업무 참조 키 **경로 전수**(사람이 고칠 재료라 경로로 돌려준다). */
function collectBusinessRefKeys(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectBusinessRefKeys(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isBusinessRefKey(key)) into.push(here);
            else collectBusinessRefKeys(value, here, into);
        }
    }
    return into;
}

/**
 * 참조 키가 재작성된 뒤의 **id 형** 키(`assetId`·`photoAssetId`·`productId`·`productIds`…).
 * 시드에는 이 형태가 있으면 안 된다(§2.6-5) — 아래 NUMERIC_ID 게이트가 쓴다.
 */
//
// ⚠ **백엔드 `SeedIdKeys` 와 같은 판정이어야 한다.** memo139 D9 가 "백엔드·팩 양쪽에 category 어간을
//    넣었다"고 적었는데 **팩 쪽이 안 들어갔다**(심의 실측): `categoryId: 46` 을 시드에 넣으면 팩은
//    통과하고 개시가 500 으로 죽는다 — 이 파일 곳곳이 경고하는 "가장 늦게 발견되는 결함" 그 형태다.
//    판정 방식도 백엔드와 맞춘다: **영숫자만 남겨 정규화**한 뒤 어간을 본다(`product_category_id`·
//    `category-id`·후행 공백 같은 위장 철자를 같은 자리로 접는다).
const ID_STEMS = ["asset", "product", "category"];
const isRewrittenIdKey = (key) => {
    const lower = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    let stem;
    if (lower.endsWith("ids")) stem = lower.slice(0, -3).replace(/s$/, "");
    else if (lower.endsWith("id")) stem = lower.slice(0, -2);
    else return false;
    return ID_STEMS.some((s) => stem === s || stem.endsWith(s));
};

/** 계약이 요구하는 id 형 키(`*AssetId`)를 소스가 쓰는 참조형 키(`*Asset`)로 되돌린다. */
const seedKeyOf = (idKey) => (idKey.endsWith("Ids") ? `${idKey.slice(0, -3)}s` : idKey.replace(/Id$/, ""));

/** 시드 config 에 재작성된 id 형 키가 있으면 그 경로를 모은다(§2.6-5 — 숫자 직기입 금지). */
function collectIdKeys(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectIdKeys(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isRewrittenIdKey(key)) into.push(here);
            else collectIdKeys(value, here, into);
        }
    }
    return into;
}

/**
 * 계약 정본(`@zalkera/client` 의 SECTION_CONTRACT)을 읽는다. **못 읽으면 팩을 실패시킨다** — 조용히 꺼지는
 * 게이트는 게이트가 아니고, 팩은 릴리스 행위라 `npm ci` 된 체크아웃에서 도는 것이 정상이다.
 *
 * 읽는 것은 타입 목록과 **필수 참조 키**(`requiredRefs` — contractRev 3·memo119 §2.6-3)다. 필수성의 지식은
 * 렌더 계약의 것이라 여기서 다시 짜지 않고 운반체가 실어 온 선언을 그대로 쓴다. 그 필드가 없는 구버전
 * client 로는 **팩하지 않는다** — 있는 줄 알았던 게이트가 사실 꺼져 있는 것이 가장 나쁜 상태다.
 */
function sectionContract() {
    try {
        const contract = createRequire(import.meta.url)("@zalkera/client")?.SECTION_CONTRACT;
        if (!Array.isArray(contract) || !contract.length) throw new Error("SECTION_CONTRACT 가 비었습니다(구버전 client)");
        // rev 5 부터 그룹 축(`requiredRefsAnyOf`)도 필요하다 — 없는 client 로 팩하면 "있는 줄 알았던
        // 게이트가 사실 꺼져 있는" 상태가 된다(rev 3 의 requiredRefs 도입 때와 같은 관례).
        const stale = contract
            .filter((s) => !Array.isArray(s?.requiredRefs) || !Array.isArray(s?.requiredRefsAnyOf))
            .map((s) => s?.type ?? String(s));
        if (stale.length) {
            throw new Error(
                `SECTION_CONTRACT 에 requiredRefs·requiredRefsAnyOf 가 없습니다(contractRev 5 미만) — ${stale.slice(0, 3).join(", ")}…`,
            );
        }
        return new Map(contract.map((s) => [s.type, s]));
    } catch (e) {
        console.error(`섹션 어휘 계약을 읽지 못했습니다 — ${e.message}`);
        console.error("  → 이 체크아웃에서 `npm ci` 를 먼저 돌리십시오(vendored @zalkera/client 설치).");
        process.exit(1);
    }
}

/**
 * 잣대 배송 확인 — **고객 zip 이 자기 약속을 지킬 수 있는가**(memo122 §1.3).
 *
 * `CUSTOMIZE.md` 는 고객에게 "산출물 검사기가 이 zip 에 들어 있고, 잣대는 `@zalkera/client` 로 따라온다"고
 * 약속한다. 그 약속의 참·거짓은 **이 체크아웃이 무는 client 버전**이 정한다 — 운반본을 안 싣는 버전을 물고
 * 팩하면, 문서만 참이고 물건은 거짓인 zip 이 나간다(그 상태를 실제로 한 번 배송한 것이 이 게이트의 이유다).
 *
 * 검사는 버전 비교가 아니라 **능력 확인**이다: 지금 설치된 client 에서 그 하위 경로가 열리는가. 버전 상수는
 * 갈라지지만 능력은 안 갈라진다. 팩은 릴리스 행위라 `npm ci` 된 체크아웃에서 도는 것이 정상이므로
 * (`sectionContract()` 와 같은 전제), 설치된 트리를 재는 것이 곧 고객이 받을 것을 재는 것이다.
 */
function assertGuaranteesCarried() {
    const require = createRequire(import.meta.url);
    /**
     * memo123 §6.1: 잣대만이 아니라 **검사기 자신**도 이제 client 가 배송한다(template 의 스크립트는
     * 그 bin 을 부르는 wrapper 다). 그래서 셋 다 열려야 zip 의 약속이 참이다 — 검사기가 없는 버전을
     * 물고 팩하면 고객의 `npm run check:aeo` 는 잣대를 찾기도 전에 wrapper 에서 exit 2 로 죽는다.
     */
    const needed = [
        ["AEO_YARDSTICK", "@zalkera/client/contracts/aeo-surface-guarantees.json", "AEO 보장표 운반본(잣대)"],
        ["AEO_CHECKER", "@zalkera/client/bin/check-aeo-surfaces.mjs", "산출물 검사기 본체"],
        ["AEO_CRAWLER", "@zalkera/client/lib/site-crawl.mjs", "검사기가 쓰는 크롤러"],
    ];
    const missing = needed.filter(([, specifier]) => {
        try {
            require.resolve(specifier);
            return false;
        } catch {
            return true;
        }
    });
    if (missing.length === 0) return;
    console.error("팩 실패 — 이 zip 의 약속을 못 지킵니다(zip 을 하나도 쓰지 않았습니다):");
    for (const [tag, specifier, what] of missing) {
        console.error(`  [${tag}] 설치된 @zalkera/client 가 ${what}을(를) 싣지 않습니다 — ${specifier}`);
    }
    console.error("    이대로 팩하면 고객이 `npm run check:aeo` 를 돌렸을 때 검사기·잣대를 못 찾아 멈추는데,");
    console.error("    CUSTOMIZE.md 는 따라온다고 약속합니다 — 문서만 참인 물건은 내보내지 않습니다.");
    console.error("    → 그것들을 실은 @zalkera/client 를 발행하고, 이 레포의 의존을 그 버전으로 올린 뒤");
    console.error("      (`npm i @zalkera/client@<버전>` — package-lock 포함) 다시 팩하십시오.");
    process.exit(1);
}

/**
 * 정적 라우트 세그먼트(`src/app/<seg>/page.tsx`). Next 규칙상 정적 세그먼트가 `[slug]` 보다 **우선**하므로,
 * 같은 이름의 시드 페이지는 그려지지 않는다 — 데이터는 들어갔는데 아무도 못 보는 고아가 된다.
 * 조용한 그림자라 사람 눈으로는 안 잡힌다. 레포에서 직접 세어 시드 slug 와 대조한다.
 */
function reservedSlugs() {
    const appDir = join(ROOT, "src/app");
    return new Set(
        readdirSync(appDir, {withFileTypes: true})
            .filter((e) => e.isDirectory() && !e.name.startsWith("[") && !e.name.startsWith("_"))
            .map((e) => e.name),
    );
}

/** 큐레이션 아이콘 맵은 레포 안에 있으니 항상 대조한다 — 미지 아이콘은 렌더에서 조용히 사라진다(§4.4). */
function iconKeys() {
    const src = readFileSync(join(ROOT, "src/components/ui/Icon.tsx"), "utf8");
    const body = src.slice(src.indexOf("export const ICONS"), src.indexOf("export const ICON_KEYS"));
    return new Set([...body.matchAll(/"([a-z0-9-]+)":/g)].map((m) => m[1]));
}

/**
 * 루트가 홈으로 집어 오는 slug(`src/app/page.tsx` 참조). 정적 라우트와 겹치지만 **의도된 겹침**이라
 * 그림자 검사에서 면제한다 — 이 페이지만은 `/home` 이 아니라 `/` 로 나간다.
 */
const HOME_SLUG = "home";

/**
 * 시드 v3 검증(memo142) — 남은 최상위 키는 **`themeColors` 하나**다.
 *
 * `pages`·`menus` 는 팩 v2 에서 탈락했고(그 자리를 `content/` 가 받는다 — 아래 [validateContent]),
 * `products`·`categories` 는 팩 v3 에서 탈락했다(그 자리를 **소스의 직접 호출**이 받는다).
 *
 * **잔재 키를 조용히 무시하지 않고 실패시키는 이유는 두 세대가 같다**: 무시하면 그 프리셋은
 * "상품을 넣었는데 안 생기는"·"페이지를 넣었는데 안 나오는" 상태로 나가고, 그 원인이 파일 어디에도
 * 안 적혀 있다. 백엔드도 같은 판정이다(strict 파싱이 미지 키로 개시를 중단한다) — 갈리면 안 되는 축이다.
 */
function validateSeed(code, seedBytes, assetNames) {
    if (seedBytes.length > CAPS.seedJsonBytes) {
        fail("SEED_SIZE", `${code}: seed.json ${seedBytes.length}B > ${CAPS.seedJsonBytes}B`);
    }

    let seed;
    try {
        seed = JSON.parse(seedBytes.toString("utf8"));
    } catch (e) {
        fail("SEED_PARSE", `${code}: seed.json 파싱 실패 — ${e.message}`);
        return null;
    }

    const legacy = ["pages", "menus"].filter((k) => k in seed);
    if (legacy.length) {
        fail(
            "SEED_V1",
            `${code}: seed.json 에 ${legacy.join("·")} 가 남아 있습니다 — 팩 v2 에서 사이트의 얼굴은 ` +
                `presets/${code}/content/ 로 갔습니다. 옮기고 지우십시오`,
        );
    }
    // ⚠ **팩 v3 의 핵심 게이트**(memo142). 상품·갈래를 시드에 실으면 그것은 우리가 고객 DB 에 업무
    //    데이터를 만드는 것이고, 갈래 이름(`리빙`·`시술`)은 애초에 **사장이 정할 이름**이다.
    //    카탈로그의 입구는 콘솔·MCP 이고, 화면에 비추는 일은 소스가 `listProducts()` 로 한다.
    const business = ["products", "categories"].filter((k) => k in seed);
    if (business.length) {
        fail(
            "SEED_BUSINESS_DATA",
            `${code}: seed.json 에 ${business.join("·")} 가 있습니다 — 시드는 업무 데이터를 만들지 않습니다` +
                `(memo142 §1). 카탈로그는 콘솔·MCP 가 채우고, 화면은 소스가 listProducts()·` +
                `listProductCategories() 를 직접 불러 그립니다. 견본 카탈로그가 필요하면 ` +
                `qa/fixtures/${code}/catalog.json 으로 옮겨 파트너 API 로 적재하십시오`,
        );
    }
    const unknownTop = Object.keys(seed).filter((k) => k !== "themeColors");
    if (unknownTop.length && !unknownTop.every((k) => ["pages", "menus", "products", "categories"].includes(k))) {
        const rest = unknownTop.filter((k) => !["pages", "menus", "products", "categories"].includes(k));
        fail("SEED_STRICT", `${code}: 최상위 미지 키 — ${rest.join(", ")}. 남은 키는 themeColors 뿐입니다`);
    }

    // `.zalkera/assets/` 는 **전송 이미지 풀**이다. 팩 v3 에서 그 유일한 소비자(상품 커버)가 사라져
    // 현행 팩들은 이 디렉터리가 아예 없다 — 파일을 두면 아무도 안 쓰는 채로 배송된다.
    // 섹션 이미지의 정위치는 레포 상주(`presets/<code>/public/`)이고 그건 아래 [validateContent] 가 센다.
    for (const name of assetNames) {
        fail(
            "REF_UNUSED",
            `${code}: 아무도 안 쓰는 전송 에셋 — .zalkera/assets/${name}. 섹션 이미지라면 ` +
                `presets/${code}/public/ 로 옮기고(레포 상주가 정위치입니다), 상품 이미지라면 ` +
                `qa/fixtures/${code}/assets/ 로 옮기십시오(카탈로그는 콘솔이 채웁니다)`,
        );
    }

    return {seed};
}

/**
 * 콘텐츠 파일 검증 — **팩 v1 의 시드 페이지 검사가 통째로 이사 온 자리**다.
 *
 * 검사 항목이 바뀐 게 아니라 **대상 파일**이 바뀌었다: 계약 타입·필수 참조·아이콘·id 형 금지·slug
 * 그림자·캡. 여기서 막는 이유도 그대로다 — 이 결함들은 전부 예외를 안 던지고 **섹션이 조용히 사라지는**
 * 모양으로 나타나므로, 고객 개시 순간이 아니라 우리 터미널에서 죽어야 한다(전제 A 합치: 게이트는
 * 우리 산출물인 팩에만 걸리고 고객 zip·고객 레포에는 안 걸린다).
 *
 * 새로 생긴 축 둘: ⑴ 에셋이 `public/` 루트 절대 경로이고 그 파일이 실재하는가 ⑵ `sortOrder` 잔존
 * (배열이 순서인데 키가 남으면 순서의 원장이 둘이 된다).
 */
function validateContent(code, contentDir, publicNames, contract, icons, reserved) {
    const pagesDir = join(contentDir, "pages");
    let files;
    try {
        files = readdirSync(pagesDir).filter((n) => n.endsWith(".json")).sort();
    } catch {
        fail("CONTENT_MISSING", `${code}: presets/${code}/content/pages/ 가 없습니다 — 팩 v2 는 여기서 얼굴을 읽습니다`);
        return {pages: [], nav: null, usedAssets: new Set()};
    }
    if (files.length > CAPS.pages) fail("CAP_PAGES", `${code}: 페이지 ${files.length} > ${CAPS.pages}`);

    const pages = [];
    const usedAssets = new Set();

    for (const file of files) {
        const slug = file.slice(0, -".json".length);
        const path = join(pagesDir, file);
        const bytes = readFileSync(path);
        let doc;
        try {
            doc = JSON.parse(bytes.toString("utf8"));
        } catch (e) {
            fail("CONTENT_PARSE", `${code}/${slug}: 파싱 실패 — ${e.message}`);
            continue;
        }
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail("CONTENT_SHAPE", `${code}/${slug}: 최상위가 객체여야 합니다`);
            continue;
        }
        pages.push({slug, path, bytes});

        if (!/^[a-z0-9-]+$/.test(slug)) {
            fail("SLUG_FORMAT", `${code}: 파일명 "${file}" — slug 는 소문자·숫자·하이픈만 씁니다`);
        }
        if (slug !== HOME_SLUG && reserved.has(slug)) {
            fail(
                "SLUG_SHADOWED",
                `${code}: slug "${slug}" 는 정적 라우트 src/app/${slug}/ 에 가려집니다 — 이 페이지는 안 그려집니다`,
            );
        }
        if (typeof doc.title !== "string" || doc.title.trim() === "") {
            fail("CONTENT_TITLE", `${code}/${slug}: title 은 비어 있지 않은 문자열이어야 합니다`);
        }

        const sections = doc.sections ?? [];
        if (!Array.isArray(sections)) {
            fail("CONTENT_SECTIONS", `${code}/${slug}: sections 는 배열이어야 합니다 — 배열 순서가 곧 화면 순서입니다`);
            continue;
        }
        if (sections.length > CAPS.sectionsPerPage) {
            fail("CAP_SECTIONS", `${code}/${slug}: 섹션 ${sections.length} > ${CAPS.sectionsPerPage}`);
        }

        for (const [i, section] of sections.entries()) {
            const at = `${code}/${slug} sections[${i}]`;
            if (section == null || typeof section !== "object" || Array.isArray(section)) {
                fail("CONTENT_SECTION", `${at}: 섹션은 { type, config } 객체여야 합니다`);
                continue;
            }
            if ("sortOrder" in section) {
                fail(
                    "SORT_ORDER",
                    `${at}: sortOrder 는 콘텐츠 파일에 없는 키입니다 — 배열 순서가 순서입니다(계약 rev 4). ` +
                        `남겨 두면 "순서 바꿔"가 고칠 자리가 둘이 됩니다`,
                );
            }
            const spec = contract.get(section.type);
            if (!spec) {
                fail("CONTRACT", `${at}: 계약에 없는 섹션 타입 — ${section.type}`);
            }
            const config = section.config ?? {};
            if (config == null || typeof config !== "object" || Array.isArray(config)) {
                fail("CONTENT_CONFIG", `${at}: config 는 객체여야 합니다(JSON 문자열은 DB 방언입니다)`);
                continue;
            }
            const bytesOfConfig = Buffer.byteLength(JSON.stringify(config), "utf8");
            if (bytesOfConfig > CAPS.configBytes) {
                fail("CAP_CONFIG", `${at}: config ${bytesOfConfig}B > ${CAPS.configBytes}B`);
            }
            for (const item of config.items ?? []) {
                if (item?.icon && !icons.has(item.icon)) {
                    fail("ICON", `${at}: 큐레이션 맵에 없는 아이콘 — ${item.icon}`);
                }
            }

            // 필수 참조 — 계약이 id 형으로 선언한 것을 소스 방언 키로 되돌려 본다.
            for (const idKey of spec?.requiredRefs ?? []) {
                const key = seedKeyOf(idKey);
                const value = config[key];
                const filled = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value !== "";
                if (!filled) {
                    fail(
                        "REQUIRED_REF",
                        `${at}: ${section.type} 이 필수 참조 "${key}" 를 안 가리킵니다 — 렌더러가 이 섹션을 통째로 건너뜁니다(계약 ${idKey} 필수)`,
                    );
                }
            }

            // ⚠ **업무 참조 키 금지**(memo142 §1 기계 판정 · 팩 v3 의 핵심 게이트).
            //
            //    종전에는 여기서 "이 갈래가 시드에 있는가"를 대조했다. 이제 묻는 것이 다르다 —
            //    **선언이 업무 축을 가리키는 것 자체**가 경계 위반이다. 값이 업무 DB 에 살고 화면이
            //    비추기만 하는 조회는 선언이 아니라 소스의 소관이고(`ProductRail` 이 본보기), 절반 선언은
            //    "어디에"만 선언에 두고 "어떻게"를 공유 렌더러에 얼려 버린다.
            //
            //    **타입 이름이 아니라 키 형상으로 건다** — 어휘에서 조회형 둘이 삭제됐지만 같은 성격의
            //    타입이 다시 생겨도 여기서 잡힌다. 이 게이트는 **우리 산출물인 팩에만** 선다(요건 1:
            //    고객 zip·고객 레포의 어휘를 우리가 강제하지 않는다).
            for (const path of collectBusinessRefKeys(config)) {
                fail(
                    "BUSINESS_REF",
                    `${at}: 섹션 config 에 업무 참조 키 "${path}" — 배송물은 업무 축의 고유명사(상품 handle·` +
                        `갈래 slug)를 박지 않습니다(받은 사람 카탈로그에는 그 이름이 없어 영구히 빕니다). ` +
                        `진열은 소스에서 listProducts()·listProductCategories() 를 직접 부르십시오`,
                );
            }

            // 참조 그룹(rev 5) — 각 그룹에서 **하나 이상**이 채워져야 한다. 막으려는 것은
            // requiredRefs 와 같다(아무것도 안 가리킨 채 들어와 조용히 사라지는 섹션). 단위만 넓다.
            for (const group of spec?.requiredRefsAnyOf ?? []) {
                const keys = group.map(seedKeyOf);
                const anyFilled = keys.some((key) => {
                    const value = config[key];
                    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value !== "";
                });
                if (!anyFilled) {
                    fail(
                        "REQUIRED_REF",
                        `${at}: ${section.type} 이 ${keys.map((k) => `"${k}"`).join(" 또는 ")} 중 아무것도 안 가리킵니다 —` +
                            ` 렌더러가 이 섹션을 통째로 건너뜁니다`,
                    );
                }
            }

            // 숫자 직기입 금지 — 소스는 테넌트를 안 가린다.
            for (const path of collectIdKeys(config)) {
                fail(
                    "NUMERIC_ID",
                    `${at}: id 형 키 "${path}" — 소스는 참조형(public 경로·handle)으로 씁니다. 숫자 id 는 테넌트 스코프라 이 소스가 다른 테넌트에서 의미를 잃습니다`,
                );
            }

            // 에셋 = public 루트 절대 경로 + 실재.
            for (const [key, value] of Object.entries(flattenAssetRefs(config))) {
                if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.split("/").includes("..")) {
                    fail("ASSET_PATH", `${at}: "${key}" = ${JSON.stringify(value)} — public 루트 절대 경로여야 합니다(예 "/images/hero.png")`);
                    continue;
                }
                if (!publicNames.has(value)) {
                    fail("REF_MISSING", `${at}: 참조한 이미지 없음 — presets/${code}/public${value}`);
                }
                usedAssets.add(value);
            }

        }
    }

    // 역방향 — 아무 페이지도 안 쓰는 이미지. 에셋 풀과 같은 규칙이다(§3.2-a-7).
    for (const name of publicNames) {
        if (!usedAssets.has(name)) fail("REF_UNUSED", `${code}: 아무도 안 쓰는 이미지 — presets/${code}/public${name}`);
    }

    // 내비 — 없으면 정상(내비가 빈다). 있으면 형상을 본다.
    let nav = null;
    const navPath = join(contentDir, "nav.json");
    try {
        const navBytes = readFileSync(navPath);
        const parsed = JSON.parse(navBytes.toString("utf8"));
        nav = {path: navPath, bytes: navBytes};
        for (const position of ["header", "footer"]) {
            const links = parsed?.[position] ?? [];
            if (!Array.isArray(links)) {
                fail("NAV_SHAPE", `${code}: nav.json ${position} 는 배열이어야 합니다`);
                continue;
            }
            if (links.length > CAPS.navLinks) fail("CAP_NAV", `${code}: nav ${position} ${links.length} > ${CAPS.navLinks}`);
            for (const link of links) {
                if (typeof link?.label !== "string" || typeof link?.href !== "string") {
                    fail("NAV_LINK", `${code}: nav.json ${position} 항목은 { label, href } 문자열이어야 합니다 — ${JSON.stringify(link)}`);
                }
            }
        }
    } catch (e) {
        if (e.code !== "ENOENT") fail("NAV_PARSE", `${code}: nav.json — ${e.message}`);
    }

    return {pages, nav, usedAssets};
}

/** 중첩까지 훑어 에셋 참조를 `{경로: 값}` 으로 편다. */
function flattenAssetRefs(node, prefix = "", into = {}) {
    if (Array.isArray(node)) node.forEach((v, i) => flattenAssetRefs(v, `${prefix}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = prefix ? `${prefix}.${key}` : key;
            if (isReferenceKey(key)) into[here] = value;
            else flattenAssetRefs(value, here, into);
        }
    }
    return into;
}

/** 에셋 캡·형식. 백엔드가 put 전에 하는 판정을 팩에서 먼저 한다(같은 규칙·다른 시점). */
function validateAssets(code, assets) {
    if (assets.length > CAPS.assets) fail("CAP_ASSETS", `${code}: 에셋 ${assets.length}개 > ${CAPS.assets}개`);

    let total = 0;
    for (const {name, bytes} of assets) {
        total += bytes.length;
        if (bytes.length > CAPS.assetFileBytes) fail("CAP_FILE", `${code}: ${name} ${bytes.length}B 초과`);

        const spec = RASTER[name.split(".").pop().toLowerCase()];
        if (!spec) {
            fail("ASSET_TYPE", `${code}: ${name} — 허용 확장자는 ${Object.keys(RASTER).join("·")} 뿐`);
            continue;
        }
        const matches = (offset, magic) => magic.every((b, i) => bytes[offset + i] === b);
        const ok = matches(0, spec.magic) && (!spec.tag || matches(spec.tag.offset, spec.tag.bytes));
        if (!ok) fail("ASSET_MAGIC", `${code}: ${name} — 확장자와 실제 바이트가 다릅니다`);
    }
    if (total > CAPS.assetTotalBytes) fail("CAP_TOTAL", `${code}: 에셋 총량 ${total}B > ${CAPS.assetTotalBytes}B`);
}

/**
 * §7 라이선스 게이트 — zip 에 실리는 이미지 **전수**가 매니페스트에 적혀 있어야 팩이 성공한다.
 * 출처 기록이 고객 소스와 **동행**하는 것이 소유 원칙상 정위치라, 기록 없는 이미지는 아예 나갈 수 없게 한다.
 *
 * 팩 v2 에서 대상이 셋으로 늘었다: `.zalkera/assets/`(상품 이미지) · **`presets/<code>/public/`(섹션
 * 이미지 — 새 거처)** · 템플릿 자신의 `public/`. 새 거처를 빠뜨리면 라이선스 기록 없는 이미지가
 * 레포 상주로 나가는데, 그게 정확히 이 게이트가 막으려던 것이다.
 */
function validateLicense(code, manifest, assets, presetPublicImages, overlayImages = []) {
    const templateImages = listImages(join(ROOT, "public"));
    // ⚠ 오버레이 이미지도 센다(보안 심의 W1). 종전 대상은 `.zalkera/assets`·프리셋 `public/`·템플릿
    //    `public/` 뿐이라, `presets/<code>/src/` 밑에 둔 이미지가 **기록 없이 zip 에 실렸다**(실측).
    //    §7 게이트의 "기록 없는 이미지는 나갈 수 없다"가 오버레이에서 거짓이었다.
    for (const name of [...assets.map((a) => a.name), ...presetPublicImages, ...templateImages, ...overlayImages]) {
        if (!manifest.includes(name)) fail("LICENSE", `${code}: ASSETS-LICENSE.md 에 없는 이미지 — ${name}`);
    }
}

function listImages(dir) {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return [];
    }
    return entries.flatMap((e) =>
        e.isDirectory()
            ? listImages(join(dir, e.name))
            : /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(e.name)
              ? [e.name]
              : [],
    );
}

// ── ZIP (결정론) ─────────────────────────────────────────────────────────────

const DOS_TIME = 24576; // 12:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (7 << 5) | 26; // 2026-07-26 고정 — 팩 시각이 sha 를 흔들지 않게.

function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const {path, bytes} of entries) {
        const name = Buffer.from(path, "utf8");
        const deflated = deflateRawSync(bytes, {level: 9});
        const useStore = deflated.length >= bytes.length;
        const body = useStore ? bytes : deflated;
        const method = useStore ? 0 : 8;
        const sum = crc32(bytes);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 파일명
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(sum, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(bytes.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(sum, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(bytes.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // 외부 속성: 일반 파일 0644(JS 시프트는 부호 있음 — 반드시 >>>0)
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += 30 + name.length + body.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuf, end]);
}

/** 정본 소스 = git 추적 파일. `node_modules`·빌드 산출물이 자동으로 빠지고 목록이 사람 손을 안 탄다. */
function sourceEntries() {
    const tracked = execFileSync("git", ["ls-files", "-z"], {cwd: ROOT, maxBuffer: 32 * 1024 * 1024})
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .filter((p) => !SOURCE_EXCLUDES.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x)))
        .sort();
    return tracked.map((path) => ({path, bytes: readFileSync(join(ROOT, path))}));
}

/**
 * 소스 출처 확인 — **팩은 커밋을 봉인하는 행위**다.
 *
 * `sourceEntries()` 는 경로만 git 에서 얻고 **바이트는 워킹트리에서** 읽는다. 즉 미커밋 편집이
 * 조용히 zip 에 들어가, 어떤 커밋과도 대응하지 않는 산출물이 고객에게 간다. 나중에 "이 사이트가
 * 어느 판본이냐"를 물으면 답할 수 없다. 더러운 트리에서는 팩하지 않는다.
 *
 * 뒤처진 체크아웃도 같은 병이다 — 2026-07-27 에 실제로 이 자리에서 났다. 원격은 인증 결함을
 * 이미 고쳤는데 로컬이 3커밋 뒤처져 있어, 그대로 팩했으면 **고쳐진 것을 되돌린 zip** 이 카탈로그에
 * 올라갈 뻔했다. fetch 는 하지 않는다(팩에 네트워크를 끌어들이지 않는다) — 이미 아는 원격
 * 참조로만 재고, 뒤처졌으면 경고한다. 판단은 사람이 한다.
 */
function sourceProvenance() {
    const git = (...a) => execFileSync("git", a, {cwd: ROOT}).toString("utf8").trim();
    const head = git("rev-parse", "--short", "HEAD");
    const dirty = git("status", "--porcelain");
    if (dirty && !process.argv.includes("--allow-dirty")) {
        fail("DIRTY_TREE", `미커밋 변경이 있습니다 — 커밋 후 팩하십시오(부득이하면 --allow-dirty):\n${dirty}`);
    }
    let behind = "";
    try {
        behind = git("rev-list", "--count", "HEAD..origin/main");
    } catch {
        // 원격 추적 참조가 없는 체크아웃(클론 직후·분리 헤드) — 잴 수 없으면 잠자코 넘긴다.
    }
    if (behind && behind !== "0") {
        console.warn(`  ⚠ 로컬이 origin/main 보다 ${behind}커밋 뒤처졌습니다 — 낡은 판본을 봉인할 수 있습니다.`);
        console.warn("    `git fetch && git status` 로 확인하고, 최신이 맞다면 그대로 진행하십시오.");
    }
    return head;
}

/**
 * 소스 보안 불변식 — 팩에 실리는 **코드 자체**를 본다(시드·에셋은 위에서 이미 본다).
 *
 * 왜 여기냐: 프리셋 zip 이 이 레포의 코드가 고객 사이트로 가는 **유일한 통로**다. 여기서 막으면
 * 결함이 고객 개시 순간이 아니라 우리 터미널에서 드러난다 — 이 스크립트의 원래 철학 그대로다.
 *
 * 소셜 로그인 콜백의 state 대조는 **fail-closed** 여야 한다. `if (saved && state && saved !== state)`
 * 형태는 검사가 있는 것처럼 보이지만 사실상 없는 것이다 — 공격자는 링크에서 state 를 빼기만 하면
 * 되고, 피해자는 애초에 로그인을 시작하지 않았으므로 저장된 값도 늘 비어 있다. 그러면 공격자 계정
 * 세션이 피해자 브라우저에 심겨, 피해자가 자기 계정인 줄 알고 주소·연락처를 적어 넣는다.
 * 4계보에 같은 파일이 흩어져 있던 레포라 기계 검사가 없으면 재발한다.
 */
function validateSource(source) {
    const callbacks = source.filter((e) => /src\/app\/auth\/callback\/.*\.tsx$/.test(e.path));
    for (const entry of callbacks) {
        const text = entry.bytes.toString("utf8");
        if (!text.includes("STATE_STORAGE_KEY")) continue; // state 를 안 다루는 콜백 파일은 대상이 아니다
        if (/if\s*\(\s*saved\s*&&/.test(text) || !/!saved/.test(text)) {
            fail("AUTH_FAIL_OPEN", `${entry.path}: OAuth state 대조가 fail-open 입니다 — 값이 없으면 거부해야 합니다(!saved || !state || saved !== state)`);
        }
    }
}

// ── 팩 ───────────────────────────────────────────────────────────────────────

/** 프리셋 `public/` 아래 전 파일을 `{zip 경로, public 루트 경로, bytes}` 로 모은다. */
/**
 * `presets/<code>/src/**` — **정본 소스를 파일 단위로 가리는 오버레이.**
 *
 * 왜 필요한가: 사이트의 정체는 선언이 아니라 **`@zalkera/client` 를 어떻게 부르는가**로 구성된다
 * (오너 확정 2026-08-01). 그런데 정본 `src/` 는 전 팩 공유라, 커머스 호출을 쓰지 않는 팩(홍보·소개)이
 * 자기 구성을 만들 방법이 규칙상 없었다 — 헤더에 장바구니·로그인이 남는 것이 그 증상이다.
 * 그것을 `commerce: boolean` 같은 **렌더를 바꾸는 선언**으로 우회하려던 시도는 기각됐다
 * (정본이 허용하는 선언은 *검증을 켜는* 선언뿐이다 — memo125 요건 1 "계약 준수는 선언으로 자발적이다").
 *
 * **포크가 아닌 이유**: memo102 "테마마다 소스를 포크하지 않는다"의 실질은 유지보수였다(정본 패치가
 * 전 팩에 전파되어야 한다). 오버레이는 가리는 파일이 **유한하고 기계로 열거된다** — 팩이 매번
 * 목록을 찍으므로, 정본 패치가 가려진 파일을 건드릴 때 사람이 안다. 전면 포크의 비가시 드리프트와 다르다.
 * 가려진 파일에 정본 패치가 안 닿는 비용은 **정체 차이의 본질 비용**이라 없앨 수 없고, 가시화로 관리한다.
 *
 * v1 은 `src/**` 전체를 허용한다(추가·교체만 — 삭제는 짓지 않는다). `components/` 로만 좁히면 홍보 팩이
 * 자기 라우트를 못 만들어 같은 결함이 라우트 축에서 재발한다.
 */
function presetSourceOverlay(code) {
    const rel = `presets/${code}/src`;
    const dir = join(PRESETS_DIR, code, "src");
    if (!existsSync(dir)) return [];

    // ── ⑴ **git 원장만 싣는다**(보안 심의 B1). `sourceEntries()` 가 `git ls-files` 를 쓰는 이유가
    //    "목록이 사람 손을 안 탄다"인데, 오버레이가 `readdirSync` 로 걸으면 그 원장을 우회한다.
    //    실측: `presets/<code>/src/.env.local` 은 `.gitignore` 에 걸려 **`git status` 가 깨끗한 채**
    //    zip 에 실렸다(DIRTY_TREE 도 ignored 파일은 못 본다). 프리셋 zip 은 그 프리셋으로 개시하는
    //    **전 테넌트**에 복제되므로 파급이 테넌트 수만큼이다.
    const tracked = new Set(
        execFileSync("git", ["ls-files", "-z", "--", rel], {cwd: ROOT, maxBuffer: 32 * 1024 * 1024})
            .toString("utf8")
            .split("\0")
            .filter(Boolean),
    );
    if (tracked.size === 0) {
        fail("OVERLAY_UNTRACKED", `${code}: ${rel} 에 git 추적 파일이 없습니다 — 커밋 후 팩하십시오`);
        return [];
    }

    const out = [];
    for (const path of [...tracked].sort()) {
        const abs = join(ROOT, path);
        // ── ⑵ **심링크 거부**(B2). `readFileSync` 는 대상 내용을 그대로 읽으므로, 레포 밖 파일이
        //    `.tsx` 이름을 쓰고 zip 에 실릴 수 있다(이름 기반 시크릿 스캔도 못 잡는다). 실측 재현됨.
        if (lstatSync(abs).isSymbolicLink()) {
            fail("OVERLAY_SYMLINK", `${path}: 오버레이에 심링크를 둘 수 없습니다 — 대상 내용이 zip 에 실립니다`);
            continue;
        }
        // ── ⑶ **중립 배선은 가릴 수 없다**(B3). 이 파일들은 능력 구성이 아니라 **플랫폼 계약**이다
        //    (memo140 §3 표). 실측: `crossOrigin.ts` 를 `return true` 스텁으로 가려도 팩·validate·
        //    verify-zip 이 전부 green 이었다 — X1 은 "호출했는가"만 보고 `npm test` 는 정본 src 만 본다.
        //    그래서 여기가 그 자물쇠의 유일한 자리다.
        const inner = path.slice(`presets/${code}/`.length);
        if (PROTECTED_WIRING.some((g) => inner === g || inner.startsWith(g))) {
            fail(
                "OVERLAY_PROTECTED",
                `${path}: 중립 배선은 오버레이로 가릴 수 없습니다(${inner}) — 능력 구성이 아니라 플랫폼 계약입니다. ` +
                    "표현을 바꾸려면 그 파일이 아니라 화면 컴포넌트를 가리십시오.",
            );
            continue;
        }
        out.push({path: `src/${inner.slice("src/".length)}`, bytes: readFileSync(abs)});
    }
    return out;
}

/**
 * 오버레이로 **가릴 수 없는** 정본 파일(보안 심의 B3). memo140 §3 의 "중립 배선"을 기계화한 것이다 —
 * 지우거나 갈아치우면 플랫폼 계약이 죽는데, 죽어도 어떤 검사기도 못 잡는 자리들이다.
 *
 * 능력 구성(커머스·예약·게시판)은 여기 없다 — 그것은 빼고 더하는 것이 자유다.
 */
const PROTECTED_WIRING = [
    "src/lib/crossOrigin.ts", // memo118 교차사이트 위조 가드 — **판정**
    // ⚠ 판정만 지키면 소용없다(보안 심의 차단 2). 실제로 403 을 만드는 것은 **전송층**이라,
    //    `http.ts` 의 `assertSameOrigin` 을 `return null` 스텁으로 가리면 **변이 라우트 18개의 가드가
    //    전부 죽은 zip 이 팩·validate 를 그린으로 통과한다**(E2E 재현). 판정/전송을 가른 뒤 이 목록이
    //    따라오지 않은 것이 결함이었다.
    "src/lib/http.ts",
    "src/lib/session.ts", // 쿠키 httpOnly·secure 정책, state 소각
    "src/lib/oauth.ts", // safeNextPath — 오픈 리다이렉트 판정
    "src/lib/safeUrl.ts", // 오픈 리다이렉트 소독
    "src/lib/oauthState.ts", // OAuth state 대조(fail-closed)
    "src/lib/env.ts",
    "src/lib/buildEnv.ts",
    "src/lib/theme.ts", // L1 테마 주입의 심장
    "src/lib/zalkera.ts", // 클라이언트 싱글턴(baseUrl·시크릿 주입 지점)
    "src/app/api/revalidate/", // ISR 무효화 — 시크릿 헤더 가드
    "src/app/media/", // 미디어 프록시
    "src/app/robots.ts",
    "src/app/sitemap.ts",
];

/**
 * `llms.txt` 를 **설치본에서 바이트 그대로** 실어 zip 루트에 둔다(Fable 설계 2026-08-01).
 *
 * 종전에는 zip 안에 없었다 — `npm ci` 뒤 `node_modules/@zalkera/client/llms.txt` 에만 생겼다. 그래서
 * zip 만 받아 연 사람, 그리고 **zip 을 통째로 물린 고객 LLM** 은 명세를 영영 못 읽었다. `README.md` 가
 * "AI 매뉴얼 — llms.txt"로 그 파일을 가리키는데 눈앞에 없었으니, 배송이 자기 문서를 배신하고 있었다.
 *
 * ⚠ **레포에 사본을 두지 않는다** — 두 번째 정본이 되어 드리프트가 시작된다. 팩 시점에 설치본에서
 * 복사하고, 재직렬화하지 않는다(바이트 대조가 드리프트를 숨을 곳 없이 잡게 한다 — `sync-aeo-guarantees`
 * 와 같은 근거). 버전 스탬프도 찍지 않는다: llms.txt 의 버전은 그것을 나른 `@zalkera/client` 의 버전이고
 * `package-lock.json` 이 이미 고정한다.
 */
function llmsManualEntry() {
    // ⚠ `require.resolve("@zalkera/client/llms.txt")` 는 **안 된다** — 그 패키지의 `exports` 맵이
    //    llms.txt 를 열어 두지 않았다(`files` 로 tarball 에는 실리지만 서브패스 export 는 없다).
    //    그래서 이미 존재가 보장된 운반본(`assertGuaranteesCarried` 가 먼저 확인한다) 경로에서
    //    패키지 루트를 얻는다. client 에 `"./llms.txt"` export 를 여는 것이 더 깨끗하지만 재발행이
    //    필요하므로 별건으로 남긴다 — 그때 이 함수는 resolve 한 줄로 줄어든다.
    const req = createRequire(import.meta.url);
    let root;
    try {
        root = dirname(dirname(req.resolve("@zalkera/client/contracts/aeo-surface-guarantees.json")));
    } catch {
        fail("LLMS_MISSING", "@zalkera/client 를 못 찾았습니다 — npm ci 후 재시도하십시오.");
        return null;
    }
    const path = join(root, "llms.txt");
    if (!existsSync(path)) {
        fail(
            "LLMS_MISSING",
            `@zalkera/client 가 llms.txt 를 나르지 않습니다(${path}) — 이 버전으로는 팩하지 마십시오. ` +
                "zip 이 명세 없이 나가면 README 가 없는 파일을 가리킵니다.",
        );
        return null;
    }
    return {path: "llms.txt", bytes: readFileSync(path)};
}

function presetPublicFiles(dir, base = "") {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return []; // public/ 없는 프리셋 — 섹션 이미지가 없을 뿐이다
    }
    return entries
        .flatMap((e) =>
            e.isDirectory()
                ? presetPublicFiles(join(dir, e.name), `${base}/${e.name}`)
                : [{route: `${base}/${e.name}`, name: e.name, bytes: readFileSync(join(dir, e.name))}],
        )
        .sort((a, b) => a.route.localeCompare(b.route));
}

/** 검증만 — 부작용 0. 한 테마라도 걸리면 아무 zip 도 안 쓴다(부분 산출물 금지). */
function inspect(code, contract, icons, reserved) {
    const dir = join(PRESETS_DIR, code);
    const seedBytes = readFileSync(join(dir, "seed.json"));
    const manifest = readFileSync(join(dir, "ASSETS-LICENSE.md"), "utf8");

    // `.zalkera/assets/` = 전송 이미지 풀. 팩 v3 에서 그 유일한 소비자(상품 커버)가 사라져
    // **현행 팩은 전부 이 디렉터리가 없다** — 있으면 validateSeed 가 미사용으로 막는다.
    const assetDir = join(dir, "assets");
    let assets = [];
    try {
        assets = readdirSync(assetDir)
            .filter((name) => statSync(join(assetDir, name)).isFile())
            .sort()
            .map((name) => ({name, bytes: readFileSync(join(assetDir, name))}));
    } catch {
        /* 상품 없는 테마 — 정상 */
    }

    const publicFiles = presetPublicFiles(join(dir, "public"));

    validateAssets(code, assets);
    validateSeed(code, seedBytes, new Set(assets.map((a) => a.name)));
    const content = validateContent(
        code,
        join(dir, "content"),
        new Set(publicFiles.map((f) => f.route)),
        contract,
        icons,
        reserved,
    );
    const overlayImages = presetSourceOverlay(code)
        .map((o) => o.path.split("/").pop())
        .filter((n) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(n));
    validateLicense(code, manifest, assets, publicFiles.map((f) => f.name), overlayImages);
    return {code, seedBytes, manifest, assets, publicFiles, content};
}

/**
 * 콘텐츠 매니페스트를 **생성**한다(`content/index.ts`).
 *
 * 손으로 유지하지 않는 이유: 매니페스트와 파일 목록이 갈리면 "파일은 있는데 아무도 못 보는 페이지"가
 * 되고, 그 드리프트를 사람이 지키는 것이 이 레포가 내내 진 싸움이다. 파일 목록에서 파생시키면
 * 갈릴 수가 없다. 형상은 템플릿 기본(`content/index.ts`)과 같아서 고객이 손으로 이어 고칠 수 있다.
 */
function contentManifest(slugs) {
    const imports = slugs.map((slug) => `import ${identifierOf(slug)} from "./pages/${slug}.json";`).join("\n");
    const entries = slugs.map((slug) => `    ${identifierOf(slug)},`).join("\n");
    return `/**
 * 콘텐츠 매니페스트 — **\`content/\` 디렉터리의 유일한 코드**.
 *
 * 페이지 json 을 **정적 import** 해서 slug → 페이지 맵으로 내놓는다. 읽는 쪽은 \`src/lib/content.ts\` 다.
 * 정적 import 라야 dev 에서 json 을 고치면 화면이 즉시 바뀌고(HMR), 빌드 산출물에 콘텐츠가 실린다.
 *
 * **페이지를 하나 만들 때 고치는 곳은 둘뿐이다**: \`content/pages/<slug>.json\` 을 쓰고, 여기에
 * import 한 줄 + 아래 맵에 한 줄.
 */
import nav from "./nav.json";
${imports}

/** slug → 페이지 콘텐츠. **키가 곧 URL 경로**다(\`about\` → \`/about\`, \`home\` → \`/\`). */
export const pages: Record<string, unknown> = {
${entries}
};

export {nav};
`;
}

/** slug 를 JS 식별자로 — 하이픈은 식별자에 못 쓴다(`our-story` → `our_story`). */
function identifierOf(slug) {
    return slug.replace(/-/g, "_");
}

function write(inspected, version, source, manual) {
    const {code, seedBytes, manifest, assets, publicFiles, content} = inspected;
    const slugs = content.pages.map((p) => p.slug);
    // 오버레이가 같은 경로를 가지면 **팩 것이 이긴다** — 정본을 먼저 깔고 뒤에서 덮는다.
    const overlay = presetSourceOverlay(code);
    const overlaid = new Set(overlay.map((o) => o.path));
    if (overlay.length) {
        const shadowed = source.filter((e) => overlaid.has(e.path)).map((e) => e.path);
        console.log(`    · 소스 오버레이 ${overlay.length}개 — 정본 가림 ${shadowed.length}개`);
        for (const p of shadowed) console.log(`      ↳ ${p}`);
        for (const o of overlay) if (!shadowed.includes(o.path)) console.log(`      + ${o.path} (신규)`);
    }
    const entries = [
        ...source.filter((e) => !overlaid.has(e.path)),
        ...overlay,
        manual,
        // ── 레포 상주(사이트의 얼굴) ────────────────────────────────────────
        {path: "content/index.ts", bytes: Buffer.from(contentManifest(slugs), "utf8")},
        {
            path: "content/nav.json",
            bytes: content.nav?.bytes ?? Buffer.from(`{\n    "header": [],\n    "footer": []\n}\n`, "utf8"),
        },
        ...content.pages.map((p) => ({path: `content/pages/${p.slug}.json`, bytes: p.bytes})),
        ...publicFiles.map((f) => ({path: `public${f.route}`, bytes: f.bytes})),
        // ── 전송(업무 데이터) ──────────────────────────────────────────────
        {path: ".zalkera/seed.json", bytes: seedBytes},
        {path: ".zalkera/ASSETS-LICENSE.md", bytes: Buffer.from(manifest, "utf8")},
        ...assets.map((a) => ({path: `.zalkera/assets/${a.name}`, bytes: a.bytes})),
    ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const buf = zip(entries);
    mkdirSync(OUT_DIR, {recursive: true});
    const out = join(OUT_DIR, `${code}-${version}.zip`);
    writeFileSync(out, buf);
    const sha = createHash("sha256").update(buf).digest("hex");
    console.log(`  ✓ ${relative(ROOT, out)}  ${(buf.length / 1024).toFixed(0)}KB  파일 ${entries.length}개`);
    console.log(`    sha256: ${sha}`);
    return {code, version, sha, path: out};
}

const args = process.argv.slice(2);
const versionFlag = args.indexOf("--version");
const version = versionFlag >= 0 ? args[versionFlag + 1] : DEFAULT_VERSION;
// `--version` 이 없으면 versionFlag 는 -1 이고 versionFlag+1 은 0 이 된다 — 그 자리를 그냥 제외하면
// 첫 위치인자(팩할 프리셋 코드)가 조용히 사라져 **항상 전체가 팩된다**. 플래그가 있을 때만 그 뒤를 건넌다.
const codes = args.filter((a, i) => !a.startsWith("--") && !(versionFlag >= 0 && i === versionFlag + 1));
const targets = codes.length
    ? codes
    : readdirSync(PRESETS_DIR, {withFileTypes: true})
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();

console.log(`프리셋 팩 — version=${version}, 대상 ${targets.join(", ")}`);
const head = sourceProvenance();
const source = sourceEntries();
console.log(`  정본 소스 ${source.length}개 파일(git 추적 − 팩 도구·시드 원본) · HEAD ${head}`);
// ⚠ 오버레이도 같은 규칙에 넣는다(보안 심의 B4). 종전에는 `source` 만 받아, fail-open OAuth 콜백을
// 오버레이로 넣으면 규칙이 멀쩡한데도 **대상이 안 들어가** 통과했다(실측 재현).
validateSource([...source, ...targets.flatMap((code) => presetSourceOverlay(code))]);

const contract = sectionContract();
assertGuaranteesCarried();
// ⚠ **게이트 이전에** 확인한다(기능 심의 차단 1). 초판은 존재 확인이 `write()` 안에 있었는데
//    `problems` 게이트는 그 전에 소진되므로, `fail("LLMS_MISSING")` 이 push 돼도 **아무도 다시 보지
//    않았다** — exit 0 · zip 산출 · 메시지조차 미출력(실측 재현). 이 파일이 스스로 경고하는 그
//    "조용히 꺼지는 게이트"를 내가 만들었다. 게이트는 게이트가 소진되기 전에 서야 한다.
const llmsManual = llmsManualEntry();
const icons = iconKeys();
const reserved = reservedSlugs();
const inspected = targets.map((code) => inspect(code, contract, icons, reserved));

if (problems.length) {
    console.error("\n팩 실패 — 게이트 위반(zip 을 하나도 쓰지 않았습니다):");
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
}

const packed = inspected.map((item) => write(item, version, source, llmsManual));

// 레지스트리는 DB(theme + theme_artifact)다. 종전의 backend `site.presets` yaml 은 memo105 T3 에서
// 은퇴했는데 이 안내만 남아 있었다 — 운영자가 마지막으로 읽는 줄이라 틀린 채로 두면 그대로 따라 한다.
console.log("\n적재(업로드) — 본사 SUPER_ADMIN 권한:");
for (const p of packed) {
    console.log(
        `  curl -X POST "$API/api/system/themes/${p.code}/artifacts" \\\n` +
            `    -H "Authorization: Bearer $TOKEN" \\\n` +
            `    -F "version=${p.version}" \\\n` +
            `    -F "file=@${relative(ROOT, p.path)}" \\\n` +
            // 썸네일은 선택이다 — 이미지 0장인 프리셋(골격)에는 파일이 없고, 있는 줄 알고 복붙하면
            // curl 이 파일을 못 읽어 통째로 실패한다(심의 실측). 있는 것만 안내한다.
            (existsSync(join(PRESETS_DIR, p.code, "thumbnail.png"))
                ? `    -F "thumbnail=@presets/${p.code}/thumbnail.png" \\\n`
                : "") +
            `    -F "expectedSha256=${p.sha}"`,
    );
}
console.log("\n공개(노출 전환) — 적재와 분리돼 있어 올린 것이 곧바로 개시 대상이 되지는 않습니다:");
for (const p of packed) {
    console.log(`  curl -X POST "$API/api/system/themes/${p.code}/artifacts/${p.version}/promote" -H "Authorization: Bearer $TOKEN"`);
}
