/**
 * **테마 파서의 회귀 픽스처 — 이 파일은 CSS 주입 지점이다.**
 *
 * `parseThemeColors` 가 돌려주는 맵은 `<html style={...}>` 에 그대로 얹힌다. 값의 출처는 **콘솔에
 * 저장된 테넌트 설정**이고, 그것은 우리가 정하지 않는다. 화이트리스트가 한 줄만 느슨해지면 그
 * 팩에서만 CSS 주입이 열린다 — `wiring-parity` 가 이 파일과 `theme.ts` 를 다섯 벌에서 바이트로
 * 잠그는 이유가 그것이다.
 *
 * 재현: `npm test`
 */
import assert from "node:assert/strict";
import test from "node:test";
import {parseThemeColors} from "./theme.ts";

const vars = (raw: unknown) => parseThemeColors(JSON.stringify(raw)).cssVars;

test("정상 색만 통과한다", () => {
  const out = vars({primary: "#3b82f6", secondary: "#abc", background: "#ffffff", text: "#000000"});
  assert.equal(out["--color-primary"], "#3b82f6");
  assert.equal(out["--color-secondary"], "#abc");
  assert.equal(out["--color-background"], "#ffffff");
  assert.equal(out["--color-foreground"], "#000000");
});

test("색이 아닌 것은 통째로 버린다 — 값이 style 속성에 실린다", () => {
  // 하나라도 새면 그 문자열이 `<html style>` 안으로 들어간다.
  const evil = [
    "red",
    "#3b82f6; background: url(https://evil.test/x)",
    "#3b82f6;}html{display:none",
    "var(--anything)",
    "expression(alert(1))",
    "#12345",
    "#1234567",
    "#zzzzzz",
    " #3b82f6",
    "#3b82f6 ",
    "#3b82f6\n",
    "url(javascript:alert(1))",
    "",
  ];
  for (const value of evil) {
    assert.deepEqual(vars({primary: value}), {}, `통과했다: ${JSON.stringify(value)}`);
  }
});

test("문자열이 아닌 값도 버린다", () => {
  for (const value of [null, 42, true, {}, [], undefined]) {
    assert.deepEqual(vars({primary: value}), {}, `통과했다: ${JSON.stringify(value)}`);
  }
});

test("아는 키만 읽는다 — 모르는 키는 변수 이름이 되지 않는다", () => {
  const out = vars({primary: "#3b82f6", "--evil": "#000000", accent: "#000000", "color-primary": "#000"});
  assert.deepEqual(Object.keys(out).sort(), ["--color-primary", "--color-primary-foreground"]);
});

test("primary 를 덮으면 그 위 글자색도 함께 정한다", () => {
  // 테넌트가 밝은 액센트를 골라도 CTA 글자가 안 죽어야 한다.
  assert.equal(vars({primary: "#ffffff"})["--color-primary-foreground"], "#020617");
  assert.equal(vars({primary: "#000000"})["--color-primary-foreground"], "#ffffff");
  // primary 가 없으면 그 변수도 없다 — 기본 테마를 건드리지 않는다.
  assert.equal("--color-primary-foreground" in vars({secondary: "#abc"}), false);
});

test("knob 은 표에 있는 값만 받는다 — 사용자 문자열이 style 에 실리지 않는다", () => {
  assert.equal(vars({radius: "round"})["--radius-knob"], "2");
  assert.equal(vars({density: "compact"})["--spacing"], "0.22rem");
  assert.ok(vars({font: "pretendard"})["--font-sans"].includes("Pretendard"));
  for (const bad of ["9999px", "1; }", "system-ui;x:y", "toString", "valueOf"]) {
    assert.deepEqual(vars({radius: bad}), {}, `radius 로 통과했다: ${bad}`);
    assert.deepEqual(vars({font: bad}), {}, `font 로 통과했다: ${bad}`);
    assert.deepEqual(vars({density: bad}), {}, `density 로 통과했다: ${bad}`);
  }
});

test("프로토타입 오염으로 표를 뚫을 수 없다", () => {
  // `hasOwnProperty` 가 아니라 `in` 이었으면 `constructor`·`__proto__` 가 표에 있는 것처럼 보인다.
  for (const bad of ["constructor", "__proto__", "hasOwnProperty", "isPrototypeOf"]) {
    assert.deepEqual(vars({radius: bad}), {}, `${bad} 가 반지름이 됐다`);
  }
  assert.deepEqual(parseThemeColors('{"__proto__":{"radius":"round"}}').cssVars, {});
  assert.equal(({} as Record<string, unknown>).radius, undefined, "프로토타입이 오염됐다");
});

test("입력이 없거나 형식이 아니면 기본 테마를 그대로 둔다", () => {
  for (const raw of [null, undefined, "", "not json", "[]", "null", '"문자열"', "42"]) {
    assert.deepEqual(parseThemeColors(raw as string).cssVars, {}, `통과했다: ${String(raw)}`);
  }
});

test("색 키와 knob 키가 겹치지 않는다 — 겹치면 어느 쪽이 이기는지 알 수 없다", () => {
  const colorOnly = Object.keys(vars({primary: "#000", secondary: "#111", background: "#222", text: "#333"}));
  const knobOnly = Object.keys(vars({font: "system", radius: "soft", density: "cozy"}));
  assert.deepEqual(colorOnly.filter((k) => knobOnly.includes(k)), []);
});
