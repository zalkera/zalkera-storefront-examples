import {strict as assert} from "node:assert";
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/**
 * 목록의 **쪽 이동 배선**을 실제로 렌더해서 잰다 — 판정 함수가 아니라 그것을 **쓰는 자리**다.
 *
 * ## 왜 이 파일이 있나
 *
 * `blogPaging.test.ts` 는 술어(`hasNextPage`·`isOutOfRange`·`blogPagePath`)를 잰다. 그것만으로는
 * **호출부**가 안 잠긴다 — `BlogList.tsx` 에서 `const hasNext = hasNextPage(posts)` 를
 * `const hasNext = false` 로 고정하면 술어 시험은 전부 초록인 채 「다음 →」이 통째로 사라지고,
 * **21번째 글부터 목록에서 도달 불가**가 된다. 그것이 정확히 이 트랜치가 고친 결함이다.
 * 심의가 그 변이를 실제로 넣어 전 게이트가 초록임을 확인했다. 그래서 렌더한다.
 *
 * `BlogList` 가 `posts` 를 인자로 받으므로 네트워크 없이 그려진다 — 그 인자는 쪽 라우트가
 * 범위 밖 판정을 하려고 목록을 먼저 보기 때문에 생긴 것이고, 여기서 그대로 쓴다.
 *
 * 재현: `node --experimental-strip-types --test src/lib/blogListRender.test.ts; echo rc=$?` → rc=0
 */

// 모듈 적재 시점에 평가되는 env — `lib/zalkera.ts` 는 `ZALKERA_TENANT` 가 없으면 던진다(의도된 설계).
process.env.ZALKERA_TENANT ??= "render-test";
process.env.ZALKERA_SITE_URL ??= "https://render.test";

/**
 * `@/` 그래프를 통째로 전사한다 — **한 번만**.
 *
 * ⚠ `markdownRender.test.ts` 의 한 파일 전사와 다르다. `BlogList` 는 `components/JsonLd.tsx`(JSX)
 *   를 타므로 잎까지 따라가야 한다 — `--experimental-strip-types` 는 JSX 를 못 벗긴다.
 */
let compiled: Promise<{BlogList: (props: unknown) => Promise<unknown>}> | null = null;

/** `@/foo/bar` → 실제 파일. 확장자는 파일이 있는 쪽으로 정한다(번들러가 하던 일). */
function sourceOf(spec: string): string | null {
    for (const ext of ["", ".ts", ".tsx"]) {
        const candidate = join(SRC, spec + ext);
        if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
    }
    return null;
}

function compileGraph() {
    // ⚠ **`/tmp` 에 쓰면 안 된다** — node 는 맨 지정자(`react`)를 **가져오는 파일 기준**으로 푼다.
    const cache = resolve(SRC, "../node_modules/.cache");
    mkdirSync(cache, {recursive: true});
    const dir = mkdtempSync(join(cache, "zalkera-bloglist-"));
    const out = (spec: string) => join(dir, spec.replace(/\//g, "__") + ".mjs");

    const seen = new Set<string>();
    const queue = ["components/BlogList"];
    while (queue.length > 0) {
        const spec = queue.shift()!;
        if (seen.has(spec)) continue;
        seen.add(spec);
        const file = sourceOf(spec);
        assert.ok(file, `@/${spec} 를 못 찾았다 — 이 시험이 헛돈다`);
        const source = ts.sys.readFile(file!);
        assert.ok(source, `${file} 를 못 읽었다 — 이 시험이 헛돈다`);
        const rewritten = source!.replace(/(["'])@\/([^"']+)\1/g, (_m, q: string, rest: string) => {
            queue.push(rest);
            return `${q}${out(rest)}${q}`;
        });
        writeFileSync(
            out(spec),
            ts.transpileModule(rewritten, {
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2022,
                    jsx: ts.JsxEmit.ReactJSX,
                },
            }).outputText,
        );
    }
    return import(out("components/BlogList")) as Promise<{BlogList: (props: unknown) => Promise<unknown>}>;
    // 전사물은 남긴다 — 적재가 지연되므로(dynamic import 안의 정적 import) 여기서 지우면 못 읽는다.
    // `node_modules/.cache` 아래이고 이미 무시 대상이다.
}

/** 그 쪽을 실제로 그린 HTML. `posts` 를 넣어 네트워크를 안 탄다. */
async function render(page: number, posts: unknown): Promise<string> {
    compiled ??= compileGraph();
    const [{BlogList}, {renderToStaticMarkup}, {createElement}] = await Promise.all([
        compiled,
        import("react-dom/server"),
        import("react"),
    ]);
    // RSC 는 async 컴포넌트다 — 반환된 엘리먼트를 렌더한다.
    const element = await BlogList({page, posts});
    return renderToStaticMarkup(createElement(() => element as never));
}

/** 그 쪽의 목록 응답. `last` 가 「마지막 쪽인가」다. */
function pageOf(count: number, last: boolean) {
    return {
        content: Array.from({length: count}, (_, i) => ({
            id: i + 1,
            slug: `p${i + 1}`,
            title: `글 ${i + 1}`,
            summary: null,
            publishedAt: null,
        })),
        last,
    };
}

/**
 * 🔴 **「다음 →」이 발견 경로다.** 이 배선이 죽으면 21번째 글이 목록에서 도달 불가가 된다 —
 * 상세는 열리고 sitemap 도 싣지만, 크롤러가 상세로 가는 **내부 링크 허브**가 목록이다.
 *
 * 재현: `BlogList.tsx` 의 `const hasNext = hasNextPage(posts);` 를 `const hasNext = false;` 로
 * 바꾸면 `blogPaging.test.ts` 는 **0건 red**, 이 파일은 red 다.
 */
test("🔴 다음 쪽이 있으면 그 링크를 실제로 그린다", async () => {
    const html = await render(1, pageOf(20, false));
    assert.match(html, /<a[^>]+href="\/blog\/page\/2"[^>]*rel="next"/, `「다음」 링크가 없다: ${html}`);
    assert.match(html, /<a[^>]+href="\/blog\/p1"/, "글 링크가 없다 — 허브가 비었다");
});

/** **음성 짝** — 마지막 쪽에서 그리면 없는 쪽으로 크롤러를 보낸다. */
test("마지막 쪽에서는 다음을 안 그린다", async () => {
    const html = await render(3, pageOf(5, true));
    assert.doesNotMatch(html, /rel="next"/, `마지막 쪽인데 다음을 그렸다: ${html}`);
    assert.match(html, /<a[^>]+href="\/blog\/page\/2"[^>]*rel="prev"/, `이전 링크가 없다: ${html}`);
});

/**
 * 🔴 **2쪽의 「이전」은 `/blog` 다.** `/blog/page/1` 을 만들면 같은 내용이 두 주소에 서고, 루트
 * layout 이 요청 경로를 그대로 canonical 로 내므로 **각자 자기를 정본이라 주장**한다.
 */
test("🔴 2쪽의 이전은 /blog 다 — /blog/page/1 이 아니다", async () => {
    const html = await render(2, pageOf(20, false));
    assert.match(html, /<a[^>]+href="\/blog"[^>]*rel="prev"/, `2쪽의 이전이 /blog 가 아니다: ${html}`);
    assert.doesNotMatch(html, /href="\/blog\/page\/1"/, "1쪽 주소를 만들었다 — 색인이 갈린다");
});

/**
 * 🔴 **백엔드가 죽어도 셸은 산다.** 그리고 마지막 쪽인지 모르는 상태에서 「다음」을 그리면
 * 없는 쪽으로 크롤러를 보낸다.
 */
test("🔴 백엔드가 죽으면 셸만 그리고 다음을 안 그린다", async () => {
    const html = await render(1, null);
    assert.match(html, /게시글이 없습니다/, `셸이 안 섰다: ${html}`);
    assert.doesNotMatch(html, /rel="next"/, "모르는데 다음을 그렸다");
    assert.doesNotMatch(html, /ItemList/, "글 0건인데 목록 그래프를 냈다 — 보이지 않는 것을 서술한다");
});

/** 글이 있으면 목록 그래프를 낸다 — 답변 엔진이 상세로 가는 허브로 읽는 자리다. */
test("글이 있으면 ItemList 그래프를 낸다", async () => {
    const html = await render(1, pageOf(3, true));
    assert.match(html, /ItemList/, `목록 그래프가 없다: ${html}`);
});
