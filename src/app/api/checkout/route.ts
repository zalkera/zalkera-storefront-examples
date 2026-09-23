import {visitorIp, ZalkeraError} from "@zalkera/client";
import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession, rotateCartSessionKey} from "@/lib/session";
import {orderIdempotencyKey} from "@/lib/idempotency";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/** 결제 본문 길이 상한(글자). 정상 결제는 1천 자 안팎이고, 동의 문면을 여럿 실어도 이 안에 든다. */
const CHECKOUT_BODY_MAX_CHARS = 64 * 1024;

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
    // 미리보기 모드는 읽기전용 — 실제 주문·결제 생성을 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 주문·결제가 비활성화됩니다."}, {status: 403});
    }
    const input = await readJsonBody(req, CHECKOUT_BODY_MAX_CHARS); // {buyerName, buyerPhone, buyerEmail?, shipTo?}
    if (!input) return invalidBody();
    const session = await getShopSession();
    try {
        // 멱등키 = 「장바구니 키 + 본문 지문」(`orderIdempotencyKey`). 더블클릭·네트워크 재시도는 같은
        // 키로 원주문을 그대로 돌려받는다(새 주문·재차감 없음). **호출마다 새 키를 만들면 아무것도 못
        // 막는다** — 재시도가 서로 다른 키가 되기 때문.
        //
        // 🔴 카트 키만 쓰면 **내용을 고쳐 다시 낸 것**이 「같은 키 · 다른 본문」 409 가 되고, 카트 키는
        //    성공 응답에서만 돌므로 카트 쿠키 수명(30일)만큼 막힌다. 본문 지문을 섞어 그 409 를 없앤다.
        //    ⚠ 그래도 첫 시도가 이미 카트를 주문으로 넘겼으므로, 결제 시작이 실패한 뒤 **다시 담기 전에는**
        //    내용을 고쳐 내도 404(장바구니가 없습니다)다. 다시 담으면 새 카트·새 키로 선다.
        // "카트 1개 → 주문 1건"은 저절로 참인 게 아니라 **아래 회전(rotateCartSessionKey)이 참으로
        // 만드는 명제**다(§26). 카트 쿠키가 없으면(예: 쿠키 없이 들어온 로그인 고객) 키 없이 종전 동작.
        const order = await zalkera.checkout(
            input,
            // 방문자 IP 를 선언한다 — 안 넘기면 백엔드가 이 서버의 IP 를 받아, 청약 동의 증빙의 접속 IP 가
            // 방문자가 아니라 **사이트 서버**로 남는다(추가 전용 원장이라 못 고친다).
            {...session, context: {clientIp: visitorIp(req.headers)}},
            session.cartSessionKey ? orderIdempotencyKey(session.cartSessionKey, input) : undefined,
        );
        // ⛔ **무통장은 결제창을 안 연다.** `startPayment` 를 태우면 백엔드가 409 `NOT_PG_ORDER` 로
        //    막는다 — 그 주문은 운영자가 입금을 확인해 `PAID` 로 올린다. 화면은 주문 상세로 가서
        //    계좌와 `paymentDueAt` 을 본다.
        //    ⚠ 판정은 **주문이 돌려준 값**으로 한다(요청 값이 아니라) — 백엔드가 조여서 다르게
        //      선 경우에도 화면과 원장이 안 갈린다.
        if (order.paymentMethod === "BANK_TRANSFER") {
            const bankResponse = NextResponse.json({
                orderNo: order.orderNo,
                status: order.status,
                paymentMethod: order.paymentMethod,
                paymentDueAt: order.paymentDueAt,
                paymentUrl: null,
                widget: null,
            });
            rotateCartSessionKey(bankResponse);
            return bankResponse;
        }

        const payment = await zalkera.startPayment(order.orderNo, {
            accessToken: session.accessToken,
            phone: input.buyerPhone,
            context: {clientIp: visitorIp(req.headers)},
        });
        const response = NextResponse.json({
            orderNo: order.orderNo,
            status: order.status,
            paymentMethod: order.paymentMethod,
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
        // 멱등키가 본문 지문을 담으므로 내용을 고쳐 다시 내는 것은 여기로 안 온다 — 대표적으로
        // **같은 내용의 동시 제출**이고, 어느 쪽이든 이미 한 건이 접수된 뒤다.
        // ⚠ 좁은 갈래 하나는 안내문대로 해도 계속 여기로 온다 — 게스트로 낸 뒤 **로그인하고** 같은 내용으로
        //   다시 내면 키는 같은데 백엔드 지문(고객 신원 포함)이 달라진다. 그때는 다시 담아야 새 키가 선다.
        // ⛔ **카트 키를 돌리지 않는다** — 돌리면 담아 둔 것이 옛 키 아래 남아 사라진 것처럼 보이고,
        //    재시도는 두 번째 주문이 된다. 같은 내용으로 다시 내면 같은 키라 **원주문이 그대로 돌아온다.**
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
        // stale 힌트 정리: 로그인 토큰으로 호출했는데 401 이면 세션이 죽은 것 → 힌트를 비운다.
        if (session.accessToken && response.status === 401) setAuthHint(response, false);
        return response;
    }
}
