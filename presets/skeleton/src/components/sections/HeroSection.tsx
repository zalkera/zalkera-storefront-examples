import Link from "next/link";
import {buttonClasses} from "@/components/ui/Button";
import {safeLinkUrl} from "@/lib/safeUrl";
import {assetPath, asString, readConfig} from "@zalkera/client";

/** 주목 — 첫 화면의 한 문장과 행동 유도. `title` 만 필수고 나머지는 없으면 그 부분만 빠진다. */
export function HeroSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    if (!title) return null; // 제목 없는 히어로는 빈 상자다 — 안 그린다.

    const eyebrow = asString(c?.eyebrow)?.trim();
    const subtitle = asString(c?.subtitle)?.trim();
    const ctaLabel = asString(c?.ctaLabel)?.trim();
    const ctaHref = asString(c?.ctaHref);
    const asset = assetPath(c?.asset);

    return (
        <section className="mb-12 grid gap-6 md:grid-cols-2 md:items-center">
            <div className="grid gap-4">
                {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
                <h1 className="text-3xl leading-tight md:text-4xl">{title}</h1>
                {subtitle && <p className="whitespace-pre-wrap text-muted">{subtitle}</p>}
                {ctaLabel && ctaHref && (
                    <div>
                        <Link href={safeLinkUrl(ctaHref)} className={buttonClasses("primary", "no-underline")}>
                            {ctaLabel}
                        </Link>
                    </div>
                )}
            </div>
            {asset && (
                <img
                    src={asset}
                    alt=""
                    className="h-auto w-full rounded-xl object-cover"
                />
            )}
        </section>
    );
}
