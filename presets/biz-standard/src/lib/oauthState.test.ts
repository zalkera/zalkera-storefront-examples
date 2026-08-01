import test from "node:test";
import assert from "node:assert/strict";
import {matchesOAuthState, newOAuthState} from "./oauthState.ts";

/**
 * OAuth state 대조의 **회귀 픽스처**(memo118 ②층).
 *
 * 이 판정이 막는 것은 ①(Origin↔Host)이 못 막는 유일한 경로다 — 피해자를 우리 콜백 페이지로
 * 톱레벨 이동시킨 뒤 이어지는 same-origin POST. 그래서 **전부 fail-closed** 여야 한다:
 * 여기서 실수로 `true` 를 내는 갈래가 하나라도 생기면 "state 를 아예 안 보내면 뚫리는" 구멍이 된다.
 */

const COOKIE = (state: string, provider: string) => JSON.stringify({state, provider});

test("정상 — state 와 provider 가 모두 같으면 통과한다", () => {
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), "s1", "KAKAO"), true);
});

test("state 가 다르면 막힌다", () => {
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), "s2", "KAKAO"), false);
});

/** KAKAO 로 발행한 state 를 GOOGLE 교환에 재사용하면 다른 앱의 code 를 교환하게 된다. */
test("provider 가 다르면 막힌다 — state 재사용 차단", () => {
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), "s1", "GOOGLE"), false);
});

test("쿠키가 없으면 막힌다 — 우리가 시작하지 않은 콜백이다", () => {
    assert.equal(matchesOAuthState(undefined, "s1", "KAKAO"), false);
});

test("state 를 안 보내면 막힌다", () => {
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), undefined, "KAKAO"), false);
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), "", "KAKAO"), false);
});

test("쿠키가 깨졌으면 막힌다", () => {
    assert.equal(matchesOAuthState("not-json", "s1", "KAKAO"), false);
});

/**
 * 빈 state 끼리 맞춰도 뚫리지 않는다.
 *
 * ⚠ 이 케이스를 실제로 끊는 것은 **제출 state 의 비어있음 검사**이지 쿠키 쪽 가드가 아니다
 * (실측: 쿠키 쪽 가드를 지워도 전건 통과 — 동치 가드다). 그 사실을 구현 주석에 적어 뒀다.
 */
test("쿠키의 state 가 비어 있으면 막힌다", () => {
    assert.equal(matchesOAuthState(COOKIE("", "KAKAO"), "", "KAKAO"), false);
});

test("타입이 어긋나면 막힌다", () => {
    assert.equal(matchesOAuthState(JSON.stringify({state: 1, provider: "KAKAO"}), "1", "KAKAO"), false);
    assert.equal(matchesOAuthState(COOKIE("s1", "KAKAO"), 1 as unknown, "KAKAO"), false);
});

test("발행값은 매번 다르다", () => {
    assert.notEqual(newOAuthState(), newOAuthState());
});
