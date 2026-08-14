import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, readJsonBody} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * 구매 확정 — 로그인 고객(토큰) 또는 게스트(바디 phone). **배송완료(DELIVERED)만** 서버가 허용한다
 * (그 외는 NOT_COMPLETABLE 409). 확정하면 반품 창구가 닫히므로 클라이언트가 confirm 을 한 번 받는다.
 *
 * phone 은 **바디로만** 받는다(URL 쿼리 금지). 마이페이지(OrderList)는 바디 없이 POST 하므로
 * readJsonBody 가 null 이어도 400 을 내지 않는다(phone 없으면 undefined → 토큰 경로).
 */
export async function POST(req: Request, {params}: {params: Promise<{orderNo: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 구매 확정이 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    const body = await readJsonBody(req);
    const phone = body?.phone as string | undefined;
    if (!accessToken && !phone) return NextResponse.json({message: "로그인 또는 연락처가 필요합니다."}, {status: 401});
    const {orderNo} = await params;
    try {
        const order = await zalkera.completeOrder(orderNo, {
            accessToken,
            phone,
            context: {clientIp: visitorIp(req.headers)},
        });
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
