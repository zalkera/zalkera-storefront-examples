"use client";

import {useState, useTransition} from "react";
import {Button} from "@/components/ui/Button";

/**
 * 결제 폼. 구매자 연락처는 게스트 주문 조회 크리덴셜이라 필수.
 *
 * 제출하면 주문 생성 + 결제 시작 → **벤더에 따라 두 갈래**(테넌트가 자기 PG 를 고른다 — 기본 TOSS):
 *  - **위젯형**(토스): `widget` 이 오면 `/payment/widget` 으로 보내 이 사이트에서 결제창을 띄우고,
 *    성공 콜백을 `/api/payment/confirm` 으로 넘겨 승인을 확정한다.
 *  - **리다이렉트형**(PayOneQ 등): `paymentUrl` 로 보내면 끝.
 *
 * 어느 쪽이든 **결제 확정은 백엔드**가 한다 — 이 화면의 성공/실패 표시는 UX 일 뿐 주문 완료 근거가
 * 아니다. 상태는 항상 `/orders/{orderNo}` 로 확인한다.
 */
export default function CheckoutPage() {
    const [form, setForm] = useState({buyerName: "", buyerPhone: "", buyerEmail: "", address1: ""});
    const [error, setError] = useState("");
    const [pending, startTransition] = useTransition();

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({...f, [k]: e.target.value}));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    buyerName: form.buyerName,
                    buyerPhone: form.buyerPhone,
                    buyerEmail: form.buyerEmail || undefined,
                    shipTo: form.address1 ? {name: form.buyerName, phone: form.buyerPhone, address1: form.address1} : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "결제에 실패했습니다.");
                return;
            }
            if (data.widget) {
                // 위젯형 — 디스크립터를 넘겨 결제창 페이지로. URL 이 아니라 sessionStorage 로 넘긴다
                // (새로고침·공유로 새지 않게). 어차피 금액은 서버가 저장값으로 PG 에 묻는다.
                sessionStorage.setItem(
                    "zalkera_payment_widget",
                    JSON.stringify({...data.widget, orderNo: data.orderNo, phone: form.buyerPhone}),
                );
                window.location.href = "/payment/widget";
                return;
            }
            // 리다이렉트형 — 결제창으로 이동. 실제 결제 확정은 백엔드 웹훅이 한다.
            window.location.href = data.paymentUrl;
        });
    };

    return (
        <main className="py-8">
            <h1>결제</h1>
            <form onSubmit={submit} className="grid gap-3 max-w-sm">
                <input required placeholder="이름" value={form.buyerName} onChange={set("buyerName")} />
                <input required placeholder="연락처 (주문 조회에 사용)" value={form.buyerPhone} onChange={set("buyerPhone")} />
                <input placeholder="이메일 (선택)" value={form.buyerEmail} onChange={set("buyerEmail")} />
                <input placeholder="배송지 주소 (재화면)" value={form.address1} onChange={set("address1")} />
                <Button type="submit" disabled={pending}>{pending ? "처리 중…" : "결제하기"}</Button>
                {error && <p className="text-danger text-sm">{error}</p>}
            </form>
        </main>
    );
}
