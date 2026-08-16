#!/usr/bin/env node
/**
 * **콘텐츠 페이지가 실제로 서는가** — 빌드 산출물로 대조한다.
 *
 * ■ 왜 필요한가
 *   `content/pages/<slug>.json` 을 넣고 매니페스트에 배선하면 `/slug` 가 생긴다 — 배송 문서가 그렇게
 *   가르친다. 그런데 **그 약속을 재는 검사가 아무것도 없었다.** 넷이 전부 초록인 채로 페이지가
 *   사라지는 형태가 셋 있었다 — 셋 다 아래 재현 명령으로 이 검사가 잡는 것을 확인한다:
 *
 *   ⑴ **한글 slug 가 404** — 페이지 컴포넌트가 퍼센트 인코딩된 값을 받는데 매니페스트 키는 디코드된
 *      값이라 조회가 miss 했다. 그런데 `sitemap.ts` 는 디코드된 값으로 URL 을 만들어 **그 404 를
 *      크롤러에 광고**했다.
 *   ⑵ **매니페스트 축약 표기** — `{our_story}` 로 적으면 키가 slug 가 아니라 식별자가 된다.
 *      `/our-story` 가 404 이고 `nav.json` 이 링크하는 메뉴가 죽는다. N3 은 import **경로**를 보므로
 *      이 어긋남을 못 잡는다.
 *   ⑶ **예약 세그먼트 그림자화** — `content/pages/products.json` 은 정적 라우트 `src/app/products/`
 *      에 가려 흔적 없이 사라진다.
 *
 *   셋 다 원인이 다르지만 증상이 같다: **파일은 있는데 그 주소가 안 선다.** 그래서 원인이 아니라
 *   증상을 잰다 — 빌드가 만든 프리렌더 산출물을 직접 본다.
 *
 * ■ 무엇을 보나
 *   `.next/server/app/<slug>.meta` 가 있고 그 `status` 가 404 가 아닌가 — **그리고 그 주소가 내놓는
 *   html 이 이 페이지의 `title` 을 담고 있는가.**
 *
 *   ⚠ **상태만 보면 ⑶ 을 못 잡는다.** 그림자화된 slug 는 정적 라우트가 만든 산출물이 있어서
 *   "선다"로 보인다 — 서는 것은 맞지만 **다른 페이지**가 선다. 그래서 상태가 아니라 **내용**을 본다.
 *   재현: `content/pages/products.json` 을 배선하고 `npm run build && node scripts/lib/content-routes.mjs`
 *   → `rc=1` · `products — 그 주소가 이 페이지를 안 보여줍니다`
 *
 * ■ **못 잡는 것**
 *   · 렌더는 되는데 내용이 빈 페이지. 이 검사는 "주소가 서는가"만 본다.
 *   · `output: "export"` 등 프리렌더 산출물 형태가 다른 설정. 그때는 판정 불능으로 말하고 멈춘다.
 *
 * 사용: `node scripts/lib/content-routes.mjs [트리]` — `npm run build` 뒤에 돌린다.
 */
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join, resolve} from "node:path";

const root = resolve(process.argv[2] ?? ".");
const pagesDir = join(root, "content", "pages");
const appDir = join(root, ".next", "server", "app");

if (!existsSync(pagesDir)) {
    console.log("콘텐츠 페이지 라우트 — content/pages 가 없습니다. 잴 것이 없습니다.");
    process.exit(0);
}
if (!existsSync(appDir)) {
    console.error("❌ 콘텐츠 페이지 라우트 — .next/server/app 이 없습니다(통과가 아닙니다).");
    console.error("   `npm run build` 뒤에 돌리십시오.");
    process.exit(2);
}

const slugs = readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));

/** 홈은 `/` 로 서므로 산출물 이름이 다르다. */
const outputName = (slug) => (slug === "home" ? "index" : slug);

const bad = [];
for (const slug of slugs) {
    const meta = join(appDir, `${outputName(slug)}.meta`);
    if (!existsSync(meta)) {
        bad.push(`${slug} — 프리렌더 산출물이 없습니다(그 주소가 서지 않습니다)`);
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
        bad.push(`${slug} — 프리렌더가 404 입니다(파일은 있는데 아무도 못 봅니다)`);
        continue;
    }

    // 그 주소가 **이 페이지**를 내놓는가. 정적 라우트에 가려지면 상태는 200 인데 남의 화면이 뜬다.
    let title;
    try {
        title = JSON.parse(readFileSync(join(pagesDir, `${slug}.json`), "utf8")).title;
    } catch {
        continue; // 콘텐츠 자체가 깨진 것은 N 축의 일이다 — 여기서 두 번 말하지 않는다
    }
    if (typeof title !== "string" || title.trim() === "") continue; // N-축이 잡는 자리
    const html = join(appDir, `${outputName(slug)}.html`);
    if (!existsSync(html)) {
        bad.push(`${slug} — html 산출물이 없습니다`);
        continue;
    }
    const body = readFileSync(html, "utf8");
    const escaped = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (!body.includes(title) && !body.includes(escaped)) {
        bad.push(`${slug} — 그 주소가 이 페이지를 안 보여줍니다(제목 "${title}" 이 없습니다 — 가려졌습니다)`);
    }
}

if (bad.length) {
    console.error(`❌ 콘텐츠 페이지 라우트 — ${bad.length}건이 서지 않습니다:`);
    for (const b of bad) console.error(`   · ${b}`);
    console.error("\n   원인은 셋 중 하나입니다: 매니페스트 키가 slug 가 아니거나(축약 표기),");
    console.error("   정적 라우트 `src/app/<slug>/` 에 가려졌거나, 세그먼트 디코딩이 빠졌습니다.");
    process.exit(1);
}

console.log(`✅ 콘텐츠 페이지 라우트 — ${slugs.length}개 전부 섭니다.`);
