/**
 * 글 본문의 **마크다운 부분집합 파서** — 순수 함수라 전수로 시험한다.
 *
 * ■ 왜 필요한가 (SEO·AEO 축)
 *
 * 본문은 콘솔의 마크다운 저작기에서 온다(미디어 삽입 버튼이 **불변 참조** `![alt](media:12)` 를
 * 넣는다 — 그 참조를 주소로 바꾸는 것은 `lib/mediaRef.ts` 다).
 * 그런데 팩은 그 문자열을 `whitespace-pre-wrap` 평문으로 냈다 — **`h2`·`a`·`img` 가 하나도 안
 * 생긴다.** 답변 엔진이 인용하는 단위는 «제목으로 잘린 청크» 이고, 검색엔진이 따라가는 것은
 * 내부 링크다. 둘 다 없는 문서는 「글자는 있는데 구조가 없는」 상태다.
 *
 * ⚠ 마크다운 렌더러 금지를 «D5» 로 인용하는 문면이 돌아다니는데 **그 결정문은 이 레포에 없다**
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
 * 각주·HTML 패스스루·중첩 목록·참조 링크·취소선·체크박스 목록. 필요해지면 «그때» 늘린다 —
 * 안 쓰는 문법을 미리 넣으면 그만큼이 전 테넌트가 유지해야 하는 표면이다.
 *
 * ⚠ **저작기는 `react-markdown` + `remark-gfm` 이라 여기보다 넓다.** 즉 위 목록은 「미리보기에는
 * 보이는데 사이트에서는 글자로 남는」 문법이고, 그 간극은 **저작기가 실제로 내는 것**부터 좁힌다:
 * 삽입 버튼이 내는 셋(이미지 참조 · ```` ```video ```` · ```` ```videofile ```` 펜스)과 표는 여기 있다.
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
    /** 표는 답변 엔진이 통째로 인용하는 단위다 — 셀은 인라인까지 파싱한다. */
    | {kind: "table"; head: Inline[][]; rows: Inline[][][]}
    /** `lang` 은 펜스의 정보 문자열(소문자). 없으면 빈 문자열. */
    | {kind: "code"; lang: string; text: string}
    /** 저작기 영상 펜스. `file` = 자체 업로드(`media:{id}`) · `embed` = 외부 URL. */
    | {kind: "video"; source: "file" | "embed"; src: string}
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
 *
 * ⚠ **원장이 `Set` 이 아니라 `Map` 인 이유** — 값은 「이 문자열을 base 로 삼을 때 **다음에 시도할
 *   번호**」다. `Set` 만 들고 2부터 매번 훑으면 k번째 중복이 k번 탐침해 **제목 수의 제곱**이 된다
 *   (실측: 같은 제목 2만 개 → 파서 13.2초 · 그 쪽 첫 방문자 15.3초. 문단과 달리 이 원장은 문서
 *   전역이라 빈 줄이 막아 주지도 않는다). 번호를 기억하면 탐침이 한 번으로 끝난다.
 *
 * ⚠ **그래도 `has` 로 한 번 더 묻는다.** 「제목-2」가 본문에 먼저 나오고 「제목」이 뒤따르면
 *   번호만으로는 같은 id 를 두 번 만든다 — 앵커가 겹치면 그 절을 주소로 가리킬 수 없다.
 */
export function headingId(text: string, used: Map<string, number>): string {
    const base =
        text
            .toLowerCase()
            .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 64) || "section";
    let n = used.get(base) ?? 2;
    let id = base;
    while (used.has(id)) id = `${base}-${n++}`;
    used.set(base, n); // base 의 다음 시도 번호
    if (!used.has(id)) used.set(id, 2); // 만들어 낸 id 자체도 «쓰임» 으로 남긴다
    return id;
}

/** 인라인 문법 — 이미지·링크·코드·강조. 겹치는 자리는 **먼저 열린 것이 이긴다**(왼쪽 우선). */
export function parseInline(raw: string): Inline[] {
    const out: Inline[] = [];
    // 순서가 규칙이다 — 이미지(`![`)를 링크(`[`)보다 먼저 봐야 `![alt](x)` 가 링크로 안 읽힌다.
    //
    // ⚠ **길이 상한은 장식이 아니다.** 상한이 없으면 닫히지 않는 여는 괄호가 이어질 때 한 자리의
    //    실패 시도가 **남은 본문 전체**를 훑고 되짚는다. 그 비용이 자리마다 반복되면 본문 길이의
    //    제곱이 되고, 이 파서는 RSC(서버) 에서 도므로 **그 사이 요청이 멈춘다** — 저작자 한 명의
    //    오타가 그 사이트를 세우는 형태다.
    //
    // ⚠ **줄바꿈은 막지 않는다.** 저작기(CommonMark)는 두 줄에 걸친 굵게·링크를 그린다 —
    //    여기서 `\n` 을 빼면 그 본문이 사이트에서만 `**` 가 노출된 글자가 된다. 제곱 방어는
    //    상한과 `lastIndex` 가 하고, 줄바꿈 제외는 거기 기여하지 않는다(실측).
    //
    // ⚠ **이미지 alt 는 한 겹 대괄호를 받는다.** 저작기가 파일명을 이스케이프 없이 박으므로
    //    `[공지] 배너.png` 같은 이름이 그대로 온다 — 안 받으면 그 글의 그림이 글자로 남는다.
    //    실측(이 기계 · 여는 괄호 40,000개): 지금 128ms. 상한과 `lastIndex` 중 **하나라도** 빼면
    //    5,619ms 가 되고, 그 형상은 입력이 배로 늘 때 4배로 는다(10k 277ms · 20k 1,128ms).
    //    재현: `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 예산 시험.
    const pattern =
        /!\[((?:[^[\]]|\[[^[\]]{0,200}\]){0,500})\]\(([^)\s]{1,2048})\)|\[([^[\]]{1,500})\]\(([^)\s]{1,2048})\)|`([^`]{1,500})`|\*\*([^*]{1,500})\*\*|\*([^*]{1,500})\*/g;

    // ⚠ **`lastIndex` 로 전진한다** — `slice` 로 잘라 다시 훑으면 앞부분을 매치마다 되읽는다.
    //    정규식은 상태를 가지므로 **여기서 만든다**(모듈 상수로 올리면 중첩 호출이 서로의
    //    `lastIndex` 를 밟는다).
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(raw)) !== null) {
        if (m.index > last) out.push({kind: "text", text: raw.slice(last, m.index)});

        if (m[2] !== undefined) out.push({kind: "image", src: m[2], alt: m[1] ?? ""});
        else if (m[4] !== undefined) out.push({kind: "link", href: m[4], text: m[3]!});
        else if (m[5] !== undefined) out.push({kind: "code", text: m[5]});
        else if (m[6] !== undefined) out.push({kind: "strong", text: m[6]});
        else out.push({kind: "em", text: m[7]!});

        last = pattern.lastIndex;
    }
    if (last < raw.length) out.push({kind: "text", text: raw.slice(last)});

    return out.filter((n) => n.kind !== "text" || n.text !== "");
}

/**
 * 인라인 노드의 **글자만** — 목차·요약처럼 구조 없이 텍스트가 필요한 자리가 쓴다.
 *
 * 이미지는 `alt` 로 대신한다(제목 안의 그림도 목차에서는 말이어야 한다). 링크는 주소가 아니라
 * 보이는 글자를 남긴다 — 목차에 URL 이 뜨면 그것은 제목이 아니다.
 */
export function inlineText(nodes: Inline[]): string {
    return nodes.map((node) => (node.kind === "image" ? node.alt : node.text)).join("");
}

/**
 * 본문의 제목 목록 — **목차**의 재료다.
 *
 * ■ 왜 목차가 SEO·AEO 축인가
 *   · 답변 엔진은 문서가 아니라 **절**을 인용한다. 목차는 그 절 목록을 기계와 사람에게 동시에 준다.
 *   · 각 항목이 `#앵커` 내부 링크라, 검색결과의 **사이트링크 하이라이트**(그 절로 바로 가는 링크)가
 *     설 자리가 생긴다.
 *   · 긴 글에서 독자가 먼저 보는 것이 구조다.
 *
 * 제목이 없는 글이면 빈 배열이다 — 호출자는 그때 **아무것도 안 그린다**(빈 상자를 그리지 않는다).
 */
export function headings(source: string): {level: 2 | 3 | 4; id: string; text: string}[] {
    return parseMarkdown(source)
        .filter((block) => block.kind === "heading")
        .map((block) => ({level: block.level, id: block.id, text: inlineText(block.text)}));
}

/** 표 한 줄의 셀 — 양끝 파이프는 장식이라 걷는다. */
function tableCells(line: string): string[] {
    let text = line.trim();
    if (text.startsWith("|")) text = text.slice(1);
    if (text.endsWith("|")) text = text.slice(0, -1);
    return text.split("|").map((cell) => cell.trim());
}

/**
 * 구분줄(`|---|---|`)인가 — **표의 존재를 정하는 줄이다.** 머리줄만으로는 표인지 알 수 없다
 * (파이프가 든 평범한 문장이 표가 되면 안 된다).
 */
function isTableDelimiter(line: string): boolean {
    if (!line.includes("|")) return false;
    const cells = tableCells(line);
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * 이 줄에서 표가 **실제로 시작되는가** — 시작한다면 머리줄의 칸.
 *
 * 🔴 **문단 경계 판정도 이 술어를 쓴다.** 「표 머리처럼 보이나」와 「표로 그리나」가 갈리면, 표를
 *    거절한 줄에서 문단이 다시 끊겨 **진행이 멈춘다**(같은 줄을 영원히 다시 본다). 칸 수가 안 맞는
 *    오타(`| a | b |` 다음에 `|---|`) 하나로 그 자리에 들어간다.
 */
function tableStartsAt(lines: string[], index: number): string[] | null {
    const line = lines[index];
    const next = lines[index + 1];
    if (line === undefined || next === undefined) return null;
    if (!line.includes("|") || !isTableDelimiter(next)) return null;

    const head = tableCells(line);
    // 칸 수가 맞아야 표다. 상한을 넘으면 표로 그리지 않는다(비용이 «칸 × 행» 곱이다).
    if (head.length !== tableCells(next).length || head.length > MAX_TABLE_COLUMNS) return null;
    return head;
}

/**
 * 본문 문자열 → 블록 목록.
 *
 * ⚠ **빈 줄이 문단을 가른다.** 한 줄 바꿈은 같은 문단 안의 줄바꿈으로 살린다(저작기에서 엔터 한 번
 * 친 것이 문단 분리로 보이면 글이 성기게 보인다).
 */
/**
 * 표의 상한 — 비용이 «칸 × 행» 곱이라 **둘 다** 묶는다. 넘는 표는 표로 그리지 않는다.
 * 사람이 읽는 표의 현실 범위(수십 칸 · 수백 행)보다 넉넉하고, 최악이 32 × 500 = 16,000 셀이다.
 */
const MAX_TABLE_COLUMNS = 32;
const MAX_TABLE_ROWS = 500;

/**
 * 한 **문서**의 표 행 총수 상한.
 *
 * 🔴 표 하나의 상한은 표 **개수**를 안 묶는다. 본문 길이에는 상한이 없으므로, 상한 안의 표를
 * 이어 붙이는 것만으로 행이 무한히 는다 — 행 하나가 `<tr><td>` 를 내므로 산출 HTML 이 본문의
 * 수백 배가 되고(실측: 128KB 본문 → 5만 행 → **18MB 응답**), 그 크기는 ISR 캐시 한도를 넘어
 * **방문자가 매 요청 재생성**시킨다. 서빙 박스에는 테넌트가 여럿 산다.
 *
 * 넘으면 그 뒤의 표는 표로 그리지 않는다(문단으로 남아 **글자는 안 사라진다**).
 */
const MAX_TABLE_ROWS_PER_DOCUMENT = 2_000;

export function parseMarkdown(source: string): Block[] {
    const blocks: Block[] = [];
    const usedIds = new Map<string, number>();
    let tableRows = 0;
    /**
     * 표 판정의 **단 하나의 자리** — 문서 예산까지 여기서 본다. 문단 경계도 이것을 쓴다:
     * 두 술어가 갈리면 표를 거절한 줄에서 문단도 끊겨 진행이 멈춘다(같은 줄을 영원히 다시 본다).
     */
    const startsTable = (index: number): string[] | null =>
        tableRows < MAX_TABLE_ROWS_PER_DOCUMENT ? tableStartsAt(lines, index) : null;
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
            const lang = line.slice(3).trim().toLowerCase();
            const body: string[] = [];
            i += 1;
            while (i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i++]!);
            i += 1;
            const text = body.join("\n");
            // 저작기의 영상 방언(`MediaDrawer`). 코드로 그리면 회색 상자에 `media:12` 만 남는다 —
            // 저작자는 미리보기에서 재생기를 봤는데 사이트에는 그 글자가 뜬다.
            if ((lang === "video" || lang === "videofile") && text.trim() !== "") {
                blocks.push({
                    kind: "video",
                    source: lang === "videofile" ? "file" : "embed",
                    src: text.trim(),
                });
                continue;
            }
            blocks.push({kind: "code", lang, text});
            continue;
        }

        // 표 — 머리줄 다음이 구분줄일 때만 표다. 열 수의 상한은 **머리줄이 정한다**(넘치는 칸은
        // 버린다 — 저작자의 오타가 열을 어긋나게 하지 않는다). 모자라는 칸은 **채우지 않는다**.
        //
        // 🔴 **칸 수와 행 수에 상한이 있다.** 행마다 머리줄 칸 수만큼 인라인 파싱을 하므로 비용이
        //    «칸 × 행» 곱이다. 상한이 없으면 6.8KB 짜리 본문 하나(1000칸 × 1000행)가 135MB 를 쓰고,
        //    조금 더 키우면 서빙 프로세스가 힙에서 죽는다 — 그 글은 공개 URL 이고 크기가 커서
        //    ISR 이 캐시를 거부하므로, 비용을 **익명 방문자가 반복해서** 유발한다.
        //    상한을 넘는 표는 표로 그리지 않는다(그 줄들은 문단으로 남는다 — 글자는 안 사라진다).
        const tableHead = startsTable(i);
        if (tableHead) {
            i += 2;
            const rows: Inline[][][] = [];
            while (
                i < lines.length &&
                lines[i]!.includes("|") &&
                lines[i]!.trim() !== "" &&
                rows.length < MAX_TABLE_ROWS &&
                tableRows < MAX_TABLE_ROWS_PER_DOCUMENT
            ) {
                // 🔴 **없는 칸을 채우지 않는다.** 머리줄 칸 수만큼 채우면 `|` 한 글자짜리 행이
                //    32개 셀을 만들어 **본문 바이트당 비용**이 열 수만큼 곱해진다(실측: 바이트당
                //    14.2셀 · 113KB 본문이 서빙 프로세스를 죽였다). 넘치는 칸만 버린다.
                const cells = tableCells(lines[i]!).slice(0, tableHead.length);
                rows.push(cells.map((cell) => parseInline(cell)));
                tableRows += 1;
                i += 1;
            }
            blocks.push({kind: "table", head: tableHead.map((cell) => parseInline(cell)), rows});
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
                /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(next) ||
                // 🔴 **표로 그릴 때만** 끊는다 — 「표처럼 보이나」로 끊으면 표가 거절된 줄에서
                //    문단도 끊겨 그 자리를 영원히 다시 본다(위 `tableStartsAt` 의 ⚠).
                startsTable(i) !== null
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
