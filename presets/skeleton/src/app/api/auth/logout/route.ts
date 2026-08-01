import {NextResponse} from "next/server";
import {assertSameOrigin} from "@/lib/http";
import {zalkera} from "@/lib/zalkera";
import {clearCustomerTokens, getAccessToken} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";

/** 로그아웃 — 백엔드 세션 폐기 + 쿠키 삭제. */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const accessToken = await getAccessToken();
    if (accessToken) {
        await zalkera.logout(accessToken).catch(() => undefined);
    }
    await clearCustomerTokens();
    const response = NextResponse.json({ok: true});
    // 세션 종료 → 낙관적 로그인 힌트도 비운다(헤더가 즉시 익명 크롬으로 돌아가게).
    setAuthHint(response, false);
    return response;
}
