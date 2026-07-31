import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {getRefreshToken, setCustomerTokens, clearCustomerTokens} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";
import {safeNextPath} from "@/lib/oauth";

/**
 * **세션 갱신 경유지**(memo 50 §24-3 후속 — refresh-on-401 위생).
 *
 * 고객 access 토큰은 15분이고 refresh 는 30일이다. 그런데 인증필수 화면(마이페이지 등)이 401 을
 * 곧바로 로그인으로 해석하면 **30일 refresh 가 무의미해지고 로그인 고객이 15분마다 재로그인한다**.
 * 그 401 은 "로그아웃하라"가 아니라 **"갱신하라"는 신호**다.
 *
 * **왜 라우트인가**: RSC 는 쿠키를 못 쓴다(읽기 전용). 토큰 회전은 Set-Cookie 가 필요하므로 갱신이
 * 필요한 화면은 이리로 리다이렉트하고, 여기서 회전시킨 뒤 원래 자리로 돌려보낸다.
 *
 * **무한 루프 가드**: 돌아갈 주소에 `r=1` 을 붙인다 — 갱신하고 돌아갔는데 또 401 이면 그 화면은
 * 재갱신 대신 로그인으로 보낸다(새 토큰으로도 401 이면 갱신으로 풀 문제가 아니다).
 *
 * **오픈 리다이렉트 방어**: `next` 는 **우리 사이트 내부 경로만** 허용한다(`/` 로 시작하고 `//` 아님).
 * 안 그러면 `?next=https://evil.example` 로 로그인 직후의 사용자를 남의 사이트로 보낼 수 있다.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const next = safeNext(url.searchParams.get("next"));
    const refreshToken = await getRefreshToken();

    if (!refreshToken) return NextResponse.redirect(new URL("/login", url.origin));

    try {
        const tokens = await zalkera.refreshSession(refreshToken);
        await setCustomerTokens(tokens.accessToken, tokens.refreshToken);
        // 갱신 완료 — 원래 가려던 곳으로. r=1 은 "이미 갱신했다"는 표시(위 루프 가드).
        const to = new URL(next, url.origin);
        to.searchParams.set("r", "1");
        const response = NextResponse.redirect(to);
        setAuthHint(response, true);
        return response;
    } catch {
        // refresh 도 죽었다(30일 경과·세션 폐기·로그아웃) — 이제야 진짜 로그인이 필요하다.
        await clearCustomerTokens();
        const response = NextResponse.redirect(new URL("/login", url.origin));
        setAuthHint(response, false);
        return response;
    }
}

/** 내부 경로만 통과(파서 기반 판정 — `lib/oauth`). 판정 실패는 홈으로 떨어뜨린다. */
function safeNext(raw: string | null): string {
    return safeNextPath(raw) ?? "/";
}
