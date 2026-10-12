import {strict as assert} from "node:assert";
import {test} from "node:test";
import {CONFIRM_RETRY_DELAYS_MS, confirmVerdict, restartVerdict} from "./paymentReturn.ts";

/**
 * **결제창 복귀 화면의 갈래.** 「결과를 모른다」를 「실패」로 보이면 손님이 다시 결제해 두 번 결제된다 — 그 경계를 잰다.
 */

const no = (status: number, code?: string) => ({ok: false as const, status, code});

test("결과를 모르는 응답은 「확인 중」 갈래다 — 결제사 처리 중·연결 끊김·코드 없는 게이트웨이 오류", () => {
    for (const r of [
        no(409, "PAYMENT_CONFIRM_UNSETTLED"),
        no(0),
        no(502),
        // BFF 가 SDK 의 시간 초과 오류를 그대로 실으면 `code: null` 이다 — 칸이 없는 것과 같다.
        {ok: false as const, status: 502, code: null},
        no(504),
        no(503),
        no(502, "UPSTREAM_UNAVAILABLE"),
        no(504, "UPSTREAM_UNAVAILABLE"),
    ]) {
        assert.equal(confirmVerdict(r), "unknown", JSON.stringify(r));
    }
});

test("양성 짝 — 배선 고장·내부 오류·인가 한도는 「확인 중」이 아니다(다시 물어도 안 풀린다)", () => {
    for (const r of [
        no(502, "UPSTREAM_NON_JSON"),
        no(502, "UPSTREAM_REDIRECT"),
        no(500),
        no(429, "TOO_MANY_REQUESTS"),
    ]) {
        assert.equal(confirmVerdict(r), "error", JSON.stringify(r));
    }
});

test("나머지 갈래 — 확정·결제 안 됨·연락처 필요", () => {
    assert.equal(confirmVerdict({ok: true}), "confirmed");
    assert.equal(confirmVerdict(no(400, "PAYMENT_CONFIRM_FAILED")), "failed");
    assert.equal(confirmVerdict(no(403, "ORDER_ACCESS_DENIED")), "needPhone");
});

test("다시 묻는 간격은 늘어나고 끝이 있다", () => {
    assert.ok(CONFIRM_RETRY_DELAYS_MS.length >= 2);
    for (let i = 1; i < CONFIRM_RETRY_DELAYS_MS.length; i += 1) {
        assert.ok(CONFIRM_RETRY_DELAYS_MS[i]! > CONFIRM_RETRY_DELAYS_MS[i - 1]!);
    }
    // 손님이 「확인 중」 단추를 보기까지 기다리는 시간의 상한 — 너무 길면 화면이 멈춘 것처럼 보인다.
    assert.ok(CONFIRM_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) <= 15_000);
});

test("「다시 결제」 실패 — 닫힌 주문만 단추를 거두고, 나머지는 다시 누르게 둔다", () => {
    assert.equal(restartVerdict("NOT_PAYABLE"), "closed");
    for (const code of [undefined, "UPSTREAM_UNAVAILABLE", "PG_SESSION_FAILED", "TOO_MANY_REQUESTS"]) {
        assert.equal(restartVerdict(code), "retry", String(code));
    }
});
