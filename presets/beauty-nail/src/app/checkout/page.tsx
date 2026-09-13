import {parsePolicies} from "@/lib/commercePolicies";
import {zalkera} from "@/lib/zalkera";
import {CheckoutForm} from "./CheckoutForm";

/**
 * 결제 화면 셸(RSC). **결제수단 선택지를 여기서 정한다** — 테넌트가 `commercePolicies.bankTransfer`
 * 에 계좌를 채웠을 때만 무통장 선택지가 폼에 간다.
 *
 * ⛔ **폼에는 「있다/없다」만 내려보낸다.** 계좌 문자열을 넘기면 화면에 안 그려도 RSC 페이로드에
 * 실린다. 지금 값은 공개 사이트설정이라 비밀이 아니지만, 객체를 넘기는 형상이 서 있으면 다음 사람이
 * 비밀인 칸(가상계좌 발급 키 등)을 얹을 때 그대로 샌다. 그 형상은 `astGuards.test.ts` 가 잠근다.
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
