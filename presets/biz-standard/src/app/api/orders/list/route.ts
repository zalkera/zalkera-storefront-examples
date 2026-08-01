import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";

/** 내 주문 목록 — 로그인 필수. 마이페이지 아일랜드가 부른다(취소·확정으로 바뀌어 서버 렌더가 아니다). */
export async function GET() {
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    try {
        const orders = await zalkera.listMyOrders(accessToken, {page: 0, size: 20});
        // 볼라틸(상태가 바뀐다) — 캐시 금지.
        return NextResponse.json(orders, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        const response = errorResponse(error);
        if (response.status === 401) setAuthHint(response, false);
        return response;
    }
}
