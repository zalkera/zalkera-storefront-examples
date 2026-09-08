import type {Block, Inline} from "@/lib/markdown";
import {parseMarkdown} from "@/lib/markdown";
import {safeLinkUrl} from "@/lib/safeUrl";

/**
 * 글 본문 렌더러 — 마크다운 부분집합을 **React 요소로** 그린다.
 *
 * 🔴 **`dangerouslySetInnerHTML` 이 없다.** 파서가 데이터를 내고 여기서 요소를 만들므로, 본문에
 * `<script>` 가 들어와도 글자로 보일 뿐 실행 경로가 없다. 링크 주소는 `safeLinkUrl` 을 한 번 더
 * 태워 `javascript:` 같은 스킴을 막는다.
 *
 * ■ 왜 이 구조가 SEO·AEO 에 필요한가
 *   · `h2`·`h3` 가 **인용 청크의 경계**다 — 답변 엔진은 문서 전체가 아니라 절을 인용한다.
 *   · 제목마다 `id` 가 있어 **그 절을 주소로 가리킬 수 있다**.
 *   · 링크가 요소여야 크롤러가 따라간다. 이미지가 요소여야 `alt` 가 색인된다.
 */
function InlineNodes({nodes}: {nodes: Inline[]}) {
    return (
        <>
            {nodes.map((node, i) => {
                switch (node.kind) {
                    case "strong":
                        return <strong key={i}>{node.text}</strong>;
                    case "em":
                        return <em key={i}>{node.text}</em>;
                    case "code":
                        return (
                            <code key={i} className="rounded bg-surface px-1 text-sm">
                                {node.text}
                            </code>
                        );
                    case "link": {
                        const href = safeLinkUrl(node.href);
                        // 외부 링크만 `noopener` — 내부 링크에 `nofollow` 를 달면 우리 사이트의
                        // 내부 연결을 우리 손으로 끊는다(그것이 크롤러가 따라가는 길이다).
                        const external = /^https?:\/\//i.test(href);
                        return (
                            <a
                                key={i}
                                href={href}
                                {...(external ? {rel: "noopener noreferrer"} : {})}
                                className="underline"
                            >
                                {node.text}
                            </a>
                        );
                    }
                    case "image":
                        // 커버와 같은 규약 — `/media/{id}` 안정 URL. `next/image` 는 바이트를 Next
                        // 런타임에 태우므로 쓰지 않는다.
                        return (
                            <img
                                key={i}
                                src={safeLinkUrl(node.src)}
                                alt={node.alt}
                                loading="lazy"
                                className="my-4 h-auto max-w-full rounded-lg"
                            />
                        );
                    default:
                        return <span key={i}>{node.text}</span>;
                }
            })}
        </>
    );
}

function BlockNode({block}: {block: Block}) {
    switch (block.kind) {
        case "heading": {
            const Tag = `h${block.level}` as const satisfies "h2" | "h3" | "h4";
            return (
                <Tag id={block.id} className="mt-6 mb-2 font-semibold">
                    <InlineNodes nodes={block.text} />
                </Tag>
            );
        }
        case "list":
            return block.ordered ? (
                <ol className="my-3 list-decimal pl-6">
                    {block.items.map((item, i) => (
                        <li key={i}>
                            <InlineNodes nodes={item} />
                        </li>
                    ))}
                </ol>
            ) : (
                <ul className="my-3 list-disc pl-6">
                    {block.items.map((item, i) => (
                        <li key={i}>
                            <InlineNodes nodes={item} />
                        </li>
                    ))}
                </ul>
            );
        case "quote":
            return (
                <blockquote className="my-4 border-l-4 border-border pl-4 text-muted">
                    <InlineNodes nodes={block.text} />
                </blockquote>
            );
        case "code":
            return (
                <pre className="my-4 overflow-x-auto rounded-lg bg-surface p-4 text-sm">
                    <code>{block.text}</code>
                </pre>
            );
        case "hr":
            return <hr className="my-6 border-border" />;
        default:
            // 문단 — 한 줄 바꿈은 문단 안에 남긴다(저작기에서 엔터 한 번 친 것이 문단 분리로 보이면
            // 글이 성기게 보인다). `whitespace-pre-line` 은 줄바꿈만 살리고 공백은 접는다.
            return (
                <p className="my-3 whitespace-pre-line">
                    <InlineNodes nodes={block.text} />
                </p>
            );
    }
}

/** 본문 문자열을 받아 구조를 그린다. 빈 문자열이면 아무것도 안 그린다. */
export function Markdown({source}: {source: string}) {
    const blocks = parseMarkdown(source);
    if (blocks.length === 0) return null;
    return (
        <div>
            {blocks.map((block, i) => (
                <BlockNode key={i} block={block} />
            ))}
        </div>
    );
}
