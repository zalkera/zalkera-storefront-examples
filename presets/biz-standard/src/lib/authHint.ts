import type {NextResponse} from "next/server";

/**
 * 로그인 여부 **낙관적 힌트 쿠키** — 비-httpOnly `zalkera_authed`(로그인이면 "1", 아니면 비운다).
 *
 * ## 왜 이게 있나 (ISR/정적 셸의 전제)
 * 공개 SEO 셸(레이아웃·헤더)을 정적/ISR 로 CDN 캐시하려면 서버에서 세션(`cookies()`)을 읽을 수 없다 —
 * `cookies()` 는 라우트를 요청마다 동적 렌더로 강제한다(그래서 "auth/개인화가 SSR 을 강제하는가?" 의
 * 답은 **아니오** 다: 로그인 판정을 클라이언트로 내리면 페이지는 정적/ISR 로 남는다).
 *
 * 실제 세션 토큰 쿠키(`zalkera_access`/`zalkera_refresh`)는 전부 httpOnly 라 JS 가 못 읽는다(탈취 방지).
 * 대신 BFF/인증 라우트가 유효 세션마다 이 비-httpOnly 힌트를 심고, 세션이 죽으면(로그아웃·토큰 오류)
 * 지운다. 클라이언트 훅 `useAuthHint()`(`src/lib/useAuthHint.ts`)가 이 쿠키를 읽어 헤더의 로그인 크롬을
 * 그린다.
 *
 * ## 중요한 불변식
 *  - **표시 전용 낙관값이다. 절대 인가(authorization)에 쓰지 않는다.** 실제 인가는 종전대로
 *    httpOnly 고객 세션 + Bearer + 백엔드가 단일 책임으로 판정한다. 이 쿠키는 토큰을 담지 않는다("1" 뿐).
 *  - **CDN 은 이 쿠키를 캐시 키에서 제외해야 한다.** 그러지 않으면 로그인/익명 방문자마다 캐시가 갈려
 *    (per-user cache fragmentation) ISR 효과가 사라진다. 이 힌트는 오직 BFF/동적 응답에만 실리고
 *    ISR 페이지 응답에는 절대 실리지 않으므로, 캐시 키에서 안전하게 뺄 수 있다.
 */
export const AUTH_HINT_COOKIE = "zalkera_authed";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * 낙관적 로그인 힌트 쿠키를 `NextResponse` 에 심거나(authed=true) 비운다(authed=false).
 * **BFF/인증 route handler 에서만** 호출한다(응답 객체가 있는 곳). 비-httpOnly 라 클라이언트 훅이 읽는다.
 * @param res 힌트를 실을 응답
 * @param authed 유효 세션이면 true("1", 30일) / 세션이 죽었으면 false(빈 값, 즉시 만료)
 */
export function setAuthHint(res: NextResponse, authed: boolean): void {
    res.cookies.set(AUTH_HINT_COOKIE, authed ? "1" : "", {
        httpOnly: false, // 표시 전용 — 클라이언트 JS(useAuthHint)가 읽어야 한다.
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: authed ? THIRTY_DAYS : 0,
    });
}
