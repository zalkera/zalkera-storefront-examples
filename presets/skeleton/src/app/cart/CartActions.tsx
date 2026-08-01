"use client";

import {useRouter} from "next/navigation";
import {useTransition} from "react";

/** 카트 라인 삭제(+ 새로고침). 수량 변경도 같은 패턴으로 확장할 수 있다. */
export function CartActions({variantId}: {variantId: number}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const remove = () => {
        startTransition(async () => {
            await fetch(`/api/cart/items/${variantId}`, {method: "DELETE"});
            router.refresh();
        });
    };

    return (
        <button type="button" onClick={remove} disabled={pending}>
            {pending ? "…" : "삭제"}
        </button>
    );
}
