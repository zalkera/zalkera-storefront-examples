import test from "node:test";
import assert from "node:assert/strict";
import {pageParam, routeParam} from "./routeParam.ts";

/**
 * 동적 세그먼트 디코딩의 계약.
 *
 * 이 축이 빠져 있던 동안 한글 slug 페이지가 **404 인데 sitemap 은 그것을 광고**했다 — 게이트
 * 넷(`validate`·`typecheck`·`test`·`build`)과 팩 관문이 전부 초록인 채로. ASCII slug 는 인코딩이
 * 항등이라 통제군으로 두지 않으면 이 결함이 안 보인다.
 */
test("퍼센트 인코딩된 한글을 사람이 쓴 값으로 되돌린다", () => {
    assert.equal(routeParam("%ED%9A%8C%EC%82%AC%EC%97%B0%ED%98%81"), "회사연혁");
    assert.equal(routeParam("%ED%95%9C%EA%B8%80%20%EA%B3%B5%EB%B0%B1"), "한글 공백");
});

test("통제군 — ASCII 는 그대로다(항등)", () => {
    for (const s of ["about", "our-story", "2026-roadmap", "a.b", "3d"]) {
        assert.equal(routeParam(s), s);
    }
});

test("못 되돌리는 입력은 **던지지 않고** 원문을 준다 — 500 대신 404 로 떨어뜨린다", () => {
    // 방문자가 주소창에 아무거나 쳐도 만들 수 있는 입력이다.
    for (const s of ["%", "%zz", "%E0%A4%A", "100%", "%C0%80"]) {
        assert.doesNotThrow(() => routeParam(s), `${s} 에서 던졌다`);
        assert.equal(typeof routeParam(s), "string");
    }
    assert.equal(routeParam("%"), "%");
});

test("통제군 — `decodeURIComponent` 는 정말 던진다(이 시험의 전제)", () => {
    assert.throws(() => decodeURIComponent("%"), URIError);
});

test("이미 디코드된 값을 두 번 디코드하지 않는다 — `%25` 는 리터럴 `%` 다", () => {
    assert.equal(routeParam("100%25"), "100%");
    assert.equal(routeParam(routeParam("100%2525")), "100%");
});

test("?page= 는 1-기반이고 못 읽으면 1 이다 — 던지면 그 주소가 500 으로 굳는다", () => {
    assert.equal(pageParam("2"), 2);
    assert.equal(pageParam("1"), 1);
    assert.equal(pageParam(["3", "9"]), 3); // 같은 이름이 둘이면 첫 값

    // 크롤러·손편집이 실제로 보내는 것들 — 전부 1 로 접는다.
    for (const junk of [undefined, "", "   ", "abc", "0", "-1", "1.5", "2e3x", "٣", null as unknown as string]) {
        assert.equal(pageParam(junk), 1, `${JSON.stringify(junk)} 가 1 이 아니다`);
    }
    // 안전정수 밖 — `page - 1` 로 넘기면 무슨 쪽을 받을지 모른다.
    assert.equal(pageParam("1e999"), 1, "Infinity 가 쪽 번호가 됐다");
    assert.equal(pageParam("9007199254740993"), 1, "안전정수 밖이 통과했다");

    // **양성 짝** — 이 좁힘이 정상 값을 먹으면 페이지네이션이 통째로 안 선다.
    assert.equal(pageParam("9007199254740991"), 9007199254740991);
    assert.equal(pageParam("42"), 42);
});
