/**
 * **미리보기 판별자가 받는 이름 — 둘 다.**
 *
 * 이 판정이 거짓이 되면 `src/middleware.ts` 가 쓰기를 안 막는다. 미리보기가 상용 백엔드에
 * 주문·결제를 쓴다는 뜻이다.
 *
 * 구 이름(`NEXT_PUBLIC_ONEQUE_PREVIEW`)을 「죽은 폴백」으로 보고 지우는 일이 반복될 수 있어
 * 여기서 못 박는다 — `README.md` 가 「지금도 받습니다」라고 명시하므로, 그 말을 따라 손으로
 * 넣어 둔 BYO 배포가 있다. 지우면 그 배포의 가드가 조용히 꺼진다.
 *
 * ⚠ `NEXT_PUBLIC_*` 는 **빌드 시 리터럴로 치환**된다. 그래서 판별자를 직접 부르지 않고,
 *   소스가 두 이름을 **둘 다 보는지**를 구문으로 확인한다. 런타임 주입으로는 못 잰다.
 *
 * 재현: `npm test`
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "preview.ts"), "utf8");

/** 주석이 아니라 **판별식 본문**만. 주석에만 남기고 코드에서 지우는 것이 가장 흔한 반쪽 제거다. */
const BODY = SOURCE.slice(SOURCE.indexOf("export const isPreview"));

test("판별자가 두 이름을 다 본다", () => {
  for (const name of ["NEXT_PUBLIC_ZALKERA_PREVIEW", "NEXT_PUBLIC_ONEQUE_PREVIEW"]) {
    assert.match(BODY, new RegExp(`process\\.env\\.${name}\\s*===\\s*"1"`), `${name} 를 안 본다`);
  }
});

test("`=== \"1\"` 로 정확히 비교한다 — 참같은 값이면 아무 값이나 미리보기가 된다", () => {
  // `process.env.X` 만 보면 `NEXT_PUBLIC_ZALKERA_PREVIEW=0` 도 참이 되어, 끄려던 사람이
  // 미리보기에 갇힌다(읽기 전용이라 안전 방향이지만 화면이 거짓말을 한다).
  assert.doesNotMatch(BODY, /process\.env\.NEXT_PUBLIC_\w+\s*(?:\)|\|\||&&|;)/, "값 비교 없이 존재만 본다");
});

test("둘을 `||` 로 잇는다 — 하나만 보면 다른 쪽 배포의 가드가 꺼진다", () => {
  assert.match(BODY, /\|\|/, "한 이름만 본다");
});

test("이 시험이 실제로 소스를 읽고 있다", () => {
  // 파일을 못 읽거나 판별식을 못 찾으면 위 시험들이 공허하게 초록이 된다.
  assert.ok(SOURCE.length > 200, `소스가 너무 짧다: ${SOURCE.length}자`);
  assert.ok(BODY.length > 50 && BODY.length < SOURCE.length, `판별식을 못 잘랐다: ${BODY.length}자`);
});
