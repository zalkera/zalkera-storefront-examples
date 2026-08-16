"use client";

import Link from "next/link";
import type {NavLink} from "@/lib/content";
import {useAuthHint} from "@/lib/useAuthHint";
import {LogoutButton} from "./LogoutButton";

/**
 * 사이트 헤더 (클라이언트 컴포넌트). 헤더 내비는 `content/nav.json` 이고 layout 이 읽어 props 로 준다
 * (SDK 를 직접 안 부른다 — baseUrl 노출·ISR 강등 없음). 로그인 ↔ 마이페이지/로그아웃 토글을 **낙관적 힌트 쿠키**
 * (`useAuthHint`, 비-httpOnly `zalkera_authed`)로 클라이언트에서 판정한다.
 *
 * 예전엔 async RSC 로 서버에서 `getAccessToken()`(=`cookies()`)을 읽었는데, 그러면 이 헤더가 실린
 * 루트 레이아웃이 전 라우트를 요청마다 동적 렌더로 강제해 SEO 페이지(홈·상세)가 정적/ISR 로 CDN
 * 캐시될 수 없었다. 세션 판정을 클라이언트로 내려 페이지는 static/ISR 로 남는다.
 * (토큰 유효성까지는 확인하지 않는다 — 만료라면 마이페이지 진입 시 백엔드 401 로 로그인으로 보낸다.)
 */
export function SiteHeader({menus = []}: {menus?: NavLink[]}) {
    const loggedIn = useAuthHint();

    return (
        <header className="flex items-center gap-4 border-b border-border pb-3 mb-8">
            <Link href="/" className="font-semibold no-underline">
                홈
            </Link>
            {/* content/nav.json 의 header 배열 — 배열 순서가 노출 순서다. 비면 종전과 동일한 헤더다.
                href 는 loadNav 가 이미 safeLinkUrl 로 소독했다(소독 지점을 한 곳으로 모은다). */}
            {menus.map((m, i) => (
                <Link key={i} href={m.href}>
                    {m.label}
                </Link>
            ))}
            <Link href="/cart">장바구니</Link>
            {loggedIn ? (
                <>
                    <Link href="/mypage" className="ms-auto">
                        마이페이지
                    </Link>
                    <LogoutButton />
                </>
            ) : (
                <Link href="/login" className="ms-auto">
                    로그인
                </Link>
            )}
        </header>
    );
}
