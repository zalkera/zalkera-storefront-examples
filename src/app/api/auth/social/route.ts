import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertSameOrigin, errorResponse} from "@/lib/http";
import {setCustomerTokens} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";

/**
 * 소셜 로그인 — 프론트가 소셜 리다이렉트에서 받은 authorization code 를 넘기면 백엔드가 교환한다.
 * 받은 토큰은 httpOnly 쿠키에 저장한다(브라우저 JS 에 노출하지 않는다).
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const {provider, code, redirectUri, consents} = await req.json();
    try {
        // consents 는 신규 가입 시 백엔드가 필수 동의를 검증하는 데 쓴다(미충족 시 400 CONSENT_REQUIRED).
        const tokens = await zalkera.socialLogin({provider, code, redirectUri, consents});
        await setCustomerTokens(tokens.accessToken, tokens.refreshToken);
        const response = NextResponse.json({customer: tokens.customer});
        // 로그인 성공 → 낙관적 로그인 힌트를 심어 헤더/셸이 서버 세션 읽기 없이 로그인 크롬을 그린다.
        // 이 라우트는 TestLogin·OAuth 콜백 양쪽의 단일 교환 지점이라, 여기 한 곳이면 로그인 세팅이 끝난다.
        setAuthHint(response, true);
        return response;
    } catch (error) {
        return errorResponse(error);
    }
}
