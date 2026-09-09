import test from "node:test";
import assert from "node:assert/strict";
import {jsonLdScriptBody} from "./jsonLdScript.ts";

test("🔴 `</script>` 가 섞여도 스크립트가 조기 종료되지 않는다 — `<` 가 하나도 안 남는다", () => {
    const body = jsonLdScriptBody({headline: "</script><img src=x onerror=alert(1)>"});
    assert.equal(body.includes("<"), false, "`<` 가 남으면 그 자리에서 마크업이 시작된다");
    assert.ok(body.includes("\\u003c"));
});

test("이스케이프해도 소비자가 읽는 값은 그대로다 — 파서가 `\\u003c` 를 `<` 로 되돌린다", () => {
    const original = {headline: "a < b </script>", author: "<편집팀>"};
    assert.deepEqual(JSON.parse(jsonLdScriptBody(original)), original);
});

test("키에 들어간 `<` 도 잡는다 — 값만 훑는 구현을 가른다", () => {
    assert.equal(jsonLdScriptBody({"</script>": 1}).includes("<"), false);
});

test("중첩 안쪽도 잡는다 — 이 그래프는 노드를 품는다(ItemList·Offer)", () => {
    const nested = {itemListElement: [{name: "</script>"}]};
    assert.equal(jsonLdScriptBody(nested).includes("<"), false);
});

test("양성 통제군 — `<` 가 없는 값은 손대지 않는다", () => {
    assert.equal(jsonLdScriptBody({name: "잘커라", n: 1}), '{"name":"잘커라","n":1}');
});
