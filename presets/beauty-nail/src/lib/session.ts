import {randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS, newOAuthState} from "@/lib/oauthState";
import {ATTRIBUTION_COOKIE, decodeTouch} from "@/lib/attribution";
import type {NextResponse} from "next/server";
import type {OrderAttribution, ShopSession} from "@zalkera/client";

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

// ── 갱신 직후 표식 ────────────────────────────────────────────────
//
// 인증필수 화면이 401 을 받으면 갱신 경유지로 보내는데, 갱신하고 돌아와서도 401 이면 그것은 갱신으로
// 풀 문제가 아니라 로그인이다. 그 「방금 갱신했다」를 주소창에 실으면 주소에 남아 **다음** 만료 때도
// 「이미 갱신했다」로 읽힌다 — refresh 쿠키가 살아 있는 사람이 로그인 화면을 본다. 그래서 표식은 수명이
// 짧은 쿠키다: 돌아가 한 번 그리는 데는 충분하고, 다음 만료(15분)보다는 훨씬 짧다.
const REFRESHED_COOKIE = "zalkera_refreshed";
const REFRESH_MARK_SECONDS = 15;

/** 갱신 경유지가 돌아가는 응답에 표식을 얹는다. */
export function markJustRefreshed(response: NextResponse): void {
    response.cookies.set(REFRESHED_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: REFRESH_MARK_SECONDS,
    });
}

/** 인증필수 화면이 401 을 「갱신하라」로 읽을지 「로그인하라」로 읽을지 정하는 근거. */
export async function wasJustRefreshed(): Promise<boolean> {
    return (await cookies()).get(REFRESHED_COOKIE)?.value === "1";
}

// ── 광고 유입 쿠키 ──────────────────────────────────────────────
//
// 쓰는 자리는 `middleware`(들어온 요청) · 규칙은 `@/lib/attribution`. 여기는 BFF 가 읽는 입구만 맡는다.

/** 방문자가 들어온 광고 유입 — 없거나 못 읽으면 `null`. **route handler 에서만** 호출. */
export async function getLandingAttribution(): Promise<OrderAttribution | null> {
    const jar = await cookies();
    return decodeTouch(jar.get(ATTRIBUTION_COOKIE)?.value);
}

// ── OAuth state 쿠키 ──────────────────────────────────────────────
//
// 대조·소각·교환 입구는 `@/lib/oauthState` 에 있다(`consumeOAuthState`·`bindSocialExchange`). 여기는 발행 쿠키의
// 정책만 맡는다.

/** 발행 — authorize 로 보내기 직전에 서버가 심는다. 이전 값은 덮어쓴다(마지막 시도만 유효). */
export async function issueOAuthState(provider: string): Promise<string> {
    const state = newOAuthState();
    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, JSON.stringify({state, provider}), {...OAUTH_STATE_COOKIE_OPTIONS, secure});
    return state;
}
