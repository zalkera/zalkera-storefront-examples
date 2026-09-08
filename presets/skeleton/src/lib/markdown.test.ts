import {deepStrictEqual, ok, strictEqual} from "node:assert/strict";
import {test} from "node:test";
import {headingId, headings, inlineText, parseInline, parseMarkdown} from "./markdown.ts";

/**
 * **재는 것은 「구조가 생기는가」다** — 글자가 아니라 `h2`·`a`·`img`·`li` 의 경계.
 *
 * 🔴 이 축이 SEO·AEO 의 전부다. 평문으로 내면 답변 엔진이 인용할 청크 경계가 없고 크롤러가
 *    따라갈 내부 링크가 없다.
 */

test("🔴 제목이 h2·h3 로 갈린다 — 평문이면 청크 경계가 아예 없다", () => {
    const blocks = parseMarkdown("## 큰 제목\n\n### 작은 제목");
    deepStrictEqual(
        blocks.map((b) => (b.kind === "heading" ? b.level : b.kind)),
        [2, 3],
    );
});

test("🔴 h1 은 만들지 않는다 — 쪽에 이미 글 제목의 h1 이 있다", () => {
    const blocks = parseMarkdown("# 제목처럼 쓴 줄");
    strictEqual(blocks[0]?.kind, "heading");
    strictEqual((blocks[0] as {level: number}).level, 2, "h1 이 두 개가 되면 개요가 무너진다");
});

test("🔴 제목에 앵커 id 가 붙는다 — 인용 단위가 문서에서 «절» 로 내려간다", () => {
    const blocks = parseMarkdown("## 배송 안내\n\n## 배송 안내");
    const ids = blocks.filter((b) => b.kind === "heading").map((b) => (b as {id: string}).id);
    strictEqual(ids.length, 2);
    ok(ids[0] !== ids[1], "같은 제목 둘이 같은 id 를 쓰면 링크가 첫 절로만 간다");
});

test("앵커는 «이미 쓰인 id» 와도 안 겹친다 — 번호 기억이 유일성을 이기지 않는다", () => {
    // 「제목-2」가 먼저 나온 뒤 「제목」이 이어지면, 번호만 기억하는 구현은 같은 id 를 두 번 만든다.
    // 앵커가 겹치면 뒤 절을 주소로 가리킬 수 없다(그것이 이 id 의 존재 이유다).
    const ids = parseMarkdown("## 배송 안내-2\n\n## 배송 안내\n\n## 배송 안내\n\n## 배송 안내")
        .filter((b) => b.kind === "heading")
        .map((b) => (b as {id: string}).id);
    strictEqual(new Set(ids).size, ids.length, `앵커가 겹쳤다: ${JSON.stringify(ids)}`);
});

/**
 * **예산 — 앵커 원장은 문서 전역이라 빈 줄이 못 막는다.** 같은 제목이 반복되면 종전 구현은 k번째
 * 중복에 k번 탐침해 제목 수의 제곱이 됐다(실측: 2만 개 → 파서 13.2초 · 그 쪽 첫 방문자 15.3초).
 */
test("예산 — 같은 제목 20,000개가 1초 안에 끝난다", () => {
    const started = process.hrtime.bigint();
    const blocks = parseMarkdown("## 배송 안내\n\n".repeat(20_000));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    strictEqual(blocks.length, 20_000);
    ok(ms < 1000, `제목 파싱이 ${ms.toFixed(0)}ms 걸렸다 — 제곱 비용이 돌아왔다`);
});

test("한글 제목도 id 를 얻는다 — 라틴만 남기면 전 문서가 «section» 이 된다", () => {
    const id = headingId("반품·교환 안내", new Map());
    ok(id.length > 0 && id !== "section", `얻은 id: ${id}`);
    ok(!id.includes("·"), "구두점이 주소에 남았다");
});

test("🔴 링크와 이미지가 노드로 나온다 — 문자열로 남으면 크롤러가 못 따라간다", () => {
    const inline = parseInline("자세한 것은 [배송 정책](/policies) 과 ![커버](/media/12) 참고");
    const kinds = inline.map((n) => n.kind);
    ok(kinds.includes("link"), `링크가 없다: ${JSON.stringify(kinds)}`);
    ok(kinds.includes("image"), `이미지가 없다: ${JSON.stringify(kinds)}`);
});

test("🔴 이미지가 링크보다 먼저 읽힌다 — `![alt](x)` 가 링크로 새면 alt 가 사라진다", () => {
    const inline = parseInline("![대체문구](/media/9)");
    strictEqual(inline.length, 1);
    strictEqual(inline[0]?.kind, "image");
    strictEqual((inline[0] as {alt: string}).alt, "대체문구");
});

test("목록이 항목으로 쪼개진다 — 한 문단이면 그 목록은 목록이 아니다", () => {
    const blocks = parseMarkdown("- 하나\n- 둘\n- 셋");
    strictEqual(blocks[0]?.kind, "list");
    strictEqual((blocks[0] as {items: unknown[]}).items.length, 3);
    strictEqual((blocks[0] as {ordered: boolean}).ordered, false);
});

test("번호 목록은 ordered 로 갈린다", () => {
    const blocks = parseMarkdown("1. 먼저\n2. 다음");
    strictEqual((blocks[0] as {ordered: boolean}).ordered, true);
});

test("빈 줄이 문단을 가르고, 한 줄 바꿈은 문단 안에 남는다", () => {
    const blocks = parseMarkdown("첫 문단 첫 줄\n첫 문단 둘째 줄\n\n둘째 문단");
    strictEqual(blocks.length, 2);
    strictEqual(blocks[0]?.kind, "paragraph");
    strictEqual(blocks[1]?.kind, "paragraph");
});

test("코드 울타리는 안쪽을 문법으로 읽지 않는다", () => {
    const blocks = parseMarkdown("```\n## 제목이 아니다\n- 목록도 아니다\n```");
    strictEqual(blocks.length, 1);
    strictEqual(blocks[0]?.kind, "code");
    ok((blocks[0] as {text: string}).text.includes("## 제목이 아니다"));
});

test("🔴 원시 HTML 은 노드가 아니라 «글자» 로 남는다 — 렌더러에 실행 경로가 없다", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>");
    strictEqual(blocks[0]?.kind, "paragraph");
    const text = (blocks[0] as {text: {kind: string; text?: string}[]}).text;
    strictEqual(text[0]?.kind, "text", "HTML 이 노드로 승격되면 그 순간이 XSS 표면이다");
    ok(text[0]?.text?.includes("<script>"));
});

test("인용과 구분선이 자기 블록이 된다", () => {
    const blocks = parseMarkdown("> 인용문\n\n---");
    deepStrictEqual(
        blocks.map((b) => b.kind),
        ["quote", "hr"],
    );
});

test("통제군 — 빈 본문은 블록 0개다(빈 배열을 «그렸다»로 읽지 않게)", () => {
    strictEqual(parseMarkdown("").length, 0);
    strictEqual(parseMarkdown("\n\n  \n").length, 0);
});

/* ── 저작기 방언 ─────────────────────────────────────────────────────────────
 * 아래 셋은 콘솔 미디어 드로어(`MediaDrawer`)가 **실제로 내는 것**이다. 파서가 못 알아보면
 * 저작자는 미리보기에서 그림·재생기를 보고 사이트에서는 회색 상자 속 `media:12` 를 본다.
 * 참조를 주소로 바꾸는 판정은 `mediaRef.test.ts` 가 따로 잰다(여기는 **구조**만 잰다). */

test("이미지 참조는 원문 그대로 노드에 남는다 — 해석은 파서 밖이다", () => {
    const [block] = parseMarkdown("![사진](media:12)");
    strictEqual(block?.kind, "paragraph");
    deepStrictEqual((block as {text: unknown[]}).text, [{kind: "image", src: "media:12", alt: "사진"}]);
});

test("`videofile` 펜스는 코드가 아니라 영상이다", () => {
    const [block] = parseMarkdown("```videofile\nmedia:12\n```");
    deepStrictEqual(block, {kind: "video", source: "file", src: "media:12"});
});

test("`video` 펜스는 외부 영상이다", () => {
    const [block] = parseMarkdown("```video\nhttps://youtu.be/abc\n```");
    deepStrictEqual(block, {kind: "video", source: "embed", src: "https://youtu.be/abc"});
});

test("음성 짝 — 보통 펜스는 여전히 코드이고 언어를 들고 있다", () => {
    // 이 짝이 없으면 「펜스는 전부 영상」이라는 구현도 위 둘을 통과한다.
    deepStrictEqual(parseMarkdown("```ts\nconst a = 1;\n```")[0], {
        kind: "code",
        lang: "ts",
        text: "const a = 1;",
    });
    deepStrictEqual(parseMarkdown("```\n평문\n```")[0], {kind: "code", lang: "", text: "평문"});
    // 빈 영상 펜스는 영상이 아니다 — 소스가 없으면 그릴 것도 없다.
    strictEqual(parseMarkdown("```videofile\n```")[0]?.kind, "code");
});

/* ── 표 ─────────────────────────────────────────────────────────────────────
 * 답변 엔진은 표를 통째로 인용한다. 저작기(remark-gfm)가 표를 그리므로 여기도 그린다. */

test("표는 머리와 행으로 갈린다 — 셀 안의 인라인도 산다", () => {
    const [block] = parseMarkdown("| 이름 | 값 |\n|---|---|\n| **굵게** | [링크](/a) |\n| 하나 | 둘 |");
    strictEqual(block?.kind, "table");
    const table = block as {head: {text?: string}[][]; rows: {kind: string}[][][]};
    deepStrictEqual(
        table.head.map((c) => c[0]?.text),
        ["이름", "값"],
    );
    strictEqual(table.rows.length, 2);
    strictEqual(table.rows[0]![0]![0]!.kind, "strong");
    strictEqual(table.rows[0]![1]![0]!.kind, "link");
});

test("열 수의 상한은 머리줄이 정한다 — 넘치면 버리고, 모자라면 «채우지 않는다»", () => {
    // 모자란 칸을 채우면 `|` 한 글자짜리 행이 머리줄 칸 수만큼 셀을 만든다 — 본문 바이트당
    // 비용이 열 수만큼 곱해져, 상한 안의 표를 여러 개 쌓는 것만으로 서버가 죽는다(심의 실측).
    const [block] = parseMarkdown("| a | b |\n|---|---|\n| 하나 |\n| 하나 | 둘 | 셋 |");
    const {rows} = block as {rows: unknown[][]};
    deepStrictEqual(
        rows.map((r) => r.length),
        [1, 2],
    );
});
test("음성 짝 — 구분줄이 없으면 표가 아니다(파이프 든 문장이 표가 되면 안 된다)", () => {
    strictEqual(parseMarkdown("| 이건 표가 아니다 | 그냥 문장 |")[0]?.kind, "paragraph");
    strictEqual(parseMarkdown("가격은 1,000|2,000 사이입니다")[0]?.kind, "paragraph");
    // 앞 문단에 먹히지도 않는다 — 문단 다음 줄이 표 머리면 거기서 끊긴다.
    deepStrictEqual(
        parseMarkdown("문단입니다\n| a | b |\n|---|---|\n| 1 | 2 |").map((b) => b.kind),
        ["paragraph", "table"],
    );
});

/**
 * **예산 — 이 파서는 RSC(서버)에서 돈다.** 닫히지 않는 여는 괄호가 이어지면 종전 구현은 한 자리의
 * 실패 시도가 남은 본문 전체를 되짚어 **본문 길이의 제곱**이 됐다. 저작자 한 명의 오타가 그
 * 사이트의 응답을 세우는 형태다.
 *
 * 실측(개발 기계): 종전 10k 277ms · 20k 1,128ms · 40k 5,619ms(배로 늘면 4배) → 지금 40k **128ms** ·
 * 80k 258ms(선형). 상한은 그 사이를 넉넉히 벌려 잡는다 — 느린 CI 에서 깜빡이지 않으면서 제곱이
 * 돌아오면 반드시 걸리는 자리다.
 */
test("예산 — 닫히지 않는 괄호 40,000개가 1.5초 안에 끝난다", () => {
    const started = process.hrtime.bigint();
    parseMarkdown("![".repeat(40_000));
    parseInline("[x](".repeat(40_000));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    ok(ms < 1500, `본문 파싱이 ${ms.toFixed(0)}ms 걸렸다 — 제곱 비용이 돌아왔다`);
});

/* ── 목차의 재료 ────────────────────────────────────────────────────────────── */

test("제목 목록이 본문 순서·깊이·앵커를 그대로 준다", () => {
    const items = headings("## 배송\n\n본문\n\n### 지역별\n\n#### 도서산간\n\n## 교환");
    deepStrictEqual(items, [
        {level: 2, id: "배송", text: "배송"},
        {level: 3, id: "지역별", text: "지역별"},
        {level: 4, id: "도서산간", text: "도서산간"},
        {level: 2, id: "교환", text: "교환"},
    ]);
});

test("제목의 서식은 목차에서 «말» 이 된다 — 링크 주소·마크업이 아니라", () => {
    // 목차에 `**` 나 URL 이 뜨면 그것은 제목이 아니다.
    strictEqual(inlineText(parseInline("**중요** 한 [안내](/guide) 와 ![그림](media:12)")), "중요 한 안내 와 그림");
    strictEqual(headings("## **배송** 안내")[0]?.text, "배송 안내");
});

test("통제군 — 제목이 없는 본문은 빈 목록이다(빈 상자를 그리지 않게)", () => {
    strictEqual(headings("그냥 문단입니다.\n\n- 목록\n\n> 인용").length, 0);
    strictEqual(headings("").length, 0);
});

/* ── 표의 예산과 경계 ────────────────────────────────────────────────────────
 * 표는 비용이 «칸 × 행» 곱이라, 작은 본문 하나가 서빙 프로세스를 죽일 수 있는 유일한 축이다.
 * 그 글은 공개 URL 이고 크기가 커서 ISR 이 캐시를 거부하므로 비용을 방문자가 반복 유발한다. */

test("🔴 예산 — 1000칸 × 1000행(6.8KB)이 표로 그려지지 않고 즉시 끝난다", () => {
    const evil = "|".repeat(1001) + "\n|" + "---|".repeat(1000) + "\n" + "|\n".repeat(1000);
    const started = process.hrtime.bigint();
    const blocks = parseMarkdown(evil);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    strictEqual(blocks[0]?.kind, "paragraph", "상한을 넘는 표를 표로 그렸다");
    ok(ms < 500, `${ms.toFixed(0)}ms 걸렸다 — 칸×행 곱이 돌아왔다`);
});

// ⚠ **시간 상한을 단다.** 이 판정이 깨지면 시험이 실패하는 게 아니라 **안 끝난다** — CI 가
// red 가 아니라 hang 이 되어 「왜 멈췄는지」를 아무도 못 읽는다.
test("🔴 표가 거절돼도 진행이 멈추지 않는다 — 칸 수가 안 맞는 오타", {timeout: 10_000}, () => {
    // 표 분기와 문단 경계가 다른 술어를 쓰면 이 입력에서 같은 줄을 영원히 다시 본다(무한 루프).
    // 이 시험이 끝나는 것 자체가 판정이다.
    deepStrictEqual(
        parseMarkdown("| a | b |\n|---|\n| 1 |").map((b) => b.kind),
        ["paragraph"],
    );
    deepStrictEqual(
        parseMarkdown("| a | b |\n|---|").map((b) => b.kind),
        ["paragraph"],
    );
});

test("상한 안의 표는 그대로 그린다 — 좁힘이 정상 표를 먹지 않는다", () => {
    const head = `|${Array.from({length: 32}, (_, c) => ` c${c} `).join("|")}|`;
    const delim = `|${"---|".repeat(32)}`;
    const row = `|${Array.from({length: 32}, (_, c) => ` v${c} `).join("|")}|`;
    const [block] = parseMarkdown([head, delim, ...Array(200).fill(row)].join("\n"));

    strictEqual(block?.kind, "table");
    const table = block as {head: unknown[]; rows: unknown[]};
    strictEqual(table.head.length, 32);
    strictEqual(table.rows.length, 200);
});

/* ── 저작기가 실제로 내는 꼴 ─────────────────────────────────────────────── */

test("파일명에 대괄호가 있어도 이미지다 — 저작기는 이름을 이스케이프하지 않는다", () => {
    // `![[공지] 배너.png](media:13)`. 안 받으면 그 글의 그림이 글자로 남는다.
    const [block] = parseMarkdown("![[공지] 배너.png](media:13)");
    deepStrictEqual((block as {text: unknown[]}).text, [{kind: "image", src: "media:13", alt: "[공지] 배너.png"}]);
});

test("강조·링크는 줄바꿈을 건너뛴다 — 저작기(CommonMark)와 같은 답", () => {
    // 한 문단 안의 줄바꿈은 화면에 살리되(`whitespace-pre-line`), 문법은 줄을 건넌다.
    deepStrictEqual(
        parseInline("**굵게 첫 줄\n둘째 줄**").map((n) => n.kind),
        ["strong"],
    );
    deepStrictEqual(
        parseInline("[배송\n정책](/policies)").map((n) => n.kind),
        ["link"],
    );
});

test("앵커는 «이미 만들어 낸 id» 와도 안 겹친다 — 반대 순서", () => {
    // 「제목」이 먼저 둘, 그다음 「제목-2」. 만들어 낸 id 를 원장에 안 남기면 여기서 겹친다.
    const ids = parseMarkdown("## 배송 안내\n\n## 배송 안내\n\n## 배송 안내-2")
        .filter((b) => b.kind === "heading")
        .map((b) => (b as {id: string}).id);
    strictEqual(new Set(ids).size, ids.length, `앵커가 겹쳤다: ${JSON.stringify(ids)}`);
});

test("🔴 예산 — 행 상한: 501행째부터는 표가 아니다", () => {
    // 칸 상한만으로는 못 막는다. 32칸 표는 행이 늘수록 비용이 곱으로 는다 — 977KB 본문이
    // 654MB·2.3초, 3.9MB 면 2.6GB(심의 실측). 본문 길이에 상한이 없으므로 행에도 상한이 있어야 한다.
    const head = `|${Array.from({length: 32}, (_, c) => ` c${c} `).join("|")}|`;
    const delim = `|${"---|".repeat(32)}`;
    const row = `|${Array.from({length: 32}, () => " v ").join("|")}|`;
    const started = process.hrtime.bigint();
    const blocks = parseMarkdown([head, delim, ...Array(5_000).fill(row)].join("\n"));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    strictEqual(blocks[0]?.kind, "table");
    strictEqual((blocks[0] as {rows: unknown[]}).rows.length, 500, "행 상한이 안 걸렸다");
    // 넘친 줄은 사라지지 않는다 — 문단으로 남는다.
    strictEqual(blocks[1]?.kind, "paragraph");
    ok(ms < 500, `${ms.toFixed(0)}ms 걸렸다 — 행 상한이 비용을 못 묶는다`);
});

test("🔴 예산 — 상한 안의 표를 100개 쌓아도 즉시 끝난다", () => {
    // 표 하나의 상한은 표 «개수» 를 안 묶는다. 비용은 본문 바이트에 비례해야 한다.
    const head = `|${Array.from({length: 32}, (_, c) => ` c${c} `).join("|")}|`;
    const delim = `|${"---|".repeat(32)}`;
    const table = [head, delim, ...Array(500).fill("|")].join("\n");
    const source = Array(100).fill(table).join("\n\n");

    const started = process.hrtime.bigint();
    const blocks = parseMarkdown(source);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    // 문서 예산(2,000행)을 쓰고 나면 그 뒤 표는 문단이다 — 글자는 안 사라진다.
    strictEqual(blocks.filter((b) => b.kind === "table").length, 4);
    strictEqual(blocks.filter((b) => b.kind === "paragraph").length, 96);
    // 행 총수가 문서 예산에서 멈춘다 — 표당 상한만으로는 여기서 5만 행이 된다.
    const rows = blocks.reduce((sum, b) => sum + (b.kind === "table" ? (b as {rows: unknown[][]}).rows.length : 0), 0);
    strictEqual(rows, 2_000, `표 행이 ${rows}개 — 문서 예산이 안 걸렸다`);
    ok(ms < 500, `${ms.toFixed(0)}ms 걸렸다 — 본문 바이트당 비용이 열 수만큼 곱해진다`);
});
