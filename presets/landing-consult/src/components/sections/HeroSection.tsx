import Link from "next/link";
import {safeLinkUrl} from "@/lib/safeUrl";
import {asString, readConfig} from "@zalkera/client";

/**
 * 상담 랜딩 히어로 — **어두운 전면 배경 + 상담 창구 3개**.
 *
 * 정본 골격의 히어로(좌우 2단·이미지)와 **props 계약은 같고 시각 언어가 다르다.** 이 팩이 있는 이유가
 * 그것이다 — 예제가 "고를 유형"이 아니라 "이렇게도 쓸 수 있다"의 실례이려면, 같은 데이터로 전혀 다른
 * 화면이 나오는 것을 실물로 보여야 한다(memo140 §3).
 *
 * 상담 창구를 셋 두는 것은 **랜딩형의 형상**이다: 방문자가 어느 채널을 편해하는지 모르므로 고르게 한다.
 * 링크 값은 이 팩의 것이라 소스가 갖는다(업무 데이터가 아니다).
 */
export function HeroSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    if (!title) return null;

    const eyebrow = asString(c?.eyebrow)?.trim();
    const subtitle = asString(c?.subtitle)?.trim();
    const ctaLabel = asString(c?.ctaLabel)?.trim();
    const ctaHref = asString(c?.ctaHref);

    return (
        <section className="-mx-4 mb-16 bg-foreground px-4 py-20 text-background md:-mx-8 md:px-8 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
                {eyebrow && (
                    <p className="mb-4 text-sm font-semibold tracking-widest text-background/70">{eyebrow}</p>
                )}
                <h1 className="text-3xl font-bold leading-snug md:text-5xl">{title}</h1>
                {subtitle && (
                    <p className="mx-auto mt-6 max-w-xl whitespace-pre-wrap leading-relaxed text-background/80">
                        {subtitle}
                    </p>
                )}
                {ctaLabel && ctaHref && (
                    <div className="mt-10">
                        <Link
                            href={safeLinkUrl(ctaHref)}
                            className="inline-flex items-center justify-center bg-primary px-10 py-4 text-lg font-bold text-primary-foreground no-underline transition-opacity hover:opacity-90"
                        >
                            {ctaLabel}
                        </Link>
                    </div>
                )}

                {/* 상담 창구 — 방문자가 편한 채널을 고른다 */}
                <ul className="mt-12 grid list-none grid-cols-3 gap-px overflow-hidden border border-background/20 p-0">
                    {CHANNELS.map((ch) => (
                        <li key={ch.label}>
                            <Link
                                href={ch.href}
                                className="flex flex-col items-center gap-1 bg-background/5 px-3 py-5 no-underline transition-colors hover:bg-background/15"
                            >
                                <span className="text-2xl" aria-hidden>
                                    {ch.icon}
                                </span>
                                <span className="text-sm font-medium">{ch.label}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

const CHANNELS = [
    {icon: "📞", label: "전화 상담", href: "/contact"},
    {icon: "💬", label: "채팅 상담", href: "/contact"},
    {icon: "✉️", label: "문의 남기기", href: "/contact"},
];
