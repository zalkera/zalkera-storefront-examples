"use client";

import {useState, useTransition} from "react";
import type {OrderStatus} from "@zalkera/client";
import {notifyAuthHintChange} from "@/lib/useAuthHint";
import {buttonClasses} from "@/components/ui/Button";

/**
 * 주문 상세의 취소·구매확정 아일랜드 — 회원(세션 토큰)과 게스트(?phone=) 양쪽에서 동작한다.
 *
 * 마이페이지 OrderList.act() 와 동형이되 게스트 조회를 지원한다: 게스트는 phone 을 **바디로** 실어
 * BFF 가 회원 세션 없이도 취소·확정하게 한다(URL 쿼리로 안 보낸다 — 로그·리퍼러 유출 면). 성공하면
 * RSC 를 다시 굽기 위해 리로드한다(?phone= URL 을 그대로 유지). 401 은 갱신 신호라 refresh 로 왕복한다
 * (마이페이지와 달리 next 에 현재 경로+search 를 실어 게스트 조회 컨텍스트를 잃지 않는다).
 */
export function OrderActions({orderNo, status, phone}: {orderNo: string; status: OrderStatus; phone?: string}) {
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const act = (kind: "cancel" | "complete") => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/${kind}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(phone ? {phone} : {}),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                // RSC 재조회 — 바뀐 상태를 서버 진실로 다시 굽는다(?phone= URL 유지).
                window.location.reload();
                return;
            }
            // 401 은 갱신 신호다(§24-3) — 로그인으로 내쫓지 않고 refresh 왕복. 현재 경로+search 를 실어
            // 게스트 조회(?phone=) 컨텍스트를 잃지 않는다.
            if (res.status === 401) {
                notifyAuthHintChange();
                window.location.href = `/api/auth/refresh?next=${encodeURIComponent(location.pathname + location.search)}`;
                return;
            }
            // 상태가 이미 지나간 것 — 서버가 판정한다. 재조회로 지금 상태를 보여준다.
            if (data?.code === "NOT_CANCELABLE" || data?.code === "NOT_COMPLETABLE") {
                setMessage("주문 상태가 바뀌어 처리할 수 없습니다.");
                window.location.reload();
                return;
            }
            setMessage(data?.message ?? "처리하지 못했습니다.");
        });
    };

    if (status !== "PENDING_PAYMENT" && status !== "DELIVERED") return null;

    return (
        <div className="my-3 flex items-center gap-2">
            {/* 미결제만 취소 가능 — 결제된 주문은 환불 경로다(서버가 NOT_CANCELABLE 로 막는다). */}
            {status === "PENDING_PAYMENT" && (
                <button type="button" onClick={() => act("cancel")} disabled={pending} className={ACTION}>
                    취소
                </button>
            )}
            {/* 배송완료만 구매확정 — 확정하면 반품 창구가 닫히므로 되묻는다. */}
            {status === "DELIVERED" && (
                <button
                    type="button"
                    onClick={() => {
                        if (confirm("구매를 확정하면 반품·교환이 마감됩니다. 확정할까요?")) act("complete");
                    }}
                    disabled={pending}
                    className={ACTION}
                >
                    구매확정
                </button>
            )}
            {message && <p className="m-0 text-danger">{message}</p>}
        </div>
    );
}

const ACTION = buttonClasses("outline", "px-3 py-1.5");
