"use client";

import {useEffect, useState} from "react";

/**
 * 위젯형 벤더의 **성공 콜백 착지 페이지**.
 *
 * 결제창이 붙여준 파라미터(토스: `paymentKey`·`orderId`·`amount`)를 `/api/payment/confirm` 으로
 * 넘겨 승인을 확정한다. **이 화면이 "결제 성공"을 판단하지 않는다** — 확정은 백엔드가 PG 에
 * 직접 물어서 한다. 여기서 하는 건 그 호출을 트리거하고 주문 페이지로 보내는 것뿐이다.
 *
 * 새로고침해도 안전하다 — 이미 승인된 주문이면 백엔드가 조용히 통과시킨다(멱등).
 */
export default function PaymentCompletePage() {
    const [message, setMessage] = useState("결제를 확인하고 있습니다…");

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const orderNo = q.get("orderNo");
        if (!orderNo) {
            setMessage("주문 정보를 찾을 수 없습니다.");
            return;
        }
        // 벤더 콜백 파라미터를 통째로 넘긴다 — 무엇이 오는지는 벤더가 정한다.
        const params: Record<string, string> = {};
        q.forEach((v, k) => {
            if (k !== "orderNo") params[k] = v;
        });

        // **연락처를 상시 동반한다**. 승인 확정은 **게스트-충분 크리덴셜로
        // 완결돼야 한다** — 로그인 토큰은 15분이라 결제창에서 카드입력·3DS 로 지체하면 만료되는데,
        // 그때 토큰만 믿으면 결제창을 통과하고도 승인이 안 된다(실측 사고). 연락처는 주문 소유권의
        // 정본 크리덴셜이고(게스트 결제가 그 증거) 로그인 주문에도 통한다.
        // URL 이 아니라 디스크립터에서 읽는다 — 벤더에 PII 를 흘리지 않기 위해(widget 페이지 참조).
        let phone: string | undefined;
        try {
            const raw = sessionStorage.getItem("zalkera_payment_widget");
            if (raw) phone = (JSON.parse(raw) as {phone?: string}).phone;
        } catch {
            // 디스크립터가 깨졌어도 승인은 시도한다 — 로그인 토큰이 살아 있으면 그걸로 통과한다.
        }

        fetch("/api/payment/confirm", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({orderNo, ...params, ...(phone ? {phone} : {})}),
        })
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setMessage(body.message ?? "결제 확인에 실패했습니다.");
                    return;
                }
                // 주문 상태는 주문 페이지가 백엔드에서 다시 읽는다 — 이 화면이 정본이 아니다.
                // 게스트는 주문 조회에도 연락처가 필요하다(우리 사이트 안의 이동이라 벤더엔 안 샌다).
                const to = `/orders/${encodeURIComponent(orderNo)}`;
                window.location.href = phone ? `${to}?phone=${encodeURIComponent(phone)}` : to;
            })
            .catch(() => setMessage("결제 확인 중 오류가 발생했습니다."));
    }, []);

    return (
        <main className="py-8">
            <h1>결제 확인</h1>
            <p className="text-muted">{message}</p>
        </main>
    );
}
