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
 * **쪽 라우트의 배선도 여기서 잰다.** `isOutOfRange(...) → notFound()` 한 줄을 지워도 전 게이트가
 * 초록이었다(`npm run verify`·`typecheck`·`floor-gate`·`doc-claims` 전부 rc=0). 그래서 라우트를
 * **호출해서** 404 가 실제로 던져지는지 본다 — 백엔드는 스텁으로 갈아 끼운다.
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
const compiled = new Map<string, Promise<Record<string, never>>>();

/** 라우트 시험이 쓰는 가짜 목록 모듈 — 백엔드 왕복 없이 응답을 주입한다. */
const BLOG_LIST_STUB = `
globalThis.__blogListStub = {posts: null};
export async function listBlogPage() {
    return globalThis.__blogListStub.posts;
}
// 이 본문은 안 불린다 — JSX 는 컴포넌트를 호출하지 않고 엘리먼트만 만든다.
// 단언이 읽는 props 는 그 엘리먼트의 것이다(값은 같다).
export function BlogList(props) {
    return {stub: "BlogList", props};
}
`;

/** `@/foo/bar` → 실제 파일. 확장자는 파일이 있는 쪽으로 정한다(번들러가 하던 일). */
function sourceOf(spec: string): string | null {
    for (const ext of ["", ".ts", ".tsx"]) {
        const candidate = join(SRC, spec + ext);
        if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
    }
    return null;
}

function compileGraph(entry: string, stubs: Record<string, string> = {}) {
    // ⚠ **`/tmp` 에 쓰면 안 된다** — node 는 맨 지정자(`react`)를 **가져오는 파일 기준**으로 푼다.
    const cache = resolve(SRC, "../node_modules/.cache");
    mkdirSync(cache, {recursive: true});
    const dir = mkdtempSync(join(cache, "zalkera-bloglist-"));
    const out = (spec: string) => join(dir, spec.replace(/\//g, "__") + ".mjs");

    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const spec = queue.shift()!;
        if (seen.has(spec)) continue;
        seen.add(spec);
        if (stubs[spec] !== undefined) {
            writeFileSync(out(spec), stubs[spec]!);
            continue;
        }
        const file = sourceOf(spec);
        assert.ok(file, `@/${spec} 를 못 찾았다 — 이 시험이 헛돈다`);
        const source = ts.sys.readFile(file!);
        assert.ok(source, `${file} 를 못 읽었다 — 이 시험이 헛돈다`);
        const rewritten = source!
            .replace(/(["'])@\/([^"']+)\1/g, (_m, q: string, rest: string) => {
                queue.push(rest);
                return `${q}${out(rest)}${q}`;
            })
            // 맨 지정자는 번들러가 아니라 node 가 푼다 — `next` 의 하위경로는 확장자를 요구한다.
            .replace(/(["'])next\/navigation\1/g, (_m, q: string) => `${q}next/navigation.js${q}`);
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
    // ⚠ **`import()` 가 풀린 **뒤에** 지운다** — 그 프로미스는 정적 import 까지 다 적재된 뒤에
    //    풀리므로 그때는 파일이 필요 없다. 동기적으로 지우면 못 읽는다(그래서 `finally` 가 아니다).
    return import(out(entry)).finally(() => rmSync(dir, {recursive: true, force: true})) as Promise<
        Record<string, never>
    >;
}

/** 그 쪽을 실제로 그린 HTML. `posts` 를 넣어 네트워크를 안 탄다. */
async function load<T>(entry: string, stubs?: Record<string, string>): Promise<T> {
    if (!compiled.has(entry)) compiled.set(entry, compileGraph(entry, stubs));
    return compiled.get(entry)! as Promise<T>;
}

async function render(page: number, posts: unknown): Promise<string> {
    const [{BlogList}, {renderToStaticMarkup}, {createElement}] = await Promise.all([
        load<{BlogList: (props: unknown) => Promise<unknown>}>("components/BlogList"),
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
test("🔴 백엔드가 죽으면 셸만 그리고 «없다»고 말하지 않는다", async () => {
    // 🔴 **`undefined` 도 넣는다** — `@zalkera/client` 는 2xx **빈 본문**에 `undefined` 를 준다.
    //    한 판 술어 하나만 그것을 받게 넓혔더니 이 컴포넌트가 던져 공개 쪽이 **500** 이 됐다.
    for (const 모름 of [null, undefined]) {
        const html = await render(1, 모름);
        assert.match(html, /블로그/, `${String(모름)} 에 셸이 안 섰다: ${html}`);
        // 🔴 **「게시글이 없습니다」는 거짓 진술이다** — 모르는 것이지 없는 것이 아니고, 이 쪽은
        //    `force-static`+`revalidate` 라 그 거짓이 굳는다. AEO 가 이 제품의 셀링이다.
        assert.doesNotMatch(html, /게시글이 없습니다/, `모르는데 «없다»고 말했다: ${html}`);
        assert.doesNotMatch(html, /rel="next"/, "모르는데 다음을 그렸다");
        assert.doesNotMatch(html, /ItemList/, "글 0건인데 목록 그래프를 냈다 — 보이지 않는 것을 서술한다");
    }
});

/** **양성 짝** — 진짜로 0건이면 그때는 말해야 한다(빈 선반을 침묵으로 두면 저작자가 헷갈린다). */
test("진짜 0건이면 «게시글이 없습니다» 를 그린다", async () => {
    const html = await render(1, {content: [], last: true});
    assert.match(html, /게시글이 없습니다/, `0건인데 아무 말도 안 했다: ${html}`);
    assert.doesNotMatch(html, /ItemList/, "글 0건인데 목록 그래프를 냈다");
});

/** 글이 있으면 목록 그래프를 낸다 — 답변 엔진이 상세로 가는 허브로 읽는 자리다. */
test("글이 있으면 ItemList 그래프를 낸다", async () => {
    const html = await render(1, pageOf(3, true));
    assert.match(html, /ItemList/, `목록 그래프가 없다: ${html}`);
});

/* ── 쪽 라우트의 배선 ────────────────────────────────────────────────────────
 * 라우트를 **호출해서** 잰다. 목록 모듈만 스텁으로 갈아 끼워 백엔드 왕복을 없앤다 — 판정은
 * 전부 진짜 코드가 한다(`parseBlogPageSegment` → `listBlogPage` → `isOutOfRange` → `notFound`). */

const ROUTE = "app/blog/page/[n]/page";

type RouteModule = {
    default: (props: {params: Promise<{n: string}>}) => Promise<unknown>;
};

/** 스텁이 심는 자리. 전사물을 경로로 다시 열지 않으려고 전역에 둔다(이 프로세스 안에서만 산다). */
type StubState = {posts: unknown};
const stubState = (): StubState => (globalThis as {__blogListStub?: StubState}).__blogListStub!;

/** `notFound()` 가 던지는 것인가 — Next 는 `digest` 로 표시한다. */
function isNotFound(error: unknown): boolean {
    const digest = (error as {digest?: unknown})?.digest;
    return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** 그 세그먼트로 라우트를 부른다. 던지면 `threw`, 아니면 `value`. */
async function call(n: string, posts: unknown): Promise<{threw: unknown} | {value: unknown}> {
    const mod = await load<RouteModule>(ROUTE, {"components/BlogList": BLOG_LIST_STUB});
    stubState().posts = posts;
    try {
        return {value: await mod.default({params: Promise.resolve({n})})};
    } catch (error) {
        return {threw: error};
    }
}

/**
 * 🔴 **범위 밖은 404 다.** 200 빈 목록은 소프트 404 이고, 「이전」이 무조건 그려져 `/blog` 까지
 * 이어지는 빈 쪽 사슬의 입구가 된다.
 *
 * 재현: 라우트에서 `if (isOutOfRange(page, posts)) notFound();` 를 지우면 이 시험만 red 다
 * (`npm run verify`·`typecheck`·`floor-gate`·`doc-claims` 는 그대로 rc=0).
 */
test("🔴 라우트 — 글 0건인 4쪽은 404 를 던진다", async () => {
    const result = await call("4", {content: [], last: true});
    assert.ok("threw" in result, "404 를 안 던졌다 — 빈 쪽이 200 으로 선다");
    assert.ok(isNotFound(result.threw), `404 가 아닌 것을 던졌다: ${String(result.threw)}`);
});

/**
 * 🔴 **백엔드 장애는 「범위 밖」이 아니다** — 404 를 내면 ISR 로 굳어 복구 뒤에도 404 가 나간다.
 *
 * `undefined` 도 같은 자리다: `@zalkera/client` 는 2xx **빈 본문**에 `undefined` 를 돌려주고,
 * `=== null` 로만 갈랐을 때 라우트가 `TypeError` 로 죽었다(500).
 */
test("🔴 라우트 — 백엔드가 죽으면(null·undefined) 404 를 안 던진다", async () => {
    for (const 모름 of [null, undefined]) {
        const result = await call("4", 모름);
        assert.ok("value" in result, `${String(모름)} 에 던졌다: ${String((result as {threw: unknown}).threw)}`);
    }
});

/** **양성 짝** — 정상 쪽을 404 로 만들면 2쪽 이후가 통째로 사라진다. */
test("라우트 — 글이 있는 쪽은 그대로 그린다", async () => {
    const posts = {content: [{id: 1, slug: "a", title: "가"}], last: false};
    const result = await call("2", posts);
    assert.ok("value" in result, `정상 쪽에서 던졌다: ${String((result as {threw: unknown}).threw)}`);
    // 🔴 **목록을 두 번 부르지 않는다** — 범위 판정용으로 받은 것을 그대로 넘긴다.
    assert.deepEqual((result.value as {props: {posts: unknown; page: number}}).props, {page: 2, posts});
});

/** 🔴 **1쪽 세그먼트와 다른 표기는 라우트에서 404 다** — 같은 내용이 두 주소에 서면 색인이 갈린다. */
test("🔴 라우트 — 1쪽·다른 표기 세그먼트는 404 다", async () => {
    const posts = {content: [{id: 1, slug: "a", title: "가"}], last: false};
    for (const bad of ["1", "0", "03", "2.0", "abc"]) {
        const result = await call(bad, posts);
        assert.ok("threw" in result && isNotFound(result.threw), `${JSON.stringify(bad)} 가 열렸다`);
    }
});
