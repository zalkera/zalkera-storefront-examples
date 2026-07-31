import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * 예약 취소 — 로그인 필수. 정원이 복원된다.
 *
 * **취소가 왜 최소 완결선에 드나**: 취소 없는 즉시-CONFIRMED 는 노쇼 제조기다 — 고객이 무를 방법이
 * 없으면 그냥 안 오고, 그걸 memo 53 스위퍼가 NO_SHOW 로 치우며 고객 이력에 낙인이 남는다.
 * 잡을 수 있으면 무를 수도 있어야 한다.
 *
 * **유료 예약은 고객이 못 취소한다**(`PAID_CANCEL_ADMIN_ONLY`) — 환불이 얽혀 매장 판단이 필요하다.
 * 클라이언트는 그 코드를 받으면 "매장에 문의" 안내를 띄운다.
 */
export async function DELETE(req: Request, {params}: {params: Promise<{code: string}>}) {
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 예약 취소가 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
        return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    }
    const {code} = await params;
    try {
        const message = await zalkera.cancelBooking(accessToken, code);
        const response = NextResponse.json({message});
        setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        if (response.status === 401) setAuthHint(response, false);
        return response;
    }
}
