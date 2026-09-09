import test from "node:test";
import assert from "node:assert/strict";
import {blogPagePath} from "./blogPaging.ts";

/**
 * 쪽 주소의 계약 — **1쪽은 `/blog` 하나**다.
 *
 * `/blog/page/1` 을 허용하면 같은 내용이 두 주소에 서서 색인이 갈린다(같은 글 목록을 두 곳이
 * 주장한다). 그래서 만드는 쪽(여기)과 받는 쪽(`app/blog/page/[n]` 의 `requirePage`) 둘 다
 * 1쪽을 거절한다 — 한쪽만 하면 크롤러가 만든 적 없는 주소로 들어올 때 열린다.
 *
 * 재현: `node --experimental-strip-types --test src/lib/blogPagePath.test.ts; echo rc=$?` → rc=0
 */
test("1쪽은 /blog 다 — /blog/page/1 을 만들지 않는다", () => {
    assert.equal(blogPagePath(1), "/blog");
    assert.equal(blogPagePath(0), "/blog", "0 이하도 1쪽으로 접는다");
    assert.equal(blogPagePath(-3), "/blog");
});

test("2쪽 이상은 정적 세그먼트다 — 쿼리가 아니다", () => {
    assert.equal(blogPagePath(2), "/blog/page/2");
    assert.equal(blogPagePath(7), "/blog/page/7");
    // ⚠ **쿼리로 되돌리지 마라.** `?page=` 는 `/blog` 를 1쪽까지 동적 렌더로 강등시킨다
    //    (근거와 재현 명령은 `lib/blogPaging.ts` KDoc).
    for (const n of [2, 7, 99]) {
        assert.ok(!blogPagePath(n).includes("?"), `${n}쪽이 쿼리 주소다 — 목록이 동적으로 강등된다`);
    }
});
