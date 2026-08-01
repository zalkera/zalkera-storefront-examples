import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 질문답변 — **`<details>` 아코디언**. JS 없이 열고 닫히므로 정적/ISR 이 그대로 유지된다
 * (클라이언트 컴포넌트로 만들면 이 섹션 때문에 페이지가 하이드레이션을 지고 간다).
 *
 * JSON-LD `FAQPage` 는 정본 골격이 이미 낸다 — 표현만 바꾸고 산출물 보장은 건드리지 않는다.
 */
export function FaqListSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({q: asString(i.question)?.trim(), a: asString(i.answer)?.trim()}))
        .filter((i) => i.q && i.a);
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-20">
            {title && (
                <h2 className="mb-12 text-center text-2xl font-bold tracking-[0.3em] md:text-3xl">{title}</h2>
            )}
            <div className="mx-auto max-w-3xl">
                {items.map((item, i) => (
                    <details key={i} className="group border-b border-border">
                        <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 font-semibold marker:content-['']">
                            <span>
                                <span className="mr-3 font-bold text-primary">Q</span>
                                {item.q}
                            </span>
                            <span className="shrink-0 text-muted transition-transform group-open:rotate-45" aria-hidden>
                                +
                            </span>
                        </summary>
                        <p className="whitespace-pre-wrap pb-5 pl-7 leading-relaxed text-muted">{item.a}</p>
                    </details>
                ))}
            </div>
        </section>
    );
}
