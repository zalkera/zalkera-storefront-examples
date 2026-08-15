import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {MUTATING_METHODS, PREVIEW_WRITE_ALLOW, isPreviewBlockedWrite} from "./previewGuard.ts";

/**
 * **프리뷰 쓰기 차단의 회귀 픽스처.**
 *
 * ## 이 파일이 재는 것이 바뀌었다 — 그 이유를 먼저 읽어라
 *
 * 종전 판들은 `route.ts` 를 **텍스트로 파싱**해 "핸들러마다 `isPreview()` 를 불렀는가"를 봤고,
 * 그 파서가 **네 판 연속** 뚫렸다(이력은 `previewGuard.ts` 머리말). 마지막 구멍은 주석을 문자열보다
 * 먼저 지우는 바람에 **URL 문자열 두 개 사이가 통째로 증발**하는 것이었고, 심의가 배송 라우트에서
 * 프리뷰 쓰기를 운영 백엔드까지 보내는 것을 실 HTTP 로 실증했다.
 *
 * 그래서 판정을 **미들웨어**(`src/middleware.ts`)로 옮겼다. 이제 **판정 시험**은 순수 함수를 전수로
 * 본다 — 거기엔 파싱이 없으니 파서 구멍도 없다.
 *
 * ⚠ 다만 아래 **통제군 둘은 여전히 파일을 읽는 문면 검사**다. "관문이 있고 판정을 부르는가"만 보므로
 *   몸통을 비우고 호출을 주석으로 남긴 변이는 못 잡는다(심의 실측). 그 자리는 **빌드 산출물**이
 *   진다 — `ci.yml` 과 `verify-zip` 이 `middleware-manifest.json` 에 관문이 실렸는지 잰다.
 *
 * ## 그래도 통제군은 둔다
 *
 * 순수 함수가 아무리 옳아도 **미들웨어가 없으면 아무 일도 안 일어난다.** 그래서 파일 존재와 배선
 * (미들웨어가 이 판정을 실제로 부르는가)을 같이 건다. 그리고 면제 목록이 배송 라우트의 마커와
 * 어긋나지 않는지도 본다 — 목록은 한 곳뿐이지만, 한 곳이라도 낡을 수 있다.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

test("쓰기 메서드는 막고, 읽기 메서드는 안 막는다", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "Delete"]) {
        assert.equal(isPreviewBlockedWrite(m, "/api/cart"), true, `막아야 한다: ${m}`);
    }
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) {
        assert.equal(isPreviewBlockedWrite(m, "/api/cart"), false, `막으면 안 된다: ${m}`);
    }
});

test("면제 경로만 통과한다 — 끝 슬래시·대소문자로 우회되지 않는다", () => {
    for (const p of PREVIEW_WRITE_ALLOW) {
        assert.equal(isPreviewBlockedWrite("POST", p), false, `면제여야 한다: ${p}`);
        assert.equal(isPreviewBlockedWrite("POST", `${p}/`), false, `끝 슬래시도 면제: ${p}/`);
        assert.equal(isPreviewBlockedWrite("POST", p.toUpperCase()), false, `대문자도 면제: ${p}`);
    }
    // 면제 경로의 **하위**는 면제가 아니다 — 접두 일치로 넓히면 그 아래가 통째로 열린다.
    assert.equal(isPreviewBlockedWrite("POST", "/api/revalidate/all"), true);
    assert.equal(isPreviewBlockedWrite("DELETE", "/api/auth/logout/everything"), true);
});

test("면제 목록에 없는 것은 전부 막는다 — 새 라우트는 아무것도 안 해도 덮인다", () => {
    for (const p of [
        "/api/cart",
        "/api/cart/items",
        "/api/cart/items/7",
        "/api/checkout",
        "/api/consents",
        "/api/booking",
        "/api/whatever-new-route",
        "/api/probe-a",
        "/", // 서버 액션은 페이지 경로로 POST 한다
        "/checkout",
        "/some/page",
    ]) {
        assert.equal(isPreviewBlockedWrite("POST", p), true, `막아야 한다: ${p}`);
    }
});

test("통제군 — 미들웨어가 실제로 있고 이 판정을 부른다(없으면 아무 일도 안 일어난다)", () => {
    const mw = join(SRC, "middleware.ts");
    assert.ok(existsSync(mw), "src/middleware.ts 가 없다 — 프리뷰 쓰기 차단이 통째로 꺼진다");
    const code = readFileSync(mw, "utf8");
    assert.match(code, /isPreviewBlockedWrite/, "미들웨어가 판정을 안 부른다");
    assert.match(code, /\bisPreview\(\)/, "미들웨어가 프리뷰 여부를 안 본다");
    assert.match(code, /status:\s*403/, "미들웨어가 403 을 안 낸다");
    // matcher 로 범위를 좁히면 빠뜨린 경로가 **조용히** 무방비가 된다 — 그것이 네 번 반복된 실패다.
    assert.doesNotMatch(code, /export\s+const\s+config\b/, "matcher 를 두지 마라(좁히면 조용히 샌다)");
});

test("통제군 — 면제 목록이 배송 라우트의 마커와 일치한다", () => {
    const api = join(SRC, "app", "api");
    const walk = (d: string): string[] =>
        readdirSync(d, {withFileTypes: true}).flatMap((e) =>
            e.isDirectory() ? walk(join(d, e.name)) : e.name.startsWith("route.") ? [join(d, e.name)] : [],
        );
    const files = walk(api);
    assert.ok(files.length >= 10, `route 파일을 ${files.length}개만 찾았다 — 걷기가 깨졌다`);
    const marked = files
        .filter((f) => /^\/\/ zalkera-allow-preview-write:[ \t]*\S/m.test(readFileSync(f, "utf8")))
        .map((f) => dirname(f).slice(join(SRC, "app").length))
        .sort();
    assert.deepEqual(
        marked,
        [...PREVIEW_WRITE_ALLOW].sort(),
        "면제 목록과 라우트 마커가 어긋난다 — 둘 중 하나가 낡았다",
    );
});

test("메서드 집합이 본문을 만들 수 있는 것들이다", () => {
    assert.deepEqual([...MUTATING_METHODS].sort(), ["DELETE", "PATCH", "POST", "PUT"]);
});
