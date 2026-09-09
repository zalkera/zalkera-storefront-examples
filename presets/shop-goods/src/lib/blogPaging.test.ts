import test from "node:test";
import assert from "node:assert/strict";
import {blogPagePath, hasNextPage, isOutOfRange, parseBlogPageSegment} from "./blogPaging.ts";

/**
 * 블로그 쪽 나눔의 **판정 셋** — 발견 경로를 실제로 만드는 자리다.
 *
 * ## 왜 이 파일이 있나
 *
 * 한 판 이 셋이 컴포넌트·라우트 안에 있었고 **행위 그물이 0건**이었다. 심의가 넣은 변이 셋이
 * 전 게이트를 통과했다:
 *
 *  - `hasNext = false` — 「다음 →」이 통째로 사라진다. **21번째 글이 다시 도달 불가**가 되는데,
 *    그것이 정확히 이 트랜치가 고친 결함이다
 *  - `posts === null || posts.last === false` — 백엔드가 죽었을 때 **없는 쪽으로 크롤러를 보낸다**
 *  - `if (page < 1)` — `/blog/page/1` 이 열려 같은 내용이 두 주소에 서고 **각자 자기를 canonical
 *    이라 주장**한다(실물 확인)
 *
 * 재현: `node --experimental-strip-types --test src/lib/blogPaging.test.ts; echo rc=$?` → rc=0
 */

test("1쪽은 /blog 다 — /blog/page/1 을 만들지 않는다", () => {
    assert.equal(blogPagePath(1), "/blog");
    assert.equal(blogPagePath(0), "/blog");
    assert.equal(blogPagePath(-3), "/blog");
});

test("2쪽 이상은 정적 세그먼트다 — 쿼리가 아니다", () => {
    assert.equal(blogPagePath(2), "/blog/page/2");
    assert.equal(blogPagePath(7), "/blog/page/7");
    // ⚠ **쿼리로 되돌리지 마라.** `?page=` 는 `/blog` 를 1쪽까지 동적 렌더로 강등시킨다
    //    (근거와 재현 명령은 `blogPaging.ts` KDoc).
    for (const n of [2, 7, 99]) {
        assert.ok(!blogPagePath(n).includes("?"), `${n}쪽이 쿼리 주소다 — 목록이 동적으로 강등된다`);
    }
});

/**
 * 🔴 **받는 쪽도 1쪽을 거절한다.** 만드는 쪽만 막으면 크롤러가 **우리가 만든 적 없는 주소**로
 * 들어올 때 열린다 — 그것이 애초에 양쪽에서 막기로 한 이유다.
 */
test("🔴 1쪽 세그먼트는 거절한다 — 같은 내용이 두 주소에 서면 색인이 갈린다", () => {
    assert.equal(parseBlogPageSegment("1"), null);
    assert.equal(parseBlogPageSegment("0"), null);
});

/**
 * 🔴 **표기가 다르면 다른 주소가 된다.** `Number()` 로만 읽으면 `03`·`0x3`·`3e0`·`2.0` 이 전부
 * 열리고, 루트 layout 이 요청 경로를 그대로 canonical 로 내므로 **각자 자기를 정본이라 주장**한다.
 */
test("🔴 다른 표기는 전부 거절한다 — 각자 자기를 canonical 이라 주장하게 된다", () => {
    for (const bad of [
        "03", "0003", // 앞자리 0
        "0x3", "0b11", "0o3", // 진법 접두
        "3e0", "3E0", // 지수
        "3.", "2.0", "3.5", // 소수점
        "+3", " 3", "3 ", "\t3", "\n3", // 공백·부호
        "-1", "abc", "", "١٢", "３", // 비ASCII 숫자·전각
        "1e999", "9007199254740993", // 안전정수 밖
        "1234567890", // 10자리 — 상한 밖
    ]) {
        assert.equal(parseBlogPageSegment(bad), null, `${JSON.stringify(bad)} 가 쪽 번호로 통과했다`);
    }

    // **양성 짝** — 좁힘이 정상 값을 먹으면 2쪽 이후가 통째로 404 다.
    assert.equal(parseBlogPageSegment("2"), 2);
    assert.equal(parseBlogPageSegment("42"), 42);
    assert.equal(parseBlogPageSegment("999999999"), 999999999);
});

/**
 * 🔴 **「다음」이 발견 경로다.** 이 판정이 늘 `false` 면 21번째 글이 목록에서 도달 불가가 된다 —
 * 이 트랜치가 고친 그 결함이 그대로 돌아온다.
 */
test("🔴 다음 쪽이 있으면 그린다 · 없거나 모르면 안 그린다", () => {
    assert.equal(hasNextPage({last: false}), true, "다음 쪽이 있는데 안 그린다 — 그 뒤 글이 사라진다");
    assert.equal(hasNextPage({last: true}), false, "마지막 쪽인데 다음을 그린다 — 없는 쪽으로 보낸다");
    // ⚠ **백엔드가 죽으면 모른다** — 모를 때는 안 그린다.
    assert.equal(hasNextPage(null), false, "백엔드가 죽었는데 다음을 그린다 — 없는 쪽으로 크롤러를 보낸다");
    // 🔴 **`undefined` 도 같은 「모름」이다** — 형제 `isOutOfRange` 만 넓히고 여기를 안 넓혔더니
    //    이 자리에서 던져 공개 쪽이 404 가 아니라 **500** 이 됐다. 두 술어는 같은 값을 받는다.
    assert.equal(hasNextPage(undefined), false, "빈 본문 응답에 던지거나 다음을 그린다");
    assert.equal(hasNextPage({}), false, "`last` 가 없으면 모른다 — 그때도 안 그린다");
});

/**
 * 🔴 **범위 밖은 404 다.** 200 빈 목록은 소프트 404 이고, 「이전」이 무조건 그려져 `/blog` 까지
 * 이어지는 빈 쪽 사슬의 입구가 된다.
 */
test("🔴 범위 밖 쪽은 없는 쪽이다 — 200 빈 목록을 내지 않는다", () => {
    assert.equal(isOutOfRange(4, {content: []}), true, "글 0건인 4쪽이 200 으로 선다 — 소프트 404 다");
    assert.equal(isOutOfRange(999, {content: []}), true);

    // **양성 짝** — 정상 쪽과 1쪽(빈 블로그)을 먹으면 안 된다.
    assert.equal(isOutOfRange(2, {content: new Array(20)}), false, "글이 있는 쪽을 없는 쪽이라 한다");
    assert.equal(isOutOfRange(1, {content: []}), false, "글이 0건인 블로그의 첫 쪽은 404 가 아니다");
});

/**
 * 🔴 **백엔드가 죽은 것은 「범위 밖」이 아니다.**
 *
 * `null`(모름)에 404 를 내면 그것이 ISR 로 `revalidate` 동안 굳어, **백엔드가 살아난 뒤에도**
 * 그 쪽이 404 를 낸다. 캐시는 디스크에 있어 프로세스를 다시 띄워도 살아남는다 — 응답이
 * `x-nextjs-cache: HIT` 로 나간다. 형제 `hasNextPage` 와 같은 판정이다: **모름 ≠ 없음**.
 *
 * 재현: 백엔드를 내린 채 `/blog/page/4` 를 한 번 받고, 백엔드를 올린 뒤 다시 받아
 * `curl -sI localhost:3000/blog/page/4 | grep -i 'x-nextjs-cache\|HTTP/'` 를 견준다.
 */
test("🔴 백엔드가 죽으면(null·undefined) 범위 밖이라 하지 않는다 — 404 가 캐시에 굳는다", () => {
    for (const page of [2, 4, 999]) {
        assert.equal(isOutOfRange(page, null), false, `${page}쪽이 백엔드 장애에 404 를 낸다`);
        // 🔴 **`undefined` 도 「모름」이다** — `@zalkera/client` 는 2xx **빈 본문**에 `null` 이
        //    아니라 `undefined` 를 돌려준다(`if (!text) return void 0`). `=== null` 로만 갈랐을 때
        //    그 응답이 `TypeError: Cannot read properties of undefined` 였다.
        assert.equal(isOutOfRange(page, undefined), false, `${page}쪽이 빈 본문에 던지거나 404 를 낸다`);
    }
    // **양성 짝** — 「무조건 false」면 진짜 범위 밖이 200 빈 목록으로 선다.
    assert.equal(isOutOfRange(4, {content: []}), true);
    // `content` 자체가 없는 응답도 「모름」이 아니라 빈 쪽이다(백엔드가 답은 했다).
    assert.equal(isOutOfRange(4, {}), true);
});
