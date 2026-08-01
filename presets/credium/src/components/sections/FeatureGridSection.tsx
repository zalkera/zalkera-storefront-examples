import {Icon} from "@/components/ui/Icon";
import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * CREDIUM 서비스 카드 — 원본 `sections/services.tsx` 의 카드 표현을 옮긴 것.
 * 정본과 **props 계약 동일**, 생김새만 다르다(둥근 카드·상단 아이콘 배지·hover 그림자).
 */
export function FeatureGridSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({icon: asString(i.icon), title: asString(i.title)?.trim(), body: asString(i.body)?.trim()}))
        .filter((i) => i.title);
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-16">
            {title && <h2 className="mb-8 text-2xl font-bold md:text-3xl">{title}</h2>}
            <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, i) => (
                    <li
                        key={i}
                        className="rounded-2xl bg-surface p-7 shadow-md transition-shadow hover:shadow-xl"
                    >
                        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary">
                            <Icon name={item.icon} className="size-6 text-white" />
                        </div>
                        <h3 className="mb-2 text-lg font-bold">{item.title}</h3>
                        {item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.body}</p>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
