import test from "node:test";
import assert from "node:assert/strict";
import {cacheControlFrom, MAX_MEDIA_CACHE_SECONDS} from "./mediaCache.ts";

/**
 * `/media/{id}` 302 캐시 상한 회귀.
 *
 * 이 판정이 **넓어지면** 방문자가 만료된 서명을 재사용해 이미지가 깨지고, **좁아지면** 페이지뷰마다
 * 이미지 수만큼(카탈로그 상한 24) 백엔드 서명 요청이 그대로 돌아온다. 양쪽을 다 못 박는다.
 *
 * 숫자 하나가 아니라 **불변식**을 고정한다 — 상한 상수를 바꾸는 사람이 규칙을 깨면 여기서 걸린다.
 */

test("상류 지시를 물려받는다", () => {
    assert.equal(cacheControlFrom("private, max-age=30"), "private, max-age=30");
    assert.equal(cacheControlFrom("private, max-age=119"), "private, max-age=119");
});

test("우리 상한으로 자른다 — 상류가 길게 줘도", () => {
    assert.equal(cacheControlFrom("private, max-age=9999"), `private, max-age=${MAX_MEDIA_CACHE_SECONDS}`);
    assert.equal(cacheControlFrom("private, max-age=300"), `private, max-age=${MAX_MEDIA_CACHE_SECONDS}`);
});

test("넓히지 않는다 — public 이라 해도 private 로만 낸다", () => {
    // 공유 캐시 설정은 이 레포 밖이라 그 동작을 여기서 검증할 수 없다.
    assert.equal(cacheControlFrom("public, max-age=60"), "private, max-age=60");
});

test("재사용을 금지·유보하는 지시는 전부 no-store 로 받는다", () => {
    // `no-cache`·`must-revalidate` 를 max-age 만 보고 캐시로 바꾸면 상류의 재검증 요구가 사라진다.
    for (const upstream of [
        "no-store",
        "no-cache",
        "must-revalidate",
        "proxy-revalidate",
        "no-store, max-age=120",
        "max-age=120, no-store",
        "no-cache, max-age=45",
        "private, max-age=60, must-revalidate",
        "NO-STORE",
        "  no-cache  ",
    ]) {
        assert.equal(cacheControlFrom(upstream), "no-store", upstream);
    }
});

test("못 읽으면 캐시하지 않는다", () => {
    for (const upstream of [
        null,
        "",
        "   ",
        "max-age=",
        "max-age=abc",
        "max-age=+120",
        "max-age=-5",
        "private",
        "immutable",
    ]) {
        assert.equal(cacheControlFrom(upstream), "no-store", JSON.stringify(upstream));
    }
});

test("s-maxage 를 우리 것으로 읽지 않는다 — 그건 공유 캐시 몫이다", () => {
    assert.equal(cacheControlFrom("s-maxage=999"), "no-store");
    assert.equal(cacheControlFrom("public, s-maxage=999"), "no-store");
    // 둘 다 있으면 우리 것(max-age)만 본다.
    assert.equal(cacheControlFrom("s-maxage=999, max-age=60"), "private, max-age=60");
});

test("이름의 **일부**가 max-age 인 지시를 우리 것으로 읽지 않는다", () => {
    // 앞뒤 경계가 없으면 `foo-max-age=999` 의 999 를 우리 값으로 읽는다. `s-maxage` 는 철자상
    // `max-age` 를 품지 않아 이 경계를 시험하지 못한다 — 실제로 가르는 입력을 따로 둔다.
    assert.equal(cacheControlFrom("foo-max-age=999"), "no-store");
    assert.equal(cacheControlFrom("private, x-max-age=999"), "no-store");
    // 값 뒤에 다른 글자가 붙으면 그것도 우리가 아는 형태가 아니다.
    assert.equal(cacheControlFrom("max-age=120x"), "no-store");
});

test("0 은 캐시가 아니다", () => {
    assert.equal(cacheControlFrom("private, max-age=0"), "no-store");
});

test("불변식 — 낸 max-age 는 상류가 준 값을 절대 넘지 않는다", () => {
    for (let n = 0; n <= 600; n += 1) {
        const out = cacheControlFrom(`private, max-age=${n}`);
        const got = /max-age=(\d+)/.exec(out)?.[1];
        if (got === undefined) continue;
        assert.ok(Number(got) <= n, `상류 ${n}s 인데 ${got}s 를 냈다`);
        assert.ok(Number(got) <= MAX_MEDIA_CACHE_SECONDS, `상한을 넘었다: ${got}s`);
    }
});

test("양성 통제군 — 넉넉한 상류 값에서는 실제로 캐시한다", () => {
    // 위 불변식들은 «언제나 no-store» 로도 통과한다. 캐시가 살아 있는지를 따로 못 박는다.
    const cached = Array.from({length: 600}, (_, n) => cacheControlFrom(`private, max-age=${n + 1}`)).filter((v) =>
        v.startsWith("private"),
    );
    assert.equal(cached.length, 600);
});

test("우리가 내는 값은 두 형태뿐이다", () => {
    const shapes = new Set(
        ["private, max-age=30", "public, max-age=9999", "no-store", "", "s-maxage=5", null].map((u) => {
            const out = cacheControlFrom(u);
            return out.startsWith("private, max-age=") ? "private" : out;
        }),
    );
    assert.deepEqual([...shapes].sort(), ["no-store", "private"]);
});
