/**
 * 글 본문의 **마크다운 부분집합 파서** — 순수 함수라 전수로 시험한다.
 *
 * ■ 왜 필요한가 (SEO·AEO 축)
 *
 * 본문은 콘솔의 마크다운 저작기에서 온다(미디어 삽입 버튼이 `![alt](/media/12)` 를 넣는다).
 * 그런데 팩은 그 문자열을 `whitespace-pre-wrap` 평문으로 냈다 — **`h2`·`a`·`img` 가 하나도 안
 * 생긴다.** 답변 엔진이 인용하는 단위는 «제목으로 잘린 청크» 이고, 검색엔진이 따라가는 것은
 * 내부 링크다. 둘 다 없는 문서는 「글자는 있는데 구조가 없는」 상태다.
 *
 * ⚠ 종전 주석은 마크다운 렌더러 금지를 «D5» 로 인용했는데 **그 결정문은 이 레포에 없다**
 * (실제 D5 는 memo135 「골격 zip 불요」·memo137 「DIGITAL 계속 닫음」으로 둘 다 무관하고,
 * 마크다운 DON'T-BUILD 는 memo129 §7 의 **고정 페이지** 축이다). 죽은 인용이었다.
 *
 * ■ 왜 라이브러리를 안 쓰는가
 *
 * 이 파일은 **모든 테넌트 사이트에 복제되는 소스**다. 의존성을 하나 더하면 그 판올림·취약점이
 * 전 테넌트의 것이 된다. 그리고 우리가 필요한 것은 전체 CommonMark 가 아니라 **인용 가능한
 * 구조를 만드는 최소 집합**이다: 제목·문단·목록·인용·코드·링크·이미지·강조.
 *
 * ■ 🔴 안전 — 원시 HTML 을 만들지 않는다
 *
 * 결과는 **데이터**(블록·인라인 배열)이고 렌더러가 React 요소로 그린다. `dangerouslySetInnerHTML`
 * 이 없으므로 본문에 `<script>` 가 들어와도 **글자로 보일 뿐** 실행 경로가 없다. 링크 주소는
 * 렌더 시점에 `safeLinkUrl` 을 한 번 더 탄다(`javascript:` 차단).
 *
 * ■ 지원하지 않는 것 (의도)
 *
 * 표·각주·HTML 패스스루·중첩 목록·참조 링크. 필요해지면 «그때» 늘린다 — 안 쓰는 문법을 미리
 * 넣으면 그만큼이 전 테넌트가 유지해야 하는 표면이다.
 */

export type Inline =
    | {kind: "text"; text: string}
    | {kind: "strong"; text: string}
    | {kind: "em"; text: string}
    | {kind: "code"; text: string}
    | {kind: "link"; href: string; text: string}
    | {kind: "image"; src: string; alt: string};

export type Block =
    | {kind: "heading"; level: 2 | 3 | 4; id: string; text: Inline[]}
    | {kind: "paragraph"; text: Inline[]}
    | {kind: "list"; ordered: boolean; items: Inline[][]}
    | {kind: "quote"; text: Inline[]}
    | {kind: "code"; text: string}
    | {kind: "hr"};

/**
 * 제목 깊이 — **`h1` 은 만들지 않는다.** 쪽에 이미 글 제목의 `h1` 이 있고, 문서에 `h1` 이 둘이면
 * 개요 알고리즘이 어느 것이 문서 제목인지 못 정한다. `#`·`##` → `h2`, `###` → `h3`, 그 아래는 `h4`.
 */
function headingLevel(hashes: number): 2 | 3 | 4 {
    if (hashes <= 2) return 2;
    if (hashes === 3) return 3;
    return 4;
}

/**
 * 제목의 앵커 id — **인용 가능한 주소를 만든다.** 답변 엔진·독자가 «그 절» 을 가리킬 수 있어야
 * 인용의 단위가 문서 전체에서 절로 내려간다. 같은 제목이 두 번 나오면 뒤엣것에 `-2` 를 붙인다.
 */
export function headingId(text: string, used: Set<string>): string {
    const base =
        text
            .toLowerCase()
            .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 64) || "section";
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
}

/** 인라인 문법 — 이미지·링크·코드·강조. 겹치는 자리는 **먼저 열린 것이 이긴다**(왼쪽 우선). */
export function parseInline(raw: string): Inline[] {
    const out: Inline[] = [];
    let rest = raw;

    // 순서가 규칙이다 — 이미지(`![`)를 링크(`[`)보다 먼저 봐야 `![alt](x)` 가 링크로 안 읽힌다.
    const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/;

    while (rest.length > 0) {
        const m = pattern.exec(rest);
        if (!m) {
            out.push({kind: "text", text: rest});
            break;
        }
        if (m.index > 0) out.push({kind: "text", text: rest.slice(0, m.index)});

        if (m[2] !== undefined) out.push({kind: "image", src: m[2], alt: m[1] ?? ""});
        else if (m[4] !== undefined) out.push({kind: "link", href: m[4], text: m[3]!});
        else if (m[5] !== undefined) out.push({kind: "code", text: m[5]});
        else if (m[6] !== undefined) out.push({kind: "strong", text: m[6]});
        else out.push({kind: "em", text: m[7]!});

        rest = rest.slice(m.index + m[0].length);
    }
    return out.filter((n) => n.kind !== "text" || n.text !== "");
}

/**
 * 본문 문자열 → 블록 목록.
 *
 * ⚠ **빈 줄이 문단을 가른다.** 한 줄 바꿈은 같은 문단 안의 줄바꿈으로 살린다(저작기에서 엔터 한 번
 * 친 것이 문단 분리로 보이면 글이 성기게 보인다).
 */
export function parseMarkdown(source: string): Block[] {
    const blocks: Block[] = [];
    const usedIds = new Set<string>();
    const lines = source.replace(/\r\n?/g, "\n").split("\n");

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;

        if (line.trim() === "") {
            i += 1;
            continue;
        }

        // 코드 울타리 — 닫히지 않으면 남은 줄 전부가 코드다(원문 보존이 안전한 쪽).
        if (line.startsWith("```")) {
            const body: string[] = [];
            i += 1;
            while (i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i++]!);
            i += 1;
            blocks.push({kind: "code", text: body.join("\n")});
            continue;
        }

        if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            blocks.push({kind: "hr"});
            i += 1;
            continue;
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            const text = heading[2]!.trim();
            blocks.push({
                kind: "heading",
                level: headingLevel(heading[1]!.length),
                id: headingId(text, usedIds),
                text: parseInline(text),
            });
            i += 1;
            continue;
        }

        if (/^ {0,3}>\s?/.test(line)) {
            const body: string[] = [];
            while (i < lines.length && /^ {0,3}>\s?/.test(lines[i]!)) {
                body.push(lines[i++]!.replace(/^ {0,3}>\s?/, ""));
            }
            blocks.push({kind: "quote", text: parseInline(body.join(" "))});
            continue;
        }

        const bullet = /^ {0,3}([-*+])\s+(.*)$/;
        const ordered = /^ {0,3}\d+[.)]\s+(.*)$/;
        if (bullet.test(line) || ordered.test(line)) {
            const isOrdered = ordered.test(line);
            const items: Inline[][] = [];
            while (i < lines.length) {
                const m = isOrdered ? ordered.exec(lines[i]!) : bullet.exec(lines[i]!);
                if (!m) break;
                items.push(parseInline((isOrdered ? m[1]! : m[2]!).trim()));
                i += 1;
            }
            blocks.push({kind: "list", ordered: isOrdered, items});
            continue;
        }

        // 문단 — 빈 줄이나 다른 블록이 시작될 때까지 모은다.
        const body: string[] = [];
        while (i < lines.length) {
            const next = lines[i]!;
            if (
                next.trim() === "" ||
                next.startsWith("```") ||
                /^(#{1,6})\s+/.test(next) ||
                /^ {0,3}>\s?/.test(next) ||
                bullet.test(next) ||
                ordered.test(next) ||
                /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(next)
            ) {
                break;
            }
            body.push(next);
            i += 1;
        }
        blocks.push({kind: "paragraph", text: parseInline(body.join("\n"))});
    }

    return blocks;
}
