import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * 예약 생성 — **로그인 필수**(게스트 예약 없음. 백엔드가 401 로 막는다).
 *
 * **결제는 신설하지 않는다.** 유료·예약금 예약이면 `booking.orderNo` 가 실려 오고, 그 orderNo 로
 * `startPayment` 를 부르면 **체크아웃과 완전히 같은 결제 흐름**이 된다(위젯형/리다이렉트형 분기까지).
 * 그래서 이 라우트는 `/api/checkout` 과 같은 모양으로 응답한다 — 클라이언트가 기존 관용구를 그대로 쓴다.
 *
 * 무료 예약은 orderNo=null 이고 이미 `CONFIRMED` 라 결제 단계가 없다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 실제 예약·결제 생성을 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 예약이 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
        // 백엔드도 401 을 주지만, 여기서 끊으면 왕복 한 번을 아끼고 클라이언트가 로그인 유도로 분기한다.
        return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    }

    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {slotId, quantity, contactName, contactPhone} = body;
    try {
        const booking = await zalkera.createBooking(accessToken, {
            slotId: Number(slotId),
            quantity: Number(quantity) || 1,
            contactName: contactName || undefined,
            contactPhone: contactPhone || undefined,
        });

        // 무료 예약 — 결제가 없다. 즉시 확정이라 바로 알려준다.
        if (!booking.orderNo) {
            const response = NextResponse.json({booking, paymentUrl: null, widget: null});
            setAuthHint(response, true);
            return response;
        }

        // 유료·예약금 — 기존 결제 흐름에 그대로 얹는다(체크아웃 라우트와 동형).
        const payment = await zalkera.startPayment(booking.orderNo, {
            accessToken,
            context: {clientIp: visitorIp(req.headers)},
        });
        const response = NextResponse.json({
            booking,
            orderNo: booking.orderNo,
            paymentUrl: payment.paymentUrl,
            // 위젯형이면 결제창을 띄울 값. 리다이렉트형은 없다 — 클라이언트는 이 유무로만 분기한다.
            widget: payment.widget ?? null,
        });
        setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        // stale 힌트 정리: 토큰으로 불렀는데 401 이면 세션이 죽은 것 → 힌트를 비운다.
        if (response.status === 401) setAuthHint(response, false);
        return response;
    }
}
