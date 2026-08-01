import Link from "next/link";
import {safeLinkUrl} from "@/lib/safeUrl";
import {assetPath, asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * CREDIUM 포트폴리오 — 원본 `sections/portfolio.tsx` 의 카드 표현.
 * 정본의 LOGO_WALL 은 로고를 한 줄로 늘어놓지만, 여기서는 **자사 서비스 소개 카드**로 그린다.
 * `items[].name` 에 "브랜드 — 설명 (운영기간)" 이 한 줄로 들어오므로 `—` 로 갈라 표현한다.
 */
export function LogoWallSection({config}: {config: unknown}) {
    const items = asObjectArray(readConfig<Record<string, unknown>>(config)?.items)
        .map((i) => ({asset: assetPath(i.asset), name: asString(i.name)?.trim(), href: asString(i.href)}))
        .filter((i) => i.asset);
    if (items.length === 0) return null;

    const title = asString(readConfig<Record<string, unknown>>(config)?.title)?.trim();
    return (
        <section className="mb-16">
            {title && <h2 className="mb-8 text-2xl font-bold md:text-3xl">{title}</h2>}
            <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, i) => {
                    const [brand, ...rest] = (item.name ?? "").split("—");
                    const desc = rest.join("—").trim();
                    const card = (
                        <>
                            <img src={item.asset!} alt={brand?.trim() ?? ""} className="mb-4 h-9 w-auto" />
                            {desc && <p className="text-sm leading-relaxed text-muted">{desc}</p>}
                        </>
                    );
                    return (
                        <li
                            key={i}
                            className="rounded-2xl border border-border bg-surface p-7 transition-shadow hover:shadow-lg"
                        >
                            {item.href ? (
                                <Link href={safeLinkUrl(item.href)} className="no-underline">
                                    {card}
                                </Link>
                            ) : (
                                card
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
