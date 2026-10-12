"use client";

import {useRef, useState, useTransition} from "react";
import type {LiveEventProduct} from "@zalkera/client";
import {Button} from "@/components/ui/Button";
import {BuyerFields, EMPTY_BUYER, buyerCheckout, type BuyerForm} from "@/components/BuyerFields";
import {CHECKOUT_ATTEMPT_HEADER, attemptSurvives, newCheckoutAttempt} from "@/lib/checkoutAttempt";
import {liveSnapshotStale} from "@/lib/liveEvent";
import {goToPayment} from "@/lib/paymentStart";

/**
 * 방송 상품 하나의 **바로 구매** — 옵션·수량·구매자 칸 → `/api/checkout/direct` → 결제창.
 *
 * 카트를 안 쓴다 — 방송 QR 로 들어온 손님마다 이 폼 한 번이 주문 하나다. 결제 시작은 장바구니 결제와 같다
 * (`goToPayment` — 위젯 유무로만 가르고, 떠나기 전에 연락처를 이 탭에 남긴다).
 *
 * **시도 id** 를 제출마다 헤더로 보낸다(`@/lib/checkoutAttempt`). 같은 폼의 재시도는 같은 값이라 문이 같은
 * 멱등키를 만들어 원주문을 돌려받고, 결제창으로 떠나면 새 값을 만든다 — 뒤로 와서 같은 내용으로 한 번 더 사면 새
 * 주문이다. 결제 시작이 409 `NOT_PAYABLE`(그 주문이 만료·취소돼 더 결제할 수 없다)로 오면 시도 id 를 버린다 — 다음
 * 누름이 새 주문이다. 그 밖의 실패(연결 끊김·시간 초과 등)는 시도 id 를 그대로 둬 같은 주문으로 이어 간다.
 *
 * 결제가 방송·수량 사유(409 `LIVE_CAP_EXCEEDED`·`NOT_LIVE`·`OUT_OF_STOCK`·404 `LIVE_PRODUCT_NOT_FOUND`)로 거절되면
 * `onStale` 로 방송 스냅샷을 다시 읽게 한다 — 판매는 리비전을 안 올리므로 화면의 남은 수량은 그렇게 따라온다.
 * 다 팔렸으면 카드가 이 폼을 닫고 소진을 보인다. 방송 편성 상품은 무통장이 안 되므로 결제수단 선택지를 두지 않는다.
 */
export function BuyNowForm({
    liveId,
    product,
    maxQuantity,
    onStale,
}: {
    liveId: number;
    product: LiveEventProduct;
    maxQuantity: number;
    onStale: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [variantId, setVariantId] = useState(product.variants[0]?.variantId);
    const [quantity, setQuantity] = useState(1);
    const [buyer, setBuyer] = useState<BuyerForm>(EMPTY_BUYER);
    const [error, setError] = useState("");
    const [pending, startTransition] = useTransition();
    const attempt = useRef<string | null>(null);

    const variant = product.variants.find((v) => v.variantId === variantId);
    const qty = Math.min(Math.max(1, quantity), maxQuantity);

    if (!open) {
        return (
            <Button className="sm:justify-self-start" onClick={() => setOpen(true)} disabled={variant === undefined}>
                바로 구매
            </Button>
        );
    }

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (variant === undefined) return;
        setError("");
        attempt.current ??= newCheckoutAttempt();
        const attemptId = attempt.current;
        startTransition(async () => {
            const res = await fetch("/api/checkout/direct", {
                method: "POST",
                headers: {"Content-Type": "application/json", [CHECKOUT_ATTEMPT_HEADER]: attemptId},
                body: JSON.stringify({
                    items: [{variantId: variant.variantId, quantity: qty}],
                    sourceLiveEventId: liveId,
                    checkout: buyerCheckout(buyer),
                }),
            }).catch(() => null);
            const data = res ? await res.json().catch(() => ({})) : {};
            if (!res || !res.ok) {
                const code = typeof data.code === "string" ? data.code : undefined;
                if (liveSnapshotStale(code)) onStale();
                if (!attemptSurvives(code)) {
                    attempt.current = null;
                    setError("주문이 만료돼 결제할 수 없습니다. 다시 누르면 새 주문으로 진행합니다.");
                    return;
                }
                setError(data.message ?? "주문하지 못했습니다. 잠시 후 다시 눌러 주세요.");
                return;
            }
            // 무통장 — 결제창이 없다. 방송 상품에서는 서버가 막지만, 같은 문을 쓰는 다른 화면을 위해 갈래를 둔다.
            if (data.paymentMethod === "BANK_TRANSFER") {
                attempt.current = null;
                window.location.href = `/orders/${encodeURIComponent(data.orderNo)}`;
                return;
            }
            if (!goToPayment(data, buyer.buyerPhone)) {
                // 시도 id 를 그대로 둔다 — 다시 누르면 같은 주문으로 결제창을 연다.
                setError("결제창을 열지 못했습니다. 다시 눌러 주세요 — 같은 주문으로 이어 갑니다.");
                return;
            }
            attempt.current = null;
        });
    };

    return (
        <form onSubmit={submit} className="grid max-w-md gap-3" aria-label={`${product.productName} 바로 구매`}>
            {product.variants.length > 1 && (
                <select aria-label="옵션" value={variantId} onChange={(e) => setVariantId(Number(e.target.value))}>
                    {product.variants.map((v) => (
                        <option key={v.variantId} value={v.variantId}>
                            {(v.optionLabel ?? "기본") + " — " + v.effectivePrice.toLocaleString() + "원"}
                        </option>
                    ))}
                </select>
            )}
            <label className="grid gap-1 text-sm">
                수량
                <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                />
            </label>
            <BuyerFields value={buyer} onChange={setBuyer} />
            {variant && (
                <p className="text-sm">
                    합계 <strong>{(variant.effectivePrice * qty).toLocaleString()}원</strong>
                    <span className="ml-1 text-xs text-muted">(배송비는 결제 때 더해질 수 있습니다)</span>
                </p>
            )}
            <Button type="submit" disabled={pending || variant === undefined}>
                {pending ? "처리 중…" : "결제하기"}
            </Button>
            {error && (
                <p className="text-sm text-danger" role="alert">
                    {error}
                </p>
            )}
        </form>
    );
}
