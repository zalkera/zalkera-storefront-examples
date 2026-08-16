import {assetPath, asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 신뢰 — 고객 인용.
 *
 * **구조화 데이터(Review·AggregateRating)를 의도적으로 내보내지 않는다.** 자사 사이트에 실은 자사 후기에
 * 별점을 붙여 리치결과로 광고하는 것은 self-serving reviews 정책 위반이라 제재 대상이다.
 * 후기를 검색에 싣고 싶으면 제3자 플랫폼 리뷰가 답이지 우리 마크업이 아니다.
 */
export function TestimonialsSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({
            quote: asString(i.quote)?.trim(),
            author: asString(i.author)?.trim(),
            role: asString(i.role)?.trim(),
            asset: assetPath(i.asset),
        }))
        .filter((i) => i.quote);
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-12">
            {title && <h2 className="mb-6">{title}</h2>}
            <ul className="grid list-none gap-6 p-0 md:grid-cols-2">
                {items.map((item, i) => (
                    <li key={i} className="rounded-xl border border-border p-6">
                        <blockquote className="whitespace-pre-wrap">{item.quote}</blockquote>
                        {(item.author || item.asset) && (
                            <div className="mt-4 flex items-center gap-3">
                                {item.asset && (
                                    <img
                                        src={item.asset}
                                        alt=""
                                        loading="lazy"
                                        className="size-10 rounded-full object-cover"
                                    />
                                )}
                                <div className="text-sm">
                                    {item.author && <div className="font-semibold">{item.author}</div>}
                                    {item.role && <div className="text-muted">{item.role}</div>}
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
