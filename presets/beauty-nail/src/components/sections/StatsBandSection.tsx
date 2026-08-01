import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 신뢰 — 숫자로 말하는 실적 띠.
 *
 * `value` 를 문자열로 받는 이유: `1,200`·`99.9` 같은 표기를 렌더가 아니라 **편집자가** 정한다
 * (자릿수 구분·소수점 규칙이 업종마다 다르다).
 */
export function StatsBandSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({
            value: asString(i.value)?.trim(),
            label: asString(i.label)?.trim(),
            suffix: asString(i.suffix)?.trim(),
        }))
        .filter((i) => i.value && i.label);
    if (items.length === 0) return null;

    return (
        <section className="mb-12 rounded-xl bg-surface px-6 py-8">
            <dl className="grid gap-6 text-center sm:grid-cols-2 lg:grid-cols-4">
                {items.map((item, i) => (
                    <div key={i}>
                        <dt className="text-2xl font-semibold text-primary">
                            {item.value}
                            {item.suffix && <span className="text-lg">{item.suffix}</span>}
                        </dt>
                        <dd className="mt-1 text-sm text-muted">{item.label}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
