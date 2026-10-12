import type {LiveEvent, LiveEventProduct} from "@zalkera/client";

/**
 * 라이브 방송 쪽(`/live/[id]`)과 그 BFF(`/api/live/[id]`)가 같이 쓰는 판정. 화면 표시용이다 — 살 수 있는지의
 * 최종 판정은 결제 때 서버가 다시 한다(방송 상태·편성·한정 수량).
 */

/** 주소의 회차 id. 양의 정수(15자리 이내)만 받는다 — 아니면 `null`(쪽은 404). */
export function liveEventId(raw: string): number | null {
    return /^[1-9][0-9]{0,14}$/.test(raw) ? Number(raw) : null;
}

/** 구매 칸을 여는가 — 방송 중일 때만. */
export function liveBuyable(live: Pick<LiveEvent, "status">): boolean {
    return live.status === "LIVE";
}

/** 화면 순서 — 진행자가 고정한 상품 먼저, 그다음 편성 순서. 원본 배열은 안 바꾼다. */
export function sortLiveProducts(products: readonly LiveEventProduct[]): LiveEventProduct[] {
    return [...products].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder);
}

/** 바로 구매 한 줄의 최대 수량 — 서버 상한 99 와 남은 한정 수량 중 작은 값. 다 팔렸으면 0. */
export const BUY_NOW_MAX_QUANTITY = 99;
export function liveQuantityMax(product: Pick<LiveEventProduct, "remaining" | "soldOut">): number {
    if (product.soldOut) return 0;
    return product.remaining == null
        ? BUY_NOW_MAX_QUANTITY
        : Math.max(0, Math.min(BUY_NOW_MAX_QUANTITY, product.remaining));
}

/**
 * 스냅샷을 다시 읽어야 하는 결제 거절 — 화면이 들고 있는 방송·수량이 낡았다는 뜻이다. **판매는 리비전을 안 올리므로**
 * 남은 수량·소진은 이렇게 다시 읽어야 따라온다.
 */
const STALE_CODES: ReadonlySet<string> = new Set([
    "LIVE_CAP_EXCEEDED",
    "NOT_LIVE",
    "OUT_OF_STOCK",
    "LIVE_PRODUCT_NOT_FOUND",
]);
export function liveSnapshotStale(code: string | undefined): boolean {
    return code !== undefined && STALE_CODES.has(code);
}

/**
 * BFF(`/api/live/[id]`)가 회차마다 스냅샷을 들고 있는 시간. 이 안의 요청은 백엔드를 다시 안 부른다 — 시청자가 몇
 * 명이든 백엔드 부하가 «서버 하나당 이 시간에 한 번»으로 묶인다. 화면이 거절 뒤 다시 읽을 때도 이만큼 뒤에 한 번 더
 * 읽는다(바로 읽은 값이 이 캐시의 것일 수 있어서다).
 */
export const LIVE_SNAPSHOT_TTL_MS = 5_000;

/**
 * 열린 화면이 스냅샷을 다시 읽는 간격 — 15초 ± 20%. 흩뿌리는 이유: QR 로 한꺼번에 들어온 손님들의 요청이 같은
 * 박자로 몰리지 않게.
 */
export function livePollDelayMs(random: () => number = Math.random): number {
    const base = 15_000;
    return Math.round(base * (0.8 + 0.4 * random()));
}
