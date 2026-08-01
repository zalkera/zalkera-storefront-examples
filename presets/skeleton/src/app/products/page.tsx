import type {Metadata} from "next";
import Link from "next/link";
import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {JsonLd, breadcrumbJsonLd, itemListJsonLd} from "@/components/JsonLd";

/**
 * 상품 목록 (RSC · ISR).
 *
 * **왜 이 라우트가 있는가**: 상세(`/products/[slug]`)만 있으면 "이 가게가 무엇을 파는가"를 기계도 사람도
 * 한 번에 못 받는다 — 상세를 하나씩 발견해야 한다. 목록은 카탈로그 전체를 한 노드(`ItemList`)로 묶어
 * 주는 자리이고, 크롤러에게는 상세로 가는 내부 링크 허브다.
 *
 * 카탈로그는 세션 무관 읽기라 요청마다 SSR 하지 않는다: 첫 요청에 렌더한 뒤 `revalidate` 주기로
 * 캐시한다(상품 상세와 같은 사상). **`searchParams` 를 받지 않는 것이 의도**다 — 정렬·필터를 쿼리로
 * 받는 순간 이 라우트가 동적 렌더로 강등돼 크롤러가 매번 서버 렌더를 유발한다.
 *
 * 그 대가로 **v1 은 페이지네이션이 없다**: 첫 [PAGE_SIZE] 종만 그린다. 카탈로그가 그보다 크면 나머지는
 * 이 화면에서 안 보이지만 `sitemap.xml` 이 전량을 싣고 상세는 그대로 열린다(발견 경로는 끊기지 않는다).
 * 더 필요하면 `/products/page/[n]` 같은 **정적 세그먼트**로 늘려라 — 쿼리로 늘리지 마라.
 */
export const dynamic = "force-static";
export const revalidate = 300;

/** 한 화면에 그리는 상품 수. 늘리려면 정적 세그먼트 페이지네이션으로(위 KDoc). */
const PAGE_SIZE = 24;

export async function generateMetadata(): Promise<Metadata> {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const title = "상품";
    return {
        title,
        ...pageMetadata({
            ogTitle: withSiteName(title, config?.companyName),
            path: "/products",
            siteName: config?.companyName,
        }),
    };
}

export default async function ProductsPage() {
    // 백엔드가 죽어도 셸은 살아야 한다 — 실패는 삼키고 빈 목록으로 강하한다(블로그 목록과 같은 판단).
    const page = await zalkera
        .listProducts({size: PAGE_SIZE}, {tags: ["site-config", "products"]})
        .catch(() => null);
    // 카테고리 내비 — 없으면 그냥 안 그린다. **이게 없으면 `/c/{slug}` 는 sitemap 에만 있고 사람이
    // 도달할 길이 없는 라우트가 된다**(크롤러도 링크 추적으로는 못 만난다).
    const categories = await zalkera.listProductCategories({tags: ["site-config", "products"]}).catch(() => null);
    const items = page?.content ?? [];
    const base = siteUrl();

    return (
        <main className="py-8">
            {/* 목록의 구조화 데이터 — 화면에 그리는 바로 그 순서·그 상품들이다. 0건이면 빈 ItemList 를
                내지 않는다(팔 것이 없다는 진술을 그래프로 하지 않는다). */}
            {items.length > 0 && (
                <JsonLd
                    data={itemListJsonLd(
                        items.map((p) => ({name: p.name, url: `${base}/products/${p.slug}`})),
                    )}
                />
            )}
            <JsonLd data={breadcrumbJsonLd([{name: "홈", url: base}, {name: "상품", url: `${base}/products`}])} />

            <h1>상품</h1>
            {categories != null && categories.length > 0 && (
                <nav aria-label="카테고리" className="mb-4 flex flex-wrap gap-2">
                    {categories.map((c) => (
                        <Link
                            key={c.id}
                            href={`/c/${c.slug}`}
                            className="rounded-full border border-border px-3 py-1 text-sm text-inherit no-underline"
                        >
                            {c.name}
                        </Link>
                    ))}
                </nav>
            )}
            {items.length === 0 ? (
                <p className="text-muted">등록된 상품이 없습니다.</p>
            ) : (
                <ul className="grid list-none gap-4 p-0 m-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                    {items.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border bg-background p-4">
                            <Link href={`/products/${p.slug}`} className="text-inherit no-underline">
                                {/* 커버 이미지 — /media/{id} 안정 URL(presigned 금지: 만료되면 깨진 이미지가 박제된다).
                                    없으면 아무것도 안 그린다 — 플레이스홀더를 강제하지 않는다. */}
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
