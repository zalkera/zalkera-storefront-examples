import {LeadForm} from "@/components/LeadForm";
import {asString, readConfig} from "@zalkera/client";

/**
 * 행동 — 상담 신청. 폼 자체는 기존 [LeadForm] 을 그대로 쓴다(UTM·클릭ID 추적·레이트리밋 안내 포함).
 * 섹션은 제목·설명과 `interest`/`quick` 전달만 맡는다 — 전환 부품을 두 벌로 만들지 않는다.
 */
export function LeadCtaSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    const body = asString(c?.body)?.trim();
    const interest = asString(c?.interest)?.trim();
    const quick = c?.quick === true;

    // 안정 앵커 — 원페이지 랜딩의 히어로 CTA 가 `#lead` 로 여기를 가리킨다(계약·llms.txt §9).
    // 섹션이 여럿이면 첫 번째만 이 id 를 갖는 게 맞지만, HTML 중복 id 는 브라우저가 첫 요소로 해석하므로
    // 앵커 동작은 그대로다 — 렌더러가 순서를 세는 복잡도를 들이지 않는다.
    return (
        <section id="lead" className="mb-12 scroll-mt-8 rounded-xl bg-surface px-6 py-8">
            {title && <h2 className="mb-2">{title}</h2>}
            {body && <p className="mb-6 whitespace-pre-wrap text-muted">{body}</p>}
            <LeadForm interest={interest} quick={quick} />
        </section>
    );
}
