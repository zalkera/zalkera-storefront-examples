import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, readJsonBody} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * 주문 취소 — 로그인 고객(토큰) 또는 게스트(바디 phone). **미결제(PENDING_PAYMENT)만** 서버가
 * 허용한다(그 외는 NOT_CANCELABLE 409). 결제된 주문은 환불 경로라 여기서 못 무른다.
 *
 * phone 은 **바디로만** 받는다(URL 쿼리 금지 — 로그·리퍼러 유출 면). 마이페이지(OrderList)는 바디
 * 없이 POST 하므로 readJsonBody 가 null 이어도 400 을 내지 않는다(phone 없으면 undefined → 토큰 경로).
 */
export async function POST(req: Request, {params}: {params: Promise<{orderNo: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 주문 취소가 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    const body = await readJsonBody(req);
    const phone = body?.phone as string | undefined;
    if (!accessToken && !phone) return NextResponse.json({message: "로그인 또는 연락처가 필요합니다."}, {status: 401});
    const {orderNo} = await params;
    try {
        const order = await zalkera.cancelOrder(orderNo, {accessToken, phone, context: {clientIp: visitorIp(req.headers)}});
        const response = NextResponse.json(order);
        // 게스트(phone) 성공이 zalkera_authed 를 심으면 안 된다 — 회원 세션 성공에만 힌트를 갱신한다.
        if (accessToken) setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        if (response.status === 401) setAuthHint(response, false);
        return response;
    }
}
