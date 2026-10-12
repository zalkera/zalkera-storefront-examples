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
