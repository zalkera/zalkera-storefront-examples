import {LeadForm} from "@/components/LeadForm";
import {asString, readConfig} from "@zalkera/client";

/** 문의 — 어두운 밴드 위 흰 카드. 폼 자체는 정본 `LeadForm`(리드 제출 계약) 그대로다. */
export function LeadCtaSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    const body = asString(c?.body)?.trim();
    const interest = asString(c?.interest)?.trim();

    return (
        <section className="-mx-4 mb-16 bg-foreground px-4 py-16 md:-mx-8 md:px-8">
            <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-2 md:items-start">
                <div className="text-background">
                    {title && <h2 className="mb-4 text-2xl font-bold md:text-3xl">{title}</h2>}
                    {body && <p className="whitespace-pre-wrap leading-relaxed text-background/80">{body}</p>}
                </div>
                <div className="bg-background p-6">
                    <LeadForm interest={interest} />
                </div>
            </div>
        </section>
    );
}
