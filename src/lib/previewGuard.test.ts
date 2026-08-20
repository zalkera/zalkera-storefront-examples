import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {MUTATING_METHODS, PREVIEW_WRITE_ALLOW, isPreviewBlockedWrite} from "./previewGuard.ts";

/**
 * 면제 마커의 판정. **한 벌만 둔다** — 종전에는 같은 정규식이 아래 두 자리에 각각 박혀 있어,
 * 한쪽만 고치면 다른 쪽이 옛 규칙으로 남았다.
 *
 * 사유는 **보이는 글자**여야 한다. `\S` 만으로는 폭 없는 공백(U+200B)·결합 문자(U+034F)가
 * 「글자」로 통과해, 사유 없는 면제가 사유 있는 면제로 보였다. 그 셋을 앞에서 막는다.
 *
 * 범주 배제는 `Cf`·`Mn`·`Me` 만으로는 얕다 — 제어문자(`Cc`)·사유역(`Co`)·미할당(`Cn`)과
 * 한글 채움문자류(`Default_Ignorable_Code_Point`)가 「글자」로 통과했다. 점자 공백(U+2800)은
 * 어느 범주에도 안 걸려 따로 적는다. 재현: `node scripts/lib/marker-coverage.mjs`
 *
 * ⚠ 이 마커는 **사람이 읽는 장치이지 봉인이 아니다.** 사유가 있어 보이게 만드는 길은 늘 남는다
 *   (예: 뜻 없는 한 글자). 판정이 막는 것은 「사유가 아예 없는 것」까지다.
 */
const ALLOW_MARKER =
    /^\/\/ zalkera-allow-preview-write:[ \t   -   　]*(?![\p{Cf}\p{Mn}\p{Me}\p{Cc}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\u2800])\S/mu;

/**
 * **미리보기 쓰기 차단의 회귀 픽스처.**
 *
 * 집행은 `src/middleware.ts` 가 한다. 이 파일은 그 판정(`previewGuard.ts` 의 순수 함수)을 전수로
 * 시험하고, **관문이 실제로 배선돼 있는지**를 통제군으로 확인한다.
 *
 * ## 통제군이 필요한 이유
 *
 * 판정 함수가 아무리 옳아도 **관문이 없으면 아무 일도 안 일어난다.** 그래서 파일 존재·배선과
 * 면제 목록↔라우트 마커 대칭을 같이 건다.
 *
 * ⚠ 그 통제군 둘은 **파일을 읽는 문면 검사**다. "관문이 있고 판정을 부르는가"만 보므로 몸통을
 *   비우고 호출을 주석으로 남긴 변이는 못 잡는다. 그 자리는 **빌드 산출물**이 진다 —
 *   `ci.yml` 과 `verify-zip` 이 `middleware-manifest.json` 에 관문이 실렸는지 잰다.
 *
 * ## 소스를 파싱해 규약 준수를 재지 마라
 *
 * `route.ts` 를 텍스트로 읽어 "핸들러마다 가드를 불렀는가"를 판정하는 방식은 선언 형태·재수출·
 * 자르기 경계·리터럴 제거에서 전부 샌다. 사유는 `previewGuard.ts` 머리말에 있다.
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
    assert.ok(existsSync(mw), "src/middleware.ts 가 없다 — 미리보기 쓰기 차단이 통째로 꺼진다");
    const code = readFileSync(mw, "utf8");
    assert.match(code, /isPreviewBlockedWrite/, "미들웨어가 판정을 안 부른다");
    assert.match(code, /\bisPreview\(\)/, "미들웨어가 미리보기 여부를 안 본다");
    assert.match(code, /status:\s*403/, "미들웨어가 403 을 안 낸다");
    // matcher 는 **정적 파일만** 뺀다. 경로 목록으로 좁히면 빠뜨린 자리가 조용히 무방비가 된다.
    // 무엇을 덮는지는 여기서 문면으로 재지 않고 **빌드 산출물**로 잰다(`scripts/lib/gate-probe.mjs`)
    // — 여기서는 부정 목록 형태인지만 본다.
    const matcher = code.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? "";
    if (matcher) {
        assert.match(matcher, /\(\?!/, "matcher 는 부정 목록이어야 한다 — 열거로 좁히면 새 경로가 샌다");
    }
});

test("통제군 — 면제 목록이 배송 라우트의 마커와 일치한다", () => {
    // 걷기는 `src/app` 루트에서 시작한다 — 라우트 그룹(`(bff)/api/...`)으로 재배치해도 따라간다.
    const appDir = join(SRC, "app");
    const walk = (d: string): string[] =>
        readdirSync(d, {withFileTypes: true}).flatMap((e) =>
            e.isDirectory() ? walk(join(d, e.name)) : e.name.startsWith("route.") ? [join(d, e.name)] : [],
        );
    const files = walk(appDir);
    // 걷기가 깨졌으면 아무것도 못 찾는다. **절대 개수로 재지 않는다** — 고객이 안 쓰는 능력을
    // 지우면 라우트가 줄고, 그때 「걷기가 깨졌다」는 틀린 사유로 반려한다.
    assert.ok(files.length > 0, "src/app 아래 route 파일을 하나도 못 찾았다 — 걷기가 깨졌다");
    const marked = files
        .filter((f) => ALLOW_MARKER.test(readFileSync(f, "utf8")))
        .map((f) =>
            dirname(f)
                .slice(appDir.length)
                .replace(/\/\([^)]+\)/g, ""),
        )
        .sort();
    // ⚠ **한 방향만 위험하다.** 검수받지 않은 마커가 트리에 있으면 그 라우트가 미리보기에서 쓴다 —
    //   그것이 이 시험이 막는 것이다. 반대(목록에 있는데 라우트가 없음)는 아무 권한도 안 준다.
    //   안 쓰는 능력을 지운 사이트는 늘 그 상태가 되므로, 그것까지 반려하면 **정상 커스터마이즈가
    //   빨개진다**.
    const allowed: readonly string[] = PREVIEW_WRITE_ALLOW;
    const unauthorized = marked.filter((route) => !allowed.includes(route));
    assert.deepEqual(unauthorized, [], `검수 안 받은 미리보기 쓰기 면제 마커: ${unauthorized.join(" ")}`);
});

test("면제 목록에 유령이 없다 — 온전한 트리에서만", () => {
    // 목록에만 있고 트리에 없는 항목은 권한을 안 주지만, **우리 정본에서는** 낡았다는 뜻이다.
    // 고객이 능력을 지운 트리에서는 정상이므로 그쪽에서는 건너뛴다.
    const appDir = join(SRC, "app");
    if (!existsSync(join(appDir, "api", "auth", "social"))) return; // 능력을 덜어 낸 트리
    const walk = (d: string): string[] =>
        readdirSync(d, {withFileTypes: true}).flatMap((e) =>
            e.isDirectory() ? walk(join(d, e.name)) : e.name.startsWith("route.") ? [join(d, e.name)] : [],
        );
    const marked = walk(appDir)
        .filter((f) => ALLOW_MARKER.test(readFileSync(f, "utf8")))
        .map((f) =>
            dirname(f)
                .slice(appDir.length)
                .replace(/\/\([^)]+\)/g, ""),
        );
    const ghosts = [...PREVIEW_WRITE_ALLOW].filter((route) => !marked.includes(route));
    assert.deepEqual(ghosts, [], `면제 목록에만 있는 라우트: ${ghosts.join(" ")}`);
});

test("메서드 집합이 본문을 만들 수 있는 것들이다", () => {
    assert.deepEqual([...MUTATING_METHODS].sort(), ["DELETE", "PATCH", "POST", "PUT"]);
});

test("면제 마커의 사유는 보이는 글자여야 한다", () => {
    // 「사유가 없으면 면제가 안 된다」가 참이려면 **눈에 안 보이는 사유**도 사유가 아니어야 한다.
    // `\\S` 는 폭 없는 공백·결합 문자를 글자로 세므로, 그것만으로는 이 명제가 거짓이 된다.
    const line = (reason: string) => `// zalkera-allow-preview-write:${reason}\n`;
    assert.ok(ALLOW_MARKER.test(line(" 캐시라서 고객 데이터가 아니다.")), "정상 사유가 막혔다");
    for (const [what, reason] of [
        ["빈 사유", ""],
        ["공백만", "   "],
        ["폭 없는 공백만", " \u200b"],
        ["결합 문자만", " \u034f"],
        ["바이트 순서 표시만", " \ufeff"],
        ["제어문자만", " \u0001"],
        ["사유역 문자만", " \ue000"],
        ["한글 채움문자만", " \u3164"],
        ["점자 공백만", " \u2800"],
        ["미할당 코드포인트만", " \u0378"],
    ]) {
        assert.ok(!ALLOW_MARKER.test(line(reason)), `${what}이 사유로 통과했다`);
    }
});
