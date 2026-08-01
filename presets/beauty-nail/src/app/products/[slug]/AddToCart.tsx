"use client";

import {useState, useTransition} from "react";
import type {ProductDetail} from "@zalkera/client";

/**
 * 변형(variant) 선택 + 장바구니 담기. **variant 가 판매 단위** — 단순 상품도 variant 1개다.
 * 담기는 BFF route handler(/api/cart/items)로 POST 한다 — 토큰·세션키는 서버가 쿠키에서 붙인다.
 */
export function AddToCart({product}: {product: ProductDetail}) {
    const purchasable = product.variants.filter((v) => v.inStock);
    const [variantId, setVariantId] = useState(purchasable[0]?.id ?? product.variants[0]?.id);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const add = () => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch("/api/cart/items", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({variantId, quantity: 1}),
            });
            setMessage(res.ok ? "장바구니에 담았습니다." : "담기에 실패했습니다.");
        });
    };

    return (
        <div>
            <select value={variantId} onChange={(e) => setVariantId(Number(e.target.value))}>
                {product.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={!v.inStock}>
                        {(v.optionSignature || "기본") + " — " + v.price.toLocaleString() + "원"}
                        {v.inStock ? "" : " (품절)"}
                    </option>
                ))}
            </select>{" "}
            <button type="button" onClick={add} disabled={pending || variantId == null}>
                {pending ? "담는 중…" : "장바구니 담기"}
            </button>
            {message && <p>{message}</p>}
        </div>
    );
}
