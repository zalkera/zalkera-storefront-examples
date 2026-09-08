import {deepStrictEqual, ok, strictEqual} from "node:assert/strict";
import {test} from "node:test";
import {headingId, parseInline, parseMarkdown} from "./markdown.ts";

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

test("한글 제목도 id 를 얻는다 — 라틴만 남기면 전 문서가 «section» 이 된다", () => {
    const id = headingId("반품·교환 안내", new Set());
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
