"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {LiveEvent, LiveEventProduct} from "@zalkera/client";
import {Card} from "@/components/ui/Card";
import {buttonClasses} from "@/components/ui/Button";
import {formatDateTime} from "@/lib/datetime";
import {LIVE_SNAPSHOT_TTL_MS, liveBuyable, livePollDelayMs, liveQuantityMax, sortLiveProducts} from "@/lib/liveEvent";
import {externalHref} from "@/lib/safeUrl";
import {BuyNowForm} from "./BuyNowForm";

/**
 * 시작 시각 서식 — 24시간 숫자로만 쓴다. 이 화면은 서버에서 한 번 그리고 브라우저가 이어받는데, 「오후」 같은 낱말은
 * 실행기의 로캘 자료에 따라 「PM」 으로 나와 두 결과가 갈린다(하이드레이션 불일치). 숫자만 쓰면 둘이 같다.
 */
const START_FORMAT: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
};

const STATUS_LABEL: Record<LiveEvent["status"], string> = {
    SCHEDULED: "방송 예정",
    LIVE: "방송 중",
    ENDED: "방송 종료",
};

/**
 * 방송 한 회차 — 제목·영상 링크·편성 상품과 상품마다 「바로 구매」.
 *
 * 열려 있는 동안 **스냅샷을 다시 읽는다**(`/api/live/{id}` · 15초 ± 20% · 처음 붙을 때 한 번 · 탭이 다시 보이면 바로 ·
 * 가려져 있으면 쉰다). 리비전만 묻지 않는 이유: 리비전은 운영자가 바꾼 것(편성·특가·상태)만 따라오고 **판매로 줄어드는
 * 남은 수량·소진은 안 따라온다** — 리비전만 보면 다 팔린 뒤에도 구매 칸이 열려 있다가 결제에서 409 를 만난다. 스냅샷에
 * 리비전이 들어 있으므로 따로 묻는 왕복은 더하는 것이 없다. 백엔드 부하는 BFF 의 회차별 몇 초 공유 사본이 묶는다.
 *
 * 결제가 방송·수량 사유로 거절되면 폼이 [refresh] 를 부른다 — 바로 한 번, BFF 사본이 바뀔 즈음 한 번 더 읽는다.
 */
export function LiveBoard({initial}: {initial: LiveEvent}) {
    const [live, setLive] = useState(initial);
    const inFlight = useRef(false);
    const stopped = useRef(false);

    const read = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const res = await fetch(`/api/live/${initial.id}`, {cache: "no-store"});
            if (!res.ok || stopped.current) return;
            setLive((await res.json()) as LiveEvent);
        } catch {
            // 한 번 못 읽으면 다음 차례에 다시 읽는다 — 화면은 들고 있는 값을 그대로 보인다.
        } finally {
            inFlight.current = false;
        }
    }, [initial.id]);

    /** 결제 거절 뒤 — 지금 한 번, BFF 사본이 바뀔 즈음 한 번 더(지금 읽은 값이 그 사본일 수 있다). */
    const refresh = useCallback(() => {
        void read();
        setTimeout(() => void read(), LIVE_SNAPSHOT_TTL_MS + 500);
    }, [read]);

    useEffect(() => {
        stopped.current = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => {
            timer = setTimeout(async () => {
                if (document.visibilityState === "visible") await read();
                if (!stopped.current) schedule();
            }, livePollDelayMs());
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") void read();
        };
        void read(); // 구운 쪽은 몇 초 낡았을 수 있다 — 붙자마자 한 번 읽는다.
        schedule();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            stopped.current = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [read]);

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
                    <p className="text-sm text-muted">시작 {formatDateTime(live.startsAt, START_FORMAT)}</p>
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
                            <LiveProductCard liveId={live.id} product={product} buyable={buyable} onStale={refresh} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function LiveProductCard({
    liveId,
    product,
    buyable,
    onStale,
}: {
    liveId: number;
    product: LiveEventProduct;
    buyable: boolean;
    onStale: () => void;
}) {
    const prices = product.variants.map((v) => v.effectivePrice);
    const bases = product.variants.map((v) => v.basePrice);
    const from = Math.min(...prices);
    const baseFrom = Math.min(...bases);
    const max = liveQuantityMax(product);

    return (
        <Card className="grid gap-3">
            <div className="grid gap-1">
                <h2>
                    {/* 「소개 중」은 방송 중에만 참이다 — 끝난 방송에서 고정 표식이 남아도 지금 소개하는 것은 없다 */}
                    {product.pinned && buyable && (
                        <span className="mr-2 text-xs font-semibold text-primary">지금 소개 중</span>
                    )}
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
            {buyable && max > 0 && <BuyNowForm liveId={liveId} product={product} maxQuantity={max} onStale={onStale} />}
        </Card>
    );
}
