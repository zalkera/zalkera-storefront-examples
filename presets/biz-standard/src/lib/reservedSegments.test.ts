import {ok, strictEqual} from "node:assert/strict";
import {readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {RESERVED_SEGMENTS} from "./reservedSegments.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

/** `src/app/` 최상위의 **정적** 세그먼트. `[slug]` 같은 동적 세그먼트와 라우트 그룹은 뺀다. */
function staticSegments(): string[] {
    return readdirSync(APP, {withFileTypes: true})
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => !name.startsWith("[") && !name.startsWith("(") && !name.startsWith("_"))
        .sort();
}

test("훑을 라우트가 실제로 있다 — 없으면 이 시험이 아무것도 안 본다", () => {
    ok(staticSegments().length > 0, `${APP} 에서 정적 세그먼트를 못 찾았다`);
});

test("고정 라우트가 전부 목록에 있다", () => {
    // ⚠ 라우트를 하나 더하고 목록에 안 적으면, 그 이름의 콘텐츠 페이지가 **가려진 채** sitemap 에
    //   실린다 — 크롤러는 색인하는데 내용이 다른 화면이 뜬다. 실제로 `c` 가 그 상태였다.
    const missing = staticSegments().filter((name) => !RESERVED_SEGMENTS.has(name));
    strictEqual(missing.join(" "), "", `src/app/ 에 있는데 RESERVED_SEGMENTS 에 없는 라우트: ${missing.join(" ")}`);
});

test("목록에 없는 라우트를 지어내지 않는다", () => {
    // 없는 라우트를 목록에 넣으면 **멀쩡히 서는 페이지**가 sitemap 에서 조용히 빠진다.
    const real = new Set(staticSegments());
    const ghosts = [...RESERVED_SEGMENTS].filter((name) => !real.has(name));
    strictEqual(ghosts.join(" "), "", `RESERVED_SEGMENTS 에만 있는 이름: ${ghosts.join(" ")}`);
});
