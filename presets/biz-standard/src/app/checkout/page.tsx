import {parsePolicies} from "@/components/JsonLd";
import {zalkera} from "@/lib/zalkera";
import {CheckoutForm} from "./CheckoutForm";

/**
 * 결제 화면 셸(RSC). **결제수단 선택지를 여기서 정한다** — 테넌트가 `commercePolicies.bankTransfer`
 * 에 계좌를 채웠을 때만 무통장 선택지가 폼에 간다.
 *
 * ⚠ 계좌를 **폼에 내려보내지 않는다.** 이 화면에서 계좌를 보여 줄 이유가 없고(주문 뒤에 안내한다),
 * 결제수단 선택에 필요한 것은 「계좌가 있다」는 사실뿐이다. 다만 은행·계좌번호는 사업자 수취
 * 계좌라 공개 사이트설정이 이미 나르는 값이라(개인 계좌가 아니다) 비밀은 아니다.
 */
export default async function CheckoutPage() {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const bank = parsePolicies(config?.commercePolicies ?? null).bankTransfer;
    const offer =
        bank?.bankName && bank.accountNo
            ? {bankName: bank.bankName, accountNo: bank.accountNo, holder: bank.holder}
            : null;

    return (
        <main className="py-8">
            <h1>결제</h1>
            <CheckoutForm bankTransfer={offer} />
        </main>
    );
}
