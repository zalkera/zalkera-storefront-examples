// zalkera-allow-preview-write: 로그인 흐름 — 막으면 로그인한 화면을 못 본다. 최초 소셜 로그인은 운영에 계정을 만든다.
import {NextResponse} from "next/server";
import type {SocialProvider} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse} from "@/lib/http";
import {consumeOAuthState, setCustomerTokens} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";
import {callbackPath, parseProviderParam} from "@/lib/oauth";

/**
 * 소셜 로그인 **교환** — authorization code 를 백엔드가 토큰으로 바꾼다. 받은 토큰은 httpOnly 쿠키에
 * 저장한다(브라우저 JS 에 노출하지 않는다).
 *
 * 방어가 두 겹이고 **각각 다른 경로**를 막는다(memo118).
 *
 *  ① `assertSameOrigin` — 교차사이트 폼 제출. 우리 코드가 한 줄도 안 도는 경로다.
 *  ② `consumeOAuthState` — **콜백 페이지 경유 code 주입.** 공격자가 피해자를
 *     `/auth/callback/kakao?code=공격자코드` 로 톱레벨 이동시키면 그 페이지는 **진짜 우리 사이트**라
 *     이어지는 POST 가 same-origin 이다 — ①을 통과한다. 그러면 피해자 브라우저에 **공격자 계정
 *     세션**이 심기고, 피해자가 남기는 주소·주문이 전부 공격자 계정에 쌓인다.
 *     서버가 "이 교환이 우리가 시작한 authorize 의 귀환인가"를 아는 유일한 증거가 state 쿠키다.
 *
 * **순서가 곧 방어다** — 셋 다 세션을 만들기 **전에** 끝낸다. 차단 응답에 `Set-Cookie` 로 세션이
 * 실리면 방어가 무의미해진다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;

    const body = await req.json().catch(() => null);
    const raw = String(body?.provider ?? "");
    const code = body?.code;
    const social = parseProviderParam(raw); // KAKAO·NAVER·GOOGLE 만 통과
    const isTest = raw === "TEST";

    if (!code || (!social && !isTest)) {
        return NextResponse.json({message: "잘못된 요청 본문입니다.", code: "INVALID_BODY"}, {status: 400});
    }

    // 개발 전용 TEST provider — **프로덕션에서는 존재 자체를 거부한다.** 백엔드도
    // `customer.auth.test-provider-enabled` 로 막지만, 그 설정이 실수로 켜져도 여기서 한 번 더 끊는다.
    if (isTest && process.env.NODE_ENV === "production") {
        return NextResponse.json({message: "지원하지 않는 로그인 방식입니다.", code: "INVALID_BODY"}, {status: 400});
    }

    let redirectUri: string | undefined;
    if (social) {
        // ② state ↔ 쿠키 대조(provider 동일성까지). 통과 여부와 무관하게 쿠키는 소각된다 — 리플레이 차단.
        //
        // TEST 는 이 검사를 **타지 않는다.** 외부 리다이렉트가 없어 authorize 왕복 자체가 없고,
        // 따라서 바인딩할 state 도 존재하지 않는다. 면제가 아니라 **적용 대상이 아닌 것**이다
        // (그리고 위에서 프로덕션 차단이 이미 걸려 있다).
        if (!(await consumeOAuthState(body?.state, social))) {
            return NextResponse.json(
                {
                    message: "로그인 요청을 확인할 수 없습니다. 로그인 화면에서 처음부터 다시 시도해 주세요.",
                    code: "OAUTH_STATE_MISMATCH",
                },
                {status: 400},
            );
        }
        // `redirect_uri` 를 **본문에서 받지 않는다** — 요청이 도달한 오리진에서 파생한다(개시와 같은
        // 방식이라 두 값이 반드시 일치한다). 클라이언트가 준 값을 그대로 실으면 열린 리다이렉터가 된다.
        const origin = req.headers.get("origin")!; // assertSameOrigin 이 존재·일치를 보장한다.
        redirectUri = `${origin}${callbackPath(social)}`;
    }

    try {
        // consents 는 신규 가입 시 백엔드가 필수 동의를 검증하는 데 쓴다(미충족 시 400 CONSENT_REQUIRED).
        const tokens = await zalkera.socialLogin({
            provider: (social ?? raw) as SocialProvider,
            code,
            redirectUri,
            consents: body?.consents,
        });
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
