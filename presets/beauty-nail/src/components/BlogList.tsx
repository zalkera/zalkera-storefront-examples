import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {JsonLd, breadcrumbJsonLd, itemListJsonLd} from "@/components/JsonLd";
import {formatDate} from "@/lib/datetime";
import {BLOG_PAGE_SIZE, blogPagePath, hasNextPage} from "@/lib/blogPaging";

/**
 * 블로그 목록 한 쪽 — `/blog`(1쪽)와 `/blog/page/{n}`(2쪽 이상)이 **함께** 쓴다.
 *
 * 쪽 주소가 왜 쿼리가 아니라 경로 세그먼트인지는 `lib/blogPaging.ts` KDoc 이 근거와 재현 명령을
 * 함께 들고 있다.
 */
/**
 * 그 쪽의 글 — **백엔드가 죽어도 셸은 살아야 한다.** 실패는 삼키고 `null` 로 강하한다.
 *
 * ⚠ 쪽 라우트가 **범위 밖 판정**을 하려면 목록을 먼저 봐야 해서 밖으로 뺐다. 두 번 부르지 않도록
 *   그 결과를 [BlogList] 에 넘긴다.
 */
export async function listBlogPage(page: number) {
    return zalkera
        .listPosts({page: page - 1, size: BLOG_PAGE_SIZE, sort: "publishedAt,desc"})
        .catch(() => null);
}

export async function BlogList({
    page,
    posts: given,
}: {
    page: number;
    posts?: Awaited<ReturnType<typeof listBlogPage>>;
}) {
    const posts = given !== undefined ? given : await listBlogPage(page);
    const items = posts?.content ?? [];
    const base = siteUrl();
    // ⚠ **판정은 여기 없다** — `hasNextPage` 가 진다. 이 **배선**은 `lib/blogListRender.test.ts` 가
    //    실제로 렌더해서 잰다(술어만 재면 `const hasNext = false` 로 고정하는 변이가 통과한다 —
    //    그 변이는 「다음」을 통째로 없애 21번째 글을 다시 도달 불가로 만든다).
    const hasNext = hasNextPage(posts);

    return (
        <main>
            {/* 목록 그래프 — 글이 0건이면 안 낸다(빈 목록을 그래프로 주장할 이유가 없다). */}
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
                            {p.publishedAt && <time className="text-xs text-muted">{formatDate(p.publishedAt)}</time>}
                        </li>
                    ))}
                </ul>
            )}
            {(page > 1 || hasNext) && (
                // ⚠ **`<a>` 다.** 크롤러가 따라가야 2쪽 이후의 글이 발견된다 — 버튼·클라이언트
                //    라우팅으로 바꾸면 그 글들이 색인에서 사라진다.
                <nav aria-label="쪽 이동" className="mt-6 flex justify-between">
                    {page > 1 ? (
                        <a href={blogPagePath(page - 1)} rel="prev">
                            ← 이전
                        </a>
                    ) : (
                        <span />
                    )}
                    {hasNext ? (
                        <a href={blogPagePath(page + 1)} rel="next">
                            다음 →
                        </a>
                    ) : (
                        <span />
                    )}
                </nav>
            )}
        </main>
    );
}
