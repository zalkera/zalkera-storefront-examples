/**
 * 이 사이트의 공개 절대 URL. JSON-LD·sitemap·robots 는 상대경로를 쓸 수 없다 —
 * 크롤러가 절대 URL 로 정규화해 읽기 때문이다.
 *
 * env `ZALKERA_SITE_URL` 로 주입한다(예: https://shop.example.com). 미설정이면 로컬 기본값이라
 * **배포 전 반드시 설정**해야 한다 — 안 그러면 sitemap 이 localhost 를 가리킨다.
 * 끝의 `/` 는 벗겨서 `${siteUrl()}/products/x` 가 항상 슬래시 1개가 되게 한다.
 */
export function siteUrl(): string {
    return (process.env.ZALKERA_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * `metadata.metadataBase` 용 절대 오리진. 이게 있어야 metadata 의 상대 경로(canonical·og:url)가
 * 절대 URL 로 해석된다 — 크롤러는 상대 canonical 을 신뢰하지 않는다.
 *
 * **던지지 않는다.** `ZALKERA_SITE_URL` 오타(스킴 누락 등)로 `new URL` 이 던지면 이걸 부르는
 * 루트 layout 의 generateMetadata 가 깨지고 **전 라우트가 500** 이 된다. 설정 오류의 대가가
 * 사이트 전체 중단이어선 안 된다 — undefined 로 강하하면 Next 가 경고만 남기고 산다
 * ([fallbackSiteName] 과 같은 판단).
 */
export function metadataBaseUrl(): URL | undefined {
    try {
        return new URL(siteUrl());
    } catch {
        return undefined;
    }
}

/**
 * 사이트 설정을 못 가져왔을 때 쓸 사이트 이름 — 호스트명.
 *
 * 이 폴백은 희귀 장애경로가 아니다. 빌드가 백엔드에 못 닿으면(CI 가 그렇다) `force-static` 라우트는
 * 폴백이 박힌 채 프리렌더되고, revalidate 주기나 `revalidateTag` 가 올 때까지 그게 크롤링된다.
 *
 * 그래서 후보 셋 중 호스트명이다:
 *  - 우리 브랜드("잘커라 …") → 거래처 사이트에 **우리 이름**이 뜬다. 이걸 없애는 게 이 코드의 목적이다.
 *  - 빈 문자열 → 브라우저가 URL 을 탭에 깔고 검색엔진이 제목을 임의 합성한다. 빈 h1 은 접근성 마이너스.
 *  - "스토어" 류 범용어 → 전 거래처가 같은 제목으로 잡힌다.
 * 호스트명은 테넌트별로 유일하고, 주소창에 이미 보이는 사실이며, 지어낸 문구가 아니다.
 */
export function fallbackSiteName(): string {
    try {
        return new URL(siteUrl()).hostname;
    } catch {
        // ZALKERA_SITE_URL 오타(스킴 누락 등)로 전 라우트 metadata 가 500 나면 안 된다 — sitemap 이
        // 이미 깨졌겠지만 그건 그쪽에서 드러날 일이고, 폴백 제목 하나가 사이트를 죽일 이유는 없다.
        return siteUrl();
    }
}
