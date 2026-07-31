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

export function safeLinkUrl(raw: string | null | undefined): string {
    if (!raw) return "#";
    const url = raw.trim();
    // 내부 절대경로 — 스킴이 없다. `//host`(스킴 상대)는 외부라 파서로 넘겨 검증한다.
    if (url.startsWith("/") && !url.startsWith("//")) return url;
    try {
        const parsed = new URL(url); // 절대 URL 만 파싱된다(상대면 throw)
        return ALLOWED_SCHEMES.has(parsed.protocol) ? url : "#";
    } catch {
        // 파싱 실패 = 스킴 없는 상대경로(anchor#·?query 등) — 내부로 간주해 통과.
        return url.startsWith("//") ? "#" : url;
    }
}
