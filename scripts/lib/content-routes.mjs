#!/usr/bin/env node
/**
 * **콘텐츠 페이지가 실제로 서는가** — 빌드 산출물로 대조한다.
 *
 * ■ 왜 필요한가
 *   `content/pages/<slug>.json` 을 넣고 매니페스트에 배선하면 `/slug` 가 생긴다 — 배송 문서가 그렇게
 *   가르친다. 그런데 **그 약속을 재는 검사가 아무것도 없었다.** 넷이 전부 초록인 채로 페이지가
 *   사라지는 형태가 셋 있었다:
 *
 *   ⑴ **한글 slug 가 404** — 페이지 컴포넌트가 퍼센트 인코딩된 값을 받는데 매니페스트 키는 디코드된
 *      값이라 조회가 miss 했다. 그런데 `sitemap.ts` 는 디코드된 값으로 URL 을 만들어 **그 404 를
 *      크롤러에 광고**했다.
 *   ⑵ **매니페스트 축약 표기** — `{our_story}` 로 적으면 키가 slug 가 아니라 식별자가 된다.
 *      `/our-story` 가 404 이고 `nav.json` 이 링크하는 메뉴가 죽는다.
 *   ⑶ **예약 세그먼트 그림자화** — `content/pages/products.json` 은 정적 라우트 `src/app/products/`
 *      에 가려 흔적 없이 사라진다.
 *
 *   셋 다 원인이 다르지만 증상이 같다: **파일은 있는데 그 주소를 이 페이지가 안 만든다.**
 *
 * ■ 무엇을 보나 — **누가 그 주소를 만들었는가**
 *   `.next/prerender-manifest.json` 의 `routes["/<slug>"].srcRoute` 가 그 주소를 낳은 **소스 라우트**를
 *   적는다. 콘텐츠 페이지는 `/[slug]` 여야 한다. `/products` 처럼 정적 라우트가 낳았으면 그 값이
 *   `/products` 로 나오고, 그것이 곧 그림자화다.
 *
 *   그리고 **혈통만으로는 부족하다.** `[slug]` 가 낳은 주소인데 조회가 miss 해 `notFound()` 로
 *   떨어지면 `srcRoute` 는 여전히 `/[slug]` 다. 그래서 산출물의 `status` 도 함께 본다
 *   (아래 «재현(디코딩 누락)» 이 그 형태다).
 *
 *   ⚠ **제목·본문 같은 글자로는 이 판정을 못 한다.** 산출된 html 이 페이지 `title` 을 담는지 보는
 *   오라클은 양쪽으로 깨진다 —
 *   · **거짓 통과**: `content/pages/products.json` 의 제목이 `상품` 이면, 정적 라우트가 이미 그리는
 *     `<h1>상품</h1>` 에 걸려 통과한다. 그 페이지 본문은 화면에 0회 나오는데도.
 *   · **거짓 반려**: 제목에 따옴표가 들어가면(`우리의 "약속"`) React 가 `&quot;` 로 굽는다.
 *   글자는 **남의 화면에도 있을 수 있는 것**이라 원리상 «누가 이 주소를 만들었나»를 못 가른다.
 *   `srcRoute` 는 글자가 아니라 혈통이다.
 *
 * ■ **못 잡는 것**
 *   · 라우트는 `[slug]` 가 낳았는데 **내용이 빈** 페이지. 이 검사는 "누가 이 주소를 만들었나"만 본다.
 *   · 프리렌더되지 않는 설정(`dynamicParams` 로 요청 때 그리는 경우). 그때는 판정 불능으로 말하고 멈춘다.
 *
 * 사용: `node scripts/lib/content-routes.mjs [트리]` — `npm run build` 뒤에 돌린다.
 *
 * 재현(그림자화): `content/pages/products.json` 을 만들어 `content/index.ts` 에 배선하고
 * `npm run build && node scripts/lib/content-routes.mjs; echo rc=$?` → `rc=1` ·
 * `products — 그 주소를 «/products» 가 만듭니다`
 *
 * 재현(디코딩 누락): `src/lib/routeParam.ts` 의 `decodeURIComponent` 를 지우고 같은 명령 →
 * `rc=1` · 한글 slug 가 `그 주소가 404 입니다`
 */
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join, resolve} from "node:path";

const root = resolve(process.argv[2] ?? ".");
const pagesDir = join(root, "content", "pages");
const manifestPath = join(root, ".next", "prerender-manifest.json");
const appDir = join(root, ".next", "server", "app");

/** 콘텐츠 페이지를 낳아야 하는 소스 라우트. 이것 말고 다른 것이 낳았으면 가려진 것이다. */
const CONTENT_ROUTE = "/[slug]";

// ⚠ **"없으니 통과"가 아니다.** `content/pages/` 가 통째로 없으면 잴 콘텐츠가 없는 것이 맞지만,
//   그 상태를 침묵으로 넘기면 **폴더 하나를 지우는 것이 이 게이트를 끄는 가장 쉬운 길**이 된다.
//   매니페스트가 비어 있는지까지 함께 보고, 어긋나면 말한다.
if (!existsSync(pagesDir)) {
    const manifestSrc = join(root, "content", "index.ts");
    // ⚠ **따옴표 한 종류만 보면 안 된다.** 작은따옴표로 쓴 매니페스트에서 이 판정이 통과로 떨어지고,
    //   그러면 «매니페스트도 비어 있습니다» 라는 **재지 않은 문면**을 찍는다.
    const importsPages = /^\s*import\s+[\p{ID_Start}$_][\p{ID_Continue}$]*\s+from\s+["']\.\/pages\//mu;
    if (existsSync(manifestSrc) && importsPages.test(readFileSync(manifestSrc, "utf8"))) {
        console.error("❌ 콘텐츠 페이지 라우트 — content/pages 가 없는데 매니페스트가 그 안을 가져옵니다.");
        console.error("   폴더가 지워졌거나 zip 에 안 실렸습니다(통과가 아닙니다).");
        process.exit(1);
    }
    console.log("콘텐츠 페이지 라우트 — content/pages 가 없습니다. 잴 것이 없습니다(매니페스트도 비어 있습니다).");
    process.exit(0);
}
// ── ⓑ **sitemap 제외 목록이 진짜 라우트와 맞는가** — 빌드가 아는 것으로 대조한다.
//
//    `src/lib/reservedSegments.ts` 는 소스를 보고 «이 이름이 `[slug]` 를 가린다» 를 **추측**한다
//    (`page.tsx`/`route.ts` 가 있나). 추측이 틀리면 두 방향으로 샌다 — 가려지는데 빠뜨리면 죽은 URL 을
//    크롤러에 광고하고, 안 가려지는 것을 넣으면 멀쩡한 페이지가 sitemap 에서 사라진다.
//
//    빌드는 추측하지 않는다. `app-path-routes-manifest.json` 이 **동적 라우트까지 포함해** 실제로
//    존재하는 라우트를 적는다(`/cart` 는 프리렌더가 없어 `prerender-manifest` 에는 안 나온다).
//    여기서 그 둘을 맞춰 본다.
//
//    재현: `src/lib/reservedSegments.ts` 에서 `"blog"` 를 빼고 `npm run build && node
//    scripts/lib/content-routes.mjs; echo rc=$?` → `rc=1` · `가려지는데 목록에 없습니다: blog`
{
    const appPaths = join(root, ".next", "app-path-routes-manifest.json");
    const listSrc = join(root, "src", "lib", "reservedSegments.ts");
    // ⚠ **"없으니 통과"가 아니다.** 종전에는 둘 중 하나만 없어도 이 축이 통째로 **조용히** 꺼지고
    //    rc 0 으로 끝났다 — 빌드 없이 부르면 언제나 초록이었다는 뜻이다. 위 ⓐ 가 같은 함정을
    //    이미 닫아 두었는데 여기만 열려 있었다.
    //
    //    두 호출부(`ci.yml`·`verify-zip --pack`)는 **전부 빌드 뒤에** 부른다. 산출물이 없다는 것은
    //    「잴 것이 없다」가 아니라 「못 쟀다」다.
    //    재현: `rm -rf .next && node scripts/lib/content-routes.mjs; echo rc=$?` → rc=2
    if (!existsSync(listSrc)) {
        console.error(`❌ sitemap 제외 목록 — ${listSrc} 가 없습니다(통과가 아닙니다).`);
        console.error("   예약 세그먼트 목록이 없으면 무엇을 가리는지 판정할 수 없습니다.");
        process.exit(2);
    }
    if (!existsSync(appPaths)) {
        console.error("❌ sitemap 제외 목록 — 라우트 산출물이 없습니다(통과가 아닙니다).");
        console.error(`   ${appPaths}`);
        console.error("   먼저 `npm run build` 를 돌리십시오 — 빌드가 아는 라우트로 대조하는 검사입니다.");
        process.exit(2);
    }
    {
        let manifest;
        try {
            manifest = JSON.parse(readFileSync(appPaths, "utf8"));
        } catch (e) {
            console.error(`❌ sitemap 제외 목록 — 라우트 산출물을 못 읽었습니다 [${e.code ?? "PARSE"}](통과가 아닙니다).`);
            process.exit(2);
        }
        // 최상위 한 세그먼트짜리 실제 라우트. `_` 로 시작하는 내부 라우트와 파일형(`robots.txt`)은 뺀다.
        const real = new Set(
            Object.values(manifest)
                .map((url) => /^\/([^/]+)$/.exec(String(url))?.[1])
                .filter((name) => name && !name.startsWith("_") && !name.startsWith("[") && !name.includes(".")),
        );
        const declared = declaredSegments(readFileSync(listSrc, "utf8"));
        // ⚠ **못 읽었으면 통과가 아니다.** 빈 집합을 그냥 쓰면 실재 라우트가 전부 「목록에 없다」로
        //    반려되어 사유가 거짓이 된다(종전 형태가 정확히 그랬다 — 아래 [declaredSegments]).
        if (declared === null) {
            console.error(`❌ sitemap 제외 목록 — ${listSrc} 에서 RESERVED_SEGMENTS 를 못 읽었습니다(통과가 아닙니다).`);
            console.error("   `export const RESERVED_SEGMENTS = new Set([...])` 형태여야 읽습니다.");
            process.exit(2);
        }
        const missing = [...real].filter((name) => !declared.has(name)).sort();
        if (missing.length) {
            console.error(`❌ sitemap 제외 목록 — 가려지는데 목록에 없습니다: ${missing.join(" ")}`);
            console.error("   그 이름의 콘텐츠 페이지는 다른 화면이 뜨는데 sitemap 이 그 URL 을 광고합니다.");
            console.error("   `src/lib/reservedSegments.ts` 에 더하십시오.");
            process.exit(1);
        }
    }
}

// ── ⓐ **소스 배선** — 빌드 없이 잡는다. 키가 곧 URL 이고 값이 그 페이지여야 한다.
//
//    빌드 산출물로는 원리상 못 보는 형태가 하나 있다: 키는 맞는데 **값이 남의 페이지**인 배선
//    (`about: history, "회사연혁": about`). `srcRoute` 는 `/[slug]`, `status` 는 200 이라 아래 축이
//    전부 통과한다. 배송 문서가 사람·AI 에게 "import 한 줄 + 맵 한 줄"을 손으로 더하라고 가르치므로
//    값 맞바꿈은 현실적인 오타다.
//
//    재현: `content/index.ts` 에서 두 페이지의 값을 맞바꾸고
//    `node scripts/lib/content-routes.mjs; echo rc=$?` → `rc=1` · `키와 값이 어긋납니다`
{
    const manifestSource = join(root, "content", "index.ts");
    if (!existsSync(manifestSource)) {
        console.error("❌ 콘텐츠 페이지 라우트 — content/index.ts 가 없습니다(통과가 아닙니다).");
        process.exit(2);
    }
    const src = readFileSync(manifestSource, "utf8");
    // `import <이름> from "./pages/<slug>.json";`
    const importedSlug = new Map();
    // ⚠ **식별자는 ASCII 가 아니다.** slug `회사연혁` 은 그대로 유효한 JS 식별자라 매니페스트가
    //   그것을 이름으로 쓴다(`identifierOf` 는 하이픈만 바꾼다). `\w` 로 훑으면 한국어 사이트의
    //   페이지가 **통째로 이 검사 밖**에 놓인다.
    for (const m of src.matchAll(/^\s*import\s+([\p{ID_Start}$_][\p{ID_Continue}$]*)\s+from\s+["']\.\/pages\/(.+?)\.json["'];/gmu)) {
        importedSlug.set(m[1], m[2]);
    }
    const mapBody = /export const pages[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src)?.[1];
    if (mapBody === undefined) {
        console.error("❌ 콘텐츠 페이지 라우트 — content/index.ts 에서 pages 맵을 못 읽었습니다(통과가 아닙니다).");
        process.exit(2);
    }
    const wrong = [];
    // ⚠ **줄 단위로 자르지 않는다.** 매니페스트는 사람이 손으로 고치는 파일이라 항목이 두 줄에
    //   걸칠 수 있다(`"about":` 다음 줄에 `history,`). 줄 단위 파서는 그런 항목을 **조용히
    //   건너뛰어** 오배선을 못 본다 — 못 읽은 줄을 말하지도 않으니 아무도 모른다.
    //   쉼표로 끊고 줄바꿈을 공백으로 접어 항목 단위로 본다.
    const flat = mapBody
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join(" ");
    for (const raw of flat.split(",")) {
        const body = raw.replace(/\s+/g, " ").trim();
        if (body === "") continue;
        const pair = /^(?:"(.+?)"|'(.+?)'|([\p{ID_Start}$_][\p{ID_Continue}$]*))\s*:\s*([\p{ID_Start}$_][\p{ID_Continue}$]*)$/u.exec(body);
        if (pair) {
            const key = pair[1] ?? pair[2] ?? pair[3];
            const from = importedSlug.get(pair[4]);
            if (from === undefined) {
                wrong.push(`${key} — 값 «${pair[4]}» 이 content/pages/ 에서 온 것이 아닙니다`);
            } else if (from !== key) {
                wrong.push(`${key} — 키와 값이 어긋납니다(값은 content/pages/${from}.json 입니다)`);
            }
            continue;
        }
        const shorthand = /^([\p{ID_Start}$_][\p{ID_Continue}$]*)$/u.exec(body);
        if (!shorthand) {
            // ⚠ **못 읽은 항목을 조용히 넘기지 않는다.** 넘기면 「검사했다」와 「검사할 수 없었다」가
            //   같은 초록이 된다.
            wrong.push(`«${body.slice(0, 60)}» — 이 항목을 못 읽었습니다(키: 값 형태로 적으십시오)`);
            continue;
        }
        {
            const ident = shorthand[1];
            const from = importedSlug.get(ident);
            // ⚠ 축약은 키를 **식별자**로 만든다. slug `our-story` 는 식별자가 `our_story` 라
            //   `/our-story` 가 404 가 된다 — 파일은 멀쩡히 있고 다른 검사기도 초록이다.
            if (from !== undefined && from !== ident) {
                wrong.push(`${ident} — 축약 표기라 키가 slug 가 아닙니다(«${from}» 을 키로 적으십시오)`);
            }
        }
    }
    if (wrong.length) {
        console.error(`❌ 콘텐츠 페이지 배선 — ${wrong.length}건이 어긋납니다:`);
        for (const w of wrong) console.error(`   · ${w}`);
        console.error("\n   맵의 **키가 곧 URL** 이고 값은 그 slug 의 json 이어야 합니다.");
        process.exit(1);
    }
}

if (!existsSync(manifestPath)) {
    console.error("❌ 콘텐츠 페이지 라우트 — .next/prerender-manifest.json 이 없습니다(통과가 아닙니다).");
    console.error("   `npm run build` 뒤에 돌리십시오.");
    process.exit(2);
}

let manifest;
try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
    console.error(`❌ 콘텐츠 페이지 라우트 — 산출물을 읽지 못했습니다 [${e.code ?? "PARSE"}](통과가 아닙니다).`);
    process.exit(2);
}
const routes = manifest?.routes;
if (routes === null || typeof routes !== "object") {
    // ⚠ **모양이 바뀌면 멈춘다.** 없는 키를 훑으면 «전부 통과» 가 되고, 그것이 가장 조용한 실패다.
    console.error("❌ 콘텐츠 페이지 라우트 — 산출물에 routes 가 없습니다(Next 판이 바뀌었는지 보십시오).");
    process.exit(2);
}

const slugs = readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));

// ⚠ **비어 있는 것도 "잴 것이 없음"이 아니다.** 매니페스트가 `./pages/…` 를 가져오는데 폴더가
//   비었으면 그 zip 은 빌드조차 못 선다. 0개를 세고 «전부 섭니다» 라고 말하면, 검사기가 재지 않은
//   것을 통과로 찍는 것이다.
//   재현: `content/pages/*.json` 을 지우고 `node scripts/lib/content-routes.mjs .` → rc=1
if (slugs.length === 0 && /^\s*import\s+[\p{ID_Start}$_][\p{ID_Continue}$]*\s+from\s+["']\.\/pages\//mu.test(readFileSync(join(root, "content", "index.ts"), "utf8"))) {
    console.error("❌ 콘텐츠 페이지 라우트 — content/pages 가 비었는데 매니페스트가 그 안을 가져옵니다.");
    console.error("   페이지가 안 실렸거나 지워졌습니다(통과가 아닙니다).");
    process.exit(1);
}

const bad = [];
for (const slug of slugs) {
    const entry = routes[`/${slug}`];
    if (!entry) {
        bad.push(`${slug} — 그 주소가 프리렌더되지 않았습니다(매니페스트 배선을 보십시오)`);
        continue;
    }
    if (entry.srcRoute !== CONTENT_ROUTE) {
        bad.push(
            `${slug} — 그 주소를 «${entry.srcRoute}» 가 만듭니다(${CONTENT_ROUTE} 가 아닙니다)` +
                " — 정적 라우트에 가려졌습니다. 방문자에게는 그쪽 화면이 뜹니다",
        );
        continue;
    }

    // **혈통이 맞아도 404 일 수 있다.** `[slug]` 가 낳은 주소인데 조회가 miss 해 `notFound()` 로
    // 떨어지는 형태가 ⑴ 이다 — 세그먼트 디코딩이 빠지면 한글 slug 가 `srcRoute: /[slug]` 이면서
    // `status: 404` 가 된다. 위 «재현(디코딩 누락)» 참고.
    const meta = join(appDir, `${slug}.meta`);
    if (!existsSync(meta)) {
        bad.push(`${slug} — 프리렌더 산출물이 없습니다(혈통은 맞는데 결과가 없습니다)`);
        continue;
    }
    let status;
    try {
        status = JSON.parse(readFileSync(meta, "utf8")).status;
    } catch (e) {
        bad.push(`${slug} — 산출물을 읽지 못했습니다 [${e.code ?? "PARSE"}]`);
        continue;
    }
    if (status === 404) {
        bad.push(`${slug} — 그 주소가 404 입니다(파일은 있는데 아무도 못 봅니다 — 세그먼트 디코딩을 보십시오)`);
    }
}

if (bad.length) {
    console.error(`❌ 콘텐츠 페이지 라우트 — ${bad.length}건이 서지 않습니다:`);
    for (const b of bad) console.error(`   · ${b}`);
    console.error("\n   원인은 셋 중 하나입니다: 매니페스트 키가 slug 가 아니거나(축약 표기),");
    console.error("   정적 라우트 `src/app/<slug>/` 에 가려졌거나, 세그먼트 디코딩이 빠졌습니다.");
    process.exit(1);
}

console.log(`✅ 콘텐츠 페이지 라우트 — ${slugs.length}개 전부 ${CONTENT_ROUTE} 가 만들고 404 가 아닙니다.`);

/**
 * `RESERVED_SEGMENTS` 가 담은 이름들. 못 읽으면 `null` — **빈 집합과 다르다**(위 호출부 참조).
 *
 * ⚠ **줄 단위 정규식으로 되돌리지 마라.** 종전은 `^\s*"([^"]+)",` 였고 두 가지로 틀렸다.
 *
 *   ⑴ **서식에 걸렸다.** 한 줄로 적은 `new Set(["contact", "policies"])` 를 **한 개도 못 읽고**
 *      두 이름을 「목록에 없습니다」로 반려했다 — 정상 코드를 막는 오탐이고, 사유마저 거짓이다.
 *      재현: 그 파일을 항목마다 줄바꿈으로 바꾸고 `node scripts/lib/content-routes.mjs; echo rc=$?`
 *      → 같은 트리가 rc=1 에서 rc=0 으로 바뀐다.
 *   ⑵ **범위가 없었다.** 파일 전체를 훑어서 주석이나 다른 상수의 문자열도 목록으로 셌다.
 *
 * 그래서 판정을 **구조**로 한다 — `RESERVED_SEGMENTS` 뒤 첫 `[` 부터 짝이 맞는 `]` 까지만 읽는다.
 * 주석 제거는 **문자열 안의 `//` 에 속지 않게** 상태를 들고 훑는다(`"https://…"` 가 있으면
 * 단순 치환은 그 줄의 나머지를 지운다).
 */
function declaredSegments(src) {
    let out = "";
    let mode = "code"; // code | line | block | str
    let quote = "";
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const n = src[i + 1];
        if (mode === "code") {
            if (c === "/" && n === "/") (mode = "line"), i++;
            else if (c === "/" && n === "*") (mode = "block"), i++;
            else if (c === '"' || c === "'" || c === "`") (mode = "str"), (quote = c), (out += c);
            else out += c;
        } else if (mode === "line") {
            if (c === "\n") (mode = "code"), (out += c);
        } else if (mode === "block") {
            if (c === "*" && n === "/") (mode = "code"), i++;
        } else {
            out += c;
            if (c === "\\") (out += n ?? ""), i++;
            else if (c === quote) mode = "code";
        }
    }
    const at = out.search(/\bRESERVED_SEGMENTS\b/);
    if (at < 0) return null;
    const open = out.indexOf("[", at);
    if (open < 0) return null;
    let depth = 0;
    let end = -1;
    for (let i = open; i < out.length; i++) {
        if (out[i] === "[") depth++;
        else if (out[i] === "]" && --depth === 0) {
            end = i;
            break;
        }
    }
    if (end < 0) return null;
    return new Set([...out.slice(open + 1, end).matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]).filter(Boolean));
}
