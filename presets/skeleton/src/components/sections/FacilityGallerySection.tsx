import {assetPath, asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 신뢰 — 물리 공간의 실물 사진 격자(진료실·매장·작업 공간).
 *
 * **사진이 하나도 없으면 안 그린다.** 제목만 남은 빈 격자는 「준비 중」으로 읽히는데 실제로는
 * 콘텐츠가 빠진 것이고, 그 둘이 화면에서 구분되지 않는다.
 */
export function FacilityGallerySection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({asset: assetPath(i.asset), caption: asString(i.caption)?.trim()}))
        .filter((i) => i.asset);
    if (items.length === 0) return null;

    const eyebrow = asString(c?.eyebrow)?.trim();
    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-12">
            {(eyebrow || title) && (
                <div className="mb-6">
                    {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
                    {title && <h2>{title}</h2>}
                </div>
            )}
            <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, i) => (
                    <li key={i} className="overflow-hidden rounded-xl bg-surface">
                        {/* 사진은 장식이 아니라 정보다 — 이름표가 있으면 대체 텍스트로 싣는다. */}
                        <img
                            src={item.asset}
                            alt={item.caption ?? ""}
                            loading="lazy"
                            className="aspect-[4/3] w-full object-cover"
                        />
                        {item.caption && <p className="px-4 py-3 text-center text-sm">{item.caption}</p>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
