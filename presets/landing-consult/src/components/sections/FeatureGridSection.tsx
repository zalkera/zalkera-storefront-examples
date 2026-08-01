import {Icon} from "@/components/ui/Icon";
import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 진행 단계 — **번호가 붙은 순서**로 그린다. 정본의 FEATURE_GRID 는 강점을 나열하는 격자인데,
 * 상담 랜딩에서 같은 데이터는 "무엇을 어떤 순서로 하는가"를 뜻한다. 배열 순서가 곧 단계 번호다.
 *
 * 제목의 슬래시(`진/행/방/법`)는 원본이 쓰던 장치다 — 글자 사이를 벌려 표제처럼 보이게 한다.
 * 문구 자체가 그렇게 들어오므로 컴포넌트는 자간만 넓힌다.
 */
export function FeatureGridSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({icon: asString(i.icon), title: asString(i.title)?.trim(), body: asString(i.body)?.trim()}))
        .filter((i) => i.title);
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section id="steps" className="mb-20">
            {title && (
                <h2 className="mb-12 text-center text-2xl font-bold tracking-[0.3em] md:text-3xl">{title}</h2>
            )}
            <ol className="grid list-none gap-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((item, i) => (
                    <li key={i} className="relative border border-border p-8 text-center">
                        <span className="mb-4 inline-flex size-12 items-center justify-center bg-foreground text-lg font-bold text-background">
                            {i + 1}
                        </span>
                        <div className="mb-3 flex justify-center">
                            <Icon name={item.icon} className="size-6 text-primary" />
                        </div>
                        <h3 className="mb-2 font-bold">{item.title}</h3>
                        {item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.body}</p>}
                    </li>
                ))}
            </ol>
        </section>
    );
}
