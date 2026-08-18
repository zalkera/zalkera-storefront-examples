import {LoggedInHint} from "./LoggedInHint";
import {LoginPanel} from "./LoginPanel";

/**
 * 로그인 페이지 (RSC). 소셜 버튼(카카오/네이버/구글)은 클라이언트에서 authorize URL 로 이동한다.
 * 이미 로그인돼 있으면(비-httpOnly 힌트 쿠키로 판정 — 토큰은 담지 않는다) 안내만 — 자동
 * 리다이렉트하지 않는다(토큰 만료 시 /mypage 와의 루프 방지).
 * 개발 환경에서는 실 OAuth 없이 도는 테스트 로그인을 함께 노출한다.
 */
export default function LoginPage() {
    const showTest = process.env.NODE_ENV !== "production";

    return (
        <main className="py-8">
            <h1>로그인</h1>
            <LoggedInHint />
            <LoginPanel showTest={showTest} />
        </main>
    );
}
