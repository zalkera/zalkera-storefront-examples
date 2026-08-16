import type {Paginated, RatingSummary, Review} from "@zalkera/client";
import {ReviewItem} from "./ReviewItem";
import {ReviewLoadMore} from "./ReviewLoadMore";

/**
 * 상품 후기 목록 — **서버 컴포넌트(표시 전용, 아일랜드 아님)**.
 *
 * 후기는 저볼라틸이라(자주 안 바뀜) 첫 페이지를 상품 상세의 ISR(`revalidate=300`)에 그대로 얹는다 —
 * 프리렌더된 HTML 에 후기 텍스트가 실리므로 **JSON-LD 의 `aggregateRating` 과 페이지가 일치**한다
 * (검색엔진에 평점을 광고하면서 페이지엔 후기가 없던 불일치를 닫는다
 *
 * 11건 이상이면 2페이지부터는 볼라틸하지 않아도 프리렌더에 다 실을 필요가 없으므로, 목록 아래
 * `ReviewLoadMore`(클라이언트 아일랜드)가 BFF(/api/reviews)로 당겨 온다. 요약(★평균·개수)은 첫
 * 페이지가 아니라 **전체 기준**(summary) 이라 append 와 무관하게 그대로 둔다.
 *
 * SDK 를 직접 호출하지 않는다(props 로 받는다) — "use client" 가 아니라서 baseUrl 노출 위험이 없다.
 */
export function ReviewList({
    reviewPage,
    summary,
}: {
    reviewPage: Paginated<Review> | null;
    summary: RatingSummary | null;
}) {
    const reviews = reviewPage?.content ?? [];
    // 첫 페이지 조회 실패(null)면 더보기 아일랜드는 미렌더(마지막 페이지로 취급).
    const initialLast = reviewPage?.last ?? true;

    return (
        <section className="mt-8">
            <h2>
                상품 후기
                {reviews.length > 0 && summary && summary.reviewCount > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted">
                        ★ {summary.averageRating.toFixed(1)} · {summary.reviewCount}개
                    </span>
                )}
            </h2>

            {reviews.length === 0 ? (
                <p className="text-muted">아직 후기가 없습니다.</p>
            ) : (
                <>
                    <ul className="mt-4 grid list-none gap-4 p-0">
                        {reviews.map((r) => (
                            <ReviewItem key={r.id} review={r} />
                        ))}
                    </ul>
                    <ReviewLoadMore
                        productId={reviews[0].productId}
                        initialLast={initialLast}
                        initialIds={reviews.map((r) => r.id)}
                    />
                </>
            )}
        </section>
    );
}
