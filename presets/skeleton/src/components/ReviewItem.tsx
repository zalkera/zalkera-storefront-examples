import type {Review} from "@zalkera/client";

/**
 * 후기 1건 표시 — **순수 컴포넌트(표시 전용, "use client" 아님)**.
 *
 * RSC(ReviewList)와 클라이언트 아일랜드(ReviewLoadMore) 양쪽에서 임포트해 마크업을 한 곳에 둔다 —
 * 첫 페이지(프리렌더)와 더보기(append)의 후기 카드가 반드시 같은 모양이 되게 한다. SDK 를 직접
 * 호출하지 않고 props 로 받으므로 "use client" 가 아니어도 baseUrl 노출 위험이 없다.
 * 사진은 `/media/{id}` 안정 URL 로(presigned 는 만료되므로 — W4 관례).
 */
export function ReviewItem({review}: {review: Review}) {
    const r = review;
    return (
        <li className="border-b border-border pb-3">
            <div className="text-primary" aria-label={`별점 ${r.rating}점`}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
            </div>
            {r.title && <div className="mt-1 font-semibold">{r.title}</div>}
            <p className="my-1 whitespace-pre-wrap">{r.content}</p>
            {r.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {r.photos.map((id) => (
                        <img
                            key={id}
                            src={`/media/${id}`}
                            alt=""
                            loading="lazy"
                            className="h-24 w-24 rounded-md object-cover"
                        />
                    ))}
                </div>
            )}
            {r.createdAt && (
                <time className="text-xs text-muted">
                    {new Date(r.createdAt).toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul"})}
                </time>
            )}
        </li>
    );
}
