import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession} from "@/lib/session";
import {isPreview} from "@/lib/preview";

/** 본문 길이 상한(글자) — 주문번호와 연락처뿐이다. */
const PAYMENT_SESSION_BODY_MAX_CHARS = 4 * 1024;

/**
 * **「다시 결제」** — 미결제 주문의 결제창을 **같은 주문번호로** 다시 연다. 새 주문을 만들지 않는다.
 *
 * 결제창에서 돌아왔는데 결제가 안 된 주문(확정이 `PAYMENT_CONFIRM_FAILED` — 결제창을 닫았거나 거절됐다)에서 복귀
 * 화면(`/payment/complete`)이 부른다. 응답 모양은 결제 문들과 같다(`widget` 이 오면 위젯형, 없으면 `paymentUrl`).
 *
 * 게스트는 본문의 `phone`(주문 때 남긴 연락처)으로 주인을 확인한다 — URL 쿼리로 받지 않는다(방문 기록·리퍼러).
 * 이미 결제된 주문이면 서버가 409 로 막는다(그 응답을 그대로 넘긴다).
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 결제가 비활성화됩니다."}, {status: 403});
    }
    const body = await readJsonBody(req, PAYMENT_SESSION_BODY_MAX_CHARS);
    if (!body || typeof body.orderNo !== "string" || body.orderNo.trim() === "") return invalidBody();
    const orderNo: string = body.orderNo;
    const phone = typeof body.phone === "string" && body.phone.trim() !== "" ? body.phone : undefined;
    const session = await getShopSession();
    try {
        const payment = await zalkera.startPayment(orderNo, {
            accessToken: session.accessToken,
            phone,
            context: {clientIp: visitorIp(req.headers)},
        });
        return NextResponse.json({orderNo, paymentUrl: payment.paymentUrl, widget: payment.widget ?? null});
    } catch (error) {
        return errorResponse(error);
    }
}
