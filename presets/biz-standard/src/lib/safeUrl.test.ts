import test from "node:test";
import assert from "node:assert/strict";
import {internalPath, safeLinkUrl} from "./safeUrl.ts";
import {ESCAPES, INTERNAL} from "./urlEscapes.fixture.ts";

/**
 * **URL 소독기의 회귀 픽스처.**
 *
 * ## 왜 이 파일이 생겼나
 *
 * `internalPath`·`safeLinkUrl` 은 소독기이고
 * **잠금이 한 줄도 없었다.** 그래서 세 번째 결함이 배송됐다 — 입력의 오리진만 보고 정규화한
 * 출력을 그대로 돌려줘서, `/..//evil.example` 이 `//evil.example` 이 되어 `refresh` 라우트가
 * 실제로 `Location: https://evil.example/` 가 나간다.
 *
 * 이 값들의 출처는 콘솔·AI·고객 zip·쿼리스트링이라 **전부 신뢰 경계 밖**이다.
 *
 * ## 여기 든 형태는 전부 "고치기 전 판에서 뚫렸던" 것이다
 *
 * 판정은 **출력 재판정**(멱등성)이고, 그것을 `internalPath` 하나가 진다. 입력 목록은
 * `urlEscapes.fixture.ts` 가 든다.
 *
 * ⚠ **`safeNextPath` 는 여기 없다 — `oauthPath.test.ts` 로 갈랐다.** 그 함수는 `src/lib/oauth.ts`
 *   에 살아 로그인을 안 쓰는 사이트에는 없는데, 한 파일에 두면 **로그인을 지운 트리에서 이
 *   중립 가드 시험이 통째로 못 돈다**(`ERR_MODULE_NOT_FOUND`).
 */

test("말뭉치가 비면 위 시험들이 공허해진다 — 크기를 못 박는다", () => {
    // `urlEscapes.fixture.ts` 를 비우면 아래 전부가 «0건을 돌고 초록»이 된다. 하한표는 통과
    // **개수**만 세므로 그 형태를 못 잡는다 — 형제 `safeUrlDrift.test.ts` 와 같은 처방이다.
    assert.ok(ESCAPES.length >= 8, `이탈 말뭉치가 줄었다: ${ESCAPES.length}`);
    assert.ok(INTERNAL.length >= 6, `정상 경로 말뭉치가 줄었다: ${INTERNAL.length}`);
});

test("이탈 형태는 전부 거부된다 — internalPath", () => {
    for (const e of ESCAPES) assert.equal(internalPath(e), null, `통과하면 안 된다: ${e}`);
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
