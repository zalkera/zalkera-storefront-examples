import type {ContentSection} from "@/lib/content";
import type {ProductSummary} from "@zalkera/client";
import {asHandle, asHandleArray, asString, readConfig} from "@zalkera/client";
import {SectionRenderer, needsProducts} from "./SectionRenderer";
import {zalkera} from "@/lib/zalkera";

/**
 * 섹션 배열을 그린다 — 상품 해소·렌더 디스패치를 한 자리에 모은다.
 *
 * 섹션 페이지 입구가 둘이라(고정 페이지 `[slug]`, 홈 `/`) 이 로직이 두 벌이 되면 한쪽만 고치는
 * 드리프트가 난다 — 이 레포가 memo102 §6 에서 내내 싸우는 병이라 여기서도 사본을 안 만든다.
 *
 * ## 왜 목록을 긁어 맵을 만들지 않는가 (두 번 데인 자리다)
 *
 * 초판은 `listProducts({productType: "SERVICE", size: 100})` 로 목록을 긁어 handle 맵을 만들었다.
 * 그러면 **재화를 파는 사이트에서 상품 섹션이 통째로 사라진다**(SERVICE 가 0건이라 맵이 빈다).
 * 필터만 뺐더니 이번엔 **예약 사이트가 상품 100종을 넘기는 순간 사라졌다** — 목록 정렬이
 * `created DESC` 라 오래된 시드 상품이 1페이지 밖으로 밀려나기 때문이다(둘 다 실측 재현).
 *
 * 근본 원인은 규모가 아니라 **형태**였다. 껍데기(소스)는 업무 데이터를 소유하지 않고 **가리키기만**
 * 하는데, "상위 100건을 긁어 그중에서 찾는다"는 소유하는 쪽의 사고다. 그래서 조회 축을 뒤집는다 —
 * **참조가 조회를 만든다.**
 *
 *  - `products`/`product` (handle 참조) → 그 handle 만 **직접 조회**한다. 카탈로그가 몇 종이든 무관하다.
 *  - `categorySlug` (동적 참조) → 그 카테고리를 **서버에 물어** 오는 대로 그린다.
 *
 * 후자가 이 제품의 전제와 직결된다: **외양은 어디서든 구해 업로드한다**(우리 예제든 남이 만든 것이든).
 * 그렇다면 껍데기가 특정 상품 handle 에 얼어붙으면 안 된다 — 받은 사람 카탈로그에 그 handle 이 없기
 * 때문이다. 카테고리로 가리키면 자기 상품을 등록하는 대로 저절로 채워진다.
 *
 * 실패는 섹션 단위로 격리한다 — 한 참조가 죽어도 페이지는 살고 그 카드만 빠진다.
 */
export async function SectionList({sections}: {sections: ContentSection[]}) {
    const {byHandle, byCategory} = needsProducts(sections)
        ? await resolveProducts(sections)
        : {byHandle: new Map<string, ProductSummary>(), byCategory: new Map<string, ProductSummary[]>()};

    return sections.map((section, i) => (
        <SectionRenderer key={i} section={section} products={byHandle} categoryProducts={byCategory} />
    ));
}

/** 상품 참조 섹션이 config 에 적어 둔 handle·categorySlug 를 걷는다. */
function collectRefs(sections: ContentSection[]) {
    const handles = new Set<string>();
    const categories = new Set<string>();
    for (const s of sections) {
        if (s.type !== "SERVICE_MENU" && s.type !== "BOOKING_CTA") continue;
        const c = readConfig<Record<string, unknown>>(s.config);
        for (const h of asHandleArray(c?.products)) handles.add(h);
        const one = asHandle(c?.product);
        if (one != null) handles.add(one);
        const cat = asString(c?.categorySlug);
        if (cat) categories.add(cat);
    }
    return {handles, categories};
}

async function resolveProducts(sections: ContentSection[]) {
    const {handles, categories} = collectRefs(sections);

    // handle 참조 — 참조 수만큼만 부른다.
    //
    // ⚠ **"계약이 참조 수를 캡한다"고 적었다가 심의가 정정했다** — 그 캡(상품 20)은 **팩/시드 경로에만**
    //    참이고, 업로드된 자유 소스에는 파서에도 어휘 계약에도 길이 상한이 없다. 즉 이 팬아웃의 상한은
    //    계약이 아니라 **그 사이트 저자의 선택**이다. 자해 수준이라(자기 사이트 재검증이 느려질 뿐)
    //    가드를 두지 않지만, 없는 보증을 주석에 적어 두지는 않는다.
    const byHandle = new Map<string, ProductSummary>();
    await Promise.all(
        [...handles].map(async (handle) => {
            const detail = await zalkera.getProduct(handle, {tags: ["products"]}).catch(() => null);
            if (detail) byHandle.set(handle, toSummary(detail));
        }),
    );

    // categorySlug 참조 — 서버가 주는 대로. slug→id 해소가 필요해 카테고리 목록을 한 번 부른다.
    const byCategory = new Map<string, ProductSummary[]>();
    if (categories.size > 0) {
        // ⚠ `listCategories()` 가 아니라 `listProductCategories()` 다 — 전자는 **게시판 카테고리**이고
        //    상품 카테고리는 후자다(`/public/categories` vs `/public/product-categories`). 이름이 비슷해
        //    한 번 잘못 잡았고, 게시판이 비어 있으면 조용히 아무것도 안 그려져 증상이 "섹션 소멸"로 같다.
        const all = await zalkera.listProductCategories({tags: ["products"]}).catch(() => null);
        await Promise.all(
            [...categories].map(async (slug) => {
                const category = all?.find((c) => c.slug === slug);
                if (!category) return; // 없는 카테고리 = 그 섹션만 안 그린다(페이지는 산다)
                const page = await zalkera
                    .listProducts({categoryId: category.id, size: CATEGORY_PAGE_SIZE}, {tags: ["products"]})
                    .catch(() => null);
                if (page) byCategory.set(slug, page.content);
            }),
        );
    }

    return {byHandle, byCategory};
}

/**
 * 한 화면에 그리는 카테고리 상품 수 상한. 섹션은 **진열**이지 목록 라우트가 아니라 페이지네이션이
 * 없다 — 전량을 그리면 카탈로그가 큰 테넌트에서 홈이 무거워진다. 전체 목록의 정위치는 `/products` 다.
 */
const CATEGORY_PAGE_SIZE = 24;

/**
 * `getProduct` 는 상세형(`ProductDetail`)이라 카드가 쓰는 `priceFrom`·`inStock` 이 없다 — variant 에서
 * 만든다. 가격의 정본은 variant 이므로 여기서 **최솟값**을 취하는 것이 상세 화면과 같은 규칙이다.
 */
function toSummary(detail: Awaited<ReturnType<typeof zalkera.getProduct>>): ProductSummary {
    const prices = detail.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
    return {
        id: detail.id,
        slug: detail.slug,
        name: detail.name,
        productType: detail.productType,
        coverAssetId: detail.coverAssetId,
        priceFrom: prices.length > 0 ? Math.min(...prices) : null,
        currency: detail.variants[0]?.currency ?? "KRW",
        inStock: detail.variants.some((v) => v.inStock),
    };
}
