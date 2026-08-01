import type {NavLink} from "@/lib/content";
import Link from "next/link";

/**
 * 사이트 푸터 (RSC) — `content/nav.json` 의 footer 배열을 1뎁스 렌더. 없으면 아무것도 안 낸다.
 *
 * 서버 컴포넌트라 SDK 를 직접 안 부른다(layout 이 읽어 props 로 준다) — baseUrl 노출·ISR 강등 없음.
 * href 소독은 `loadNav` 가 이미 했다.
 */
export function SiteFooter({menus = []}: {menus?: NavLink[]}) {
    if (menus.length === 0) return null;
    return (
        <footer className="mt-12 flex flex-wrap gap-3 border-t border-border pt-4">
            {menus.map((m, i) => (
                <Link key={i} href={m.href} className="text-sm text-muted">
                    {m.label}
                </Link>
            ))}
        </footer>
    );
}
