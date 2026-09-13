import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {dirname, join, relative} from "node:path";
import type TS from "typescript";

/**
 * **교차사이트 가드 세 층의 «배선» 을 코드에게 물어 잠근다**(memo118 §3·§5).
 *
 * ⛔ 이 파일이 왜 검사기(X1·X2·X3) 위에 또 필요한가 — **그 셋은 오늘 «경고» 다**(rc 0). 심의 실측(2026-09-13):
 * 가드 호출을 정본·프리셋 **5벌에서 일관되게** 지워도 `npm run validate` 가 rc 0 이고 경고조차 안 뜨는 자리가 있다
 * (①층 일관 제거 · ②층 state 대조 통째 제거 · CORS 를 `next.config.ts`·`middleware.ts` 로 다는 경우).
 * 검사기 승격은 그쪽 레포의 판정(거짓 양성 때문에 영구 경고로 둔다)이므로, **레포가 자기 배선을 자기 시험으로 잠근다.**
 *
 * ## ③층(`assertJsonContentType`)이 서는 자리와 서면 안 되는 자리
 *
 * ## 왜 이 그물이 필요한가
 *
 * ③층은 **본문이 필수인** 문에만 선다. 본문 없는 변이(마이페이지 취소·구매확정처럼 `fetch(url, {method:"POST"})`
 * 만 하는 호출)에 걸면 브라우저가 `Content-Type` 을 **아예 안 보내** 415 로 튕긴다 — 방어가 아니라 **고장**이다.
 * 실제로 주문 취소·구매확정 두 문이 그렇게 깨진 채 프리셋 5벌로 배송됐고, 문면 검사기(X1)도 단위 시험도
 * 그것을 못 봤다(심의 실측 2026-09-13). X1 은 `assertSameOrigin` 만 세고, 순수 판정 함수 시험은 라우트를 안 지난다.
 *
 * ## 판정 규칙 — 「본문이 필수인가」를 문면이 아니라 **호출 그래프**로 읽는다
 *
 * - 본문을 읽고(`readJsonBody`·`req.json()`) **없으면 400 을 내는** 문 = 본문 필수 → ③층이 **있어야** 한다.
 * - 그 밖의 변이 문(본문을 안 읽거나, 읽되 없어도 되는 문) → ③층이 **없어야** 한다.
 *
 * 「없으면 400」의 판정은 `invalidBody()` 호출 **또는** 그 자리에서 직접 내는 `code: "INVALID_BODY"` 다
 * (`auth/social/start` 는 후자다). ⚠ 그 코드 이름을 바꾸면 이 판정이 눈을 감는다 — 통제군 시험이 그 사실을
 * 「본문 필수 문이 하나도 안 잡혔다」로 잡는다.
 *
 * 두 방향을 다 단언한다 — 「없음」만 세면 ③층을 전부 지워도 초록이고, 「있음」만 세면 이 결함이 다시 난다.
 *
 * ⚠ **①층은 이 규칙과 무관하다.** 교차사이트 위조를 막는 것은 `assertSameOrigin` 이고 그 전면성은 X1 이 잠근다.
 * 이 그물은 ③층의 **자리**만 본다.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PRESETS = join(ROOT, "presets");
const ts: typeof TS = createRequire(import.meta.url)("typescript");

/** 정본 + 프리셋 사본 전부 — 새 프리셋이 생기면 저절로 들어온다. */
const PACK_SRCS: [label: string, dir: string][] = [
    ["src", join(ROOT, "src")],
    ...(existsSync(PRESETS)
        ? readdirSync(PRESETS, {withFileTypes: true})
              .filter((e) => e.isDirectory() && existsSync(join(PRESETS, e.name, "src")))
              .map((e): [string, string] => [`presets/${e.name}`, join(PRESETS, e.name, "src")])
        : []),
];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function routeFiles(srcDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name === "route.ts") out.push(p);
        }
    };
    const api = join(srcDir, "app", "api");
    if (existsSync(api)) walk(api);
    return out.sort();
}

function parse(path: string): TS.SourceFile {
    return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** 이 파일이 그 이름을 **부르는가**(import 만 해 두고 안 쓰는 것과 가른다). */
function calls(sf: TS.SourceFile, name: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found = true;
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** export 된 HTTP 메서드 이름들 — 변이 문인지 가른다. */
function exportedMethods(sf: TS.SourceFile): string[] {
    const names: string[] = [];
    const visit = (node: TS.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
            names.push(node.name.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
}

/** 본문을 읽는가 — `readJsonBody(req)` 든 `req.json()` 이든. */
function readsBody(sf: TS.SourceFile): boolean {
    if (calls(sf, "readJsonBody")) return true;
    let found = false;
    const visit = (node: TS.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "json" &&
            /^(req|request)$/.test(node.expression.expression.getText(sf))
        ) {
            found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** 본문이 없을 때 400 을 내는가 — 표준 헬퍼든, 그 자리에서 직접 내든. */
function rejectsMissingBody(sf: TS.SourceFile): boolean {
    if (calls(sf, "invalidBody")) return true;
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isStringLiteral(node) && node.text === "INVALID_BODY") found = true;
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

interface Row {
    label: string;
    route: string;
    mutation: boolean;
    bodyRequired: boolean;
    hasCtGuard: boolean;
}

function survey(): Row[] {
    const rows: Row[] = [];
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const sf = parse(path);
            rows.push({
                label,
                route: relative(join(dir, "app", "api"), path).split("\\").join("/"),
                mutation: exportedMethods(sf).some((m) => MUTATION_METHODS.has(m)),
                // 본문 필수 = 본문을 읽고 + 없으면 400 을 낸다
                bodyRequired: readsBody(sf) && rejectsMissingBody(sf),
                hasCtGuard: calls(sf, "assertJsonContentType"),
            });
        }
    }
    return rows;
}

test("통제군 — 라우트를 실제로 읽는다(5벌 · 변이 문과 본문 필수 문이 둘 다 있다)", () => {
    const rows = survey();
    assert.ok(rows.length >= 20, `라우트를 못 읽었다: ${rows.length}`);
    assert.ok(
        PACK_SRCS.length >= 2,
        `프리셋 사본을 못 찾았다 — 이 그물이 정본만 보고 있다: ${PACK_SRCS.map(([l]) => l).join(",")}`,
    );
    assert.ok(rows.some((r) => r.bodyRequired), "본문 필수 문이 하나도 안 잡혔다 — 판정이 죽었다");
    assert.ok(rows.some((r) => r.mutation && !r.bodyRequired), "본문 없는 변이 문이 하나도 안 잡혔다 — 판정이 죽었다");
});

test("🔴 본문 필수 문에는 ③층이 있다", () => {
    const missing = survey().filter((r) => r.bodyRequired && !r.hasCtGuard);
    assert.deepEqual(
        missing.map((r) => `${r.label}:${r.route}`),
        [],
        "본문 필수인데 Content-Type 관문이 없다 — 폼 운반체가 ①층 하나에만 기댄다",
    );
});

test("🔴 본문 없는 변이 문에는 ③층이 없다 — 있으면 정상 동선이 415 로 깨진다", () => {
    const wrong = survey().filter((r) => r.mutation && !r.bodyRequired && r.hasCtGuard);
    assert.deepEqual(
        wrong.map((r) => `${r.label}:${r.route}`),
        [],
        "본문 없이 POST 하는 문에 Content-Type 관문이 걸렸다 — 브라우저는 그 헤더를 안 보낸다(415)",
    );
});

/** ①층 면제는 **이 목록뿐**이다. 늘리려면 이 줄을 고쳐야 하고, 그 자리가 곧 심의 대상이다. */
const CROSS_ORIGIN_EXEMPT = ["revalidate/route.ts"];

test("🔴 변이 문은 모두 ①층(assertSameOrigin)을 부른다 — 5벌 일관 제거를 잡는다", () => {
    const rows: string[] = [];
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const sf = parse(path);
            const route = relative(join(dir, "app", "api"), path).split("\\").join("/");
            if (!exportedMethods(sf).some((m) => MUTATION_METHODS.has(m))) continue;
            if (CROSS_ORIGIN_EXEMPT.includes(route)) continue;
            if (!calls(sf, "assertSameOrigin")) rows.push(`${label}:${route}`);
        }
    }
    assert.deepEqual(rows, [], "변이 문이 ①층 없이 열려 있다 — 교차사이트 폼 자동제출이 그대로 통과한다");
});

test("🔴 ①층 면제는 목록과 정확히 같다 — 마커 복붙으로 조용히 늘지 않는다", () => {
    const found = new Set<string>();
    for (const [, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const text = readFileSync(path, "utf8");
            if (!text.includes("zalkera-allow-cross-origin")) continue;
            found.add(relative(join(dir, "app", "api"), path).split("\\").join("/"));
        }
    }
    assert.deepEqual([...found].sort(), [...CROSS_ORIGIN_EXEMPT].sort(), "면제 마커가 붙은 라우트 집합이 바뀌었다");
});

test("🔴 소셜 교환 문이 ②층(consumeOAuthState)을 부른다 — 콜백 경유 code 주입을 막는 그 한 줄", () => {
    const missing: string[] = [];
    for (const [label, dir] of PACK_SRCS) {
        const exchange = join(dir, "app", "api", "auth", "social", "route.ts");
        const start = join(dir, "app", "api", "auth", "social", "start", "route.ts");
        if (!calls(parse(exchange), "consumeOAuthState")) missing.push(`${label}:교환`);
        if (!calls(parse(start), "issueOAuthState")) missing.push(`${label}:발행`);
    }
    assert.deepEqual(missing, [], "state 대조·발행이 빠졌다 — 피해자 브라우저에 공격자 세션이 주입된다");
});

test("🔴 CORS 를 여는 자리가 없다 — 라우트뿐 아니라 next.config·middleware 까지 본다", () => {
    const hits: string[] = [];
    const scan = (path: string, label: string): void => {
        if (!existsSync(path)) return;
        const text = readFileSync(path, "utf8");
        // 문면 판정이다 — 이 헤더는 이름 그대로만 쓸 수 있고, 쓰는 순간 값이 무엇이든 ①층의 전제가 흔들린다.
        if (/Access-Control-Allow-/i.test(text)) hits.push(label);
    };
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) scan(path, `${label}:${relative(dir, path)}`);
        scan(join(dir, "middleware.ts"), `${label}:middleware.ts`);
        scan(join(dir, "..", "next.config.ts"), `${label}:next.config.ts`);
    }
    assert.deepEqual(hits, [], "교차 오리진 JS 가 응답을 읽게 열렸다 — 읽기 GET 을 가드에서 뺀 근거가 무너진다");
});

test("프리셋 5벌의 판정이 정본과 같다 — 한 벌만 고치는 사고를 잡는다", () => {
    const rows = survey();
    const byRoute = new Map<string, Map<string, string>>();
    for (const r of rows) {
        if (!byRoute.has(r.route)) byRoute.set(r.route, new Map());
        byRoute.get(r.route)!.set(r.label, `${r.mutation}/${r.bodyRequired}/${r.hasCtGuard}`);
    }
    const drift: string[] = [];
    for (const [route, byLabel] of byRoute) {
        const shapes = new Set(byLabel.values());
        if (shapes.size > 1) drift.push(`${route}: ${[...byLabel].map(([l, s]) => `${l}=${s}`).join(" · ")}`);
        if (byLabel.size !== PACK_SRCS.length) drift.push(`${route}: 사본 ${byLabel.size}/${PACK_SRCS.length} 벌에만 있다`);
    }
    assert.deepEqual(drift, [], "프리셋 사본 사이에 ③층 배선이 갈렸다");
});
