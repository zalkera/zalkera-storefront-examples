"use client";

import {useEffect, useRef, useState} from "react";
import {ANONYMOUS, loadTossPayments} from "@tosspayments/tosspayments-sdk";
import {Button} from "@/components/ui/Button";

type Widgets = ReturnType<Awaited<ReturnType<typeof loadTossPayments>>["widgets"]>;

/**
 * **위젯형 벤더의 결제창 페이지**(토스). 체크아웃이 세션을 만든 뒤 여기로 보낸다.
 *
 * 위젯은 렌더할 DOM(`#payment-method`·`#agreement`)이 있어야 하므로 전용 페이지가 필요하다 —
 * 리다이렉트형(PayOneQ)은 이 페이지를 안 거친다.
 *
 * 디스크립터(clientKey·orderId·amount·orderName)는 백엔드가 준 값을 sessionStorage 로 넘겨받는다
 * (URL 에 실으면 새로고침·공유로 새고, 금액을 URL 로 넘기는 모양새가 된다 — 어차피 **금액은 서버가
 * 저장값으로 PG 에 묻는다**).
 *
 * 결제 성공 시 토스가 `successUrl` 로 보내고, 거기서 confirm 이 승인을 확정한다.
 * **이 화면은 결제 성공을 판단하지 않는다.**
 */
export default function PaymentWidgetPage() {
    const [descriptor, setDescriptor] = useState<Record<string, string> | null | undefined>(undefined);
    const [ready, setReady] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const widgetsRef = useRef<Widgets | null>(null);
    const initOnce = useRef(false);

    // SSR hydration 불일치 방지 — 마운트 후 1회 동기.
    useEffect(() => {
        const raw = sessionStorage.getItem("zalkera_payment_widget");
        setDescriptor(raw ? (JSON.parse(raw) as Record<string, string>) : null);
    }, []);

    // 위젯 1회 초기화 — StrictMode 이중 마운트에도 한 번만(ref 가드).
    useEffect(() => {
        if (!descriptor || initOnce.current) return;
        initOnce.current = true;
        (async () => {
            try {
                const toss = await loadTossPayments(descriptor.clientKey);
                const widgets = toss.widgets({customerKey: ANONYMOUS});
                await widgets.setAmount({value: Number(descriptor.amount), currency: "KRW"});
                await Promise.all([
                    widgets.renderPaymentMethods({selector: "#payment-method", variantKey: "DEFAULT"}),
                    widgets.renderAgreement({selector: "#agreement"}),
                ]);
                widgetsRef.current = widgets;
                setReady(true);
            } catch (e) {
                console.error("[payment-widget] 초기화 실패", e);
                initOnce.current = false;
                setError("결제 위젯을 불러오지 못했습니다.");
            }
        })();
    }, [descriptor]);

    const pay = async () => {
        const widgets = widgetsRef.current;
        if (!widgets || !descriptor || paying) return;
        setPaying(true);
        setError(null);
        try {
            const origin = window.location.origin;
            // **연락처를 successUrl 에 싣지 않는다**(memo 50 §24-2) — 이 URL 은 벤더가 리다이렉트로
            // 되돌려주는 주소라 PII 가 벤더 로그·리퍼러·브라우저 히스토리에 남는다. 착지 페이지는
            // 같은 sessionStorage 디스크립터에서 연락처를 직접 읽는다(브라우저 안에 머문다).
            const q = `orderNo=${encodeURIComponent(descriptor.orderNo)}`;
            await widgets.requestPayment({
                orderId: descriptor.orderId,
                orderName: descriptor.orderName,
                successUrl: `${origin}/payment/complete?${q}`,
                failUrl: `${origin}/checkout?failed=1`,
            });
        } catch (e) {
            // 결제창 닫음(USER_CANCEL)은 정상 흐름이라 조용히 무시.
            if ((e as {code?: string})?.code !== "USER_CANCEL") {
                setError("결제를 진행하지 못했습니다.");
            }
        } finally {
            setPaying(false);
        }
    };

    if (descriptor === undefined)
        return (
            <main className="py-8">
                <p>불러오는 중…</p>
            </main>
        );
    if (descriptor === null) {
        return (
            <main className="py-8">
                <h1>결제 정보를 찾을 수 없습니다</h1>
                <p>결제를 처음부터 다시 시작해 주세요.</p>
                <a href="/checkout">결제 페이지로</a>
            </main>
        );
    }

    return (
        <main className="py-8">
            <h1>결제</h1>
            <div id="payment-method" />
            <div id="agreement" />
            <Button onClick={pay} disabled={!ready || paying}>
                {paying ? "처리 중…" : `${Number(descriptor.amount).toLocaleString()}원 결제하기`}
            </Button>
            {error && <p className="text-danger mt-2">{error}</p>}
        </main>
    );
}
