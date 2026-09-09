// 블로그 미사용 테넌트는 app/blog/·api/posts/ 통째로 삭제 가능 — 결합은 sitemap.ts 한 곳.
import type {Metadata} from "next";
import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {parseSeo} from "@/lib/seo";
import {JsonLd, breadcrumbJsonLd, itemListJsonLd} from "@/components/JsonLd";
import {formatDate} from "@/lib/datetime";
import {pageParam} from "@/lib/routeParam";

/**
 * 블로그/공지 목록 (RSC · ISR). 발행글은 세션 무관 읽기라 요청마다 SSR 하지 않는다: 첫 요청에
 * 렌더한 뒤 `revalidate` 주기로 캐시한다(상품 상세와 같은 사상).
 *
 * ⚠ `listPosts` 는 0.32.0 부터 [ReadOptions] 를 받는다 — 태그를 달 수 있다. 다만 **태그는 캐시가
 * 아니고**(왕복을 안 줄인다) 무효화 도달도 빌드마다 다르다(`llms.txt` 의 「ISR 캐시 태그」 절).
 * 그래서 이 쪽의 갱신은 **시간 기반 `revalidate` 가 지고**, 태그는 그 위의 최선 노력이다.
 */
/**
 * ⚠ **`force-static` 이 아니다** — 이 쪽은 `?page=N` 을 읽으므로 Next 가 **동적 렌더로 강등**한다
 *   (`force-static` 이면 `searchParams` 가 빈 객체라 페이지네이션이 아예 안 선다).
 *   형제 `products/page.tsx` 는 그 대가를 안 사려고 `searchParams` 를 **일부러 안 받는다** —
 *   여기만 다른 이유는 글이 시간순으로 **무한히 쌓이는** 축이라 20건 상한이 곧 「그 뒤는 사이트에서
 *   사라진다」가 되기 때문이다(카탈로그는 그렇게까지 안 자란다).
 *
 * 그 대가는 **크롤러 방문마다 서버 렌더**다. `revalidate` 는 남겨 두었지만 동적 렌더에서는
 * 전 라우트 캐시가 아니라 **fetch 층**만 덮는다 — 백엔드 왕복은 그만큼 줄고 렌더는 매번 돈다.
 */
export const revalidate = 300;

const TITLE = "블로그";

/** 한 쪽에 그리는 글 수. */
const PAGE_SIZE = 20;

/**
 * ⚠ **정적 `metadata` 가 아니라 `generateMetadata` 다** — 상호(`site_config`)가 서버에서 와야
 * 공유 카드에 상호를 넣고 canonical 을 낼 수 있다(형제 목록 쪽들과 같은 형태).
 */
export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
    const page = pageParam((await searchParams).page);
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    // ⚠ **이 쪽의 설명을 지어내지 않는다.** 쪽의 `description` 은 layout 의 것을 **라우트 단위로
    //    이긴다** — 여기 한 문장을 박으면 전 테넌트의 `/blog` 가 자기 사이트 설명 대신 그것을
    //    단다. `blog` 는 예약 세그먼트라 테넌트가 자기 페이지로 덮을 길도 없다.
    //    사이트 기본 설명을 그대로 잇는다(없으면 없는 채로 — 이 레포의 「지어내지 않는다」 규칙).
    const seo = parseSeo(config?.seoDefaults);
    // ⚠ **canonical 은 자기 자신을 가리킨다.** 2쪽 이상을 1쪽으로 접으면 그 쪽의 글들이 색인에서
    //    사라진다 — 목록은 크롤러가 상세로 가는 **내부 링크 허브**이므로 접으면 발견 경로가 끊긴다.
    return {
        title: page > 1 ? `${TITLE} (${page}쪽)` : TITLE,
        ...pageMetadata({
            ogTitle: withSiteName(TITLE, config?.companyName),
            description: seo.description,
            path: page > 1 ? `/blog?page=${page}` : "/blog",
            siteName: config?.companyName,
        }),
    };
}

export default async function BlogPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const page = pageParam((await searchParams).page);
    // 백엔드가 죽어도 셸은 살아야 한다 — 실패는 삼키고 빈 목록으로 강하한다.
    const posts = await zalkera
        .listPosts({page: page - 1, size: PAGE_SIZE, sort: "publishedAt,desc"})
        .catch(() => null);
    const items = posts?.content ?? [];
    const base = siteUrl();
    // ⚠ **백엔드가 죽었을 때 「다음 쪽」을 그리지 않는다** — `posts` 가 null 이면 마지막 쪽 여부를
    //    모른다. 모를 때는 안 그리는 쪽이 옳다(없는 쪽으로 크롤러를 보내지 않는다).
    const hasPrev = page > 1;
    const hasNext = posts !== null && posts.last === false;

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
                            {p.publishedAt && <time className="text-xs text-muted">{formatDate(p.publishedAt)}</time>}
                        </li>
                    ))}
                </ul>
            )}
            {(hasPrev || hasNext) && (
                // ⚠ **`<a>` 다.** 크롤러가 따라가야 2쪽 이후의 글이 발견된다 — 버튼·클라이언트
                //    라우팅으로 바꾸면 그 글들이 색인에서 사라진다.
                <nav aria-label="쪽 이동" className="mt-6 flex justify-between">
                    {hasPrev ? (
                        <a href={page === 2 ? "/blog" : `/blog?page=${page - 1}`} rel="prev">
                            ← 이전
                        </a>
                    ) : (
                        <span />
                    )}
                    {hasNext ? (
                        <a href={`/blog?page=${page + 1}`} rel="next">
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
