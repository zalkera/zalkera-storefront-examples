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
 *   (제목 수를 배로 늘리면 시간이 **네 배**가 된다 — 문단과 달리 이 원장은 문서 전역이라 빈 줄이
 *   막아 주지도 않는다). 번호를 기억하면 탐침이 한 번으로 끝난다.
 *   재현: `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 「원장 — 같은 제목
 *   20,000개의 id 가 1초 안에 갈린다」. ⚠ 그 시험은 [headingId] 를 **직접** 부른다 — 본문으로
 *   재면 블록 예산이 먼저 끊어 이 결함이 문턱 안에 들어온다.
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

/**
 * 인라인 노드 한 개가 예산에서 빼 가는 **몫** — 산출 크기에 맞춘 가중치다.
 *
 * 🔴 **개수로 세면 가장 싼 노드가 예산을 정한다.** 한 판 개수로 셌더니 이미지 참조만 이어 붙인
 * 본문 하나가 예산을 「정확히 지킨 채」 다른 씨앗의 **네 배**를 냈다 — 이미지는 `<img>` 와 그
 * 주소·대체문구를, 강조는 태그 한 쌍을 낸다. 산출이 다른데 같은 몫을 빼 가면 예산이 뜻을 잃는다.
 *
 * 가중치는 «가장 싼 노드 = 1» 로 정규화한 산출 크기 비율이다. 재는 법은 [MAX_BLOCKS_PER_DOCUMENT]
 * KDoc 의 「올리기 전에 재라」와 같다 — 씨앗을 한 갈래만 채워 쪽 바이트를 노드 수로 나눈다.
 * 가중치가 실제로 걸리는지는
 * `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 「비싼 인라인일수록 적게
 * 받는다」가 잰다(이미지 < 링크 < 강조).
 */
const INLINE_COST: Record<Inline["kind"], number> = {
    image: 3,
    code: 2,
    link: 2,
    // ⚠ **`text` 만 잰 값이 아니다** — 글자 노드만 있는 씨앗을 만들 수 없어서다(글자는 다른
    //    노드 «사이» 에만 생긴다). 안전한 쪽으로 **과하게** 잡았다. 산문은 블록 예산이 먼저
    //    걸리므로 이 값 때문에 잘리는 글은 없다 — 그것은 시험의 「예산 안의 장문 기사」가 잰다.
    text: 2,
    strong: 1,
    em: 1,
};

/**
 * 인라인 문법 — 이미지·링크·코드·강조. 겹치는 자리는 **먼저 열린 것이 이긴다**(왼쪽 우선).
 *
 * `limit` 은 이 호출이 쓸 수 있는 **몫**이다(개수가 아니라 [INLINE_COST] 로 가중한 합). 다 쓰면
 * **남은 글자를 통째로 한 덩어리**로 남긴다 — 서식은 잃지만 글자는 안 잃는다. 문서 예산은
 * [parseMarkdown] 이 쥐고 남은 몫을 여기 넘긴다.
 *
 * ⚠ **판정이 여기 있어야 한다.** 한 판 개수로 자르고 밖에서 가중치를 셌더니, 한 블록짜리 문서는
 *   첫 호출에 남은 몫을 통째로 받아 **가중치가 한 번도 안 걸렸다**.
 */
export function parseInline(raw: string, limit: number = MAX_INLINE_NODES_PER_DOCUMENT): Inline[] {
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
    //    상한과 `lastIndex` 가 하고, 줄바꿈 제외는 거기 기여하지 않는다(실측 · 재현은
    //    `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 예산 시험 둘).
    //
    // ⚠ **주소는 균형 잡힌 괄호를 한 겹 받는다.** CommonMark 가 그렇고, 저작기(react-markdown +
    //    remark-gfm)도 그렇다. 첫 `)` 에서 끊으면 `타입_(프로그래밍)` 같은 위키 주소가 **조용히
    //    다른 주소가 되고**, `a_(1).png` 같은 중복 내려받기 파일명은 깨진 이미지가 된다 —
    //    저작자는 미리보기에서 정상으로 보므로 **볼 방법이 없다**. 미지원 문법은 「글자로 남는」
    //    것이지 「틀린 링크를 만드는」 것이 아니어야 한다.
    // ⚠ 두 갈래(`[^()\s]` 와 `\(`)가 첫 글자에서 갈리므로 되짚기가 안 생긴다(선형).
    //
    // ⚠ **이미지 alt 는 한 겹 대괄호를 받는다.** 저작기가 파일명을 이스케이프 없이 박으므로
    //    `[공지] 배너.png` 같은 이름이 그대로 온다 — 안 받으면 그 글의 그림이 글자로 남는다.
    //    ⚠ **절대 시간을 여기 적지 마라** — 기계마다 2~3배 갈리고, 팩을 받는 개발자에게는
    //    「이 기계」라는 말이 가리킬 대상이 없다. 재는 것은 **형상**이다: 지금은 여는 괄호를 배로
    //    늘리면 시간도 배로 늘고(선형), 상한과 `lastIndex` 중 **하나라도** 빼면 4배로 는다(제곱).
    //    재현: `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 예산 시험이
    //    `duration_ms` 를 낸다 — 10k·20k·40k 를 견주면 그 형상이 보인다.
    const pattern =
        /!\[((?:[^[\]]|\[[^[\]]{0,200}\]){0,500})\]\(((?:[^()\s]|\([^()\s]{0,64}\)){1,2048})\)|\[([^[\]]{1,500})\]\(((?:[^()\s]|\([^()\s]{0,64}\)){1,2048})\)|`([^`]{1,500})`|\*\*([^*]{1,500})\*\*|\*([^*]{1,500})\*/g;

    // ⚠ **`lastIndex` 로 전진한다** — `slice` 로 잘라 다시 훑으면 앞부분을 매치마다 되읽는다.
    //    정규식은 상태를 가지므로 **여기서 만든다**(모듈 상수로 올리면 중첩 호출이 서로의
    //    `lastIndex` 를 밟는다).
    let last = 0;
    let spent = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(raw)) !== null) {
        // 🔴 **예산은 여기서 걸어야 한다.** 부른 뒤에 세면 이미 만들어진 뒤다 — 한 문단이
        //    노드 100만 개를 내는 씨앗이 실재한다(`` `x` `` 를 이어 붙이면 블록은 **1개**다).
        if (spent >= limit) break;
        if (m.index > last) {
            out.push({kind: "text", text: raw.slice(last, m.index)});
            spent += INLINE_COST.text;
        }

        if (m[2] !== undefined) out.push({kind: "image", src: m[2], alt: m[1] ?? ""});
        else if (m[4] !== undefined) out.push({kind: "link", href: m[4], text: m[3]!});
        else if (m[5] !== undefined) out.push({kind: "code", text: m[5]});
        else if (m[6] !== undefined) out.push({kind: "strong", text: m[6]});
        else out.push({kind: "em", text: m[7]!});
        spent += INLINE_COST[out[out.length - 1]!.kind];

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
/** 표의 열 수 상한 — 머리줄이 정한다. 넘치는 칸은 버린다(저작자의 오타가 열을 안 어긋나게). */
const MAX_TABLE_COLUMNS = 32;

/**
 * 한 **문서**의 **잎 노드**(표 칸 + 목록 항목) 총수 상한.
 *
 * 🔴 **행이 아니라 칸을 센다.** 표 비용은 «칸 × 행» 곱, 즉 칸 수에 비례한다 — 행으로 세면 2열짜리
 * 긴 가격표가 부당하게 잘리고 32열짜리는 예산의 32배를 쓴다.
 *
 * 🔴 **목록 항목도 같은 예산에서 뺀다.** 목록은 길이와 무관하게 **블록 1개**라 블록 예산이 영원히
 * 안 걸린다. 표 칸과 목록 항목은 「반복되는 잎」이라는 같은 형상이고 산출 단가도 같은 자릿수다.
 *
 * 2,000이면 32열 61행 · 8열 249행 · 4열 499행 · 2열 999행 · 목록 2,000항목이 각각 들어간다
 * (머리줄도 칸이라 한 행씩 적다). 사람이 읽는 가격표·사양표의 현실 범위 밖이다 — 표 10개짜리
 * 장문 기사도 이 예산의 절반을 안 쓴다(시험 「예산 안의 장문 기사」가 그 여유를 잰다).
 *
 * 넘으면 그 뒤의 줄은 표·목록으로 그리지 않는다(문단으로 남아 **글자는 안 사라진다**).
 */
const MAX_LEAF_NODES_PER_DOCUMENT = 2_000;

/**
 * 한 **문서**의 블록 총수 상한.
 *
 * 🔴 **표만 묶으면 안 된다.** 제목·문단에는 상한이 없었다. 제목 한 줄은 문서 HTML + 목차 항목 +
 * RSC 사본 셋을 낸다 — 본문 한 줄이 산출 수백 바이트가 되는 증폭기다(**목록**은 블록이 아니라
 * 잎으로 센다 — [MAX_LEAF_NODES_PER_DOCUMENT]).
 *
 * 1,000블록이면 제목 50개·문단 300개·표 10개·목록 17개짜리 장문 기사가 **여유 있게** 들어간다
 * (그 기사의 블록 377개 — 시험 「예산 안의 장문 기사」가 그 여유를 잰다).
 * 표는 열이 좁을수록 더 긴 행을 받는다 — 4열 499행 · 2열 999행.
 *
 * ## ⚠ 이 값들은 **박스 크기에서 역산했다**
 *
 * 기준은 「예산을 **지킨** 최악 문서를 동시에 넷이 쳐도 컨테이너가 산다」이다. 값을 네 배로 하면
 * K=1 은 살지만 **K=2 에서 죽는다**(192M 기준 · 그때 한 쪽 렌더가 약 135MB).
 *
 * ⚠ 셋 중 **잎과 인라인이 비용을 지배한다** — 그 둘을 고정한 채 블록만 두 배로 해도 최악 산출은
 *   거의 안 는다(0.44 → 0.47MB · 파서 + `Markdown` 기준). 그래서 블록은 장문 기사가 여유를
 *   갖도록 잡고, 잎·인라인은 메모리에서 역산했다.
 *
 * 🔴 **정상·장문 글의 산출은 이 값에 안 걸린다** — 정상 글도 50절짜리 장문 기사(본문 97KB ·
 * 블록 393 · 잎 936 · 몫 2,866)도 예산의 절반을 안 쓴다. 이 값이 자르는 것은 병적인 문서뿐이다.
 *
 * ⛔ **이 값을 올리려면 박스 크기부터 확인하라.** 「좀 넉넉하게」로 올리면 그만큼이 그대로 한
 *    요청의 메모리가 되고, 두 번째 요청이 그 사이트를 죽인다. 재는 법은 배송 형상
 *    (`.next/standalone/server.js`)을 메모리 상한 아래 띄우고 같은 쪽을 **동시에** 치는 것이다.
 * 재현: `node --experimental-strip-types --test src/lib/markdown.test.ts` 의 「예산 안의 장문 기사」·
 * 「좁은 표는 넓은 표보다 훨씬 긴 행을 받는다」.
 *
 * 넘으면 남은 본문은 **서식 없이 글자 그대로** 한 문단에 남는다 — `whitespace-pre-line` 로 그려져
 * 줄바꿈은 살고 연속 공백은 접힌다. **글자는 하나도 안 사라진다.**
 *
 * ## 예산이 함께 묶는 것 — 그리고 안 묶는 것
 *
 * 이 상수와 [MAX_LEAF_NODES_PER_DOCUMENT] · [MAX_INLINE_NODES_PER_DOCUMENT] 가 묶는 것은
 * **구조 비용**이지 본문 크기가 아니다. 예산을 넘긴 글자는 원문 그대로 남으므로 산출은 늘
 * «본문 + 구조» 이고, 구조 쪽만 상수로 닫힌다.
 *
 * ⚠ **본문 크기 자체에는 상한이 없다.** 이 파서가 세울 수 있는 것이 아니다 — 본문을 받는 API 가
 *   정한다. 예산이 없애는 것은 **증폭**이지 크기가 아니다.
 *
 * 왜 증폭이 위험한가: 산출이 커지면 ISR 페이지 캐시가 그 항목을 거부하고, 그러면 **요청마다 다시
 * 그린다**. 그 주소는 공개라 비용을 익명 방문자가 반복해서 유발하고, 서빙 프로세스에는 테넌트가
 * 함께 산다.
 *
 * 재현(예산이 실제로 무는 자리 — 노드 수):
 * `node --experimental-strip-types -e 'import("./src/lib/markdown.ts").then(({parseMarkdown})=>{const b=parseMarkdown("\`x\`".repeat(1e6));console.log("블록",b.length,"인라인",b[0].text.length)})'`
 * → `블록 1 인라인 10001` (`` `x` `` 는 `code` 라 몫 2 — 20,000/2 = 10,000 + 꼬리 글자 1)
 *
 * ⚠ **이 상수들을 올리기 전에 산출을 재라.** 「좀 넉넉하게」로 올리면 그만큼이 그대로 한 요청의
 *   메모리·바이트가 된다. 재는 법은 `npm run build` 뒤 배송 형상(`.next/standalone/server.js`)을
 *   메모리 상한을 건 채 띄우고 그 쪽을 받아 크기를 보는 것이다 — `next start` 는 이 레포의 배송
 *   형상이 아니다(`output: standalone`).
 */
const MAX_BLOCKS_PER_DOCUMENT = 1_000;

/**
 * 한 **문서**의 인라인 예산(위 가중치로 센 몫의 합).
 *
 * 🔴 **블록 수와 잎 수만 묶으면 축이 안 닫힌다.** 한 문단은 내용이 얼마든 **블록 1개**이고 잎은
 * 0개다 — 인라인 문법만 이어 붙인 본문 하나가 두 예산을 **통과한 채** 힙을 넘긴다. 인라인 노드
 * 하나가 `<code>`·`<a>` 하나와 그 RSC 사본을 낸다.
 *
 * 표 칸·목록 항목 **안의** 인라인도 여기서 센다(잎마다 인라인 파싱을 하므로 같은 자원이다).
 *
 * 넘으면 그 뒤의 글자는 **서식 없이 한 덩어리**로 남는다 — 글자는 안 사라진다.
 *
 * ⚠ 그래서 몫의 합은 이 값을 넘을 수 있다 — 예산이 바닥나도 블록·잎마다 남은 글자 한 덩어리는
 *   생긴다(그것이 글자를 안 잃는 방법이다). 상한은 «이 값 + (블록 수 + 잎 수) × 글자 몫» 이다.
 */
const MAX_INLINE_NODES_PER_DOCUMENT = 5_000;

/** 목록 항목 — 판정이 두 자리(목록 갈래·문단 경계)에 있으므로 정규식은 한 벌만 둔다. */
const BULLET_ITEM = /^ {0,3}([-*+])\s+(.*)$/;
const ORDERED_ITEM = /^ {0,3}\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
    const blocks: Block[] = [];
    const usedIds = new Map<string, number>();
    let leafUsed = 0;
    let inlineUsed = 0;
    /**
     * 인라인 파싱의 **단 하나의 자리** — 문서 예산이 여기를 지난다.
     *
     * ⚠ `parseInline` 을 이 파일 안에서 직접 부르지 마라. 그러면 그 호출만 예산 밖이 된다.
     */
    const inline = (text: string): Inline[] => {
        const nodes = parseInline(text, Math.max(0, MAX_INLINE_NODES_PER_DOCUMENT - inlineUsed));
        inlineUsed += nodes.reduce((sum, node) => sum + INLINE_COST[node.kind], 0);
        return nodes;
    };
    /**
     * 표 판정의 **단 하나의 자리** — 문서 예산까지 여기서 본다. 문단 경계도 이것을 쓴다:
     * 두 술어가 갈리면 표를 거절한 줄에서 문단도 끊겨 진행이 멈춘다(같은 줄을 영원히 다시 본다).
     */
    const startsTable = (index: number): string[] | null => {
        const head = tableStartsAt(lines, index);
        // 머리줄까지 **들어가야** 표로 판정한다 — 「남았나」만 보면 예산을 머리줄 폭만큼 넘긴다.
        if (head === null || leafUsed + head.length > MAX_LEAF_NODES_PER_DOCUMENT) return null;
        return head;
    };
    const lines = source.replace(/\r\n?/g, "\n").split("\n");

    /**
     * 목록 판정의 **단 하나의 자리** — 문단 경계도 이것을 쓴다. 두 술어가 갈리면 목록을 거절한
     * 줄에서 문단도 끊겨 빈 문단이 줄 수만큼 생긴다(표의 `startsTable` 과 같은 처방).
     */
    const startsList = (line: string): boolean =>
        (BULLET_ITEM.test(line) || ORDERED_ITEM.test(line)) && leafUsed < MAX_LEAF_NODES_PER_DOCUMENT;

    let i = 0;
    while (i < lines.length) {
        // 🔴 **블록 예산.** 다 쓰면 남은 본문을 **서식 없이 글자 그대로** 한 문단에 담고 끝낸다 —
        //    인라인 파싱도 안 한다(링크 하나가 다시 노드 하나다). 글자는 안 사라진다.
        if (blocks.length >= MAX_BLOCKS_PER_DOCUMENT) {
            const rest = lines.slice(i).join("\n").trim();
            if (rest !== "") blocks.push({kind: "paragraph", text: [{kind: "text", text: rest}]});
            break;
        }

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
        // 🔴 **칸에 예산이 있다.** 행마다 머리줄 칸 수만큼 인라인 파싱을 하므로 비용이 «칸 × 행»
        //    곱, 즉 칸 수다. 예산이 없으면 몇 KB 짜리 본문 하나가 수백 MB 를 쓰고, 조금 더 키우면
        //    서빙 프로세스가 힙에서 죽는다 — 그 글은 공개 URL 이고, 산출이 커지면 ISR 캐시가 그
        //    항목을 거부해 **매 요청 다시 그린다**.
        //    예산을 넘는 줄은 표로 그리지 않는다(문단으로 남는다 — 글자는 안 사라진다).
        const tableHead = startsTable(i);
        if (tableHead) {
            i += 2;
            const rows: Inline[][][] = [];
            // 머리줄도 칸이다 — 예산에서 먼저 뺀다.
            leafUsed += tableHead.length;
            while (
                i < lines.length &&
                lines[i]!.includes("|") &&
                lines[i]!.trim() !== "" &&
                leafUsed + tableHead.length <= MAX_LEAF_NODES_PER_DOCUMENT
            ) {
                // 🔴 **없는 칸을 채우지 않는다.** 머리줄 칸 수만큼 채우면 `|` 한 글자짜리 행이
                //    32개 셀을 만들어 **본문 바이트당 비용**이 열 수만큼 곱해진다. 넘치는 칸만
                //    버린다. 재현: `node --experimental-strip-types --test src/lib/markdown.test.ts`
                //    의 「표를 100개 쌓아도」가 칸 총수를 잰다.
                const cells = tableCells(lines[i]!).slice(0, tableHead.length);
                rows.push(cells.map((cell) => inline(cell)));
                leafUsed += cells.length;
                i += 1;
            }
            blocks.push({kind: "table", head: tableHead.map((cell) => inline(cell)), rows});
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
                text: inline(text),
            });
            i += 1;
            continue;
        }

        if (/^ {0,3}>\s?/.test(line)) {
            const body: string[] = [];
            while (i < lines.length && /^ {0,3}>\s?/.test(lines[i]!)) {
                body.push(lines[i++]!.replace(/^ {0,3}>\s?/, ""));
            }
            blocks.push({kind: "quote", text: inline(body.join(" "))});
            continue;
        }

        if (startsList(line)) {
            const isOrdered = ORDERED_ITEM.test(line);
            const items: Inline[][] = [];
            // 🔴 **항목도 예산에서 뺀다.** 목록은 길이와 무관하게 **블록 1개**라 블록 예산이 영원히
            //    안 걸린다 — 짧은 본문 하나가 `<li>` 수만 개를 낸다. 들어올 때 예산이 남아 있음을
            //    `startsList` 가 보장하므로 첫 항목은 항상 실린다(그래야 `i` 가 전진한다).
            while (i < lines.length && leafUsed < MAX_LEAF_NODES_PER_DOCUMENT) {
                const m = isOrdered ? ORDERED_ITEM.exec(lines[i]!) : BULLET_ITEM.exec(lines[i]!);
                if (!m) break;
                items.push(inline((isOrdered ? m[1]! : m[2]!).trim()));
                leafUsed += 1;
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
                // 🔴 **목록도 같은 술어를 쓴다** — 표와 같은 이유다. 「목록처럼 보이나」로 끊고
                //    목록 판정에서는 예산까지 보면, 예산이 소진된 뒤 줄마다 문단이 끊긴다.
                startsList(next) ||
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
        blocks.push({kind: "paragraph", text: inline(body.join("\n"))});
    }

    return blocks;
}
