import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

/**
 * **로그아웃은 게스트 카트 키도 돌린다.**
 *
 * `clearCustomerTokens()` 는 토큰 쿠키만 지운다. 회전이 없으면 로그아웃 뒤에도 같은 카트 키가 남아
 * 다음 요청의 `X-Cart-Session` 으로 그대로 나가고, 매장·키오스크 같은 **공용 브라우저에서 앞사람이
 * 담은 것이 다음 방문자에게 이어진다.**
 *
 * ⚠ 회원 카트는 이 경로로 안 샌다 — 백엔드가 로그인 중 만든 카트에 `sessionKey` 를 안 심고
 * (`ShopCartService.resolveOrCreate`), 회원 조회는 세션키를 아예 안 본다. 새는 것은 **그 브라우저의
 * 게스트 카트**다. 그래서 이 시험이 잠그는 것은 「회원 데이터 격리」가 아니라 **로그아웃의 약속**이다.
 *
 * ⚠ **삭제가 아니라 회전**이어야 한다. 쿠키를 지우면 다음 담기까지 키 부재 구간이 생기고,
 * `co-{cartSessionKey}` 멱등 불변식이 그것을 전제하지 않는다(`session.ts` 머리말).
 *
 * 라우트를 실제로 부르려면 Next 런타임과 백엔드 스텁이 필요해, 여기서는 **배선**을 잠근다 —
 * 다섯 벌(정본 + 팩 4종)이 같은 헬퍼를 부르는지. 행위 자체는 `rotateCartSessionKey` 의 계약이다.
 */
const COPIES = [
    "src/app/api/auth/logout/route.ts",
    "presets/skeleton/src/app/api/auth/logout/route.ts",
    "presets/shop-goods/src/app/api/auth/logout/route.ts",
    "presets/beauty-nail/src/app/api/auth/logout/route.ts",
    "presets/biz-standard/src/app/api/auth/logout/route.ts",
];

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("로그아웃 다섯 벌이 전부 카트 키를 돌린다", () => {
    for (const rel of COPIES) {
        const src = read(rel);
        assert.match(src, /rotateCartSessionKey\(response\)/, `${rel}: 카트 키를 안 돌린다`);
        assert.match(src, /import \{[^}]*rotateCartSessionKey[^}]*\} from "@\/lib\/session"/, `${rel}: import 누락`);
    }
});

test("삭제가 아니라 회전이다 — 쿠키를 지우면 멱등 불변식이 깨진다", () => {
    for (const rel of COPIES) {
        const src = read(rel);
        // `cookies.delete(...)` 로 바꿔치기하면 여기서 걸린다.
        assert.doesNotMatch(src, /cookies\.delete\(/, `${rel}: 카트 쿠키를 지우고 있다`);
    }
});

test("양성 통제군 — 토큰 삭제와 힌트 비우기는 그대로 산다", () => {
    // 회전만 재면 «토큰을 안 지우는» 구현으로도 통과한다.
    for (const rel of COPIES) {
        const src = read(rel);
        assert.match(src, /clearCustomerTokens\(\)/, `${rel}: 토큰을 안 지운다`);
        assert.match(src, /setAuthHint\(response, false\)/, `${rel}: 로그인 힌트를 안 비운다`);
    }
});

test("회전 헬퍼가 실제로 새 키를 낸다 — httpOnly·30일", () => {
    const helper = read("src/lib/session.ts");
    const body = helper.slice(helper.indexOf("export function rotateCartSessionKey"));
    assert.match(body, /randomUUID\(\)/, "고정값을 심으면 회전이 아니다");
    assert.match(body, /httpOnly: true/, "카트 키가 스크립트에 읽히면 안 된다");
    assert.match(body, /maxAge: THIRTY_DAYS/, "수명이 바뀌면 멱등 창도 바뀐다");
});
