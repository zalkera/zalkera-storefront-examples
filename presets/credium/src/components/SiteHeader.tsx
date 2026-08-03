import Link from "next/link";
import type {NavLink} from "@/lib/content";

/**
 * 이 사이트의 헤더 — **정본 골격의 것을 가린다**(`presets/<code>/src/` 오버레이).
 *
 * 왜 자기 것을 갖는가: 사이트의 성격은 선언이 아니라 **`@zalkera/client` 를 어떻게 부르는가**로
 * 구성된다(오너 확정 2026-08-01). 이 사이트는 상품·장바구니·주문 어느 것도 부르지 않는 소개
 * 사이트라, 골격이 기본으로 주는 장바구니·로그인 표면이 있으면 **사이트가 자기 정체를 잘못 말한다**.
 * 눌러도 늘 비어 있는 장바구니는 사용자에게 참이 아니다(CONVENTIONS §13).
 *
 * `commerce: false` 같은 **선언으로 끄지 않은 이유**: 그것은 우리가 정한 유형 중에서 고르게 하는
 * 것이라 자유가 아니라 메뉴가 된다. 헤더는 사이트가 소유하는 외양이고, 반응형까지 가면 UI/UX 가
 * 매우 가변적이라 데이터로 표현되지도 않는다 — **하드코딩이 정답인 자리다.**
 *
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
