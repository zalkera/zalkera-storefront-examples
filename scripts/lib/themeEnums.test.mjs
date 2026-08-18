/**
 * 테마 계약 판독기 회귀. 이 판독기가 **작게** 읽으면 정상 시드가 반려되고(팩을 못 굽는다),
 * **크게** 읽으면 계약 밖 값이 전 테넌트로 나간다. 양방향을 다 못 박는다.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {readEnumKeys, readThemeEnums} from "./themeEnums.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("정본을 읽는다 — 세 선언 전부", () => {
    const src = readFileSync(join(ROOT, "src/lib/theme.ts"), "utf8");
    const enums = readThemeEnums(src);
    assert.deepEqual(Object.keys(enums).sort(), ["density", "font", "radius"]);
    for (const [field, keys] of Object.entries(enums)) {
        assert.ok(keys.length > 0, `${field} 이 비었다`);
    }
});

test("따옴표·하이픈 키를 놓치지 않는다 — 앞 판이 noto-serif-kr 을 통째로 잃었다", () => {
    const src = readFileSync(join(ROOT, "src/lib/theme.ts"), "utf8");
    assert.ok(
        readThemeEnums(src).font.includes("noto-serif-kr"),
        "정본에 있는 폰트를 판독기가 못 본다 — 그 값을 쓴 시드가 거짓 반려된다",
    );
});

test("값 안의 템플릿 보간에서 잘리지 않는다", () => {
    // `${...}` 의 닫는 중괄호가 선언의 끝처럼 보인다. 앞 판의 `[^}]*` 가 정확히 여기서 죽었다.
    const keys = readEnumKeys('const F = {a: `x ${Y} z`, b: "2", c: "3"};', "F");
    assert.deepEqual(keys, ["a", "b", "c"]);
});

test("값 안의 중첩 객체에서도 잘리지 않는다", () => {
    assert.deepEqual(readEnumKeys("const F = {a: {n: 1}, b: 2};", "F"), ["a", "b"]);
});

test("값 안의 콜론을 키로 착각하지 않는다", () => {
    // `(\w+)\s*:` 는 값 안의 `https:` 를 키로 잡는다 — 계약 밖 값이 허용목록에 섞인다.
    assert.deepEqual(readEnumKeys('const F = {a: "url(https://x/y)"};', "F"), ["a"]);
});

test("문자열·주석 안의 가짜 선언에 속지 않는다", () => {
    const src = ['const NOTE = "const F = {evil: 1}";', "// const F = {alsoEvil: 1}", 'const F = {real: "1"};'].join("\n");
    assert.deepEqual(readEnumKeys(src, "F"), ["real"]);
});

test("숫자 키·as const 를 읽는다", () => {
    assert.deepEqual(readEnumKeys("const F = {0: 'a', b: 'c'} as const;", "F"), ["0", "b"]);
});

// ── 열거 불가는 통과가 아니다 ────────────────────────────────────────────────
// 아래는 전부 "조용히 작게 읽는" 자리다. 건너뛰면 정상 시드를 반려하므로 던진다.

test("스프레드 — 던진다", () => {
    assert.throws(() => readEnumKeys("const F = {...OTHER, a: 1};", "F"), /스프레드/);
});

test("계산된 키 — 던진다", () => {
    assert.throws(() => readEnumKeys("const F = {[k]: 1};", "F"), /계산된 키/);
});

test("객체가 아닌 초기자 — 던진다", () => {
    assert.throws(() => readEnumKeys("const F = build();", "F"), /객체 리터럴이 아닙니다/);
});

test("선언이 없으면 — 던진다", () => {
    assert.throws(() => readEnumKeys("const G = {a: 1};", "F"), /선언을 못 찾았습니다/);
});

test("빈 객체 — 던진다", () => {
    assert.throws(() => readEnumKeys("const F = {};", "F"), /비었습니다/);
});

test("메서드 멤버 — 던진다", () => {
    assert.throws(() => readEnumKeys("const F = {a() {return 1;}};", "F"), /값 대입이 아닌/);
});

test("양성 통제군 — 정상 선언은 하나도 안 던진다", () => {
    // 위 6건이 전부 던지므로 "언제나 던지는" 판독기로도 통과한다. 그것을 막는다.
    const ok = ["const F = {a: 1};", 'const F = {"a-b": 1};', "const F = {a: 1, b: 2, c: 3};", "const F = {a} ;"];
    for (const src of ok) assert.ok(readEnumKeys(src, "F").length > 0, src);
});

test("값을 바꾸지 않는 껍질을 전부 벗긴다 — 정상 관용구를 거짓 반려하지 않는다", () => {
    // 껍질 하나를 빠뜨리면 그 관용구로 리팩터링하는 순간 팩이 안 구워진다.
    for (const src of [
        "const F = {a: 1} as const;",
        "const F = {a: 1} satisfies Record<string, number>;",
        "const F = {a: 1} as const satisfies Record<string, number>;",
        "const F = ({a: 1});",
        "const F = (({a: 1} as const));",
    ]) {
        assert.deepEqual(readEnumKeys(src, "F"), ["a"], src);
    }
});

test("껍질을 벗겨도 객체가 아니면 던진다 — 벗기기가 통과로 새지 않는다", () => {
    assert.throws(() => readEnumKeys("const F = build() as const;", "F"), /객체 리터럴이 아닙니다/);
});
