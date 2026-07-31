import Link from "next/link";
import type {ProductSummary} from "@zalkera/client";
import {JsonLd, itemListJsonLd} from "@/components/JsonLd";
import {siteUrl} from "@/lib/site";
import {asHandleArray, mediaSrc, readConfig} from "@zalkera/client";

/** 필드를 믿지 않는다 — raw 편집기가 문법만 보고 통과시킨 값이 올 수 있다. */
type ServiceMenuConfig = Record<string, unknown>;

/**
 * 시술 메뉴 — 고른 상품을 순서대로.
 *
 * **이 섹션은 `ItemList` 를 직접 산출한다**(계약 `jsonLd: "ItemList"`·contractRev 2). 어휘 12종 중
 * 그래프를 내는 둘째 섹션이고, 이유는 FAQ_LIST↔FAQPage 와 같다: 목록의 정본이 페이지의 이 배열이라
 * 다른 곳에서 다시 만들면 두 벌이 되고 갈라진다.
 *
 * **왜 별도 라우트가 아닌가**: 쇼핑몰 유형은 `/products` 목록 라우트가 보장 표면이지만, 예약(뷰티 등)
 * 사이트에서 시술 목록의 정위치는 **홈의 이 섹션**이다. 라우트를 강제하면 디자인 자유를 깎으면서 얻는
 * 것이 없어, 예약 유형의 목록 보장은 이 산출로 충족한다.
 */
export function ServiceMenuSection({
    config,
    products,
}: {
    config: unknown;
    products: Map<string, ProductSummary>;
}) {
    const c = readConfig<ServiceMenuConfig>(config);
    // config 의 handle 순서를 지킨다 — **이 배열이 노출 순서의 원장**이고, 아래 ItemList 도 같은 배열에서
    // 만든다. 사라진 상품(카탈로그에서 지운 handle)은 카드만 빠진다.
    const items = asHandleArray(c?.products)
        .map((handle) => products.get(handle))
        .filter((p): p is ProductSummary => p != null);
    if (items.length === 0) return null;

    const base = siteUrl();

    return (
        <section className="mb-12">
            {/* 화면에 그리는 바로 그 카드들·그 순서 — 아래 목록과 같은 배열에서 만든다. */}
            <JsonLd data={itemListJsonLd(items.map((p) => ({name: p.name, url: `${base}/products/${p.slug}`})))} />
            <ul className="grid list-none gap-3 p-0 m-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                {items.map((p) => (
                    <li key={p.id} className="rounded-xl border border-border bg-background p-4">
                        <Link href={`/products/${p.slug}`} className="text-inherit no-underline">
                            {p.coverAssetId != null && (
                                <img
                                    src={mediaSrc(p.coverAssetId)}
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
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
