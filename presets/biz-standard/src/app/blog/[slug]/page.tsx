import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {ZalkeraError, mediaSrc, type PostDetail, type PostSummary} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {parseSeo} from "@/lib/seo";
import {siteUrl} from "@/lib/site";
import {JsonLd, blogPostingJsonLd, breadcrumbJsonLd} from "@/components/JsonLd";
import {Markdown} from "@/components/Markdown";
import {RelatedPosts} from "@/components/RelatedPosts";
import {TableOfContents} from "@/components/TableOfContents";
import {ViewBeacon} from "./ViewBeacon";
import type {PostWithByline} from "@/lib/postFields";
import {routeParam} from "@/lib/routeParam";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {formatDate} from "@/lib/datetime";

/**
 * 블로그/공지 상세 (RSC · ISR). 발행글은 세션 무관 읽기라 상품 상세와 같은 사상으로 굽는다:
 * 첫 요청에 렌더한 뒤 `revalidate` 주기로 캐시. `listPosts`·`getPost` 는 0.32.0 부터 [ReadOptions] 를 받지만,
 * **태그는 캐시가 아니고**(왕복을 안 줄인다) 무효화 도달도 빌드마다 다르다(`llms.txt`) — 갱신은
 * **시간 기반 revalidate** 가 진다. generateStaticParams 는 두지 않는다(글이 유동적 → on-demand ISR).
 */
export const dynamic = "force-static";
export const revalidate = 300;

/**
 * generateMetadata 와 페이지가 **같은 인자로** 부르므로 Next request memoization 이 1회로 합친다 —
 * 인자가 갈리면 2회가 된다(상품 상세와 같은 관례). ⚠ 여기서 「인자」는 **URL·헤더**다 — 태그만
 * 갈리는 것은 dedupe 키에 안 들어가 호출 수를 늘리지 않는다(Next 의 fetch dedupe 키는 method·headers·mode·redirect·credentials·referrer·integrity 뿐이고 `next.tags` 는 없다).
 */
async function loadPost(slug: string) {
    const post = await zalkera.getPost(slug);
    // 🔴 **결여는 두 얼굴로 온다.** `@zalkera/client` 0.35.0 부터 2xx 빈 본문·봉투의 `data` 키
    //    부재는 **502 로 던지므로** `.catch` 가 받는다. 그러나 `data: null` 은 그대로 통과하니
    //    **값 판정은 여전히 필요하다**(그 전 판에서는 빈 본문까지 `undefined` 로 흘러 `.catch` 를
    //    안 타고 부르는 쪽에서 `TypeError` 가 됐다).
    //    판정을 여기 한 자리에 둔다 — 부르는 곳마다 두면 한 곳이 빠진다.
    if (post == null) notFound();
    return post;
}

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);
    const post = await loadPost(slug).catch((error) => {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    });
    const seo = parseSeo(post.seo);
    const title = seo.title ?? post.title;
    const description = seo.description ?? post.summary ?? undefined;
    // 상호는 공유 카드에만. layout 과 같은 인자라 fetch 는 1회로 합쳐진다(상품 상세와 같은 관례).
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    return {
        title,
        description,
        ...pageMetadata({
            ogTitle: withSiteName(title, config?.companyName),
            description,
            path: `/blog/${post.slug}`,
            siteName: config?.companyName,
            // 쪽이 **실제로 그리는** 커버. 없으면 필드를 뺀다 — 없는 이미지를 약속하지 않는다.
            image: post.coverAssetId != null ? mediaSrc(post.coverAssetId) : undefined,
        }),
    };
}

/**
 * 같은 카테고리의 다른 글 — **내부 링크**를 만든다(크롤러의 길 · 독자의 다음 행동).
 *
 * 카테고리 목록을 한 번 더 부르는 이유: 상세는 `categoryId` 만 들고 오는데 목록 질의는 **slug** 로
 * 거른다. ISR(5분)이라 이 두 왕복은 캐시가 빈 첫 렌더에서만 난다.
 *
 * ⚠ **실패해도 쪽이 죽지 않는다.** 관련 글은 덤이고, 그것 때문에 본문이 500 이 되면 안 된다.
 */
async function loadRelated(post: PostDetail): Promise<PostSummary[]> {
    if (post.categoryId == null) return [];

    // 🔴 **`.catch` 하나로 안 끝난다.** 0.35.0 부터 빈 본문은 던지므로 `.catch` 가 받지만,
    //    `data: null` 은 통과한다 — 그러면 다음 줄이 던져 이 쪽이 404 도 200 도 아닌 **500** 이
    //    된다. 관련 글은 없어도 되는 칸이므로 결여를 「없음」으로 받는다(`?? []`).
    const categories = (await zalkera.listCategories().catch(() => [])) ?? [];
    const category = categories.find((it) => it.id === post.categoryId)?.slug;
    if (!category) return [];

    // 자기 자신이 섞여 오므로 하나 더 받아서 걸러낸다.
    const page = await zalkera.listPosts({category, size: RELATED_LIMIT + 1}).catch(() => null);
    return (page?.content ?? []).filter((it) => it.slug !== post.slug).slice(0, RELATED_LIMIT);
}

const RELATED_LIMIT = 3;

export default async function BlogPostPage({params}: {params: Promise<{slug: string}>}) {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);

    let post: PostWithByline;
    try {
        post = await loadPost(slug);
    } catch (error) {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    }

    const base = siteUrl();
    const related = await loadRelated(post);
    // `generateMetadata` 와 **같은 인자**라 Next 요청 메모가 1회로 합친다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);

    return (
        <main>
            {/* 검색·AI 발견용 구조화 데이터 — 아래 보이는 내용과만 일치시킨다(저자·가짜 이미지 금지). */}
            <JsonLd data={blogPostingJsonLd(post, base, config)} />
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: "블로그", url: `${base}/blog`},
                    {name: post.title, url: `${base}/blog/${post.slug}`},
                ])}
            />
            <h1>{post.title}</h1>
            {/* 바이라인 — 저자가 없으면 **안 그린다**(그래프는 상호로 강하하지만 화면에 회사명을
                또 적으면 머리글이 두 번 말하는 셈이다). */}
            <p className="text-sm text-muted">
                {post.author ? <span className="mr-2">{post.author}</span> : null}
                {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>}
            </p>
            {/* 커버 이미지 — /media/{id} 안정 URL(W4). next/image 는 바이트를 Next 런타임에 태우므로
                쓰지 않는다. 없으면 아무것도 안 그린다. */}
            {post.coverAssetId != null && (
                <img
                    src={mediaSrc(post.coverAssetId)}
                    alt={post.title}
                    loading="lazy"
                    className="my-4 h-auto max-w-full rounded-lg"
                />
            )}
            {/* 본문 — 저작이 마크다운이므로 **구조로** 그린다(`h2`·`a`·`img`). 평문으로 내면 답변
                엔진이 인용할 청크 경계도, 크롤러가 따라갈 내부 링크도 안 생긴다.
                🔴 원시 HTML 을 만들지 않는다 — 파서가 데이터를 내고 렌더러가 요소를 만든다. */}
            {/* 목차 — 제목이 3개 이상일 때만. 답변 엔진이 인용하는 단위가 «절» 이라 그 목록을
                사람과 기계에 함께 준다. */}
            {post.content && <TableOfContents source={post.content} />}
            {post.content && <Markdown source={post.content} />}
            {/* 태그 — 표시만 한다. 공개 태그 라우트는 만들지 않는다(오너 결정): 태그당 글이 적을 때
                그런 쪽은 얇은 페이지를 대량으로 만들어 답변 엔진에 역효과다. */}
            {(post.tags ?? []).length > 0 && (
                <ul aria-label="태그" className="my-4 flex flex-wrap gap-2">
                    {(post.tags ?? []).map((tag) => (
                        <li key={tag} className="rounded-full border border-border px-3 py-1 text-sm text-muted">
                            {tag}
                        </li>
                    ))}
                </ul>
            )}
            <RelatedPosts posts={related} />
            {/* 조회수 비콘 — RSC 에서 recordPostView 를 직접 부르면 ISR 프리렌더가 조회를 세므로 금지.
                브라우저 아일랜드가 BFF(/api/posts/{slug}/view)를 친다. */}
            <ViewBeacon slug={slug} />
        </main>
    );
}
