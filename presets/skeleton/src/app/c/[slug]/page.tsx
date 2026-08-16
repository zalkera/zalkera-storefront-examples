import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import type {ProductCategory} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {JsonLd, breadcrumbJsonLd, collectionPageJsonLd} from "@/components/JsonLd";
import {routeParam} from "@/lib/routeParam";

/**
 * 상품 카테고리 (RSC · ISR).
 *
 * **왜 이 라우트가 있는가**: 쇼핑몰의 최소 보장 표면 셋(카테고리·상품 목록·상품 상세) 중 마지막
 * 하나다. 목록(`/products`)은 "무엇을 파는가"를 한 노드로 주지만, "이 가게의 가방은 무엇이 있나"
 * 처럼 **좁힌 질문**에 답할 자리가 없었다. 답변 엔진이 인용하는 단위가 그 좁힌 목록이다.
 *
 * **경로를 발명하지 않았다** — `@zalkera/client` 의 `llms.txt` §4.1 레시피가 카테고리 링크를
 * `/c/{slug}` 로 이미 그리고 있었다. 레시피가 가리키는 자리에 실물을 세운 것이다.
 *
 * 카탈로그는 세션 무관 읽기라 요청마다 SSR 하지 않는다(`/products` 와 같은 사상). `searchParams` 를
 * 받지 않는 것도 같은 이유다 — 정렬·필터를 쿼리로 받는 순간 동적 렌더로 강등된다. v1 은 그 대가로
 * 페이지네이션이 없다: 첫 [PAGE_SIZE] 종만 그리고, 나머지는 sitemap 과 상세 라우트가 받는다.
 *
 * `generateStaticParams` 를 두지 않는다 — 카테고리는 콘솔에서 계속 생기므로 빌드 시점 목록으로
 * 굳히면 새 카테고리가 다음 빌드까지 404 다. 온디맨드 ISR 로 둔다(`/products/[slug]` 와 같다).
 */
export const dynamic = "force-static";
export const revalidate = 300;

/** 한 화면에 그리는 상품 수. 늘리려면 정적 세그먼트 페이지네이션으로(`/products` KDoc). */
const PAGE_SIZE = 24;

/**
 * slug 로 카테고리를 찾는다. 카테고리는 테넌트당 수십 건이라 전량 조회가 정본 경로다(백엔드에
 * slug 단건 공개 API 가 없는 이유이기도 하다). 목록을 못 받으면 **404 가 아니라 throw** 다 —
 * 백엔드 장애를 "그런 카테고리 없음"으로 바꿔 말하면 크롤러가 그 오답을 캐시한다.
 */
async function findCategory(slug: string): Promise<ProductCategory> {
    const categories = await zalkera.listProductCategories({tags: ["site-config", "products"]});
    const category = categories.find((c) => c.slug === slug);
    if (!category) notFound();
    return category;
}

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);
    const category = await findCategory(slug);
    // 상호는 공유 카드에만. layout 과 같은 인자라 fetch 는 1회로 합쳐진다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    return {
        title: category.name,
        ...pageMetadata({
            ogTitle: withSiteName(category.name, config?.companyName),
            path: `/c/${category.slug}`,
            siteName: config?.companyName,
        }),
    };
}

export default async function ProductCategoryPage({params}: {params: Promise<{slug: string}>}) {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);
    const category = await findCategory(slug);

    // 카테고리는 찾았는데 상품 조회가 실패하면 셸은 살린다 — 빈 카테고리와 같은 화면이 된다.
    // (카테고리 자체를 못 찾은 것과 달리 여기서는 페이지가 있다는 사실이 이미 참이다.)
    const page = await zalkera
        .listProducts({categoryId: category.id, size: PAGE_SIZE}, {tags: ["site-config", "products"]})
        .catch(() => null);
    const items = page?.content ?? [];
    const base = siteUrl();
    const listed = items.map((p) => ({name: p.name, url: `${base}/products/${p.slug}`}));

    return (
        <main className="py-8">
            {/* 이 페이지의 주어가 곧 이 목록이다 — CollectionPage 가 ItemList 를 품는다(JsonLd.tsx). */}
            <JsonLd data={collectionPageJsonLd(category, listed, base)} />
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: "상품", url: `${base}/products`},
                    {name: category.name, url: `${base}/c/${category.slug}`},
                ])}
            />

            <h1>{category.name}</h1>
            {items.length === 0 ? (
                <p className="text-muted">이 카테고리에 등록된 상품이 없습니다.</p>
            ) : (
                <ul className="grid list-none gap-4 p-0 m-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                    {items.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border bg-background p-4">
                            <Link href={`/products/${p.slug}`} className="text-inherit no-underline">
                                {/* 커버 이미지 — /media/{id} 안정 URL(presigned 금지). 없으면 아무것도 안 그린다. */}
                                {p.coverAssetId != null && (
                                    <img
                                        src={`/media/${p.coverAssetId}`}
                                        alt={p.name}
                                        loading="lazy"
                                        className="w-full aspect-[4/3] object-cover rounded mb-2"
                                    />
                                )}
                                <div className="font-semibold">{p.name}</div>
                                {p.priceFrom != null && (
                                    <div className="mt-1 text-primary">
                                        {Number(p.priceFrom).toLocaleString("ko-KR")}원~
                                    </div>
                                )}
                                {/* 품절은 숨기지 않고 적는다 — 헛걸음을 만드는 침묵보다 낫다. */}
                                {!p.inStock && <div className="mt-1 text-sm text-muted">품절</div>}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
