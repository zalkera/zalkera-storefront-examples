import {ZalkeraError, type ShipmentInfo, visitorIp} from "@zalkera/client";
import {headers} from "next/headers";
import {parsePolicies} from "@/lib/commercePolicies";
import {formatDateTime} from "@/lib/datetime";
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

    // 무통장 대기 주문에만 계좌를 읽는다 — 다른 주문에서 사이트설정을 왕복할 이유가 없다.
    const awaitingDeposit = order.paymentMethod === "BANK_TRANSFER" && order.status === "PENDING_PAYMENT";
    const bank = awaitingDeposit
        ? parsePolicies(
              (await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null))?.commercePolicies ?? null,
          ).bankTransfer
        : undefined;

    return (
        <main className="py-8">
            <h1>주문 {order.orderNo}</h1>
            <p className="mt-2">
                상태: <strong>{order.status}</strong> · 결제금액 {order.totalAmount.toLocaleString()}원 ·{" "}
                {order.paymentMethod === "BANK_TRANSFER" ? "무통장입금" : "카드·간편결제"}
            </p>

            {/*
              무통장 입금 안내. **마감은 `order.paymentDueAt` 이 정본**이다 —
              `commercePolicies.bankTransfer.dueDays` 는 참고값이고 백엔드가 1~7일로 조여 적용하므로,
              그 값으로 날짜를 계산해 적으면 화면과 원장이 갈린다.
              ⚠ 계좌가 비어 있으면(설정이 지워졌다) **안내를 지어내지 않는다** — 문의 안내로 떨어진다.
            */}
            {awaitingDeposit && (
                <section className="mt-4 rounded-xl border border-border p-4">
                    <h2 className="m-0 text-base">입금 안내</h2>
                    {bank ? (
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                            <dt className="text-muted">입금 계좌</dt>
                            <dd className="m-0">
                                {bank.bankName} {bank.accountNo}
                                {bank.holder ? ` (예금주 ${bank.holder})` : ""}
                            </dd>
                            <dt className="text-muted">입금 금액</dt>
                            <dd className="m-0">{order.totalAmount.toLocaleString()}원</dd>
                            {order.paymentDueAt && (
                                <>
                                    <dt className="text-muted">입금 기한</dt>
                                    <dd className="m-0">{formatDateTime(order.paymentDueAt)}</dd>
                                </>
                            )}
                        </dl>
                    ) : (
                        <p className="mt-2 text-sm text-muted">
                            입금 계좌 안내가 준비되지 않았습니다. 판매자에게 문의해 주세요.
                        </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                        입금이 확인되면 주문 상태가 바뀝니다. 확인에는 영업일 기준 시간이 걸릴 수 있습니다.
                    </p>
                </section>
            )}
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
