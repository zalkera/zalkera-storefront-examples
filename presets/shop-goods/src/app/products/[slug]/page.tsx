import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {ZalkeraError} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {parseSeo} from "@/lib/seo";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {siteUrl} from "@/lib/site";
import {JsonLd, breadcrumbJsonLd, merchantReturnPolicyJsonLd, parsePolicies, productJsonLd} from "@/components/JsonLd";
import {AddToCart} from "./AddToCart";
import {ReviewList} from "@/components/ReviewList";
import {BookingPanel} from "./BookingPanel";
import {routeParam} from "@/lib/routeParam";

/**
 * 상품 상세 (RSC · ISR). ACTIVE 상품만 공개된다 — 없으면 404. 상품 카탈로그는 세션 무관 읽기라
 * 요청마다 SSR 하지 않는다: 첫 요청에 렌더한 뒤 `revalidate` 주기로 캐시한다(SKILL.md "서버 동적 렌더 최소화").
 * 재고·가격은 결제 시점에 백엔드가 원자적으로 재검증하므로 이 주기의 stale 은 안전하다.
 * (generateStaticParams 를 두면 특정 slug 를 빌드 프리렌더할 수도 있으나, 카탈로그가 유동적이라 on-demand ISR 로 둔다.)
 */
export const dynamic = "force-static";
export const revalidate = 300;

/**
 * ISR 캐시 태그 — site-config(테마·레이아웃, 전 페이지)·products(카탈로그).
 *
 * ⚠ **`product:{slug}` 로 이 상세만 콕 집어 무효화되는 일은 없다.** 백엔드가 그 태그를 **일부러
 *   안 붙인다** — 오퍼레이션 페이로드의 상품 참조가 고객이 말로 지시한 모호 참조라 slug 와 일치한다는
 *   보장이 없기 때문이다(`@zalkera/client` 의 `llms.txt` §「캐시 태그」). 상품 페이지도 `products` 로
 *   받는다. 아래에서 이 태그를 함께 다는 것은 **미래 대비이자 무해**일 뿐이니, 「상품별 즉시 무효화」
 *   위에 설계를 얹지 마라.
 *
 * generateMetadata 와 페이지가 **같은 인자로** 부르므로 Next request memoization 이 1회로 합친다 —
 * 인자가 갈리면 2회가 될 수 있다 — 다만 **태그가 갈리는 것만으로는 안 그렇다**(Next 의 fetch dedupe 키에 `next.tags` 가 없다).
 */
function loadProduct(slug: string) {
    return zalkera.getProduct(slug, {tags: ["site-config", "products", `product:${slug}`]});
}

/**
 * 상품 제목 — sitemap 에 등재되는 라우트인데(sitemap.ts) 이게 없으면 루트 layout 의 제목을 상속해
 * **모든 상품 상세가 상호 하나로** 검색·탭에 잡힌다. 상품명이 제목에 없으면 검색 유입의 절반은 없는 셈.
 *
 * layout 의 `title.template`(`%s | 상호`)을 타므로 여기선 상품명만 주면 "상품명 | 상호" 가 된다.
 */
export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);
    // 404 면 notFound() 로 빠져 메타데이터를 낼 일이 없다(페이지도 같은 판정을 한다).
    const product = await loadProduct(slug).catch((error) => {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    });
    const seo = parseSeo(product.seo);
    const title = seo.title ?? product.name;
    // 상품 설명이 길 수 있으나 자르지 않는다 — 검색엔진이 알아서 자른다. 없으면 생략.
    const description = seo.description ?? product.description ?? undefined;
    // 상호는 공유 카드에만. layout 과 같은 인자라 fetch 는 1회로 합쳐진다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    return {
        title,
        description,
        ...pageMetadata({
            ogTitle: withSiteName(title, config?.companyName),
            description,
            path: `/products/${product.slug}`,
            siteName: config?.companyName,
            // 페이지가 실제로 그리는 그 이미지(안정 URL). 없으면 필드를 뺀다 — 없는 이미지를 약속하지 않는다.
            image: product.coverAssetId != null ? `/media/${product.coverAssetId}` : undefined,
        }),
    };
}

export default async function ProductPage({params}: {params: Promise<{slug: string}>}) {
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);

    let product;
    try {
        product = await loadProduct(slug);
    } catch (error) {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    }

    // 평점 요약 — product 의 비정규화 집계라 값싸다. 후기 도메인이 비어 있어도 페이지는 살아야 하므로
    // 실패는 삼키고 aggregateRating 없이 렌더한다(JSON-LD 는 후기 0건이면 그 필드를 아예 뺀다).
    const rating = await zalkera.getProductReviewSummary(product.id).catch(() => null);
    // 후기 첫 페이지 — 저볼라틸이라 이 페이지의 ISR 에 그대로 얹는다(JSON-LD aggregateRating 과 본문 일치).
    // 2페이지부터는 ReviewLoadMore 아일랜드가 BFF 로 당긴다.
    const reviewPage = await zalkera.listProductReviews(product.id, {size: 10}).catch(() => null);
    // 환불 정책 — Offer 에 실어 리치결과에 "N일 이내 반품·배송비" 가 노출되게 한다.
    // 정책은 부가 정보라 실패해도 상품 페이지는 산다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const returnPolicy = config ? merchantReturnPolicyJsonLd(config, parsePolicies(config.commercePolicies)) : null;
    const base = siteUrl();

    return (
        <main className="py-8">
            {/* 검색·AI 발견용 구조화 데이터 — 아래 보이는 내용과 반드시 일치시킨다. */}
            <JsonLd data={productJsonLd(product, rating, base, returnPolicy)} />
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: product.name, url: `${base}/products/${product.slug}`},
                ])}
            />
            <h1>{product.name}</h1>
            {/* 커버 이미지 — /media/{id} 안정 URL(W4). next/image 는 바이트를 Next 런타임에 태우므로
                쓰지 않는다(밀도 비용). 없으면 아무것도 안 그린다 — 플레이스홀더 강제 없음. */}
            {product.coverAssetId != null && (
                <img
                    src={`/media/${product.coverAssetId}`}
                    alt={product.name}
                    loading="lazy"
                    className="max-w-full h-auto rounded-lg my-4"
                />
            )}
            {product.description && <p className="whitespace-pre-wrap">{product.description}</p>}
            {/* 예약(SERVICE)은 카트를 타지 않는다(혼합주문 금지) — 담기 대신 슬롯 선택이다.
                BookingPanel 은 클라이언트 아일랜드라 이 페이지의 ISR 정적성을 깨지 않는다. */}
            {product.productType === "SERVICE" ? <BookingPanel product={product} /> : <AddToCart product={product} />}
            <ReviewList reviewPage={reviewPage} summary={rating} />
        </main>
    );
}
