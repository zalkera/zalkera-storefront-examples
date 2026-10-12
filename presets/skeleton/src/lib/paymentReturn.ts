/**
 * **결제창 복귀 화면의 판정** — `/payment/complete` 가 확정(`/api/payment/confirm`) 응답을 어느 갈래로 보낼지.
 *
 * 핵심은 「결과를 모른다」를 「실패」와 가르는 것이다. 결제사가 승인을 마무리하는 중이거나(409
 * `PAYMENT_CONFIRM_UNSETTLED`) 우리 쪽 연결이 끊기거나 시간이 넘으면(`status 0` · 코드 없는 502/503/504 ·
 * `UPSTREAM_UNAVAILABLE`) **승인이 났을 수 있다** — 그때 「결제 실패」나 막다른 오류를 보이면 손님이 다시 결제해 두 번
 * 결제된다. 그래서 그 갈래는 간격을 늘려 다시 묻고, 그래도 모르면 「확인 중」과 다시 확인 단추를 둔다.
 */
export type ConfirmResult = {ok: true} | {ok: false; status: number; code?: string; message?: string};
export type ConfirmVerdict = "confirmed" | "unknown" | "failed" | "needPhone" | "error";

/** 「확인 중」을 몇 번 더 물을지와 그 간격 — 결제사가 승인을 마무리하는 몇 초를 기다린다. */
export const CONFIRM_RETRY_DELAYS_MS: readonly number[] = [1500, 3000, 6000];

/** 상류가 닿지 않았다는 응답 — 결제 갈래 코드가 아닌 게이트웨이 상태. */
const GATEWAY = new Set([502, 503, 504]);

export function confirmVerdict(result: ConfirmResult): ConfirmVerdict {
    if (result.ok) return "confirmed";
    if (result.code === "PAYMENT_CONFIRM_UNSETTLED") return "unknown";
    if (result.code === "PAYMENT_CONFIRM_FAILED") return "failed";
    if (result.code === "ORDER_ACCESS_DENIED") return "needPhone";
    if (result.status === 0) return "unknown";
    if (GATEWAY.has(result.status) && (result.code === undefined || result.code === "UPSTREAM_UNAVAILABLE")) {
        return "unknown";
    }
    return "error";
}

/**
 * 「다시 결제」(같은 주문으로 결제창 다시 열기)가 실패했을 때 — 단추를 남길지(`retry`), 주문이 닫혀 더 못 여는지
 * (`closed` — 409 `NOT_PAYABLE`: 만료·취소·이미 결제).
 */
export function restartVerdict(code: string | undefined): "retry" | "closed" {
    return code === "NOT_PAYABLE" ? "closed" : "retry";
}
