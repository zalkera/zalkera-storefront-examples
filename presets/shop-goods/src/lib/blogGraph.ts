import type {SiteConfig} from "@zalkera/client";
import type {PostWithByline} from "./postFields.ts";

/**
 * 글 그래프 빌더 — **컴포넌트가 아니라 데이터라서 여기 있다.**
 *
 * `JsonLd.tsx` 는 JSX 라 Node 의 타입 스트리핑이 못 읽는다(`.tsx`). 저자 갈래처럼 **분기가 있는
 * 판정**은 시험이 붙어야 하므로 순수 모듈로 둔다. 화면 쪽은 `JsonLd.tsx` 가 그대로 재수출하므로
 * 호출부는 바뀌지 않는다.
 */
/**
 * 업종 → schema.org 타입. 서버가 **실제 업태를 명시 입력받아** 주는 값만 좁힌다
 * (테마 선택에서 유도한 값이 아니다 — 디자인은 업태 진술이 아니므로).
 * 모르는 값·미설정은 `Organization` 으로 흘려보낸다 — 거짓 진술보다 덜 구체적인 진술이 낫다.
 */
export function schemaTypeOf(businessType: SiteConfig["businessType"]): string {
    return businessType === "BEAUTY" ? "BeautySalon" : "Organization";
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
export function blogPostingJsonLd(post: PostWithByline, siteBase: string, config?: SiteConfig | null) {
    const url = `${siteBase}/blog/${post.slug}`;
    // 상호가 있으면 그것이 **발행자**다 — 그 사이트의 글은 실제로 그 조직이 낸 것이라 참이다.
    const organization = config?.companyName
        ? {"@type": schemaTypeOf(config.businessType), name: config.companyName, url: siteBase}
        : undefined;
    // 글이 저자를 들고 있으면 사람, 아니면 조직. 둘 다 없으면 **칸을 뺀다**(지어내지 않는다).
    const author = post.author ? {"@type": "Person", name: post.author} : organization;

    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        url,
        ...(post.publishedAt ? {datePublished: post.publishedAt} : {}),
        // 「아직 최신인가」의 신호. 발행일만 내면 3년 전 글과 어제 고친 글이 같아 보인다.
        // 없으면 **뺀다** — 없는 날짜를 지어내면 그 신선도 신호가 거짓이 된다.
        ...(post.modified ? {dateModified: post.modified} : {}),
        ...(author ? {author} : {}),
        ...(organization ? {publisher: organization} : {}),
        ...(post.summary ? {description: post.summary} : {}),
        ...(post.coverAssetId != null ? {image: [`${siteBase}/media/${post.coverAssetId}`]} : {}),
    };
}
