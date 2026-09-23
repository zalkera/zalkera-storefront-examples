import {strict as assert} from "node:assert";
import {test} from "node:test";
import {parseJsonWithin} from "./bodyLimit.ts";

test("상한 안의 본문은 그대로 읽고, 넘는 본문은 파싱하지 않는다", () => {
    const text = JSON.stringify({buyerName: "홍길동", buyerPhone: "01012345678"});
    assert.deepEqual(parseJsonWithin(text, text.length), {buyerName: "홍길동", buyerPhone: "01012345678"});
    assert.equal(parseJsonWithin(text, text.length - 1), null, "상한을 넘는 본문을 읽었다");
});

test("깨진 본문은 null 이다 — 던지지 않는다", () => {
    assert.equal(parseJsonWithin("{", 100), null);
});
