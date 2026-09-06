import type {Metadata} from "next";

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

/**
 * 검색엔진 소유확인 토큰 하나를 읽는다.
 *
 * 콘솔 「사이트 환경변수」에 붙여넣을 때 **메타 태그 전문**(`<meta name="…" content="…" />`)을
 * 통째로 넣는 일이 잦다 — 각 도구가 태그를 통째로 보여 주기 때문이다. 그대로 content 에 실으면
 * 태그는 나오는데 값이 틀려 **소유확인만 조용히 실패**하고, 화면에는 아무 신호도 없다.
 *
 * 그래서 태그 조각(`<`·`>`)이나 공백이 든 값은 **버리고 경고를 남긴다**: 태그가 아예 없으면 각 도구가
 * 「확인 실패」로 말해 주므로, 있는데 값이 틀린 것보다 낫다.
 */
/**
 * 이미 경고한 env 이름. 루트 layout 의 `generateMetadata` 는 빌드 1회로 끝나지 않는다 —
 * 동적 라우트(`/cart`·`/mypage`·`/orders/[orderNo]`)에서는 **요청마다** 돌고 ISR 재생성마다 다시 돈다.
 * 잘못된 값은 빌드 시점에 고정되므로 요청마다 재판정할 새 정보가 없는데, 그대로 두면 같은 답을
 * 요청당 최대 3줄씩 영구히 찍는다(심의 실측: `/cart` 지연 +3~8 ms · 요청당 489 B).
 * 프로세스 수명 동안 env 이름별 한 번만 남긴다 — 진단 가치는 첫 줄에 다 있다.
 */
const warnedEnvNames = new Set<string>();

function verificationToken(envName: string, raw: string | undefined): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    if (/[<>\s]/.test(value)) {
        if (!warnedEnvNames.has(envName)) {
            warnedEnvNames.add(envName);
            // 값은 싣지 않는다 — 토큰이 로그로 새면 안 된다.
            console.warn(
                `${envName} 값에 태그·공백이 들어 있어 무시한다 — 메타 태그 전문이 아니라 content 의 토큰 값만 넣으라.`,
            );
        }
        return undefined;
    }
    return value;
}

/**
 * 구글 서치 콘솔 · 네이버 서치어드바이저 · Bing 웹마스터 도구의 소유확인 메타 태그.
 *
 * 값은 테넌트마다 다르고 브라우저에 그대로 노출되는 공개 문자열이라 `NEXT_PUBLIC_*` 로 주입한다.
 * 관리형은 콘솔 「사이트 환경변수」에 넣으면 재빌드로 반영되고, BYO 는 `.env.local` 에 둔다.
 * **소스에 박지 않는다** — 박힌 토큰을 다른 사이트가 서빙하면, 그 토큰을 발급받은 **원래 계정이 그 사이트의**
 * **소유권을 확인받는다**(데이터 열람·사이트맵 제출·URL 삭제 요청·사용자 추가). 물려받은 쪽이 가해자가
 * 아니라 피해자다 — 그래서 팩에 실값이 한 톨도 있으면 안 된다.
 *
 * 셋 다 비면 `undefined` 를 내 **`verification` 키 자체를 만들지 않는다** — 빈 `content` 는 각 도구의
 * 검증에서 실패로 잡히고, 없는 것만 못하다.
 *
 * ⚠ DNS·HTML 파일로 확인했다면 넣을 필요가 없다. 셋은 서로 독립이라 쓰는 것만 넣는다.
 */
export function siteVerification(): Metadata["verification"] | undefined {
    const google = verificationToken(
        "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
        process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    );
    const naver = verificationToken(
        "NEXT_PUBLIC_NAVER_SITE_VERIFICATION",
        process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION,
    );
    // Bing 웹마스터 도구가 정한 meta 이름이다 — `bing-site-verification` 이 아니다.
    const bing = verificationToken(
        "NEXT_PUBLIC_BING_SITE_VERIFICATION",
        process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
    );

    const other: Record<string, string> = {};
    if (naver) other["naver-site-verification"] = naver;
    if (bing) other["msvalidate.01"] = bing;

    if (!google && Object.keys(other).length === 0) return undefined;
    return {
        ...(google ? {google} : {}),
        ...(Object.keys(other).length > 0 ? {other} : {}),
    };
}
