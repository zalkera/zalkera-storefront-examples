import {headings} from "@/lib/markdown";

/**
 * 본문 목차 — **인용 가능한 절의 목록**.
 *
 * ■ 왜 그리나 (SEO·AEO)
 *   · 답변 엔진은 문서가 아니라 절을 인용한다. 목차는 그 절 목록을 사람과 기계에 동시에 준다.
 *   · 항목이 `#앵커` **내부 링크**라 크롤러가 문서 안의 구조를 따라간다.
 *
 * ■ 안 그리는 경우
 *   제목이 [MIN_HEADINGS] 개 미만이면 아무것도 안 그린다. 두 줄짜리 목차는 안내가 아니라 소음이고,
 *   본문 첫 화면을 밀어낸다.
 *
 * 깊이는 들여쓰기로만 나타낸다 — 목차 안에 `h2`·`h3` 를 또 만들면 문서 개요에 **없는 절**이 생긴다.
 */
const MIN_HEADINGS = 3;

export function TableOfContents({source}: {source: string}) {
    const items = headings(source);
    if (items.length < MIN_HEADINGS) return null;

    return (
        <nav aria-label="목차" className="my-6 rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-semibold">목차</p>
            <ol className="space-y-1 text-sm">
                {items.map((item) => (
                    <li key={item.id} className={item.level === 2 ? "" : item.level === 3 ? "pl-4" : "pl-8"}>
                        <a href={`#${item.id}`} className="hover:underline">
                            {item.text}
                        </a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
