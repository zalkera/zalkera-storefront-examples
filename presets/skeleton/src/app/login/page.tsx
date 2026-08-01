import Link from "next/link";
import {getAccessToken} from "@/lib/session";
import {LoginPanel} from "./LoginPanel";

/**
 * 로그인 페이지 (RSC). 소셜 버튼(카카오/네이버/구글)은 클라이언트에서 authorize URL 로 이동한다.
 * 이미 로그인돼 있으면(쿠키에 토큰) 안내만 — 자동 리다이렉트하지 않는다(토큰 만료 시 /mypage 와의 루프 방지).
 * 개발 환경에서는 실 OAuth 없이 도는 테스트 로그인을 함께 노출한다.
 */
export default async function LoginPage() {
    const loggedIn = Boolean(await getAccessToken());
    const showTest = process.env.NODE_ENV !== "production";

    return (
        <main className="py-8">
            <h1>로그인</h1>
            {loggedIn && (
                <p className="text-muted">
                    이미 로그인되어 있습니다. <Link href="/mypage">마이페이지 →</Link>
                </p>
            )}
            <LoginPanel showTest={showTest} />
        </main>
    );
}
