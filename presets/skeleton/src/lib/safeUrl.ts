/**
 * 사용자/콘솔 입력 URL 을 링크로 쓰기 전 소독한다 — **저장형 XSS 방어**.
 *
 * 메뉴 url 은 콘솔 입력이라 `javascript:alert(document.cookie)` 가 들어올 수 있다. 백엔드는 스킴
 * 검증을 하지 않는다(실측: AdminMenuCreateRequest 는 trim + ≤500 뿐).
 *
 * **정확히 하자면 이건 prod 에서 이미 막힌다** — react-dom 19.2.4 의 `sanitizeURL` 이 `javascript:`
 * href 를 throw 스텁으로 치환한다(prod 번들 소스 실측). 단 **dev 에서는 raw 로 실리고**(내가 dev 만
 * 보고 "prod 취약"으로 과장 보고했다 — memo 57 §9 정정), react 내부 동작에 보안을 의존하는 것도
 * 취약하다. 그래서 이 헬퍼는 **심층 방어**다: react 판본과 무관하게 렌더 소스에서 스킴을 거른다.
 *
 * 허용: 내부 절대경로(`/about`)·http(s)·mailto·tel. 그 외(javascript:·data:·vbscript: 등)는 `#` 으로
 * 무력화한다(링크는 남되 스크립트는 안 돈다). 메뉴는 외부 링크가 정당하므로 safeNextPath 처럼
 * 내부로만 좁히지 않고 스킴 허용목록을 쓴다.
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/** 내부 경로 판정용 가짜 오리진 — 이 값으로 정규화되면 "밖으로 안 나간다"가 참이다. */
const DUMMY_ORIGIN = "https://zalkera.invalid";

export function safeLinkUrl(raw: string | null | undefined): string {
    if (!raw) return "#";
    const url = raw.trim();

    // ── 내부 절대경로 — **문자 검사로는 못 막는다.**
    //
    // ⚠ 종전 판정은 `startsWith("/") && !startsWith("//")` 였고 다음이 전부 통과했다(심의 실측):
    //    `/\evil.example` · `/<TAB>/evil.example` — 둘 다 `/` 로 시작하고 `//` 로 시작하지 않지만
    //    **브라우저는 `https://evil.example/` 로 읽는다.** 저장형 XSS 는 아니지만 오픈 리다이렉트·
    //    피싱이고, 이 값의 출처가 콘솔·AI·고객 zip 이라 신뢰 경계 밖이다. "회사소개" 라벨이 남의
    //    사이트로 가는 링크가 전 테넌트에 복제된다.
    //
    // 같은 결함을 **이 레포가 이미 한 번 겪고 고쳤다** — `oauth.ts` 의 `safeNextPath` 가 정확히 같은
    // 입력을 실측하고 파서 판정으로 옮겼는데, 이 함수만 문자 검사에 남아 있었다. 판정을 통일한다.
    //
    // 통과 값도 원문이 아니라 **파서가 정규화한 것**을 돌려준다 — 제어문자가 섞인 원문을 그대로
    // 넘기면 소비자가 또 다르게 해석할 여지가 남는다.
    // 현재 페이지 기준 조각·질의는 그대로 둔다 — 호스트를 바꿀 수 없어 안전하고, 정규화하면
    // `#top` 이 `/#top` 이 되어 **다른 페이지에서 홈으로 튄다**(초판 수정에서 실제로 낸 회귀).
    if (url.startsWith("#") || url.startsWith("?")) return url;

    if (url.startsWith("/")) {
        try {
            const parsed = new URL(url, DUMMY_ORIGIN);
            if (parsed.origin !== DUMMY_ORIGIN) return "#";
            return parsed.pathname + parsed.search + parsed.hash;
        } catch {
            return "#";
        }
    }

    try {
        const parsed = new URL(url); // 절대 URL 만 파싱된다(상대면 throw)
        return ALLOWED_SCHEMES.has(parsed.protocol) ? url : "#";
    } catch {
        // 파싱 실패 = 스킴 없는 상대경로(anchor#·?query 등). 여기도 파서로 재판정한다 —
        // `\\evil.example` 같은 값이 "파싱 실패"로 빠져나가던 갈래를 닫는다(심의 실측).
        try {
            const parsed = new URL(url, DUMMY_ORIGIN);
            return parsed.origin === DUMMY_ORIGIN ? parsed.pathname + parsed.search + parsed.hash : "#";
        } catch {
            return "#";
        }
    }
}
