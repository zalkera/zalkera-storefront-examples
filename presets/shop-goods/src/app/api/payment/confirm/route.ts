import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession} from "@/lib/session";
import {isPreview} from "@/lib/preview";

/**
 * 위젯형 벤더(토스 등)의 **승인 확정** BFF.
 *
 * 결제창이 성공 URL 로 돌려준 파라미터(`paymentKey` 등)를 그대로 백엔드에 넘긴다.
 *
 * **금액을 넘겨도 서버는 안 믿는다** — 서버가 저장한 주문 금액으로 PG 에 직접 묻는다. 그래서
 * 브라우저에서 금액을 조작해도 승인되지 않는다("브라우저 콜백을 신뢰하지 않는다" 불변식).
 *
 * 이미 승인된 주문(웹훅 선착)이면 백엔드가 조용히 통과시킨다 — 재호출이 안전하다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드는 읽기전용 — 실제 승인을 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 결제가 비활성화됩니다."}, {status: 403});
    }
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {orderNo, phone, ...providerParams} = body;
    const session = await getShopSession();
    try {
        await zalkera.confirmPayment(orderNo, providerParams, {
            accessToken: session.accessToken,
            phone,
            context: {clientIp: visitorIp(req.headers)},
        });
        return NextResponse.json({orderNo, confirmed: true});
    } catch (error) {
        return errorResponse(error);
    }
}
