/**
 * **바로 구매의 시도 id** — 브라우저가 폼에서 만들고, 바로 구매 문(`/api/checkout/direct`)이 멱등키 재료로 쓴다.
 *
 * 장바구니 결제의 키는 카트 키에서 나오고 카트 키는 결제 성공 응답에서 돈다. 바로 구매는 카트를 소비하지 않으므로
 * 그 자리를 **시도 id** 가 맡는다 — 같은 폼의 재시도(더블클릭·응답 유실)는 같은 값을 보내고, 결제창으로 떠나면
 * 폼이 새 값을 만든다. 키를 만드는 법은 `@/lib/idempotency` 의 `buyNowIdempotencyKey` 다.
 *
 * 이 파일은 브라우저와 서버가 **같이** 들여온다 — `node:` 모듈을 들이지 마라(클라이언트 번들이 깨진다).
 */

/** 시도 id 를 싣는 요청 헤더. 폼과 문이 이 상수 하나를 같이 쓴다. */
export const CHECKOUT_ATTEMPT_HEADER = "x-checkout-attempt";

/** 받는 모양 — 영문·숫자·하이픈 16~64자. 손님끼리 겹칠 만한 짧은 값·빈 값을 받지 않는다. */
const ATTEMPT_SHAPE = /^[A-Za-z0-9-]{16,64}$/;

/** 요청의 시도 id. 없거나 모양이 아니면 `undefined` — 그때 문은 멱등키 없이 보낸다. */
export function checkoutAttempt(headers: {get(name: string): string | null}): string | undefined {
    const raw = headers.get(CHECKOUT_ATTEMPT_HEADER)?.trim();
    return raw && ATTEMPT_SHAPE.test(raw) ? raw : undefined;
}

/**
 * 새 시도 id(16진 32자). `crypto.randomUUID` 는 보안 출처(https·localhost)에서만 있어 LAN 주소로 연 개발 화면에서
 * 없다 — 어디서나 있는 `getRandomValues` 로 만든다.
 */
export function newCheckoutAttempt(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 결제 시작이 이 코드로 실패한 뒤에도 **같은 시도 id 를 쓰는가**. 409 `NOT_PAYABLE` 은 그 주문이 더는 결제할 수 없다는
 * 뜻이다(미결제로 두다 만료·취소) — 같은 시도 id 로 다시 내면 같은 키로 그 닫힌 주문이 재생될 뿐이라, 시도 id 를 버리고
 * 다음 누름이 새 주문이 되게 한다. 그 밖의 실패(연결 끊김·시간 초과·재고 등)는 같은 시도로 다시 내야 이미 선 주문이
 * 이어진다(새 주문이 서면 앞 주문이 재고·한정 수량을 쥔 채 남는다).
 */
export function attemptSurvives(code: string | undefined): boolean {
    return code !== "NOT_PAYABLE";
}
