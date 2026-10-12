import {strict as assert} from "node:assert";
import {test} from "node:test";
import type {LiveEventProduct} from "@zalkera/client";
import {BUY_NOW_MAX_QUANTITY, liveBuyable, liveEventId, liveQuantityMax, sortLiveProducts} from "./liveEvent.ts";

/** 라이브 방송 쪽의 표시 판정 — 구매 칸을 여는 조건·수량 상한·순서. */

const product = (over: Partial<LiveEventProduct>): LiveEventProduct => ({
    productId: 1,
    productName: "상품",
    pinned: false,
    sortOrder: 0,
    livePrice: null,
    liveQtyCap: null,
    liveSold: 0,
    remaining: null,
    soldOut: false,
    variants: [],
    ...over,
});

test("회차 id — 양의 정수만 받는다(경로 조각·음수·0·소수·긴 값은 404)", () => {
    assert.equal(liveEventId("12"), 12);
    for (const bad of ["0", "-1", "1.5", "012", "1e3", "12a", "", "..", "1".repeat(16), "%31"]) {
        assert.equal(liveEventId(bad), null, bad);
    }
});

test("구매 칸은 방송 중일 때만 연다", () => {
    assert.equal(liveBuyable({status: "LIVE"}), true);
    assert.equal(liveBuyable({status: "SCHEDULED"}), false);
    assert.equal(liveBuyable({status: "ENDED"}), false);
});

test("수량 상한 — 서버 상한과 남은 한정 수량 중 작은 값 · 소진이면 0", () => {
    assert.equal(liveQuantityMax(product({})), BUY_NOW_MAX_QUANTITY);
    assert.equal(liveQuantityMax(product({remaining: 3})), 3);
    assert.equal(liveQuantityMax(product({remaining: 500})), BUY_NOW_MAX_QUANTITY);
    assert.equal(liveQuantityMax(product({remaining: 0, soldOut: true})), 0);
    assert.equal(liveQuantityMax(product({remaining: 5, soldOut: true})), 0);
});

test("순서 — 고정 상품 먼저, 그다음 편성 순서 · 원본은 그대로", () => {
    const input = [
        product({productId: 1, sortOrder: 2}),
        product({productId: 2, sortOrder: 1}),
        product({productId: 3, sortOrder: 9, pinned: true}),
    ];
    assert.deepEqual(
        sortLiveProducts(input).map((p) => p.productId),
        [3, 2, 1],
    );
    assert.deepEqual(
        input.map((p) => p.productId),
        [1, 2, 3],
        "원본 배열을 바꿨다",
    );
});
