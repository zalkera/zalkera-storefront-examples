import Script from "next/script";

/**
 * Google Analytics 4 — **env 에 측정 ID 가 있을 때만** 로더를 싣는다.
 *
 * 값의 출처는 `NEXT_PUBLIC_GA4_ID` 하나다. 관리형 서빙은 콘솔 「사이트 환경변수」가 빌드타임에 인라인하고,
 * 자체 배포는 `.env.local` 에 둔다. 빈 값이면 **아무것도 렌더하지 않는다** — 외부 호스트를 부르는 자리는
 * 발주처가 준 ID 가 있을 때만 열린다(외부 의존 금지의 유일한 예외 · `docs/mockup-to-pack.md` §1-6).
 *
 * ⚠ 형식(`G-` + 영숫자)이 아니면 무시한다. 오타 난 ID 로 남의 속성에 이벤트를 쏘거나, 속성값에 든 문자가
 *   인라인 스크립트를 깨뜨리는 자리를 닫는다. 콘솔 `analyticsConfig`(백엔드 site-config)는 여기서 읽지 않는다 —
 *   정적 랜딩이 백엔드를 물지 않게 하기 위해서고, 그 JSON 을 쓰는 팩은 자기 레이아웃에서 따로 잇는다.
 */
const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export function Analytics() {
    const id = process.env.NEXT_PUBLIC_GA4_ID?.trim();
    if (!id || !GA4_ID_PATTERN.test(id)) return null;
    return (
        <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
                {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
            </Script>
        </>
    );
}
