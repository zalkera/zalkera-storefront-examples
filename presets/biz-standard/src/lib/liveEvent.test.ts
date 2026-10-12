import {strict as assert} from "node:assert";
import {test} from "node:test";
import type {LiveEventProduct} from "@zalkera/client";
import {
    BUY_NOW_MAX_QUANTITY,
    LIVE_SNAPSHOT_TTL_MS,
    liveBuyable,
    liveEventId,
    livePollDelayMs,
    liveQuantityMax,
    liveSnapshotStale,
    sortLiveProducts,
} from "./liveEvent.ts";
import {createSnapshotCache} from "./liveSnapshotCache.ts";

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

test("다시 읽을 거절 — 방송·수량이 낡았다는 코드만", () => {
    for (const code of ["LIVE_CAP_EXCEEDED", "NOT_LIVE", "OUT_OF_STOCK", "LIVE_PRODUCT_NOT_FOUND"]) {
        assert.equal(liveSnapshotStale(code), true, code);
    }
    // 양성 짝 — 방송과 무관한 거절에 스냅샷을 다시 읽으면 백엔드만 두드린다.
    for (const code of [
        undefined,
        "IDEMPOTENCY_CONFLICT",
        "NOT_PAYABLE",
        "INVALID_INPUT_VALUE",
        "UPSTREAM_UNAVAILABLE",
    ]) {
        assert.equal(liveSnapshotStale(code), false, String(code));
    }
});

test("다시 읽는 간격 — 15초 ± 20% 안에서 흩뿌린다", () => {
    assert.equal(
        livePollDelayMs(() => 0),
        12_000,
    );
    assert.equal(
        livePollDelayMs(() => 0.5),
        15_000,
    );
    assert.equal(
        livePollDelayMs(() => 1),
        18_000,
    );
    const seen = new Set(Array.from({length: 50}, () => livePollDelayMs()));
    assert.ok(seen.size > 1, "흩뿌림이 없다 — 손님들이 같은 박자로 몰린다");
    for (const d of seen) assert.ok(d >= 12_000 && d <= 18_000, String(d));
});

/** 시계를 손으로 돌리는 캐시 + 부른 횟수를 세는 적재기. */
function harness(fail = false) {
    let clock = 1_000_000;
    let calls = 0;
    const cache = createSnapshotCache(
        async (id: number) => {
            calls += 1;
            await new Promise((r) => setTimeout(r, 5));
            if (fail) throw new Error(`down ${id}`);
            return {id, calls};
        },
        {ttlMs: LIVE_SNAPSHOT_TTL_MS, maxEntries: 3, now: () => clock},
    );
    return {cache, calls: () => calls, tick: (ms: number) => (clock += ms)};
}

test("스냅샷 캐시 — 창 안의 동시·연이은 요청은 백엔드를 한 번만 부른다", async () => {
    const h = harness();
    const first = await Promise.all(Array.from({length: 20}, () => h.cache.get(12)));
    assert.equal(h.calls(), 1, "동시에 몰린 20건이 백엔드를 여러 번 불렀다");
    assert.ok(first.every((v) => v.calls === 1));
    h.tick(LIVE_SNAPSHOT_TTL_MS - 1);
    await h.cache.get(12);
    assert.equal(h.calls(), 1, "창 안의 다음 요청이 다시 불렀다");
    // 양성 짝 — 창이 지나면 새로 읽는다(안 읽으면 남은 수량이 영영 안 따라온다).
    h.tick(1);
    assert.equal((await h.cache.get(12)).calls, 2);
    assert.equal(h.calls(), 2);
});

test("스냅샷 캐시 — 회차마다 따로 든다", async () => {
    const h = harness();
    await Promise.all([h.cache.get(12), h.cache.get(13), h.cache.get(12)]);
    assert.equal(h.calls(), 2);
});

test("스냅샷 캐시 — 실패도 창 동안 들고 있다(아픈 백엔드를 시청자 수만큼 두드리지 않는다)", async () => {
    const h = harness(true);
    for (let i = 0; i < 5; i += 1) await assert.rejects(h.cache.get(12), /down 12/);
    assert.equal(h.calls(), 1);
    h.tick(LIVE_SNAPSHOT_TTL_MS);
    await assert.rejects(h.cache.get(12));
    assert.equal(h.calls(), 2);
});

test("스냅샷 캐시 — 항목 수 상한을 넘으면 오래된 것부터 버린다", async () => {
    const h = harness();
    for (const id of [1, 2, 3, 4]) await h.cache.get(id);
    assert.equal(h.calls(), 4);
    await h.cache.get(4);
    assert.equal(h.calls(), 4, "가장 최근 것을 버렸다");
    await h.cache.get(1);
    assert.equal(h.calls(), 5, "상한을 넘었는데 가장 오래된 것을 들고 있다 — 메모리가 회차 수만큼 는다");
});
