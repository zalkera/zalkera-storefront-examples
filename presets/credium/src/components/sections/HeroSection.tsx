import Link from "next/link";
import {safeLinkUrl} from "@/lib/safeUrl";
import {asString, readConfig} from "@zalkera/client";

/**
 * CREDIUM 히어로 — **원본 사이트의 레이아웃을 그대로 옮긴 것**(`components/sections/hero.tsx`).
 *
 * 정본 골격의 `HeroSection` 과 **props 계약은 같고 생김새만 다르다.** 그래서 `content/pages/home.json`
 * 이 그대로 이 컴포넌트를 몰고, 콘솔에서 문구를 고치면 여기에 반영된다 — 디자인을 자기 것으로 가져도
 * 편집 경로는 잃지 않는다는 것이 이 오버레이의 요점이다.
 *
 * v3 → v4 에서 바뀐 것은 **색의 거처뿐**이다. 종전에는 `tailwind.config.ts` 에 hex 가 박혀 있어 콘솔이
 * 손댈 수 없었는데, 이제 `@theme` 토큰이라 테넌트 색 주입(`lib/theme.ts`)이 위에 얹힌다. 클래스 이름과
 * 배치는 한 줄도 안 바뀌었다.
 */
export function HeroSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    if (!title) return null;

    const eyebrow = asString(c?.eyebrow)?.trim();
    const subtitle = asString(c?.subtitle)?.trim();
    const ctaLabel = asString(c?.ctaLabel)?.trim();
    const ctaHref = asString(c?.ctaHref);

    // 제목의 마지막 한 낱말에 브랜드 그라데이션을 입힌다(원본의 `<span className="gradient-text">크레디움</span>`).
    // 문구가 콘솔에서 바뀌어도 규칙이 따라가도록 위치가 아니라 **마지막 낱말**로 잡는다.
    const words = title.split(" ");
    const head = words.slice(0, -1).join(" ");
    const tail = words[words.length - 1];

    return (
        <section className="relative mb-16 overflow-hidden pt-8">
            {/* 원본의 배경 원 두 개 — 브랜드 색의 옅은 틴트 */}
            <div className="pointer-events-none absolute -right-60 -top-60 size-[500px] rounded-full bg-primary/5" />
            <div className="pointer-events-none absolute -left-40 top-40 size-[300px] rounded-full bg-secondary/5" />

            <div className="relative z-10 grid items-center gap-12 lg:grid-cols-2">
                <div className="space-y-6 lg:space-y-8">
                    {eyebrow && (
                        <span className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                            {eyebrow}
                        </span>
                    )}

                    <h1 className="text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
                        {head && <>{head} </>}
                        <span className="gradient-text">{tail}</span>
                    </h1>

                    {subtitle && <p className="whitespace-pre-wrap text-lg leading-relaxed text-muted">{subtitle}</p>}

                    {ctaLabel && ctaHref && (
                        <div className="flex flex-wrap gap-3 pt-2">
                            <Link
                                href={safeLinkUrl(ctaHref)}
                                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-primary to-secondary px-7 py-3 font-semibold text-white no-underline shadow-md transition-shadow hover:shadow-lg"
                            >
                                {ctaLabel}
                            </Link>
                            <Link
                                href="/about"
                                className="inline-flex items-center justify-center rounded-full border-2 border-primary/30 px-7 py-3 font-semibold text-primary no-underline transition-colors hover:border-primary hover:bg-primary/5"
                            >
                                회사 소개 보기
                            </Link>
                        </div>
                    )}

                    {/* 지표 3단 — 회사의 사실이라 소스가 갖는다(업무 데이터가 아니다). */}
                    <div className="grid grid-cols-3 gap-3 pt-4 md:gap-6">
                        {STATS.map((s) => (
                            <div
                                key={s.label}
                                className={`rounded-xl border-l-4 bg-surface p-4 shadow-md transition-shadow hover:shadow-lg md:p-6 ${s.accent}`}
                            >
                                <div className="mb-1 whitespace-nowrap text-3xl font-bold md:mb-3 md:text-5xl">
                                    <span className={s.text}>{s.value}</span>
                                </div>
                                <div className="text-xs font-medium md:text-sm">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 원본의 플로팅 카드 — 회사의 3대 사업 축 */}
                <div className="relative hidden h-[500px] lg:block">
                    {CARDS.map((card) => (
                        // zalkera-allow-inline-style: 카드마다 다른 좌표·지연이라 유틸리티 클래스로 표현되지 않는다(값이 데이터다).
                        <div
                            key={card.title}
                            className="float-card absolute w-[220px] rounded-2xl bg-surface px-7 py-6 shadow-xl"
                            style={{top: card.top, left: card.left, animationDelay: card.delay}}
                        >
                            <div className="mb-2 text-3xl">{card.icon}</div>
                            <div className="font-bold">{card.title}</div>
                            <div className="mt-0.5 text-xs text-muted">{card.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

const STATS = [
    {value: "10x", label: "더 빠른 개발", accent: "border-primary", text: "text-primary"},
    {value: "3+", label: "자체 운영 서비스", accent: "border-secondary", text: "text-secondary"},
    {value: "14년", label: "서비스 운영 지속", accent: "border-primary", text: "text-primary"},
];

const CARDS = [
    {icon: "🔄", title: "AI 전환 (AX)", desc: "DX를 넘어 AX로", top: "4%", left: "6%", delay: "0s"},
    {icon: "💻", title: "풀스택 개발", desc: "기획부터 운영까지", top: "38%", left: "34%", delay: "0.3s"},
    {icon: "🚀", title: "자체 서비스 운영", desc: "직접 만들고 운영", top: "72%", left: "4%", delay: "0.6s"},
];
