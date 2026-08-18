"use client";

import Link from "next/link";
import {useAuthHint} from "@/lib/useAuthHint";

/**
 * 「이미 로그인되어 있습니다」 안내 한 줄.
 *
 * ⚠ **서버에서 세션을 읽지 않는다.** 종전에는 `getAccessToken()`(=`cookies()`)로 판정해 이 배너
 *   한 줄 때문에 `/login` 전체가 동적 렌더로 강등됐다(심의 실측: 대조군에서 그 한 줄만 상수로
 *   바꾸니 `ƒ` → `○ 1h 1y`, 5회 요청당 백엔드 호출 5 → 0).
 *
 *   같은 레포가 이미 이 사고를 겪고 처방을 정해 두었다 — `src/lib/authHint.ts` 와 `SiteHeader` 가
 *   그것이다. 로그인 판정을 클라이언트로 내리면 페이지는 정적/ISR 로 남는다. `/login` 만 그
 *   규율 밖이었다.
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
