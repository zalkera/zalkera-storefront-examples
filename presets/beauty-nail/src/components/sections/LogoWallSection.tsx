import Link from "next/link";
import {safeLinkUrl} from "@/lib/safeUrl";
import {assetPath, asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 신뢰 — 고객사·파트너 로고 나열.
 *
 * 로고는 **사용 허락이 있는 것만** 올려야 한다(타사 상표). 시드 팩에는 실제 기업 로고를 넣지 않는다.
 */
export function LogoWallSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({asset: assetPath(i.asset), name: asString(i.name)?.trim(), href: asString(i.href)}))
        .flatMap((i) => (i.asset == null ? [] : [{...i, asset: i.asset}]));
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-12">
            {title && <h2 className="mb-6">{title}</h2>}
            <ul className="flex list-none flex-wrap items-center gap-8 p-0">
                {items.map((item, i) => {
                    const logo = (
                        <img
                            src={item.asset}
                            alt={item.name ?? ""}
                            loading="lazy"
                            className="h-8 w-auto opacity-70 transition-opacity hover:opacity-100"
                        />
                    );
                    return (
                        <li key={i}>{item.href ? <Link href={safeLinkUrl(item.href)}>{logo}</Link> : logo}</li>
                    );
                })}
            </ul>
        </section>
    );
}
