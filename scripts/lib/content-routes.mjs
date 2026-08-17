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

if (!existsSync(pagesDir)) {
    console.log("콘텐츠 페이지 라우트 — content/pages 가 없습니다. 잴 것이 없습니다.");
    process.exit(0);
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
