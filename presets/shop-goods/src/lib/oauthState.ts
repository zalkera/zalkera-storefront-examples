/**
 * OAuth `state` 의 **판정·소각·교환 입구** — 쿠키 항아리를 주입받는 순수 함수라 Node 기본 테스트 러너로 행위를
 * 잠근다(`next/*` 를 import 하는 모듈은 그 러너가 못 읽는다). 발행 쿠키를 심는 것은 `@/lib/session` 의
 * `issueOAuthState`, 항아리(`cookies()`)를 넘기는 것은 교환 라우트다.
 *
 * ## ①층(Origin↔Host)이 못 막는 경로가 하나 있다
 * 공격자가 피해자를 `https://피해자사이트/auth/callback/kakao?code=공격자코드` 로 **톱레벨 이동**시키면,
 * 그 페이지에서 이어지는 `POST /api/auth/social` 은 **진짜 same-origin** 이다. Origin 검사를 통과한다.
 * 그 결과 피해자 브라우저에 **공격자 계정 세션**이 심기고, 피해자가 남기는 주소·주문이 전부
 * 공격자 계정에 쌓인다.
 *
 * 막는 방법은 "이 교환이 우리가 시작한 authorize 의 귀환인가"를 서버가 아는 것뿐이고, 그 증거가 state 다.
 *
 * ## 왜 sessionStorage 가 아니라 서버인가
 * 기존 `CallbackHandler` 의 sessionStorage 대조는 기능적으로는 이 경로를 닫는다. 그럼에도 서버로
 * 옮기는 이유는 보안 속성의 **거처** 때문이다. 이 제품의 전제는 **AI 가 스토어프론트를 다시 쓴다**는
 * 것이고 BYO 고객은 자기 콜백 페이지를 직접 짠다 — **클라이언트에 있는 보안 검사는 이 제품에서
 * 수명이 보장되지 않는다.** 서버로 옮기면 그 라우트는 어떤 프론트엔드가 붙든 스스로 방어한다.
 */

/** 발행값 — 추측 불가해야 한다. */
export function newOAuthState(): string {
    return crypto.randomUUID();
}

/**
 * 쿠키 값 ↔ 제출된 state 의 **순수 대조**. 쿠키 입출력에서 갈라 둔 이유는 이 판정이 테스트로
 * 잠겨야 하기 때문이다(`next/headers` 를 import 하는 모듈은 Node 기본 러너가 못 읽는다).
 *
 * 전부 **fail-closed** 다 — 쿠키 부재·파싱 실패·**파싱은 됐지만 객체가 아닌 값**·빈 값을 전부
 * 거부한다. 하나라도 통과로 두면 "state 를 아예 안 보내면 뚫리는" 구멍이 생긴다.
 *
 * ⚠ 세 번째 항이 이 목록에 없던 동안 `JSON.parse("null")` → `null` 을 그대로 역참조해 **TypeError**
 *   가 났다. 호출부(`api/auth/social`)의 `try` 밖이라 예외가 핸들러를 탈출해 **HTTP 500** 이 된다 —
 *   인증 우회는 아니지만 소셜 로그인이 죽는다. 재현:
 *   `matchesOAuthState("null", "any", "KAKAO")` → TypeError
 */
export function matchesOAuthState(raw: string | undefined, state: unknown, provider: unknown): boolean {
    if (!raw || typeof state !== "string" || !state) return false;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return false;
    }
    // `JSON.parse` 는 `null`·숫자·배열도 **성공**으로 돌려준다. 파싱 성공을 객체로 읽으면 그 셋에서
    // 죽는다 — `null` 이 특히 그렇다(`typeof null === "object"` 라 typeof 검사만으로는 못 거른다).
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    const saved = parsed as {state?: unknown; provider?: unknown};
    // ⚠ 이 줄은 **오늘 동치 가드다**(실측: 지워도 스위트가 전부 통과). 위에서 제출 state 를 "비어 있지 않은
    // 문자열"로 이미 좁혔고 비교가 엄격 동등이라, 쿠키 쪽이 비었거나 문자열이 아니면 어차피 통과할 수
    // 없다. 그래도 남기는 이유는 **위 조건이 느슨해지는 날**을 위해서다 — 그때 이 줄이 없으면
    // "둘 다 비우면 뚫린다"가 조용히 생긴다. 지우려면 위 조건부터 보라.
    if (typeof saved.state !== "string" || !saved.state) return false;
    // provider 까지 대조한다 — KAKAO 로 발행한 state 를 GOOGLE 교환에 재사용하면 다른 앱의 code 를
    // 교환하게 된다. 쌍으로 봐야 그 재사용이 막힌다.
    return saved.state === state && saved.provider === provider;
}

/** state 쿠키 이름 — 발행(`@/lib/session`)과 소각(아래)이 같은 이름을 쓴다. */
export const OAUTH_STATE_COOKIE = "zalkera_oauth_state";

/**
 * 발행 쿠키 속성 — `@/lib/session` 이 여기에 `secure` 만 더해 심는다. 값을 이 파일에 두는 것은 시험과 검사기 X3 가
 * 같은 자리를 재게 하려는 것이다.
 */
export const OAUTH_STATE_COOKIE_OPTIONS = {
    httpOnly: true,
    // ⚠ `strict` 면 안 된다 — authorize 리다이렉트로 **돌아올 때** 쿠키가 안 실려 정상 로그인이 깨진다.
    sameSite: "lax",
    path: "/",
    maxAge: 600,
} as const;

/** 쿠키 항아리 — `next/headers` 의 `cookies()` 가 돌려주는 것 중 여기서 쓰는 두 동작. */
export interface OAuthStateJar {
    get(name: string): {value: string} | undefined;
    delete(name: string): unknown;
}

/**
 * 대조 + **1회용 소각**. 통과 여부와 무관하게 쿠키를 지운다 — 남기면 리플레이가 가능하다.
 *
 * `false` 면 호출부는 **세션을 만들기 전에** 끝내야 한다. 차단 응답에 `Set-Cookie` 로 세션이 실리면
 * 방어가 무의미해진다.
 */
export function consumeOAuthState(jar: OAuthStateJar, state: unknown, provider: unknown): boolean {
    const raw = jar.get(OAUTH_STATE_COOKIE)?.value;
    jar.delete(OAUTH_STATE_COOKIE);
    return matchesOAuthState(raw, state, provider);
}

/**
 * 소셜 교환의 **한 입구** — 대조·소각이 교환보다 먼저이고, 대조가 실패하면 교환을 **부르지 않고** `null` 을 돌려준다.
 * `@/lib/zalkera` 가 싱글턴에서 뗀 `socialLogin` 을 여기에만 넘긴다.
 *
 * 개발 전용 `TEST` 는 대조 대상이 아니다 — authorize 왕복이 없어 바인딩할 state 가 없다. 운영이면 부르지 않는다.
 */
export function bindSocialExchange<I extends {provider: string}, O>(
    login: (input: I) => Promise<O>,
    isProduction: () => boolean,
): (jar: OAuthStateJar, state: unknown, input: I) => Promise<O | null> {
    return async (jar, state, input) => {
        const allowed = input.provider === "TEST" ? !isProduction() : consumeOAuthState(jar, state, input.provider);
        return allowed ? login(input) : null;
    };
}
