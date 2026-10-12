import {visitorIp, ZalkeraError} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession} from "@/lib/session";
import {buyNowIdempotencyKey} from "@/lib/idempotency";
import {checkoutAttempt} from "@/lib/checkoutAttempt";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/** 바로 구매 본문 길이 상한(글자) — 장바구니 결제와 같은 값. 멱등키가 본문을 한 번 더 훑는다. */
const DIRECT_CHECKOUT_BODY_MAX_CHARS = 64 * 1024;

/**
 * **바로 구매**(장바구니 없는 주문 생성) → 결제 세션 생성. 라이브 방송 쪽(`/live/[id]`)의 「바로 구매」가 부른다.
 * 본문은 `{items: [{variantId, quantity}], sourceLiveEventId?, checkout: {buyerName, buyerPhone, …}}` 이고 그대로
 * 넘긴다 — 방송 상태·편성·한정 수량·재고는 서버가 결제 때 판정한다.
 *
 * 응답·결제 시작은 장바구니 결제(`/api/checkout`)와 같다 — `widget` 이 오면 위젯형, 없으면 `paymentUrl` 로.
 * 다른 점은 **카트를 안 건드린다**는 것 하나다: 카트 키를 멱등키 재료로 쓰지 않고(`buyNowIdempotencyKey` 머리말),
 * 성공해도 카트 쿠키를 돌리지 않는다(돌리면 담아 둔 카트가 사라진 것처럼 보인다).
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 미리보기 모드는 읽기전용 — 실제 주문·결제 생성을 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 주문·결제가 비활성화됩니다."}, {status: 403});
    }
    const input = await readJsonBody(req, DIRECT_CHECKOUT_BODY_MAX_CHARS);
    if (!input) return invalidBody();
    const session = await getShopSession();
    // 시도 id — 같은 폼의 재시도는 같은 값이라 같은 키가 되어 원주문이 돌아온다. 없으면 키 없이 보낸다.
    const attempt = checkoutAttempt(req.headers);
    try {
        const order = await zalkera.buyNow(
            input,
            // 방문자 IP 를 선언한다 — 청약 동의 증빙의 접속 IP 가 된다(추가 전용 원장이라 못 고친다).
            {...session, context: {clientIp: visitorIp(req.headers)}},
            attempt ? buyNowIdempotencyKey(attempt, input) : undefined,
        );
        // 무통장은 결제창을 안 연다(장바구니 결제와 같다) — 판정은 주문이 돌려준 값으로 한다.
        if (order.paymentMethod === "BANK_TRANSFER") {
            return NextResponse.json({
                orderNo: order.orderNo,
                status: order.status,
                paymentMethod: order.paymentMethod,
                paymentDueAt: order.paymentDueAt,
                paymentUrl: null,
                widget: null,
            });
        }
        const payment = await zalkera.startPayment(order.orderNo, {
            accessToken: session.accessToken,
            phone: input.checkout.buyerPhone,
            context: {clientIp: visitorIp(req.headers)},
        });
        const response = NextResponse.json({
            orderNo: order.orderNo,
            status: order.status,
            paymentMethod: order.paymentMethod,
            paymentUrl: payment.paymentUrl,
            widget: payment.widget ?? null,
        });
        if (session.accessToken) setAuthHint(response, true);
        return response;
    } catch (error) {
        // 같은 시도 id 로 내용을 바꾸면 키가 달라지므로 여기로 안 온다 — 같은 내용의 동시 제출이다.
        if (error instanceof ZalkeraError && error.code === "IDEMPOTENCY_CONFLICT") {
            return NextResponse.json(
                {
                    message:
                        "처리 중인 주문이 있습니다. 잠시 후 같은 내용으로 다시 눌러 주세요 — 이미 접수됐다면 그 주문을 그대로 이어 갑니다.",
                    code: error.code,
                },
                {status: 409},
            );
        }
        const response = errorResponse(error);
        if (session.accessToken && response.status === 401) setAuthHint(response, false);
        return response;
    }
}
