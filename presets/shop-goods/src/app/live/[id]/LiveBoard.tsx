"use client";

import {useEffect, useRef, useState} from "react";
import type {LiveEvent, LiveEventProduct} from "@zalkera/client";
import {Card} from "@/components/ui/Card";
import {buttonClasses} from "@/components/ui/Button";
import {formatDateTime} from "@/lib/datetime";
import {liveBuyable, liveQuantityMax, sortLiveProducts} from "@/lib/liveEvent";
import {externalHref} from "@/lib/safeUrl";
import {BuyNowForm} from "./BuyNowForm";

/** 리비전을 묻는 간격. 방송 상태가 바뀐 뒤 이 화면이 따라오는 데 걸리는 시간의 상한이다. */
const POLL_MS = 15_000;

const STATUS_LABEL: Record<LiveEvent["status"], string> = {
    SCHEDULED: "방송 예정",
    LIVE: "방송 중",
    ENDED: "방송 종료",
};

/**
 * 방송 한 회차 — 제목·영상 링크·편성 상품과 상품마다 「바로 구매」.
 *
 * 열려 있는 동안 리비전을 묻고(`/api/live/{id}/revision`), 바뀌면 스냅샷을 다시 받는다(`/api/live/{id}`) — 방송이
 * 예정 → 방송 중으로 바뀌면 새로고침 없이 구매 칸이 열린다. 탭이 가려져 있으면 묻지 않는다.
 */
export function LiveBoard({initial}: {initial: LiveEvent}) {
    const [live, setLive] = useState(initial);
    const revision = useRef(initial.revision);

    useEffect(() => {
        let stopped = false;
        const poll = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const r = await fetch(`/api/live/${initial.id}/revision`, {cache: "no-store"});
                if (!r.ok) return;
                const {revision: next} = (await r.json()) as {revision?: number};
                if (typeof next !== "number" || next === revision.current) return;
                const s = await fetch(`/api/live/${initial.id}`, {cache: "no-store"});
                if (!s.ok) return;
                const snapshot = (await s.json()) as LiveEvent;
                if (stopped) return;
                revision.current = snapshot.revision;
                setLive(snapshot);
            } catch {
                // 한 번 못 물으면 다음 차례에 다시 묻는다 — 화면은 들고 있는 값을 그대로 보인다.
            }
        };
        const timer = setInterval(poll, POLL_MS);
        document.addEventListener("visibilitychange", poll);
        return () => {
            stopped = true;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", poll);
        };
    }, [initial.id]);

    const buyable = liveBuyable(live);
    const watch = externalHref(live.status === "ENDED" ? live.vodUrl : live.streamUrl);
    const products = sortLiveProducts(live.products);

    return (
        <div className="grid gap-6">
            <header className="grid gap-2">
                <p>
                    <span
                        className={
                            buyable
                                ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                                : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
                        }
                    >
                        {STATUS_LABEL[live.status]}
                    </span>
                </p>
                <h1>{live.title}</h1>
                {live.startsAt && live.status === "SCHEDULED" && (
                    <p className="text-sm text-muted">시작 {formatDateTime(live.startsAt)}</p>
                )}
                {watch && (
                    <p>
                        <a className={buttonClasses("outline")} href={watch} target="_blank" rel="noopener noreferrer">
                            {live.status === "ENDED" ? "다시 보기" : "방송 보러 가기"}
                        </a>
                    </p>
                )}
                {!buyable && (
                    <p className="rounded-lg bg-surface p-3 text-sm text-muted" role="status">
                        {live.status === "SCHEDULED"
                            ? "방송이 시작되면 이 화면에서 바로 구매할 수 있습니다."
                            : "방송이 끝나 구매가 닫혔습니다."}
                    </p>
                )}
            </header>

            {products.length > 0 && (
                <ul className="grid gap-4 p-0">
                    {products.map((product) => (
                        <li key={product.productId} className="list-none">
                            <LiveProductCard liveId={live.id} product={product} buyable={buyable} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function LiveProductCard({liveId, product, buyable}: {liveId: number; product: LiveEventProduct; buyable: boolean}) {
    const prices = product.variants.map((v) => v.effectivePrice);
    const bases = product.variants.map((v) => v.basePrice);
    const from = Math.min(...prices);
    const baseFrom = Math.min(...bases);
    const max = liveQuantityMax(product);

    return (
        <Card className="grid gap-3">
            <div className="grid gap-1">
                <h2>
                    {product.pinned && <span className="mr-2 text-xs font-semibold text-primary">지금 소개 중</span>}
                    {product.productName}
                </h2>
                <p className="text-sm">
                    {product.livePrice != null && baseFrom > from && (
                        <s className="mr-2 text-muted">{baseFrom.toLocaleString()}원</s>
                    )}
                    <strong>
                        {from.toLocaleString()}원{prices.some((p) => p !== from) ? "부터" : ""}
                    </strong>
                    {product.livePrice != null && <span className="ml-2 text-xs text-primary">방송 특가</span>}
                </p>
                {product.soldOut ? (
                    <p className="text-sm text-danger">한정 수량이 모두 팔렸습니다.</p>
                ) : (
                    product.remaining != null && <p className="text-sm text-muted">남은 수량 {product.remaining}개</p>
                )}
            </div>
            {buyable && max > 0 && <BuyNowForm liveId={liveId} product={product} maxQuantity={max} />}
        </Card>
    );
}
