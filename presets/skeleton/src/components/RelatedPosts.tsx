import Link from "next/link";
import type {PostSummary} from "@zalkera/client";
import {formatDate} from "@/lib/datetime";

/**
 * 관련 글 — 같은 카테고리의 다른 글.
 *
 * ■ 왜 그리나
 *   · **내부 링크**가 크롤러의 길이다. 상세가 서로를 안 가리키면 글은 목록 한 쪽에서만 닿는 잎이 된다.
 *   · 사람에게는 「이 주제의 다른 글」이 다음 행동이다.
 *
 * 없으면 아무것도 안 그린다 — 「관련 글이 없습니다」는 알려 줄 값이 없는 문장이다.
 */
export function RelatedPosts({posts}: {posts: PostSummary[]}) {
    if (posts.length === 0) return null;

    return (
        <section aria-labelledby="related-posts" className="mt-10 border-t border-border pt-6">
            <h2 id="related-posts" className="mb-3 text-lg font-semibold">
                관련 글
            </h2>
            <ul className="space-y-2">
                {posts.map((post) => (
                    <li key={post.slug}>
                        <Link href={`/blog/${post.slug}`} className="hover:underline">
                            {post.title}
                        </Link>
                        {post.publishedAt && (
                            <time className="ml-2 text-sm text-muted" dateTime={post.publishedAt}>
                                {formatDate(post.publishedAt)}
                            </time>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
