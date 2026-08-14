import type {Metadata} from "next";
import {zalkera} from "@/lib/zalkera";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {parsePolicies} from "@/components/JsonLd";

/**
 * 구매 정책 페이지 (RSC · ISR) — 환불·교환·배송·A/S.
 *
 * **두 가지를 동시에 만족한다**: 사람에게는 전자상거래법이 요구하는 거래조건 표시면이고, 기계에게는
 * 상품 상세의 `MerchantReturnPolicy` JSON-LD 와 같은 사실을 말하는 근거 페이지다(둘의 출처가 하나라
 * 갈라지지 않는다).
 *
 * **금액은 `defaultReturnShippingFee`(운영 값)만 쓴다** — 정책 JSON 문구에 금액을 적지 않는 이유가
 * 이것이다. 여기 쓰인 반품 배송비는 실제 환불에서 차감되는 바로 그 값이다.
 *
 * 미설정 테넌트도 페이지가 살아야 하므로(사업자 정보는 항상 표시 대상) 정책이 비면 그 절만 생략한다.
 */
export const dynamic = "force-static";
export const revalidate = 600;

/**
 * sitemap 등재 라우트인데 제목이 없으면 루트 layout 의 상호를 그대로 상속해 **홈과 같은 제목**으로
 * 검색·탭에 잡힌다(중복 제목). 고정 문구라 백엔드 조회 없이 박는다.
 */
export async function generateMetadata(): Promise<Metadata> {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const title = "구매 정책";
    return {
        title,
        ...pageMetadata({
            ogTitle: withSiteName(title, config?.companyName),
            path: "/policies",
            siteName: config?.companyName,
        }),
    };
}

export default async function PoliciesPage() {
    // site-config 태그 — 관리자가 정책을 고치면 백엔드가 이 태그로 이 페이지를 콕 집어 무효화한다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    if (!config)
        return (
            <main className="py-8">
                <h1>구매 정책</h1>
                <p>정보를 불러오지 못했습니다.</p>
            </main>
        );

    const policies = parsePolicies(config.commercePolicies);
    const fee = config.defaultReturnShippingFee;
    const sections = [
        {title: "반품·환불", body: policies.returns?.notes, extra: reelExtra(policies.returns?.windowDays, fee)},
        {title: "교환", body: policies.exchange?.notes},
        {title: "배송", body: policies.shipping?.notes},
        {title: "A/S", body: policies.as?.notes},
    ].filter((s) => s.body || s.extra);

    return (
        <main className="py-8">
            <h1>구매 정책</h1>

            {sections.length === 0 ? (
                <p className="text-muted">등록된 정책이 없습니다.</p>
            ) : (
                <div className="space-y-5">
                    {sections.map((s) => (
                        <section key={s.title} className="space-y-1">
                            <h2>{s.title}</h2>
                            {s.extra && <p>{s.extra}</p>}
                            {s.body && <p className="whitespace-pre-wrap">{s.body}</p>}
                        </section>
                    ))}
                </div>
            )}

            {/* 사업자 정보 — 정책 유무와 무관하게 표시 대상이다. */}
            <section className="mt-8 pt-4 border-t border-border text-muted text-sm space-y-1">
                <h2 className="text-base">사업자 정보</h2>
                <p>{config.companyName}</p>
                {config.ceoName && <p>대표: {config.ceoName}</p>}
                {config.bizRegNo && <p>사업자등록번호: {config.bizRegNo}</p>}
                {config.address && <p>{config.address}</p>}
                {config.tel && <p>전화: {config.tel}</p>}
                {config.email && <p>이메일: {config.email}</p>}
            </section>
        </main>
    );
}

/** 기간·반품비를 사람 문장으로. 둘 다 없으면 생략(문구는 테넌트의 notes 가 말한다). */
function reelExtra(windowDays?: number, fee?: number | null): string | undefined {
    const parts: string[] = [];
    if (windowDays != null) parts.push(`수령 후 ${windowDays}일 이내 반품 가능`);
    if (fee != null) parts.push(fee > 0 ? `반품 배송비 ${fee.toLocaleString()}원` : "반품 배송비 무료");
    return parts.length ? parts.join(" · ") : undefined;
}
