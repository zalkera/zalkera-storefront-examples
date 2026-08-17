import {deepStrictEqual, ok} from "node:assert/strict";
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {RESERVED_SEGMENTS} from "./reservedSegments.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(SRC, "app");

/** 그 경로 **자체**가 페이지나 라우트를 내놓는 최상위 이름 — 즉 `[slug]` 를 가리는 것. */
const ENTRY = ["page.tsx", "page.ts", "page.jsx", "page.js", "route.ts", "route.js"];

/**
 * 그 이름의 URL 을 **실제로 내놓는** 최상위 세그먼트 — 즉 `[slug]` 를 가리는 것.
 *
 * ⚠ **라우트 그룹 안쪽도 본다.** `src/app/(marketing)/about/page.tsx` 는 `/about` 을 서빙한다 —
 *   괄호 폴더는 URL 에 안 나타나기 때문이다. 최상위만 훑으면 그 그림자화를 통째로 놓친다.
 * ⚠ **심링크 폴더도 본다.** `isDirectory()` 는 심링크에 `false` 다.
 */
function shadowing(dir: string = APP, depth = 0): string[] {
    const found: string[] = [];
    for (const e of readdirSync(dir, {withFileTypes: true})) {
        if (e.name.startsWith("[") || e.name.startsWith("_")) continue;
        const at = join(dir, e.name);
        if (!statSync(at).isDirectory()) continue;
        if (/^\(.*\)$/.test(e.name)) {
            // 라우트 그룹은 URL 에 안 나타난다 — 한 겹 더 내려가되 무한히 돌지 않는다.
            if (depth < 3) found.push(...shadowing(at, depth + 1));
            continue;
        }
        if (ENTRY.some((f) => existsSync(join(at, f)))) found.push(e.name);
    }
    return [...new Set(found)];
}

/** `robots.ts` 가 크롤러에게 막은 최상위 이름. */
function disallowed(): string[] {
    const src = readFileSync(join(APP, "robots.ts"), "utf8");
    const list = /disallow:\s*\[([^\]]*)\]/.exec(src)?.[1];
    ok(list !== undefined, "robots.ts 에서 disallow 목록을 못 읽었다 — 이 시험이 반쪽만 본다");
    return [...list.matchAll(/["'`]\/([^"'`/]+)\/?["'`]/g)].map((m) => m[1]);
}

test("도출할 근거가 실제로 있다 — 없으면 이 시험이 아무것도 안 본다", () => {
    ok(shadowing().length > 0, "가리는 라우트를 하나도 못 찾았다");
    ok(disallowed().length > 0, "robots 의 disallow 를 하나도 못 찾았다");
});

test("목록은 «가려짐 ∪ robots 막음» 과 정확히 같다", () => {
    // ⚠ **디렉터리 존재로 재면 안 된다.** `src/app/c/` 처럼 `[slug]/` 만 든 폴더는 `/c` 를 안 가린다 —
    //   그런 이름을 목록에 넣으면 **멀쩡히 서는 페이지가 sitemap 에서 조용히 빠진다.**
    //   반대로 빠뜨리면 가려진 URL 을 크롤러에게 광고한다. 그래서 양방향으로 못 박는다.
    const expected = [...new Set([...shadowing(), ...disallowed()])].sort();
    deepStrictEqual([...RESERVED_SEGMENTS].sort(), expected);
});

test("가리는 라우트는 하나도 빠지지 않는다", () => {
    const missing = shadowing().filter((n) => !RESERVED_SEGMENTS.has(n));
    deepStrictEqual(missing, [], `가려지는데 목록에 없다(그 URL 을 크롤러에 광고한다): ${missing.join(" ")}`);
});

test("근거 없는 이름은 목록에 없다", () => {
    const reasons = new Set([...shadowing(), ...disallowed()]);
    const groundless = [...RESERVED_SEGMENTS].filter((n) => !reasons.has(n));
    deepStrictEqual(groundless, [], `가리지도 막히지도 않는데 뺀다(서는 페이지가 사라진다): ${groundless.join(" ")}`);
});
