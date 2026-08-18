"use client";

import Link from "next/link";
import {useAuthHint} from "@/lib/useAuthHint";

/**
 * 「이미 로그인되어 있습니다」 안내 한 줄.
 *
 * ⚠ **서버에서 세션을 읽지 않는다.** 서버 컴포넌트에서 `cookies()` 를 한 번이라도 부르면 그
 *   페이지는 통째로 동적 렌더(`ƒ`)가 된다 — 안내 한 줄 때문에 `/login` 전체가 매 요청 서버를
 *   타게 된다. 로그인 판정을 클라이언트로 내리면 페이지는 정적/ISR(`○`)로 남는다.
 *
 *   이 레포의 처방은 `src/lib/authHint.ts` 와 `SiteHeader` 다. 같은 규율을 따른다.
 */
export function LoggedInHint() {
    const loggedIn = useAuthHint();
    if (!loggedIn) return null;
    return (
        <p className="text-muted">
            이미 로그인되어 있습니다. <Link href="/mypage">마이페이지 →</Link>
        </p>
    );
}
