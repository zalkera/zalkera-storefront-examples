import {parsePolicies} from "@/lib/commercePolicies";
import {zalkera} from "@/lib/zalkera";
import {CheckoutForm} from "./CheckoutForm";

/**
 * 결제 화면 셸(RSC). **결제수단 선택지를 여기서 정한다** — 테넌트가 `commercePolicies.bankTransfer`
 * 에 계좌를 채웠을 때만 무통장 선택지가 폼에 간다.
 *
 * ⛔ **폼에는 「있다/없다」만 내려보낸다.** 계좌 문자열을 넘기면 화면에 안 그려도 RSC 페이로드에
 * 실린다 — 3.5.0 심의가 기능·보안 두 축에서 그것을 잡았다(내가 「안 내려보낸다」고 적어 놓고
 * 객체를 넘겼다). 지금 값은 공개 사이트설정이라 비밀이 아니지만, 그 주석을 근거로 다음 사람이
 * 비밀인 칸(가상계좌 발급 키 등)을 얹으면 그때 샌다. **주석이 참이 되게 코드를 고쳤다.**
 */
export default async function CheckoutPage() {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    // 절이 성립하면 세 칸이 다 있다(`bankTransferSection` 이 그것을 보장한다) — 여기서 다시 안 센다.
    const bankTransferAvailable = parsePolicies(config?.commercePolicies ?? null).bankTransfer !== undefined;

    return (
        <main className="py-8">
            <h1>결제</h1>
            <CheckoutForm bankTransferAvailable={bankTransferAvailable} />
        </main>
    );
}
