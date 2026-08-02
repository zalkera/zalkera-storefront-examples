import Link from "next/link";
import type {NavLink} from "@/lib/content";

/**
 * 이 사이트의 헤더 — **`skeleton` 의 것**(이 팩의 소스는 이 팩의 것이다 · 오너 확정 2026-08-01).
 *
 * 왜 커머스 표면이 없는가: 씨앗은 *"가장 단순한 시작점 — 필요한 것만 남긴 뼈대"* 다. 그런데 헤더가
 * 장바구니·로그인을 기본으로 달고 있으면, 아무것도 안 만든 사람의 사이트가 **쇼핑몰인 척**한다.
 * 눌러도 늘 비어 있는 장바구니는 사용자에게 참이 아니다(CONVENTIONS §13 · 빈 선반 금지).
 * 카탈로그가 "필요한 것만 남긴 뼈대"라고 파는데 실물이 커머스 껍데기면 그 말 자체가 거짓이 된다.
 *
 * **커머스가 사라진 것이 아니라 헤더에서 내려온 것뿐이다.** `/cart`·`/login`·`/products` 라우트와
 * SDK 배선은 그대로 있다 — 상점을 만들 사람은 이 파일에 링크 두 줄을 더하면 되고, 그편이 지운 것을
 * 되살리는 것보다 훨씬 쉽다. 상점이 처음부터 필요하면 **열매**(`shop-goods`)가 있다.
 *
 * 헤더는 사이트가 소유하는 외양이라 **하드코딩이 정답인 자리다** — `commerce: false` 같은 선언으로
 * 끄면 우리가 정한 유형 중에서 고르게 하는 것이라 자유가 아니라 메뉴가 된다(memo140 §1).
 * 그래서 이 파일은 마음대로 고쳐도 된다. 드로어·스티키·메가메뉴 무엇이든 여기서 만든다.
 * 클라이언트 훅을 안 쓰므로 `"use client"` 도 없다(정적/ISR 그대로).
 */
export function SiteHeader({menus = []}: {menus?: NavLink[]}) {
    return (
        <header className="flex items-center gap-4 border-b border-border pb-3 mb-8">
            <Link href="/" className="font-semibold no-underline">
                홈
            </Link>
            {/* content/nav.json 의 header 배열 — 배열 순서가 노출 순서다.
                href 는 loadNav 가 이미 safeLinkUrl 로 소독했다. */}
            {menus.map((m, i) => (
                <Link key={i} href={m.href}>
                    {m.label}
                </Link>
            ))}
        </header>
    );
}
