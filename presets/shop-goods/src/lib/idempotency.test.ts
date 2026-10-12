import {strict as assert} from "node:assert";
import {test} from "node:test";
import {buyNowIdempotencyKey, orderIdempotencyKey} from "./idempotency.ts";
import {CHECKOUT_ATTEMPT_HEADER, checkoutAttempt, newCheckoutAttempt} from "./checkoutAttempt.ts";

/**
 * **멱등키의 행위**. 결제 문의 재시도 규칙이 전부 이 한 함수에 산다 — 그래서 값을 직접 잰다.
 */

const CART = "cart-1";
const BODY = {
    buyerName: "홍길동",
    buyerPhone: "01012345678",
    shipTo: {name: "홍길동", phone: "01012345678", address1: "서울 강남구 테헤란로 1"},
};

test("같은 내용 재시도는 같은 키다 — 백엔드가 원주문을 돌려준다(중복 주문 없음)", () => {
    assert.equal(orderIdempotencyKey(CART, BODY), orderIdempotencyKey(CART, {...BODY}));
    // 칸 순서가 달라도 같은 키다. 결제 문은 **브라우저가 보낸 JSON** 을 그대로 넘기는데
    // `JSON.parse` 가 원문 순서를 보존하므로, 정렬하지 않으면 뜻이 같은 본문이 다른 키가 된다.
    const reordered = {
        shipTo: {address1: "서울 강남구 테헤란로 1", phone: "01012345678", name: "홍길동"},
        buyerPhone: "01012345678",
        buyerName: "홍길동",
    };
    assert.equal(orderIdempotencyKey(CART, reordered), orderIdempotencyKey(CART, BODY), "칸 순서가 키를 바꾼다");
    // ⚠ 배열은 순서가 곧 뜻이라 안 건든다.
    assert.notEqual(
        orderIdempotencyKey(CART, {items: ["a", "b"]}),
        orderIdempotencyKey(CART, {items: ["b", "a"]}),
        "배열 순서를 접었다 — 다른 주문이 같은 키가 된다",
    );
});

test("내용을 고치면 다른 키다 — 「같은 키 · 다른 본문」 409 가 서지 않는다", () => {
    // 이 한 줄이 이 설계의 요점이다. 카트 키만 쓰면 여기가 409 이고, 카트 키 회전이 성공 응답에만
    // 실려 카트 쿠키 수명만큼 이어진다.
    for (const changed of [
        {...BODY, buyerPhone: "01099998888"},
        {...BODY, shipTo: {...BODY.shipTo, address1: "부산 해운대구 1"}},
        {...BODY, buyerName: "김철수"},
    ]) {
        assert.notEqual(orderIdempotencyKey(CART, changed), orderIdempotencyKey(CART, BODY), JSON.stringify(changed));
    }
});

test("카트가 다르면 다른 키다 — 다른 손님의 같은 내용이 서로의 주문을 재생하지 않는다", () => {
    assert.notEqual(orderIdempotencyKey(CART, BODY), orderIdempotencyKey("cart-2", BODY));
});

test("키가 백엔드 칸에 들어가고, 짧게 잘리지 않는다", () => {
    const key = orderIdempotencyKey(CART, BODY);
    assert.ok(key.startsWith("co-"), key);
    // 상한 — `shop_order.idempotency_key VARCHAR(64)`. 넘으면 저장이 잘린다.
    assert.ok(key.length <= 64, `멱등키가 칸 폭을 넘었다(${key.length}자)`);
    // 🔴 하한 — 짧게 자르면 **서로 다른 시도가 같은 키**가 되어 뒤 손님이 자기 잘못 없이 409 를 받는다.
    //    상한만 재면 `slice(0, 4)` 변이가 살아남는다.
    assert.ok(key.length >= 35, `지문이 너무 짧다(${key.length}자) — 충돌이 실제로 난다`);
});

/**
 * **바로 구매 멱등키**(`/api/checkout/direct`) — 「이 시도 · 이 내용」. 바로 구매는 카트를 소비하지 않아 카트 키가 안 돈다.
 * 시도 id 가 그 자리를 맡는다.
 */
const DIRECT = {items: [{variantId: 31, quantity: 1}], sourceLiveEventId: 12, checkout: BODY};
const ATTEMPT = "0123456789abcdef0123456789abcdef";

test("바로 구매 — 같은 시도·같은 내용은 같은 키, 내용·시도가 바뀌면 다른 키", () => {
    assert.equal(buyNowIdempotencyKey(ATTEMPT, DIRECT), buyNowIdempotencyKey(ATTEMPT, {...DIRECT}));
    // 칸 순서는 안 본다 — 브라우저가 보낸 JSON 을 그대로 넘긴다.
    assert.equal(
        buyNowIdempotencyKey(ATTEMPT, {checkout: BODY, sourceLiveEventId: 12, items: DIRECT.items}),
        buyNowIdempotencyKey(ATTEMPT, DIRECT),
    );
    assert.notEqual(
        buyNowIdempotencyKey(ATTEMPT, {...DIRECT, items: [{variantId: 31, quantity: 2}]}),
        buyNowIdempotencyKey(ATTEMPT, DIRECT),
        "수량을 고쳤는데 같은 키다 — 옛 주문이 재생된다",
    );
    // 🔴 다음 구매(새 시도 id)는 다른 키다 — 같은 손님이 같은 내용으로 한 번 더 살 때 결제된 옛 주문이 돌아오지 않는다.
    assert.notEqual(
        buyNowIdempotencyKey("fedcba9876543210fedcba9876543210", DIRECT),
        buyNowIdempotencyKey(ATTEMPT, DIRECT),
    );
});

test("바로 구매 키는 장바구니 결제 키와 섞이지 않고 칸 폭 안에 든다", () => {
    const key = buyNowIdempotencyKey(ATTEMPT, DIRECT);
    assert.ok(key.startsWith("bn-"), key);
    assert.ok(key.length <= 64 && key.length >= 35, `키 폭이 어긋났다(${key.length}자)`);
    // 같은 재료라도 장바구니 결제의 키와 다르다(접두) — 두 문의 키가 한 칸에 들어가도 서로를 재생하지 않는다.
    assert.notEqual(key, orderIdempotencyKey(ATTEMPT, DIRECT));
});

test("시도 id — 모양이 맞을 때만 받고, 새 값은 그 모양이다", () => {
    const headers = (value: string | null) => ({get: (n: string) => (n === CHECKOUT_ATTEMPT_HEADER ? value : null)});
    assert.equal(checkoutAttempt(headers(ATTEMPT)), ATTEMPT);
    assert.equal(checkoutAttempt(headers(` ${ATTEMPT} `)), ATTEMPT);
    for (const bad of [
        null,
        "",
        "short",
        "a".repeat(65),
        `${ATTEMPT.slice(0, 20)} x`,
        "가나다라마바사아자차카타파하가나다",
    ]) {
        assert.equal(checkoutAttempt(headers(bad)), undefined, String(bad));
    }
    const fresh = newCheckoutAttempt();
    assert.equal(checkoutAttempt(headers(fresh)), fresh, "새로 만든 시도 id 를 문이 안 받는다");
    assert.notEqual(newCheckoutAttempt(), fresh, "시도 id 가 매번 같다");
});
