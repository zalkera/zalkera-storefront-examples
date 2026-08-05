import {visitorIp} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession, rotateCartSessionKey} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * 결제(주문 생성) → 결제 세션 생성. 재고 부족이면 409, 빈 카트면 400.
 * **벤더에 따라 두 갈래**(테넌트가 자기 PG 를 고른다 — 기본 TOSS): `widget` 이 오면 위젯형이라
 * 브라우저가 이 사이트에서 결제창을 띄우고 `/api/payment/confirm` 으로 승인을 확정한다. 없으면
 * 리다이렉트형이라 `paymentUrl` 로 보내면 끝이다. 어느 쪽이든 **결제 확정은 백엔드**가 한다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 실제 주문·결제 생성을 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 주문·결제가 비활성화됩니다."}, {status: 403});
    }
    const input = await readJsonBody(req); // {buyerName, buyerPhone, buyerEmail?, shipTo?}
    if (!input) return invalidBody();
    const session = await getShopSession();
    try {
        // 멱등키 = 장바구니 세션 키(쿠키라 재시도 간 안정). 더블클릭·네트워크 재시도가 같은 키를 들고
        // 가 원주문을 그대로 돌려받는다(새 주문·재차감 없음). **호출마다 새 키를 만들면 아무것도 못
        // 막는다** — 재시도가 서로 다른 키가 되기 때문.
        //
        // "카트 1개 → 주문 1건"은 저절로 참인 게 아니라 **아래 회전(rotateCartSessionKey)이 참으로
        // 만드는 명제**다 — 회전 없이 이 키를 쓰면 한 번 주문한 게스트가 30일간 재주문 불가다(§26).
        // 카트 쿠키가 없으면(예: 쿠키 없이 들어온 로그인 고객) 키 없이 종전 동작.
        const order = await zalkera.checkout(
            input,
            session,
            session.cartSessionKey ? `co-${session.cartSessionKey}` : undefined,
        );
        const payment = await zalkera.startPayment(order.orderNo, {
            accessToken: session.accessToken,
            phone: input.buyerPhone,
            context: {clientIp: visitorIp(req.headers)},
        });
        const response = NextResponse.json({
            orderNo: order.orderNo,
            status: order.status,
            paymentUrl: payment.paymentUrl,
            // 위젯형이면 결제창을 띄울 값(clientKey 등 — 브라우저 노출 전제값만 온다). 리다이렉트형은 없다.
            widget: payment.widget ?? null,
        });
        // **주문이 카트를 소비했으니 새 카트를 발급한다** — 이게 없으면 이 멱등키가 다음 주문을 영구히
        // 막는다(§26). 성공 응답에만 실리므로 실패·재시도 경로는 옛 키를 유지해 멱등이 그대로 선다.
        rotateCartSessionKey(response);
        // 로그인 고객의 성공 체크아웃이면 힌트를 갱신 — 게스트 체크아웃이면 손대지 않는다.
        if (session.accessToken) setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        // stale 힌트 정리: 로그인 토큰으로 호출했는데 401 이면 세션이 죽은 것 → 힌트를 비운다.
        if (session.accessToken && response.status === 401) setAuthHint(response, false);
        return response;
    }
}
