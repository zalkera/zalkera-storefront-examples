import {Icon} from "@/components/ui/Icon";
import {asObjectArray, asString, readConfig} from "@zalkera/client";

/** 가치 — 강점 3~4단 그리드. 아이콘은 큐레이션 맵의 키만 유효하고 미지 이름은 생략된다. */
export function FeatureGridSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({icon: asString(i.icon), title: asString(i.title)?.trim(), body: asString(i.body)?.trim()}))
        .filter((i) => i.title);
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-12">
            {title && <h2 className="mb-6">{title}</h2>}
            <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, i) => (
                    <li key={i} className="grid gap-2">
                        <Icon name={item.icon} className="size-6 text-primary" />
                        <h3 className="font-semibold">{item.title}</h3>
                        {item.body && <p className="whitespace-pre-wrap text-sm text-muted">{item.body}</p>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
