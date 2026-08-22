import test from "node:test";
import assert from "node:assert/strict";
import {safeNextPath} from "./oauth.ts";
import {ESCAPES, INTERNAL} from "./urlEscapes.fixture.ts";

/**
 * **`safeNextPath` 회귀 픽스처 — 로그인 능력에 딸린 소독기.**
 *
 * 이 시험이 `safeUrl.test.ts` 에서 갈라져 나온 이유는 하나다. 그쪽은 **중립 배선**(저장형 XSS)
 * 이라 어느 사이트에나 있는데, `safeNextPath` 는 `src/lib/oauth.ts` 에 살아 로그인을 안 쓰는
 * 사이트에는 없다. 한 파일에 있으면 **로그인을 지운 트리에서 중립 가드 시험이 통째로 못 돈다**
 * (`ERR_MODULE_NOT_FOUND`). 실제로 상담 전환형 납품 트리 하나가 그렇게 막혔다.
 *
 * 그래서 이 파일의 하한은 `src/lib/oauth.ts` 가 있을 때만 요구한다(`floors.mjs` 의 `FLOOR_SUBJECT`).
 *
 * 재는 것: 리다이렉트 `Location` 의 원천이라 **이탈이 곧 오픈 리다이렉트**다.
 */
test("이탈 형태는 전부 거부된다 — safeNextPath(리다이렉트 Location 의 원천)", () => {
    for (const e of ESCAPES) assert.equal(safeNextPath(e), null, `통과하면 안 된다: ${e}`);
});

test("양성 통제군 — 정상 내부 경로는 살아 있다(과잉 차단이면 여기가 빨개진다)", () => {
    // 음성 단언만 두면 «전부 null 을 주는» 구현으로도 위 시험이 초록이 된다.
    for (const p of INTERNAL) assert.notEqual(safeNextPath(p), null, `막히면 안 된다: ${p}`);
});
