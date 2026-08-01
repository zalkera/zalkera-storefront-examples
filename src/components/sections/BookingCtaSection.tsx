import Link from "next/link";
import type {ProductSummary} from "@zalkera/client";
import {buttonClasses} from "@/components/ui/Button";
import {asHandle, asString, readConfig} from "@zalkera/client";

type BookingCtaConfig = Record<string, unknown>;

/**
 * 예약 유도 버튼.
 *
 * 참조 방식이 둘이고 **계약이 둘 다 선언**한다(rev 5 — `productId` · `categorySlug`).
 *
 *  - **명시 참조**(큐레이션) → 그 **상품 상세**로 보낸다. 거기서 슬롯을 고른다.
 *  - **갈래 참조**(동적) → 그 **카테고리 페이지**(`/c/{slug}`)로 보낸다.
 *
 * ⚠ **갈래에서 "첫 상품"을 골라 상세로 보내지 않는다.** 어느 시술이 예약 버튼을 받을지는
 * 머천다이징 결정이고 그것은 레인 B(운영)의 몫이다 — 껍데기가 정하면 memo138 §6-1 위반이다.
 * 갈래를 가리켰으면 갈래를 보여 주고, 고르는 것은 방문자가 한다.
 *
 * 어느 쪽이든 **보낼 곳이 비어 있으면 안 그린다**: 상품이 사라졌거나 갈래에 상품이 0건이면
 * 아무 데도 못 보내는 버튼이 되고, 빈 선반으로 보내는 버튼은 방문자에게 거짓이다.
 */
export function BookingCtaSection({
    config,
    products,
    categoryProducts,
}: {
    config: unknown;
    products: Map<string, ProductSummary>;
    categoryProducts: Map<string, ProductSummary[]>;
}) {
    const c = readConfig<BookingCtaConfig>(config);
    const label = asString(c?.label)?.trim() || "예약하기";

    // 명시 참조가 우선이다 — 큐레이션이 있으면 그것이 원장이고, 없을 때 갈래가 대신한다
    // (`ServiceMenuSection` 과 같은 우선순위 — 두 섹션이 다르게 굴면 제작자가 헷갈린다).
    const handle = asHandle(c?.product);
    const product = handle != null ? products.get(handle) : undefined;
    if (product) {
        return (
            <section className="mb-12 text-center">
                <Link href={`/products/${product.slug}`} className={buttonClasses("primary", "no-underline")}>
                    {label}
                </Link>
            </section>
        );
    }

    const categorySlug = asString(c?.categorySlug);
    // 상품 조회는 `SectionList` 가 SERVICE_MENU 용으로 이미 걷어 둔 맵을 재사용한다 — 추가 fetch 0.
    if (categorySlug && (categoryProducts.get(categorySlug)?.length ?? 0) > 0) {
        return (
            <section className="mb-12 text-center">
                <Link href={`/c/${categorySlug}`} className={buttonClasses("primary", "no-underline")}>
                    {label}
                </Link>
            </section>
        );
    }

    return null;
}
