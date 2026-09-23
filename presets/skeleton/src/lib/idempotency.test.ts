import {strict as assert} from "node:assert";
import {test} from "node:test";
import {orderIdempotencyKey} from "./idempotency.ts";

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
    // 🔴 하한 — 짧게 자르면 **서로 다른 시도가 같은 키**가 되어 남의 주문을 재생받는다(교착보다 나쁘다).
    //    상한만 재면 `slice(0, 4)` 변이가 살아남는다.
    assert.ok(key.length >= 35, `지문이 너무 짧다(${key.length}자) — 충돌이 실제로 난다`);
});
