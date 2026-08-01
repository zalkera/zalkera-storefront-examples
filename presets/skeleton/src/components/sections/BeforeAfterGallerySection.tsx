import {assetPath, asObjectArray, asString, readConfig} from "@zalkera/client";

type GalleryConfig = Record<string, unknown>;

interface GalleryItem {
    beforeAsset: string;
    afterAsset: string;
    caption?: string;
}

/** 시술 전후 갤러리 — 뷰티 차별화의 핵심 섹션. */
export function BeforeAfterGallerySection({config}: {config: unknown}) {
    const c = readConfig<GalleryConfig>(config);
    // 짝이 갖춰진 항목만 — 한쪽만 있으면 "전후"가 아니다. 형상이 다른 값은 여기서 걸러진다.
    const items: GalleryItem[] = asObjectArray(c?.items).flatMap((raw) => {
        const before = assetPath(raw.beforeAsset);
        const after = assetPath(raw.afterAsset);
        return before && after ? [{beforeAsset: before, afterAsset: after, caption: asString(raw.caption)}] : [];
    });
    if (items.length === 0) return null;

    return (
        <section className="mb-12">
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                {items.map((item, i) => (
                    <figure key={i} className="m-0">
                        <div className="flex gap-1">
                            <img
                                src={item.beforeAsset}
                                alt={item.caption ? `${item.caption} 전` : "시술 전"}
                                loading="lazy"
                                className="w-1/2 aspect-square object-cover rounded"
                            />
                            <img
                                src={item.afterAsset}
                                alt={item.caption ? `${item.caption} 후` : "시술 후"}
                                loading="lazy"
                                className="w-1/2 aspect-square object-cover rounded"
                            />
                        </div>
                        {item.caption && (
                            <figcaption className="text-sm text-muted mt-1.5">{item.caption}</figcaption>
                        )}
                    </figure>
                ))}
            </div>
        </section>
    );
}
