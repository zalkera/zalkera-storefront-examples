import {ZalkeraError, type ShipmentInfo, visitorIp} from "@zalkera/client";
import {headers} from "next/headers";
import {zalkera} from "@/lib/zalkera";
import {getAccessToken} from "@/lib/session";
import {OrderActions} from "./OrderActions";
import {ReviewForm} from "./ReviewForm";
import {routeParam} from "@/lib/routeParam";

/**
 * 주문 조회 (RSC). 로그인 고객은 토큰으로, 게스트는 ?phone=연락처로 조회한다.
 * 배송 정보도 함께 보여준다(있으면).
 */
export default async function OrderPage({
    params,
    searchParams,
}: {
    params: Promise<{orderNo: string}>;
    searchParams: Promise<{phone?: string}>;
}) {
    const {orderNo: rawParam} = await params;
    const orderNo = routeParam(rawParam);
    const {phone} = await searchParams;
    const accessToken = await getAccessToken();
    // ⚠️ 서버 사이드(RSC)라 백엔드가 보는 IP 는 방문자가 아니라 이 서버다. 선언하지 않으면 이 사이트의
    // 게스트 요청이 전부 한 IP 로 뭉친다 — 게스트 주문 인가의 **실패** rate-limit 이 그 IP 축을 쓰므로,
    // 남의 오입력이 쌓이면 내가 오타 한 번에 403 대신 429 를 받는다(IP 축은 성공을 안 막는다 —
    // 다만 주문번호 축은 별개다: 그 주문번호로 5회 실패가 쌓이면 연락처가 맞아도 10분간 429 다).
    // 그리고 스캐너 탐지가 주문번호 축 하나로 줄어든다.
    const access = {accessToken, phone, context: {clientIp: visitorIp(await headers())}};

    let order;
    try {
        order = await zalkera.getOrder(orderNo, access);
    } catch (error) {
        const msg = error instanceof ZalkeraError ? error.message : "조회 실패";
        return (
            <main className="py-8">
                <h1>주문 조회</h1>
                <p className="text-danger">{msg}</p>
                <p className="text-muted">
                    게스트는 주소에 <code>?phone=연락처</code> 를 붙여야 합니다.
                </p>
            </main>
        );
    }

    let shipment: ShipmentInfo | null = null;
    try {
        shipment = await zalkera.getShipment(orderNo, access);
    } catch {
        shipment = null; // 아직 출고 전이면 배송 정보 없음
    }

    return (
        <main className="py-8">
            <h1>주문 {order.orderNo}</h1>
            <p className="mt-2">
                상태: <strong>{order.status}</strong> · 결제금액 {order.totalAmount.toLocaleString()}원
            </p>
            {/* 취소·구매확정 아일랜드 — 회원(세션)·게스트(?phone=) 양쪽. 게스트는 phone 을 바디로 실어 BFF 로 보낸다. */}
            <OrderActions orderNo={order.orderNo} status={order.status} phone={phone} />
            <ul className="mt-4 divide-y divide-border list-none p-0">
                {order.items.map((it, i) => (
                    <li key={i} className="py-2">
                        {it.productName}
                        {it.variantLabel ? ` · ${it.variantLabel}` : ""} × {it.quantity} —{" "}
                        {it.lineTotal.toLocaleString()}원
                        {/* 후기는 **로그인 고객만**(작성이 로그인 전용) + 배송완료 이상 + 배송 상품(productId 존재)만.
                            게스트(?phone= 조회)에게 버튼을 내면 눌러서 401 로 튕기며 작성 내용을 잃는다.
                            SERVICE·예약금 라인은 productId=null 이라 자연 차단된다. */}
                        {accessToken &&
                            (order.status === "DELIVERED" || order.status === "COMPLETED") &&
                            it.productId != null && <ReviewForm productId={it.productId} orderItemId={it.id} />}
                    </li>
                ))}
            </ul>
            {shipment && (
                <section className="mt-8">
                    <h2>배송 — {shipment.status}</h2>
                    {shipment.carrierCode && (
                        <p className="text-muted">
                            {shipment.carrierCode} · {shipment.trackingNo}
                        </p>
                    )}
                    <ul className="mt-2 divide-y divide-border list-none p-0">
                        {shipment.events.map((e, i) => (
                            <li key={i} className="py-2">
                                {e.status} · {e.description} · {e.location}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
