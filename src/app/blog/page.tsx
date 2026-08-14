// 블로그 미사용 테넌트는 app/blog/·api/posts/ 통째로 삭제 가능 — 결합은 sitemap.ts 한 곳.
import type {Metadata} from "next";
import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {JsonLd, breadcrumbJsonLd, itemListJsonLd} from "@/components/JsonLd";

/**
 * 블로그/공지 목록 (RSC · ISR). 발행글은 세션 무관 읽기라 요청마다 SSR 하지 않는다: 첫 요청에
 * 렌더한 뒤 `revalidate` 주기로 캐시한다(상품 상세와 같은 사상). 백엔드 posts 는 태그 무효화가
 * 없어(SDK listPosts 는 ReadOptions 를 안 받는다) **시간 기반 revalidate 만** 건다.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export const metadata: Metadata = {title: "블로그"};

export default async function BlogPage() {
    // 백엔드가 죽어도 셸은 살아야 한다 — 실패는 삼키고 빈 목록으로 강하한다.
    const posts = await zalkera.listPosts({size: 20, sort: "publishedAt,desc"}).catch(() => null);
    const items = posts?.content ?? [];
    const base = siteUrl();

    return (
        <main>
            {/* 목록 그래프 — 상품 목록과 같은 구멍이었다(라우트는 있는데 그래프가 없다). 글이 0건이면
                내지 않는다: 빈 목록을 그래프로 주장할 이유가 없다. */}
            {items.length > 0 && (
                <JsonLd data={itemListJsonLd(items.map((p) => ({name: p.title, url: `${base}/blog/${p.slug}`})))} />
            )}
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: "블로그", url: `${base}/blog`},
                ])}
            />
            <h1>블로그</h1>
            {items.length === 0 ? (
                <p className="text-muted">게시글이 없습니다.</p>
            ) : (
                <ul className="grid list-none gap-4 p-0">
                    {items.map((p) => (
                        <li key={p.id} className="border-b border-border pb-3">
                            <a href={`/blog/${p.slug}`} className="text-lg font-semibold">
                                {p.title}
                            </a>
                            {p.summary && <p className="my-1 text-muted">{p.summary}</p>}
                            {p.publishedAt && (
                                <time className="text-xs text-muted">
                                    {new Date(p.publishedAt).toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul"})}
                                </time>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
