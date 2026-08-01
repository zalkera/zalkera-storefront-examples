import Link from "next/link";
import type {NavLink} from "@/lib/content";

/**
 * CREDIUM 헤더 — 원본 `components/navigation.tsx` 의 형상(고정 높이 h-20·좌 로고·우 메뉴).
 *
 * 장바구니·로그인이 없는 이유는 선언이 아니라 **구성**이다 — 이 사이트는 상품·장바구니 API 를
 * 부르지 않는다. 화면의 권한은 소스에 있고, 여기서는 하드코딩이 정답이다(memo140 §1).
 * 클라이언트 훅을 안 쓰므로 루트 레이아웃이 정적/ISR 로 남는다.
 */
export function SiteHeader({menus = []}: {menus?: NavLink[]}) {
    return (
        <header className="sticky top-0 z-50 mb-8 border-b border-border bg-background/80 backdrop-blur">
            <div className="flex h-20 items-center justify-between">
                <Link href="/" className="flex items-center gap-2 no-underline" aria-label="CREDIUM 홈">
                    <img src="/images/logo.png" alt="CREDIUM" className="h-10 w-auto" />
                </Link>
                <nav>
                    <ul className="flex list-none items-center gap-8 p-0">
                        {menus.map((m, i) => (
                            <li key={i}>
                                <Link href={m.href} className="text-sm font-medium no-underline hover:text-primary">
                                    {m.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </header>
    );
}
