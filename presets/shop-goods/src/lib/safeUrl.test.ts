import test from "node:test";
import assert from "node:assert/strict";
import {internalPath, safeLinkUrl} from "./safeUrl.ts";
import {safeNextPath} from "./oauth.ts";

/**
 * **URL 소독기의 회귀 픽스처.**
 *
 * ## 왜 이 파일이 생겼나
 *
 * `safeLinkUrl`·`safeNextPath` 는 소독기이고
 * **잠금이 한 줄도 없었다.** 그래서 세 번째 결함이 배송됐다 — 입력의 오리진만 보고 정규화한
 * 출력을 그대로 돌려줘서, `/..//evil.example` 이 `//evil.example` 이 되어 `refresh` 라우트가
 * 실제로 `Location: https://evil.example/` 가 나간다.
 *
 * 이 값들의 출처는 콘솔·AI·고객 zip·쿼리스트링이라 **전부 신뢰 경계 밖**이다.
 *
 * ## 여기 든 형태는 전부 "고치기 전 판에서 뚫렸던" 것이다
 *
 * 문자 목록으로 막지 마라 — `//`·`/\`·`/%2e%2e//`·`/a/b/../..//`·`/./..//` 가 전부 같은 값으로
 * 정규화된다. 판정은 **출력 재판정**(멱등성)이고, 그것을 `internalPath` 하나가 진다.
 */
const ESCAPES = [
    "//evil.example",
    "/\\evil.example",
    "/..//evil.example",
    "/a/b/../..//evil.example",
    "/%2e%2e//evil.example",
    "/./..//evil.example",
    "/..//evil.example/path?x=1#frag",
    "/../..//evil.example",
];

const INTERNAL = ["/about", "/products/1", "/a/b/../c", "/search?q=1", "/page#top", "/"];

test("이탈 형태는 전부 거부된다 — internalPath", () => {
    for (const e of ESCAPES) assert.equal(internalPath(e), null, `통과하면 안 된다: ${e}`);
});

test("이탈 형태는 전부 거부된다 — safeNextPath(리다이렉트 Location 의 원천)", () => {
    for (const e of ESCAPES) assert.equal(safeNextPath(e), null, `통과하면 안 된다: ${e}`);
});

test("이탈 형태는 전부 무력화된다 — safeLinkUrl(href 의 원천)", () => {
    for (const e of ESCAPES) assert.equal(safeLinkUrl(e), "#", `통과하면 안 된다: ${e}`);
});

test("양성 통제군 — 정상 내부 경로는 살아 있다(과잉 차단이면 여기가 빨개진다)", () => {
    for (const p of INTERNAL) {
        assert.notEqual(internalPath(p), null, `막히면 안 된다: ${p}`);
        assert.notEqual(safeLinkUrl(p), "#", `막히면 안 된다: ${p}`);
    }
    assert.equal(internalPath("/a/b/../c"), "/a/c");
    assert.equal(safeLinkUrl("#top"), "#top");
    assert.equal(safeLinkUrl("?q=1"), "?q=1");
});

test("멱등 — 소독한 값을 다시 소독해도 같다", () => {
    for (const p of [...INTERNAL, ...ESCAPES]) {
        const once = safeLinkUrl(p);
        assert.equal(safeLinkUrl(once), once, `멱등하지 않다: ${p} → ${once}`);
    }
});

test("외부 스킴 규칙은 그대로다(허용목록 회귀)", () => {
    assert.equal(safeLinkUrl("https://ok.example/x"), "https://ok.example/x");
    assert.equal(safeLinkUrl("mailto:a@b.c"), "mailto:a@b.c");
    assert.equal(safeLinkUrl("javascript:alert(1)"), "#");
    assert.equal(safeLinkUrl("data:text/html,<script>"), "#");
    assert.equal(safeLinkUrl("vbscript:msgbox"), "#");
});
