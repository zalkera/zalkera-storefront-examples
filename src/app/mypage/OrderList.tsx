"use client";

import {useEffect, useState, useTransition} from "react";
import type {OrderStatus, OrderSummary} from "@zalkera/client";
import {notifyAuthHintChange} from "@/lib/useAuthHint";
import {buttonClasses} from "@/components/ui/Button";

/**
 * 내 주문 목록 + 취소·구매확정 — 마이페이지 아일랜드.
 *
 * 예약(BookingList)과 대칭이다: 예약을 "잡고·보고·무를" 수 있으면 주문도 "사고·보고·무를(취소)·
 * 받고 확정할" 수 있어야 한다. W7 BookingList 와 완전 동형이라 그 선례의 교훈을 그대로 따른다:
 *  - 401 은 갱신 신호다(§24-3) — 로그인으로 내쫓지 않고 refresh 왕복
 *  - 오류는 `e.code`(BFF lib/http 가 code 로 싣는다) — errorCode 아님
 *  - 로드 실패와 빈 목록은 다른 사실이다(섞으면 장애를 정상으로 오표시)
 *  - 구매확정은 반품 창구를 닫으므로 confirm 선행
 */
export function OrderList() {
    const [orders, setOrders] = useState<OrderSummary[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const load = () => {
        setLoadError(false);
        void fetch("/api/orders/list")
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
            .then((page: {content: OrderSummary[]}) => setOrders(page.content))
            .catch(() => {
                setOrders([]);
                setLoadError(true);
            });
    };
    useEffect(load, []);

    const act = (orderNo: string, kind: "cancel" | "complete") => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/${kind}`, {method: "POST"});
            const data = await res.json().catch(() => null);
            if (res.ok) {
                setMessage(kind === "cancel" ? "주문을 취소했습니다." : "구매를 확정했습니다.");
                load();
                return;
            }
            // 401 은 갱신 신호다(§24-3) — 15분 토큰이 끊긴 것뿐이니 로그인으로 내쫓지 않는다.
            if (res.status === 401) {
                notifyAuthHintChange();
                window.location.href = "/api/auth/refresh?next=%2Fmypage";
                return;
            }
            // 상태가 이미 지나간 것(결제됨·미배송 등) — 서버가 판정한다. 재조회로 지금 상태를 보여준다.
            if (data?.code === "NOT_CANCELABLE" || data?.code === "NOT_COMPLETABLE") {
                setMessage("주문 상태가 바뀌어 처리할 수 없습니다. 목록을 새로고침했어요.");
                load();
                return;
            }
            setMessage(data?.message ?? "처리하지 못했습니다.");
        });
    };

    if (orders === null) return <p className="text-muted">주문을 불러오는 중…</p>;
    if (loadError) {
        return (
            <p className="text-muted">
                주문을 불러오지 못했습니다.{" "}
                <button type="button" onClick={load} className={LINK}>
                    다시 시도
                </button>
            </p>
        );
    }
    if (orders.length === 0) return <p className="text-muted">주문 내역이 없습니다.</p>;

    return (
        <div className="grid max-w-md gap-2">
            {orders.map((o) => (
                <div key={o.orderNo} className="rounded-lg border border-border p-3">
                    <div className="flex justify-between gap-3">
                        <div>
                            <a href={`/orders/${o.orderNo}`} className="font-semibold">
                                {o.orderNo}
                            </a>
                            <div className="text-sm text-muted">
                                {STATUS_LABEL[o.status] ?? o.status} · {o.totalAmount.toLocaleString()}원
                                {o.placedAt && ` · ${formatDate(o.placedAt)}`}
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            {/* 미결제만 취소 가능 — 결제된 주문은 환불 경로다(서버가 NOT_CANCELABLE 로 막는다). */}
                            {o.status === "PENDING_PAYMENT" && (
                                <button
                                    type="button"
                                    onClick={() => act(o.orderNo, "cancel")}
                                    disabled={pending}
                                    className={ACTION}
                                >
                                    취소
                                </button>
                            )}
                            {/* 배송완료만 구매확정 — 확정하면 반품 창구가 닫히므로 되묻는다. */}
                            {o.status === "DELIVERED" && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (confirm("구매를 확정하면 반품·교환이 마감됩니다. 확정할까요?"))
                                            act(o.orderNo, "complete");
                                    }}
                                    disabled={pending}
                                    className={ACTION}
                                >
                                    구매확정
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            {message && <p>{message}</p>}
        </div>
    );
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ko-KR", {year: "numeric", month: "numeric", day: "numeric"});

const STATUS_LABEL: Record<OrderStatus, string> = {
    PENDING_PAYMENT: "결제 대기",
    PAID: "결제 완료",
    SHIPPED: "배송 중",
    DELIVERED: "배송 완료",
    COMPLETED: "구매 확정",
    CANCELED: "취소됨",
    REFUNDED: "환불됨",
};

const ACTION = buttonClasses("outline", "px-3 py-1.5");
const LINK = "underline underline-offset-4";
