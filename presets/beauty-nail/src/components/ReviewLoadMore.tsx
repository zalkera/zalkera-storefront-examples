"use client";

import {useState, useTransition} from "react";
import type {Paginated, Review} from "@zalkera/client";
import {ReviewItem} from "./ReviewItem";
import {Button} from "@/components/ui/Button";

/**
 * "후기 더 보기" 클라이언트 아일랜드 — 첫 페이지(ISR RSC) 아래에 붙어 2페이지부터 append 한다.
 *
 * 첫 페이지는 상품 상세의 ISR(revalidate=300)에 실려 프리렌더되고(JSON-LD aggregateRating 일치),
 * 볼라틸하지 않은 나머지 페이지는 이 아일랜드가 BFF(/api/reviews)로 당겨 온다. AddToCart 의
 * useState+useTransition 패턴을 그대로 따른다.
 *
 * **dedupe**: 첫 페이지 HTML 은 ISR 로 최대 5분 낡을 수 있고 정렬은 최신순(id 내림차순)이라, 그새
 * 새 후기가 들어오면 페이지 경계에서 같은 id 가 겹칠 수 있다. append 전에 initialIds + 기존 extra
 * 의 id 로 걸러 중복 렌더·React key 충돌을 막는다.
 */
export function ReviewLoadMore({
    productId,
    initialLast,
    initialIds,
}: {
    productId: number;
    initialLast: boolean;
    initialIds: number[];
}) {
    // 10건 이하(첫 페이지가 곧 마지막)면 더 볼 게 없다 — DOM 에 아무것도 안 그린다.
    const [extra, setExtra] = useState<Review[]>([]);
    const [nextPage, setNextPage] = useState(1); // 첫 페이지가 page 0 이므로 다음은 1.
    const [last, setLast] = useState(initialLast);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    if (initialLast) return null;

    const loadMore = () => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch(`/api/reviews?productId=${productId}&page=${nextPage}`);
            if (!res.ok) {
                setMessage("후기를 더 불러오지 못했습니다.");
                return;
            }
            const data: Paginated<Review> = await res.json();
            // dedupe — 이미 보이는 id(첫 페이지 + 기존 extra)는 버린다.
            const seen = new Set<number>([...initialIds, ...extra.map((r) => r.id)]);
            const fresh = data.content.filter((r) => !seen.has(r.id));
            if (fresh.length > 0) setExtra((prev) => [...prev, ...fresh]);
            setNextPage((p) => p + 1);
            setLast(data.last);
        });
    };

    return (
        <>
            {extra.length > 0 && (
                <ul className="mt-4 grid list-none gap-4 p-0">
                    {extra.map((r) => (
                        <ReviewItem key={r.id} review={r} />
                    ))}
                </ul>
            )}
            {!last && (
                <Button variant="outline" onClick={loadMore} disabled={pending} className="mt-4">
                    {pending ? "불러오는 중…" : "후기 더 보기"}
                </Button>
            )}
            {message && <p className="text-danger">{message}</p>}
        </>
    );
}
