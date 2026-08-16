import {randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {matchesOAuthState, newOAuthState} from "@/lib/oauthState";
import type {NextResponse} from "next/server";
import type {ShopSession} from "@zalkera/client";

/**
 * 스토어프론트 세션 쿠키. 전부 httpOnly — 브라우저 JS 에서 못 읽는다(토큰 탈취 방지).
 * - 게스트 장바구니: 랜덤 세션키(안정적으로 유지돼야 같은 카트를 본다).
 * - 로그인 고객: access/refresh 토큰.
 */
const CART_COOKIE = "zalkera_cart";
const ACCESS_COOKIE = "zalkera_access";
const REFRESH_COOKIE = "zalkera_refresh";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const secure = process.env.NODE_ENV === "production";

/** 게스트 카트 세션키를 읽거나(없으면) 만들어 쿠키에 심는다. **route handler/server action 에서만** 호출. */
export async function ensureCartSessionKey(): Promise<string> {
    const jar = await cookies();
    const existing = jar.get(CART_COOKIE)?.value;
    if (existing) return existing;
    const key = randomUUID();
    jar.set(CART_COOKIE, key, {httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: THIRTY_DAYS});
    return key;
}

/**
 * **주문이 카트를 소비했으므로 새 카트를 발급한다** — 체크아웃 성공 응답에 반드시 동반해야 한다.
 *
 * 없으면 무슨 일이 나는가(실제로 났던 형상): 체크아웃 멱등키가 `co-{cartSessionKey}` 이고
 * 카트 쿠키는 30일짜리라, 회전이 없으면 **한 번 주문한 게스트가 30일간 두 번째 주문을 못 한다**
 * (같은 키·다른 본문 → 409 `IDEMPOTENCY_CONFLICT`). 결제를 포기했다 다시 담아도 같다. 로그아웃도
 * 이 쿠키를 안 지운다 — 손님은 쿠키를 못 지우니 그대로 이탈이다.
 *
 * **왜 응답에 싣는가(재시도 안전의 핵심)**: Set-Cookie 는 이 응답에 실려 가므로 회전이 **성공 응답의
 * 브라우저 도달과 원자적으로 묶인다**. 응답이 유실되면 쿠키도 안 돌고 → 재시도가 옛 키를 들고 가
 * **원주문을 그대로 돌려받는다**(그 응답이 회전을 마저 수행). 도달했으면 새 키·빈 카트라 중복 클릭은
 * `EMPTY_CART` 로 무해하게 끝난다. "카트 1개 = 주문 1건"은 **회전이 있어야 참이 되는 명제**다.
 */
export function rotateCartSessionKey(response: NextResponse): void {
    response.cookies.set(CART_COOKIE, randomUUID(), {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: THIRTY_DAYS,
    });
}

/** 현재 사용자 식별(로그인 토큰 + 게스트 카트키). 읽기 전용 — RSC 에서도 안전. */
export async function getShopSession(): Promise<ShopSession> {
    const jar = await cookies();
    return {
        accessToken: jar.get(ACCESS_COOKIE)?.value,
        cartSessionKey: jar.get(CART_COOKIE)?.value,
    };
}

export async function getAccessToken(): Promise<string | undefined> {
    return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
    return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/** 소셜 로그인 성공 후 토큰 저장. **route handler/server action 에서만.** */
export async function setCustomerTokens(accessToken: string, refreshToken: string): Promise<void> {
    const jar = await cookies();
    jar.set(ACCESS_COOKIE, accessToken, {httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: THIRTY_DAYS});
    jar.set(REFRESH_COOKIE, refreshToken, {httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: THIRTY_DAYS});
}

export async function clearCustomerTokens(): Promise<void> {
    const jar = await cookies();
    jar.delete(ACCESS_COOKIE);
    jar.delete(REFRESH_COOKIE);
}

// ── OAuth state 쿠키 ──────────────────────────────────────────────
//
// 판정 규칙과 그 근거는 `@/lib/oauthState` 에 있다. 여기는 쿠키 정책만 맡는다.

const OAUTH_STATE_COOKIE = "zalkera_oauth_state";
const TEN_MINUTES = 600;

/** 발행 — authorize 로 보내기 직전에 서버가 심는다. 이전 값은 덮어쓴다(마지막 시도만 유효). */
export async function issueOAuthState(provider: string): Promise<string> {
    const state = newOAuthState();
    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, JSON.stringify({state, provider}), {
        httpOnly: true,
        // ⚠ `strict` 면 안 된다 — authorize 리다이렉트로 **돌아올 때** 쿠키가 안 실려 정상 로그인이 깨진다.
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: TEN_MINUTES,
    });
    return state;
}

/**
 * 대조 + **1회용 소각**. 통과 여부와 무관하게 쿠키를 지운다 — 남기면 리플레이가 가능하다.
 *
 * `false` 면 호출부는 **세션을 만들기 전에** 끝내야 한다. 차단 응답에 `Set-Cookie` 로 세션이 실리면
 * 방어가 무의미해진다.
 */
export async function consumeOAuthState(state: unknown, provider: unknown): Promise<boolean> {
    const jar = await cookies();
    const raw = jar.get(OAUTH_STATE_COOKIE)?.value;
    jar.delete(OAUTH_STATE_COOKIE);
    return matchesOAuthState(raw, state, provider);
}
