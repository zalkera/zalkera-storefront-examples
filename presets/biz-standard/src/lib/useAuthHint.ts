"use client";

import {useSyncExternalStore} from "react";
import {AUTH_HINT_COOKIE} from "./authHint";

/**
 * 로그인 여부 **낙관적 힌트** 클라이언트 훅 — 비-httpOnly 쿠키 `zalkera_authed` 를 읽는다.
 *
 * ## 왜 클라이언트인가 (ISR/정적 셸의 전제)
 * 헤더/셸이 서버에서 세션(`cookies()`)을 읽으면 그 라우트가 요청마다 동적 렌더로 강제된다 — SEO
 * 페이지가 정적/ISR 로 CDN 캐시될 수 없다. 그래서 로그인 판정을 **클라이언트로 내린다**: BFF/인증
 * 라우트가 심어둔 비-httpOnly 힌트 쿠키를 여기서 읽어 로그인 크롬(마이페이지·로그아웃 vs 로그인)을
 * 그린다. 실제 인가는 종전대로 httpOnly 세션 + Bearer + 백엔드가 판정한다(이 값은 표시 전용).
 *
 * ## 하이드레이션 안전
 * `useSyncExternalStore` 의 server snapshot 을 **항상 `false`(익명)** 로 고정한다 — 정적/SSR 은 익명
 * 셸로 프리렌더돼 CDN 에 캐시되고(크롤러도 익명이라 정합), 클라이언트가 마운트되며 쿠키를 읽어 로그인
 * 크롬으로 조정한다. 로그인 사용자에게만 익명→로그인 **찰나 깜빡임**이 있고, 익명 방문자엔 없다.
 *
 * 다른 탭에서 로그인/로그아웃한 뒤 돌아오면 `focus`/`visibilitychange` 로 쿠키를 재읽어 갱신한다.
 */

/** 같은 탭에서 쿠키를 직접 바꾼 직후 재읽기를 트리거하는 커스텀 이벤트명. */
const HINT_CHANGE_EVENT = "zalkera-auth-hint-change";

/** 문자열 쿠키에서 `name` 값을 읽는다(브라우저 전용). 없으면 null. */
function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const prefix = `${name}=`;
    for (const part of document.cookie.split("; ")) {
        if (part.startsWith(prefix)) return part.slice(prefix.length);
    }
    return null;
}

/** 낙관적 로그인 힌트 현재값(브라우저 전용). */
export function readAuthHint(): boolean {
    return readCookie(AUTH_HINT_COOKIE) === "1";
}

/**
 * 힌트 쿠키를 클라이언트에서 즉시 비운다 — 로그아웃 직후나 **stale 힌트 정리**(보호 액션이 401 을
 * 낸 경우: 힌트는 로그인이라는데 실제 세션이 죽음)에 호출해 셸이 곧장 익명으로 돌아가게 한다.
 * 실제 httpOnly 세션 쿠키 정리는 서버 라우트(`/api/auth/logout`)가 담당한다.
 */
export function clearAuthHint(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${AUTH_HINT_COOKIE}=; path=/; max-age=0; samesite=lax`;
    if (typeof window !== "undefined") window.dispatchEvent(new Event(HINT_CHANGE_EVENT));
}

/**
 * 같은 탭 구독자에게 힌트 변경을 알린다 — 서버 응답이 힌트 쿠키를 바꾼 직후(로그인 성공·로그아웃)
 * 호출해 헤더가 `focus` 를 기다리지 않고 즉시 로그인/익명 크롬으로 갱신되게 한다.
 */
export function notifyAuthHintChange(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(HINT_CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
    // 같은 탭: 명시적 알림. 다른 탭/복귀: focus·visibilitychange 로 쿠키 최신화(로그인/로그아웃 후 귀환).
    window.addEventListener(HINT_CHANGE_EVENT, onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("visibilitychange", onChange);
    return () => {
        window.removeEventListener(HINT_CHANGE_EVENT, onChange);
        window.removeEventListener("focus", onChange);
        window.removeEventListener("visibilitychange", onChange);
    };
}

/**
 * 낙관적 로그인 여부. SSR/정적 프리렌더에서는 항상 `false`(익명 셸), 클라이언트 마운트 후 쿠키를 읽어
 * 갱신한다. 표시 전용 — 보호 리소스 접근은 절대 이 값에 의존하지 말 것(백엔드 401 로 판정).
 */
export function useAuthHint(): boolean {
    return useSyncExternalStore(
        subscribe,
        readAuthHint, // client snapshot
        () => false, // server snapshot — 익명으로 프리렌더
    );
}
