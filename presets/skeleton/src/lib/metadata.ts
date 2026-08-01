import type {Metadata} from "next";

/**
 * 공유 카드용 제목에 상호를 붙인다 — 문서 `title` 은 layout 의 `%s | 상호` 템플릿이 해 주지만
 * `openGraph.title` 은 그 템플릿을 타지 않아 하위 라우트에서 상호가 통째로 빠진다. 그 구멍을 메운다.
 * 상호를 못 읽었으면 제목만 — 폴백 상호(호스트명)를 공유 카드에 박지 않는다.
 */
export function withSiteName(title: string, siteName?: string): string {
    return siteName ? `${title} | ${siteName}` : title;
}

/**
 * 공개 라우트의 OG · 트위터 카드를 한 벌로 만든다.
 *
 * **canonical 은 여기서 내지 않는다** — 루트 layout 의 `alternates.canonical: "./"` 하나가 라우트별로
 * 자기 경로를 절대 URL 로 해석해 준다(memo98 §3.3). 실측으로 확인했다: `/policies` → `…/policies`,
 * `/products/guard-test` → `…/products/guard-test`. 라우트마다 canonical 을 다시 쓰면 같은 사실의
 * 이중 원장이 되고, 새 라우트를 추가할 때 빠뜨리면 조용히 홈으로 정규화된다.
 *
 * **openGraph 는 병합이 아니라 얕은 교체다** — 자식이 `openGraph` 를 주면 부모 것이 통째로 대체된다.
 * `siteName` 처럼 라우트마다 같은 값도 여기서 매번 다시 채우는 이유가 그것이다. og:title 은 라우트의
 * 제목을 알아야 하므로 layout 이 대신 낼 수 없다 — canonical 과 달리 여기 남는 이유다.
 */
export function pageMetadata(opts: {
    /** 공유 카드에 뜰 제목. 문서 `title`(탭·검색결과)과 달리 layout 의 `%s | 상호` 템플릿을 타지 않으므로
     *  **호출부가 완성형으로** 넘긴다. */
    ogTitle: string;
    /** 없으면 og/twitter 에서 필드를 뺀다 — 없는 문구를 지어내지 않는다(seo.ts 와 같은 규칙). */
    description?: string;
    /** `/` 로 시작하는 사이트 내 경로. metadataBase 로 절대 URL 이 된다. */
    path: string;
    /** 사이트 설정을 못 읽었으면 생략 — 폴백 상호를 공유 카드에 박지 않는다. */
    siteName?: string;
    /** 페이지가 **실제로 그리는** 이미지의 사이트 내 경로(`/media/{id}`). presigned URL 은 수 분 뒤
     *  만료돼 공유 카드가 깨지므로 절대 넣지 않는다(JsonLd.tsx W4 와 같은 규칙). */
    image?: string;
}): Metadata {
    const {ogTitle, description, path, siteName, image} = opts;
    return {
        openGraph: {
            type: "website",
            locale: "ko_KR",
            url: path,
            title: ogTitle,
            ...(description ? {description} : {}),
            ...(siteName ? {siteName} : {}),
            ...(image ? {images: [image]} : {}),
        },
        // 이미지가 없으면 large_image 카드는 빈 상자가 된다 — 있을 때만 큰 카드를 요청한다.
        // `card` 를 삼항으로 두지 않고 객체를 통째로 가르는 이유: Next 의 Twitter 타입은 card 리터럴로
        // 판별하는 유니온이라, 삼항이면 판별이 풀려 타입이 안 맞는다.
        twitter: image
            ? {
                  card: "summary_large_image",
                  title: ogTitle,
                  ...(description ? {description} : {}),
                  images: [image],
              }
            : {
                  card: "summary",
                  title: ogTitle,
                  ...(description ? {description} : {}),
              },
    };
}
