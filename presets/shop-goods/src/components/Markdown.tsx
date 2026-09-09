import type {Block, Inline} from "@/lib/markdown";
import {parseMarkdown} from "@/lib/markdown";
import {bodyImageHref, bodyMediaSrc, bodyVideoSrc} from "@/lib/mediaRef";
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
/**
 * 소독을 **통과한** 링크가 남의 호스트를 가리키는가 — `rel` 을 다는 조건.
 *
 * ⚠ [safeLinkUrl] 이 돌려준 값에만 건다. 원문에 걸면 소독기가 무력화한 값(`javascript:` → `#`)과
 *   정규화한 값을 못 본다.
 *
 * ⚠ 본문 **이미지**의 같은 물음은 여기 없다 — `bodyImageHref` 가 진다(5벌이 바이트로 잠긴 파일).
 */
const EXTERNAL_HREF = /^https?:\/\//i;

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
                        // 외부 링크에만 `rel` 을 단다. ⚠ **실제로 일하는 것은 `noreferrer` 다** —
                        // `target="_blank"` 를 안 쓰므로 `noopener` 는 무동작이고(짝으로 두는 관례),
                        // 같은 탭 이동에서도 `Referer` 가 지워진다. 내부 링크에는 아무것도 안 단다:
                        // `nofollow` 를 달면 크롤러가 따라가는 우리 내부 연결을 우리 손으로 끊는다.
                        const external = EXTERNAL_HREF.test(href);
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
                    case "image": {
                        // 저작기가 박는 것은 **불변 참조**(`media:12`)다 — 소독기만 태우면 모르는
                        // 스킴이라 `#` 이 되고, `<img src="#">` 는 그 쪽 HTML 을 이미지로 다시
                        // 요청한다. 해석은 `bodyMediaSrc` 한 곳이 한다(소독까지 포함).
                        // `next/image` 는 바이트를 Next 런타임에 태우므로 쓰지 않는다.
                        const src = bodyMediaSrc(node.src);
                        if (src !== null) {
                            return (
                                <img
                                    key={i}
                                    src={src}
                                    alt={node.alt}
                                    loading="lazy"
                                    className="my-4 h-auto max-w-full rounded-lg"
                                />
                            );
                        }
                        // 🔴 **외부 호스트는 자동으로 안 부른다.** `<img src>` 로 두면 방문자가
                        //    아무 조작도 안 했는데 브라우저가 그 호스트로 나가 IP·UA 를 넘긴다.
                        //    그래서 [bodyMediaSrc] 가 우리 주소만 주고, 나머지는 **링크로** 그린다 —
                        //    외부 영상 펜스와 같은 판정이다. 안 그리면 저작자가 넣은 그림이 통째로
                        //    사라지는데, 링크는 읽는 사람도 크롤러도 그것에 닿는다.
                        //
                        // ⚠ **판정은 여기 없다.** `bodyImageHref` 가 진다 — 그 파일은 5벌이 바이트로
                        //    잠겨 있어 한 벌만 갈리면 CI 가 빨강이다. 이 파일은 그 목록 밖이라
                        //    (얼굴이 팩마다 달라야 한다) 같은 보장이 없다. 판정을 여기로 되가져오지
                        //    마라 — 근거와 재현은 `bodyImageHref` KDoc 에 있다.
                        // ⚠ **이름을 링크 갈래와 갈라 둔다.** 배선 그물은 같은 파일의 **이름**으로
                        //    되짚으므로, 둘 다 `href` 면 두 갈래가 「여러 갈래」로 뭉쳐 어느 쪽이
                        //    무엇에 묶였는지 못 말한다.
                        const imageHref = bodyImageHref(node.src);
                        if (imageHref === null) return null;
                        return (
                            <a key={i} href={imageHref} rel="noopener noreferrer" className="underline">
                                {node.alt || node.src}
                            </a>
                        );
                    }
                    default:
                        // 평문 런은 **요소로 감싸지 않는다.** `<span>` 하나하나가 HTML 과 RSC
                        // 페이로드에 실려 나가는데, 배열 속 문자열은 key 가 필요 없고 뜻도 그대로다.
                        return node.text;
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
        case "table":
            // 표는 답변 엔진이 통째로 인용한다 — `thead` 가 있어야 «무엇의 값인지» 가 남는다.
            // 좁은 화면에서 **표만** 가로로 구른다(쪽 전체가 구르면 본문을 읽을 수 없다).
            return (
                <div className="my-4 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr>
                                {block.head.map((cell, c) => (
                                    <th
                                        key={c}
                                        className="border border-border bg-surface px-3 py-2 text-left font-semibold"
                                    >
                                        <InlineNodes nodes={cell} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, r) => (
                                <tr key={r}>
                                    {row.map((cell, c) => (
                                        <td key={c} className="border border-border px-3 py-2">
                                            <InlineNodes nodes={cell} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case "video": {
            if (block.source === "file") {
                // 자체 업로드 영상 — **불변 참조만** 받는다. 외부 주소를 여기서 받으면 방문자가
                // 아무 조작도 안 했는데 `preload="metadata"` 가 그 호스트로 나간다(IP·UA 유출).
                // 외부 영상은 `video` 펜스의 몫이고, 그쪽은 링크로만 그린다.
                const videoSrc = bodyVideoSrc(block.src);
                if (videoSrc === null) return null;
                return <video src={videoSrc} controls preload="metadata" className="my-4 h-auto w-full rounded-lg" />;
            }
            // 외부 영상은 **링크로 그린다.** 저작기 미리보기는 iframe 임베드지만, 여기서 그러려면
            // 어느 호스트를 프레임에 넣을지 정하는 **허용목록**이 필요하다(임의 URL 을 iframe 에
            // 넣는 것은 그 자체가 새 신뢰 표면이다). 그 판정은 오너 결정 대기 중이고, 그때까지
            // 링크는 **읽는 사람도 크롤러도 영상에 닿는다** — 회색 코드 상자보다 정직하다.
            const href = safeLinkUrl(block.src);
            if (href === "#") return null;
            return (
                <p className="my-3">
                    <a href={href} rel="noopener noreferrer" className="underline">
                        {block.src}
                    </a>
                </p>
            );
        }
        case "code":
            return (
                <pre className="my-4 overflow-x-auto rounded-lg bg-surface p-4 text-sm">
                    {/* 언어는 하이라이터의 관례 클래스로만 나간다 — 임의 문자열이 클래스 목록에
                        섞이지 않도록 꼴을 좁힌다(공백이 들어오면 클래스가 하나 더 붙는다). */}
                    <code className={/^[a-z0-9+#-]{1,20}$/.test(block.lang) ? `language-${block.lang}` : undefined}>
                        {block.text}
                    </code>
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
