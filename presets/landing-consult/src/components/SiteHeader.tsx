import Link from "next/link";
import type {NavLink} from "@/lib/content";

/**
 * 상담 랜딩 헤더 — 가늘고 조용하다. 랜딩형은 방문자를 헤매게 하지 않는 것이 목적이라 링크를 적게 둔다.
 * 커머스 표면이 없는 이유는 선언이 아니라 구성이다 — 이 사이트는 상품·장바구니를 부르지 않는다.
 */
export function SiteHeader({menus = []}: {menus?: NavLink[]}) {
    return (
        <header className="mb-0 border-b border-border">
            <div className="flex h-16 items-center justify-between">
                <Link href="/" className="font-bold tracking-tight no-underline">
                    상담 랜딩
                </Link>
                <nav>
                    <ul className="flex list-none items-center gap-6 p-0">
                        {menus.map((m, i) => (
                            <li key={i}>
                                <Link href={m.href} className="text-sm no-underline hover:text-primary">
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
