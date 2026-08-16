/**
 * 사용자·콘솔 입력 URL 을 링크로 쓰기 전 소독한다 — **저장형 XSS + 오픈 리다이렉트 방어**.
 *
 * 메뉴 url 은 콘솔 입력이라 `javascript:alert(document.cookie)` 가 들어올 수 있고 백엔드는 스킴을
 * 검증하지 않는다(trim + 길이만). react-dom 이 prod 번들에서 `javascript:` href 를 막지만 dev 에서는
 * raw 로 실리므로, 이 헬퍼는 react 판본과 무관한 **심층 방어**다.
 *
 * 허용: 내부 절대경로(`/about`)·http(s)·mailto·tel. 그 외는 `#` 으로 무력화한다(링크는 남되
 * 스크립트는 안 돈다). 메뉴는 외부 링크가 정당하므로 내부로만 좁히지 않고 스킴 허용목록을 쓴다.
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/** 내부 경로 판정용 가짜 오리진 — 이 값으로 정규화되면 "밖으로 안 나간다"가 참이다. */
const DUMMY_ORIGIN = "https://zalkera.invalid";

/**
 * 내부 절대경로로 **정규화**한다 — 밖으로 나가는 형태면 `null`.
 *
 * ⚠ **판정은 문자가 아니라 파서가 한다.** 파서는 탭·CR·LF 를 URL 어디에서든 지우고 역슬래시를
 *   `/` 로 접으므로 `startsWith("//")` 검사가 보는 문자열과 브라우저가 보는 URL 이 다르다.
 *   재현: `node -e 'console.log(new URL("/\t/evil.example","https://t.example").origin)'` → https://evil.example
 *
 * ⚠ **입력이 아니라 돌려주는 값을 판정한다.** `/..//evil.example` 은 입력 판정을 통과하고 정규화
 *   결과가 `//evil.example` 이 되며, 그 값이 href·`Location` 으로 소비되면 프로토콜 상대 URL 로
 *   읽힌다. 그래서 자기 출력이 자기 입력 판정을 다시 통과해야 한다 — 그 멱등성을 여기서 건다.
 *   재현: `node -e 'console.log(new URL("/..//evil.example","https://zalkera.invalid").pathname)'` → //evil.example
 *
 * ⚠ **이 함수가 판정의 단 하나의 자리다.** 새 소비자가 생기면 규칙을 옮겨 적지 말고 이것을 불러라.
 *   `@zalkera/client` 의 같은 이름 함수와 판정이 갈리면 `safeUrlDrift.test.ts` 가 잡는다.
 *   재현: `node --experimental-strip-types --test src/lib/safeUrlDrift.test.ts; echo rc=$?` → rc=0
 */
export function internalPath(raw: string): string | null {
    let out: string;
    try {
        const parsed = new URL(raw, DUMMY_ORIGIN);
        if (parsed.origin !== DUMMY_ORIGIN) return null;
        out = parsed.pathname + parsed.search + parsed.hash;
    } catch {
        return null;
    }
    // 출처 비교만으로는 **센티넬 자신**을 못 거른다 — 정규화 결과가 `//zalkera.invalid` 가 되면
    // 그 호스트가 곧 `DUMMY_ORIGIN` 이라 재판정을 통과한다. 이 상수를 해석 가능한 도메인으로
    // 바꾸는 순간 실제 이탈이 되므로 형태로 한 번 더 거른다.
    // 재현: `node -e 'console.log(new URL("/..//zalkera.invalid","https://zalkera.invalid").pathname)'` → //zalkera.invalid
    if (out.startsWith("//")) return null;
    try {
        if (new URL(out, DUMMY_ORIGIN).origin !== DUMMY_ORIGIN) return null;
    } catch {
        return null;
    }
    return out;
}

export function safeLinkUrl(raw: string | null | undefined): string {
    if (!raw) return "#";
    const url = raw.trim();

    // 현재 페이지 기준 조각·질의는 그대로 둔다 — 호스트를 못 바꿔 안전하고, 정규화하면 `#top` 이
    // `/#top` 이 되어 다른 페이지에서 홈으로 튄다.
    if (url.startsWith("#") || url.startsWith("?")) return url;

    if (url.startsWith("/")) return internalPath(url) ?? "#";

    try {
        const parsed = new URL(url); // 절대 URL 만 파싱된다(상대면 throw)
        return ALLOWED_SCHEMES.has(parsed.protocol) ? url : "#";
    } catch {
        // 파싱 실패 = 스킴 없는 상대경로. 여기도 파서로 재판정한다 — `\\evil.example` 처럼
        // 절대 URL 파싱에 실패하면서 브라우저는 외부로 읽는 값이 이 갈래로 샌다.
        try {
            return internalPath(url) ?? "#";
        } catch {
            return "#";
        }
    }
}
