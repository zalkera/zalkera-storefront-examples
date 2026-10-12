"use client";

import {rememberPendingPayment} from "@zalkera/client";
import {externalHref} from "@/lib/safeUrl";

/**
 * 결제 시작 문(`/api/checkout`·`/api/checkout/direct`·`/api/payment/session`)이 돌려주는 값 중 결제창을 여는 데
 * 쓰는 칸. 세 문이 같은 모양이다.
 */
export interface PaymentStart {
    orderNo: string;
    paymentUrl: string | null;
    /** 위젯형 벤더가 결제창을 띄우는 값(브라우저 노출이 전제된 값만). 리다이렉트형이면 `null`. */
    widget: Record<string, string> | null;
}

/** 위젯 결제 화면(`/payment/widget`)이 읽는 디스크립터 자리. 연락처는 여기 안 싣는다 — 아래 보관이 진다. */
export const WIDGET_DESCRIPTOR_KEY = "zalkera_payment_widget";

/**
 * **결제창으로 보낸다** — 위젯 유무로만 가른다(벤더 이름으로 가르지 않는다 · 벤더는 늘어난다).
 *  - 위젯형(토스): 디스크립터를 이 탭에 두고 `/payment/widget` 으로 — 그 화면이 결제창을 띄운다.
 *  - 리다이렉트형(결제사 결제창): `paymentUrl` 로 보낸다.
 *
 * 떠나기 **직전에** 구매자 연락처를 이 탭에 남긴다(`rememberPendingPayment`). 돌아온 화면(`/payment/complete`)이
 * 주문번호로 꺼내 확정에 싣는다 — 게스트의 확정은 연락처가 있어야 선다. URL 에 싣지 않는 이유는 결제사 로그·
 * 리퍼러·방문 기록에 개인정보가 남아서다.
 *
 * @returns 보냈으면 `true`. 결제창 주소가 없거나 http(s) 절대 주소가 아니거나 디스크립터를 못 두면 `false` — 화면이 말한다.
 */
export function goToPayment(start: PaymentStart, phone: string): boolean {
    rememberPendingPayment(start.orderNo, phone);
    if (start.widget) {
        try {
            sessionStorage.setItem(WIDGET_DESCRIPTOR_KEY, JSON.stringify({...start.widget, orderNo: start.orderNo}));
        } catch {
            return false;
        }
        window.location.href = "/payment/widget";
        return true;
    }
    // 서버가 준 주소지만 소독기를 태운다 — `javascript:` 같은 값으로 이 사이트에서 스크립트가 돌면 안 된다.
    const url = externalHref(start.paymentUrl);
    if (url === null) return false;
    window.location.href = url;
    return true;
}
