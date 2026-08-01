import {LeadForm} from "@/components/LeadForm";
import {asString, readConfig} from "@zalkera/client";

/**
 * CREDIUM 문의 — 원본 `sections/contact.tsx` 의 어두운 밴드 표현.
 * 폼 자체는 정본 `LeadForm`(리드 제출 계약)을 그대로 쓴다 — 표현만 우리 것이고 배선은 플랫폼 것이다.
 */
export function LeadCtaSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    const body = asString(c?.body)?.trim();
    const interest = asString(c?.interest)?.trim();

    return (
        <section className="mb-16 rounded-3xl bg-gradient-to-br from-primary to-secondary p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-2 md:items-start">
                <div className="text-white">
                    {title && <h2 className="mb-3 text-2xl font-bold md:text-3xl">{title}</h2>}
                    {body && <p className="whitespace-pre-wrap leading-relaxed opacity-90">{body}</p>}
                </div>
                <div className="rounded-2xl bg-background p-6">
                    <LeadForm interest={interest} />
                </div>
            </div>
        </section>
    );
}
