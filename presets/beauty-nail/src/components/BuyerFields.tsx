import type {CheckoutInput} from "@zalkera/client";

/**
 * **구매자 칸** — 장바구니 결제(`CheckoutForm`)와 바로 구매(`BuyNowForm`)가 같이 쓴다. 칸이 두 벌이면 한쪽에만
 * 새 칸(동의·배송 메모 등)이 붙어 두 결제가 다른 주문을 만든다.
 *
 * 연락처는 **게스트 주문 조회 크리덴셜**이라 필수다 — 비회원은 이 번호로만 자기 주문을 다시 본다.
 * 훅이 없는 표시 컴포넌트다 — 상태는 부르는 폼이 든다(두 폼 다 클라이언트 컴포넌트).
 */
export interface BuyerForm {
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    address1: string;
}

export const EMPTY_BUYER: BuyerForm = {buyerName: "", buyerPhone: "", buyerEmail: "", address1: ""};

/** 폼 값 → 결제 입력의 구매자·배송지 칸. 빈 선택 칸은 싣지 않는다(빈 문자열이 서버에 값으로 남지 않게). */
export function buyerCheckout(
    form: BuyerForm,
): Pick<CheckoutInput, "buyerName" | "buyerPhone" | "buyerEmail" | "shipTo"> {
    return {
        buyerName: form.buyerName,
        buyerPhone: form.buyerPhone,
        buyerEmail: form.buyerEmail || undefined,
        shipTo: form.address1 ? {name: form.buyerName, phone: form.buyerPhone, address1: form.address1} : undefined,
    };
}

export function BuyerFields({value, onChange}: {value: BuyerForm; onChange: (next: BuyerForm) => void}) {
    const set = (k: keyof BuyerForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({...value, [k]: e.target.value});
    return (
        <>
            <input
                required
                aria-label="이름"
                placeholder="이름"
                autoComplete="name"
                value={value.buyerName}
                onChange={set("buyerName")}
            />
            <input
                required
                aria-label="연락처"
                placeholder="연락처 (주문 조회에 사용)"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={value.buyerPhone}
                onChange={set("buyerPhone")}
            />
            <input
                aria-label="이메일"
                placeholder="이메일 (선택)"
                inputMode="email"
                autoComplete="email"
                value={value.buyerEmail}
                onChange={set("buyerEmail")}
            />
            <input
                aria-label="배송지 주소"
                placeholder="배송지 주소 (재화면)"
                autoComplete="street-address"
                value={value.address1}
                onChange={set("address1")}
            />
        </>
    );
}
