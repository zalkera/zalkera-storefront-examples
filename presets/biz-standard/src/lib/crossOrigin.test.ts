import test from "node:test";
import assert from "node:assert/strict";
import {isJsonContentType, isSameOriginRequest} from "./crossOrigin.ts";

/**
 * 교차사이트 위조 판정의 **회귀 픽스처**(memo118 §8).
 *
 * 검사기(`validate-storefront.mjs` X1)는 "가드를 불렀는가"만 본다. **가드가 옳은가**는 여기서만
 * 잠긴다 — 그리고 이 규칙은 한 줄만 흔들려도 조용히 열리는 종류다. 아래 각 테스트는
 * "이렇게 바꾸면 무엇이 뚫리는가"를 이름에 달아 뒀다.
 *
 * 실행: `npm test` (Node 기본 러너 + 타입 스트리핑 — 추가 의존성 0)
 */

function req(headers: Record<string, string>): Request {
    return new Request("https://shop.example.com/api/checkout", {method: "POST", headers});
}

const SELF = "shop.example.com";

test("정상 — 같은 오리진에서 온 요청은 통과한다", () => {
    assert.equal(isSameOriginRequest(req({origin: `https://${SELF}`, host: SELF})), true);
});

test("원 익스플로잇 — 교차사이트 폼 제출은 막힌다", () => {
    assert.equal(isSameOriginRequest(req({origin: "https://evil.example", host: SELF})), false);
});

/**
 * 형제 테넌트 차단 — 플랫폼 존이 `{tenant}.{zone}` 이라 테넌트끼리 `same-site` 다.
 *
 * ⚠ **이 테스트는 `Sec-Fetch-Site` 줄을 보지 않는다.** Origin↔Host 가 먼저 불일치로 끊어 그 줄까지
 * 도달하지 않는다. 즉 형제 테넌트를 실제로 막는 것은 **Origin 규칙**이고, `Sec-Fetch-Site` 는 그 위의
 * 보조 신호일 뿐 독립적으로 짐을 지지 않는다.
 *
 * 종전 이 자리에 "`!== \"cross-site\"` 로 바꿔도 전부 통과 — 동치 변이"라고 적혀 있었다. **지금은
 * 거짓이다** — 그 변이를 오늘 스위트에 걸면 아래 "프록시 뒤" 케이스가 잡는다(심의 실측). 고정 수치나
 * 변이 생존 여부를 문면에 박아 두지 마라. 재려면 그 변이를 직접 넣고 `npm test` 를 돌려라. memo118 이 경고한 것은 그 헤더를 **단독으로** 쓰는 설계였고, 우리는 안 쓴다.
 *
 * 그러니 이 파일을 고치는 사람에게: **Origin 규칙을 느슨하게 만들면 `Sec-Fetch-Site` 가 대신
 * 막아 주지 않는다.** 아래 "Origin 비교" 케이스들이 진짜 자물쇠다.
 */
test("형제 테넌트 — same-site 여도 막힌다(Origin 규칙이 막는다)", () => {
    const r = req({
        origin: "https://other-tenant.zalkera.app",
        host: "my-tenant.zalkera.app",
        "sec-fetch-site": "same-site",
    });
    assert.equal(isSameOriginRequest(r), false);
});

/**
 * `Sec-Fetch-Site` 줄이 **혼자서** 하는 일을 고정한다 — Origin 이 통과한 뒤에도 값이 어긋나면 막는다.
 * 실제 브라우저에서 Origin 이 정확히 같은데 `same-site` 가 오는 조합은 없지만(그때는 `same-origin` 을
 * 보낸다), 그 줄이 지워졌는지를 이 케이스가 잡는다.
 */
test("Origin 이 같아도 Sec-Fetch-Site 가 어긋나면 막힌다", () => {
    const r = req({origin: `https://${SELF}`, host: SELF, "sec-fetch-site": "same-site"});
    assert.equal(isSameOriginRequest(r), false);
});

test("Origin 부재 — 통과시키지 않는다(폼 제출이 다시 들어온다)", () => {
    assert.equal(isSameOriginRequest(req({host: SELF})), false);
});

test("Origin: null — 샌드박스 iframe 은 막힌다", () => {
    assert.equal(isSameOriginRequest(req({origin: "null", host: SELF})), false);
});

test("파싱 불가 Origin 은 막힌다", () => {
    assert.equal(isSameOriginRequest(req({origin: "not-a-url", host: SELF})), false);
});

/**
 * 스킴을 비교하면 **상용 전 사이트가 죽는다** — 오케스트레이터가 `x-forwarded-proto: "http"` 를
 * 넣는데 공개 스킴은 https 다. 호스트만 본다는 것을 이 케이스가 고정한다.
 */
test("프록시 뒤 — 스킴이 달라도 호스트가 같으면 통과한다", () => {
    const r = req({
        origin: `https://${SELF}`,
        host: "10.0.1.23:3000",
        "x-forwarded-host": SELF,
        "x-forwarded-proto": "http",
    });
    assert.equal(isSameOriginRequest(r), true);
});

test("x-forwarded-host 가 우선한다", () => {
    const r = req({origin: "https://evil.example", host: "evil.example", "x-forwarded-host": SELF});
    assert.equal(isSameOriginRequest(r), false);
});

test("Sec-Fetch-Site 부재는 통과 — 구형·인앱 브라우저를 죽이지 않는다", () => {
    assert.equal(isSameOriginRequest(req({origin: `https://${SELF}`, host: SELF})), true);
});

test("Sec-Fetch-Site: same-origin 은 통과한다", () => {
    const r = req({origin: `https://${SELF}`, host: SELF, "sec-fetch-site": "same-origin"});
    assert.equal(isSameOriginRequest(r), true);
});

test("Sec-Fetch-Site: cross-site 는 막힌다", () => {
    const r = req({origin: `https://${SELF}`, host: SELF, "sec-fetch-site": "cross-site"});
    assert.equal(isSameOriginRequest(r), false);
});

test("포트가 다르면 다른 오리진이다", () => {
    const r = req({origin: "https://shop.example.com:8443", host: SELF});
    assert.equal(isSameOriginRequest(r), false);
});

// ── Content-Type ────────────────────────────────────────────────────────────

test("application/json 은 통과한다(charset 동반 포함)", () => {
    assert.equal(isJsonContentType(req({"content-type": "application/json"})), true);
    assert.equal(isJsonContentType(req({"content-type": "application/json; charset=utf-8"})), true);
    assert.equal(isJsonContentType(req({"content-type": " APPLICATION/JSON "})), true);
});

/** 원 익스플로잇의 운반체 — preflight 없이 통과하는 유일한 인코딩이다. */
test("text/plain 은 막힌다", () => {
    assert.equal(isJsonContentType(req({"content-type": "text/plain"})), false);
});

test("폼 인코딩은 막힌다", () => {
    assert.equal(isJsonContentType(req({"content-type": "multipart/form-data; boundary=x"})), false);
    assert.equal(isJsonContentType(req({"content-type": "application/x-www-form-urlencoded"})), false);
});

test("Content-Type 부재는 막힌다", () => {
    assert.equal(isJsonContentType(req({})), false);
});

/** `application/json-patch+json` 같은 유사 타입을 prefix 매칭으로 통과시키면 안 된다. */
test("유사 타입은 막힌다", () => {
    assert.equal(isJsonContentType(req({"content-type": "application/jsonx"})), false);
});
