"use client";

import {useState, useTransition} from "react";
import type {PaymentMethod} from "@zalkera/client";
import {Button} from "@/components/ui/Button";

/** 무통장 선택지를 낼지 결정하는 값 — 테넌트가 계좌를 채웠을 때만 온다(`page.tsx` 가 판정). */
export type BankTransferOffer = {bankName: string; accountNo: string; holder?: string};

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
 *
 * ── 무통장입금 ────────────────────────────────────────────────────────
 * **결제창을 안 연다.** 주문만 만들고 `/orders/{orderNo}` 로 보내면, 그 쪽이 계좌와 입금 마감
 * (`paymentDueAt`)을 보여 준다. 그래서 이 갈래는 `startPayment` 를 아예 안 탄다 — 태우면 백엔드가
 * 409 `NOT_PG_ORDER` 로 막는다.
 *
 * ⛔ **선택지는 테넌트가 계좌를 채웠을 때만 낸다.** 안 채웠는데 고르게 두면 고객이 정보를 다 넣고
 * 제출한 뒤에야 409 `BANK_TRANSFER_NOT_CONFIGURED` 를 본다.
 */
export function CheckoutForm({bankTransfer}: {bankTransfer: BankTransferOffer | null}) {
    const [form, setForm] = useState({buyerName: "", buyerPhone: "", buyerEmail: "", address1: ""});
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PG");
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
                    shipTo: form.address1
                        ? {name: form.buyerName, phone: form.buyerPhone, address1: form.address1}
                        : undefined,
                    // 계좌를 안 채운 테넌트에서는 선택지 자체가 없으므로 늘 "PG" 다.
                    paymentMethod: bankTransfer ? paymentMethod : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "결제에 실패했습니다.");
                return;
            }
            // 무통장 — 결제창이 없다. 계좌와 마감을 보여 주는 주문 상세로 보낸다.
            if (data.paymentMethod === "BANK_TRANSFER") {
                window.location.href = `/orders/${data.orderNo}`;
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
        <form onSubmit={submit} className="grid gap-3 max-w-sm">
            <input required placeholder="이름" value={form.buyerName} onChange={set("buyerName")} />
            <input
                required
                placeholder="연락처 (주문 조회에 사용)"
                value={form.buyerPhone}
                onChange={set("buyerPhone")}
            />
            <input placeholder="이메일 (선택)" value={form.buyerEmail} onChange={set("buyerEmail")} />
            <input placeholder="배송지 주소 (재화면)" value={form.address1} onChange={set("address1")} />

            {bankTransfer && (
                <fieldset className="grid gap-1 border-0 p-0">
                    <legend className="text-sm font-semibold">결제수단</legend>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="radio"
                            name="paymentMethod"
                            value="PG"
                            checked={paymentMethod === "PG"}
                            onChange={() => setPaymentMethod("PG")}
                        />
                        카드·간편결제
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="radio"
                            name="paymentMethod"
                            value="BANK_TRANSFER"
                            checked={paymentMethod === "BANK_TRANSFER"}
                            onChange={() => setPaymentMethod("BANK_TRANSFER")}
                        />
                        무통장입금
                    </label>
                    {paymentMethod === "BANK_TRANSFER" && (
                        <p className="text-xs text-muted">
                            주문 후 안내되는 계좌로 입금해 주세요. 입금이 확인되면 배송이 시작됩니다.
                        </p>
                    )}
                </fieldset>
            )}

            <Button type="submit" disabled={pending}>
                {pending ? "처리 중…" : paymentMethod === "BANK_TRANSFER" ? "주문하기" : "결제하기"}
            </Button>
            {error && <p className="text-danger text-sm">{error}</p>}
        </form>
    );
}
