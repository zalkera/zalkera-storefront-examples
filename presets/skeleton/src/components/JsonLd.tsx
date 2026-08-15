import type {PostDetail, ProductDetail, RatingSummary, SiteConfig} from "@zalkera/client";

/**
 * schema.org JSON-LD 삽입 — 검색·AI 발견 경로의 입장권(memo 50 W1).
 *
 * **왜 필요한가**: 구글 리치결과(가격·재고·평점 노출)는 확립된 가치이고, AI 발견(ChatGPT·Gemini 등)은
 * 그 위에 공짜로 얹힌다. 네이버는 자체 에이전트를 돌리며 외부 AI 크롤러를 막으므로(memo 50 §9-3),
 * 독립 브랜드 사이트가 발견될 수 있는 경로는 네이버 밖이고 그 입장권이 이것이다.
 *
 * **AI 가 이 파일을 고칠 때 지킬 것**:
 *  - JSON-LD 는 **페이지에 실제로 보이는 내용만** 서술한다. 없는 이미지·가짜 평점을 넣으면 구조화
 *    데이터 정책 위반(리치결과 박탈)이다.
 *  - 서버 컴포넌트로 유지한다("use client" 금지) — 이 값들은 전부 ISR 로 프리렌더된다.
 */
export function JsonLd({data}: {data: object}) {
    return (
        <script
            type="application/ld+json"
            // `<` 를 유니코드 이스케이프 — 데이터에 `</script>` 가 섞여도 스크립트가 조기 종료되지
            // 않는다(JSON-LD 삽입의 고전적 XSS 벡터). JSON.stringify 는 이걸 해주지 않는다.
            dangerouslySetInnerHTML={{__html: JSON.stringify(data).replace(/</g, "\\u003c")}}
        />
    );
}

/**
 * 상품 상세용 Product + Offer(+ AggregateRating).
 *
 * **variant 마다 Offer 를 하나씩** 낸다 — 우리는 항상 variant 단위로 판다(memo 03 A.1). 옵션 없는
 * 상품도 default variant 1개라 분기가 없다.
 *
 * **image 는 `/media/{id}` 안정 URL 로 낸다**(W4). presigned URL(`getMediaUrl`)을 여기 넣으면 수 분 뒤
 * 만료돼 크롤러가 캐시한 링크가 죽는다 — 절대 쓰지 마라. `coverAssetId` 가 없으면 필드를 생략한다
 * (페이지도 이미지를 안 그리므로 "보이는 것만 서술" 정합). image 는 구글 merchant listing 필수 필드다.
 */
export function productJsonLd(
    product: ProductDetail,
    rating?: RatingSummary | null,
    siteBase?: string,
    /** 있으면 각 Offer 에 환불 정책을 붙인다([merchantReturnPolicyJsonLd] 산출물). 없으면 생략. */
    returnPolicy?: object | null,
) {
    const url = `${siteBase ?? ""}/products/${product.slug}`;

    const offers = product.variants.map((v) => ({
        "@type": "Offer",
        url,
        price: v.price,
        priceCurrency: v.currency,
        availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        ...(v.sku ? {sku: v.sku} : {}),
        // optionSignature 는 단순 상품에서 빈 문자열 — 그때는 이름을 붙이지 않는다.
        ...(v.optionSignature ? {name: v.optionSignature} : {}),
        ...(returnPolicy ? {hasMerchantReturnPolicy: returnPolicy} : {}),
    }));

    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        url,
        // 페이지가 그리는 바로 그 이미지 — 안정 URL(/media/{id}). 없으면 필드 자체를 뺀다.
        ...(product.coverAssetId != null ? {image: [`${siteBase ?? ""}/media/${product.coverAssetId}`]} : {}),
        ...(product.description ? {description: product.description} : {}),
        ...(offers.length > 0 ? {offers} : {}),
        // 후기가 0건이면 aggregateRating 자체를 뺀다 — ratingValue: 0 은 "0점짜리 상품"이라는
        // 거짓 진술이고, 구글은 후기 없는 aggregateRating 을 구조화 데이터 위반으로 본다.
        ...(rating && rating.reviewCount > 0
            ? {
                  aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: rating.averageRating,
                      reviewCount: rating.reviewCount,
                  },
              }
            : {}),
    };
}

/**
 * 업종 → schema.org 타입. 서버가 **실제 업태를 명시 입력받아** 주는 값만 좁힌다
 * (테마 선택에서 유도한 값이 아니다 — 디자인은 업태 진술이 아니므로).
 * 모르는 값·미설정은 `Organization` 으로 흘려보낸다 — 거짓 진술보다 덜 구체적인 진술이 낫다.
 */
function schemaTypeOf(businessType: SiteConfig["businessType"]): string {
    return businessType === "BEAUTY" ? "BeautySalon" : "Organization";
}

/**
 * 사이트 주체(회사) — 홈에 1회.
 *
 * 타입은 `config.businessType` 으로 자동 판별한다(BEAUTY→`BeautySalon`, 미설정→`Organization`).
 * `type` 인자로 덮어쓸 수 있으나 **실제로 그 업태일 때만** 좁혀라 — 온라인 전용 몰에 LocalBusiness 를
 * 붙이면 거짓 진술이다(주소·영업시간을 요구하는 타입).
 */
export function organizationJsonLd(config: SiteConfig, siteBase: string, type?: string) {
    return {
        "@context": "https://schema.org",
        "@type": type ?? schemaTypeOf(config.businessType),
        name: config.companyName,
        url: siteBase,
        ...(config.tel ? {telephone: config.tel} : {}),
        ...(config.email ? {email: config.email} : {}),
        ...(config.address
            ? {address: {"@type": "PostalAddress", streetAddress: config.address, addressCountry: "KR"}}
            : {}),
    };
}

/**
 * 테넌트가 채운 커머스 정책(스키마리스 JSON)의 **읽기 전용 뷰**. 파싱 실패·미설정이면 빈 객체 —
 * 정책은 부가 정보라 여기서 페이지를 죽이지 않는다.
 *
 * 서버가 스키마를 못박지 않는 자리라(문구가 테넌트·업태마다 다르다) 소비 쪽에서 방어적으로 읽는다.
 */
export type CommercePolicies = {
    returns?: {windowDays?: number; notes?: string};
    exchange?: {notes?: string};
    shipping?: {notes?: string};
    as?: {notes?: string};
};

/**
 * 정책 JSON 을 읽는다 — **절대 throw 하지 않고, 선언한 타입이 참이 되도록 필드까지 좁힌다.**
 *
 * 최상위 한 겹만 보면 부족하다. `JSON.parse("null")` 이 `null` 을 돌려주는 것도 문제지만,
 * 통과시킨 뒤 `as CommercePolicies` 로 캐스트하면 **필드 타입에 대해 계속 거짓말**을 한다:
 * `{"returns":{"notes":{"ko":"…","en":"…"}}}` 처럼 다국어 객체를 넣으면(스키마리스 패스스루에서
 * 가장 흔한 확장 모양이다) `policies/page.tsx` 가 그 값을 React 자식으로 그려
 * "Objects are not valid as a React child" 로 `/policies` 가 500 이 된다.
 *
 * 그래서 `src/lib/seo.ts` 의 `parseSeo` 와 **같은 깊이로** — 객체 판정 + 필드별 `typeof` 확인까지 한다.
 * 값이 형에 안 맞으면 그 필드만 버린다(절 전체를 버리지 않는다). 정책은 부가 정보라
 * 여기서 페이지를 죽이지 않는 것이 계약이다.
 */
function asPlainObject(value: unknown): Record<string, unknown> | null {
    // 배열·null 도 typeof "object" 를 통과한다.
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** 문자열이 아니면 버린다 — 객체·배열이 React 자식으로 새어 나가는 것을 막는 자리다. */
function asNotes(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/** `merchantReturnDays` 는 음수·소수·NaN 이 의미가 없다(구글도 정수를 요구한다). */
function asWindowDays(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** `notes` 하나만 갖는 절(교환·배송·A/S). 남는 필드가 없으면 절 자체를 내지 않는다. */
function notesSection(value: unknown): {notes?: string} | undefined {
    const obj = asPlainObject(value);
    const notes = obj ? asNotes(obj.notes) : undefined;
    return notes === undefined ? undefined : {notes};
}

export function parsePolicies(raw: string | null): CommercePolicies {
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    const root = asPlainObject(parsed);
    if (!root) return {};

    const returnsObj = asPlainObject(root.returns);
    const windowDays = returnsObj ? asWindowDays(returnsObj.windowDays) : undefined;
    const returnNotes = returnsObj ? asNotes(returnsObj.notes) : undefined;

    return {
        returns: windowDays === undefined && returnNotes === undefined ? undefined : {windowDays, notes: returnNotes},
        exchange: notesSection(root.exchange),
        shipping: notesSection(root.shipping),
        as: notesSection(root.as),
    };
}

/**
 * 환불 정책(`MerchantReturnPolicy`) — 상품 Offer 에 붙는다. 구글이 리치결과에 "무료 반품·N일 이내"를
 * 노출하는 입력이고, AI 에이전트가 "이 가게 환불 되나"를 읽는 자리다.
 *
 * **금액은 `config.defaultReturnShippingFee`(운영 값) 를 쓴다** — 정책 JSON 의 문구가 아니라.
 * 실제 환불에서 차감되는 값과 표시가 갈리면 그게 표시 의무 위반이다.
 *
 * 기간(`windowDays`)이 없으면 **정책 전체를 내지 않는다** — 반품 창구를 모르는 채 "반품 됨"만
 * 주장하는 건 구조화 데이터로서 무의미하고, 구글도 merchantReturnDays 를 요구한다.
 */
export function merchantReturnPolicyJsonLd(config: SiteConfig, policies: CommercePolicies) {
    const days = policies.returns?.windowDays;
    if (days == null) return null;
    const fee = config.defaultReturnShippingFee;
    return {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "KR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: days,
        returnMethod: "https://schema.org/ReturnByMail",
        // 반품비 0원이면 무료 반품 — 그 사실 자체가 리치결과에 노출된다.
        ...(fee != null && fee > 0
            ? {
                  returnFees: "https://schema.org/ReturnShippingFees",
                  returnShippingFeesAmount: {
                      "@type": "MonetaryAmount",
                      value: fee,
                      currency: "KRW",
                  },
              }
            : {returnFees: "https://schema.org/FreeReturn"}),
    };
}

/**
 * 블로그/공지 상세용 `BlogPosting`.
 *
 * **페이지에 실제로 보이는 것만 서술한다**(상품 JSON-LD 와 같은 규율): 없는 값은 필드 자체를 뺀다.
 *  - `author` 는 넣지 않는다 — PostDetail 에 저자가 없고 페이지에도 안 보인다. 지어내면 구조화
 *    데이터 위반이다.
 *  - `image` 는 `coverAssetId` 가 있을 때만 `/media/{id}` 안정 URL 로(presigned 금지 — W4).
 *  - `datePublished`·`description` 도 값이 있을 때만.
 */
export function blogPostingJsonLd(post: PostDetail, siteBase: string) {
    const url = `${siteBase}/blog/${post.slug}`;
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        url,
        ...(post.publishedAt ? {datePublished: post.publishedAt} : {}),
        ...(post.summary ? {description: post.summary} : {}),
        ...(post.coverAssetId != null ? {image: [`${siteBase}/media/${post.coverAssetId}`]} : {}),
    };
}

/**
 * 고정 페이지(CMS)용 `WebPage`.
 *
 * **왜 필요한가**: 홈은 `Organization`, 상품은 `Product`, 글은 `BlogPosting` 을 내는데 콘솔·시드가 만든
 * 서브페이지(회사소개·이용안내 등)만 그래프가 비어 있었다. 순수 마케팅 사이트는 그 서브페이지가
 * **콘텐츠의 전부**라, 비어 있으면 답변 엔진이 인용할 노드가 홈 하나뿐이 된다.
 *
 * **지어내지 않는다**: 제목은 페이지가 그리는 `<h1>` 과 같은 값이고, 설명은 SEO 오버라이드가 실제로
 * 있을 때만 붙인다. `datePublished`·`author`·`image` 는 페이지에 그런 것이 없으므로 내지 않는다
 * ([blogPostingJsonLd] 와 같은 규율).
 */
export function webPageJsonLd(page: {title: string; slug: string}, siteBase: string, description?: string) {
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: page.title,
        url: `${siteBase}/${page.slug}`,
        ...(description ? {description} : {}),
    };
}

/**
 * 목록 표면의 `ItemList` — 상품 목록·시술 메뉴·글 목록이 공유한다.
 *
 * **왜 목록에도 그래프가 필요한가**: 상세 N건만 있으면 "이 가게가 무엇을 파는가"를 기계가 한 번에 받지
 * 못하고 상세를 하나씩 발견해야 한다. 목록은 그 N건을 한 노드로 묶어 주는 자리다.
 *
 * **요약형(summary page) 패턴을 쓴다** — 각 `ListItem` 은 `url` 로 상세를 가리키고 이름만 들고 간다.
 * 가격·재고를 여기 복제하지 않는 이유가 규율이다: 같은 사실이 두 곳에 있으면 갈라지고, 갈라진 쪽이
 * 거짓이 된다. 가격의 정본은 상세의 `Offer` 다.
 *
 * `position` 은 **화면에 보이는 그 순서** — 원장이 정한 노출 순서를 기계에도 같은 순서로 준다.
 */
export function itemListJsonLd(items: Array<{name: string; url: string}>) {
    return {"@context": "https://schema.org", ...itemListNode(items)};
}

/** `@context` 없는 `ItemList` 노드 — 다른 노드 안에 품을 때 쓴다([collectionPageJsonLd]). */
function itemListNode(items: Array<{name: string; url: string}>) {
    return {
        "@type": "ItemList",
        itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            url: item.url,
        })),
    };
}

/**
 * 카테고리 페이지의 `CollectionPage` — 그 안에 [itemListJsonLd] 산출물을 `mainEntity` 로 품는다.
 *
 * **왜 중첩인가**: 두 노드를 나란히 내면 크롤러에게 "이 페이지에 목록이 하나 있다"까지는 전해지지만
 * "이 페이지가 곧 그 목록이다"가 안 전해진다. 카테고리 페이지의 주제는 목록 그 자체라 소속을 명시한다.
 *
 * **상품 0건이어도 `mainEntity` 를 낸다** — 상품 목록(`/products`)·글 목록이 0건일 때 `ItemList` 를
 * 아예 빼는 것과 갈리는 자리라 이유를 적어 둔다. 저기서 빈 목록을 안 내는 이유는 "이 가게는 팔 것이
 * 없다"가 카탈로그 전체에 대한 진술이 되기 때문이고, 여기서 내는 이유는 **이 페이지의 주어가 이
 * 카테고리 하나**여서 "이 카테고리에 지금 0건"이 참인 진술이기 때문이다. 보장 표면(`CollectionPage`
 * + `ItemList`)이 재고 상황에 따라 있었다 없었다 하면 그건 보장이 아니다.
 */
export function collectionPageJsonLd(
    category: {name: string; slug: string},
    items: Array<{name: string; url: string}>,
    siteBase: string,
    description?: string,
) {
    return {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: category.name,
        url: `${siteBase}/c/${category.slug}`,
        ...(description ? {description} : {}),
        // 중첩 노드에는 `@context` 를 다시 달지 않는다 — 최상위 노드의 컨텍스트를 그대로 물려받는다.
        mainEntity: itemListNode(items),
    };
}

/** 경로 이동 표시 — 검색결과에 `홈 > 상품 > 이름` 형태로 노출된다. items 는 표시순. */
export function breadcrumbJsonLd(items: Array<{name: string; url: string}>) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.name,
            item: item.url,
        })),
    };
}
