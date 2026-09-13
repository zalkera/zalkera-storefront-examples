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
 * ⛔ 이 파일이 왜 검사기(X1·X2·X3) 위에 또 필요한가 — **그 셋은 «경고» 다**(rc 0). 가드 호출을 정본·프리셋
 * **5벌에서 일관되게** 지워도 `npm run validate` 는 막지 않는다.
 * 검사기 승격은 그쪽 레포의 판정(거짓 양성 때문에 영구 경고로 둔다)이므로, **레포가 자기 배선을 자기 시험으로 잠근다.**
 *
 * ## ③층(`assertJsonContentType`)은 본문이 필수인 문에만 선다
 *
 * 본문 없는 변이(마이페이지 취소·구매확정처럼 `fetch(url, {method:"POST"})` 만 하는 호출)에 걸면 브라우저가
 * `Content-Type` 을 **아예 안 보내** 415 로 튕긴다 — 방어가 아니라 **고장**이다. 문면 검사기(X1)는
 * `assertSameOrigin` 만 세고, 순수 판정 함수 시험은 라우트를 안 지난다.
 *
 * ## 판정 규칙 — 「본문이 필수인가」를 문면이 아니라 **호출 그래프**로 읽는다
 *
 * - 본문을 읽고(`readJsonBody(…)` 또는 핸들러 첫 인자의 `.json()` — 인자 이름은 무엇이든) **없으면 400 을 내는**
 *   문 = 본문 필수 → ③층이 **있어야** 한다.
 * - 그 밖의 변이 문(본문을 안 읽거나, 읽되 없어도 되는 문) → ③층이 **없어야** 한다.
 *
 * 「없으면 400」의 신호는 `invalidBody()` 호출 **또는** 그 자리의 문자열 `"INVALID_BODY"` 다. 자기 문구로 400 을
 * 내는 문은 응답에 `code: "INVALID_BODY"` 를 실으면 필수로 읽힌다(`AGENTS.md` BFF 절이 같은 말을 한다).
 * ⚠ 본문 읽기와 거절은 **핸들러 안에서 직접** 보여야 읽힌다 — 자기 헬퍼 안에서 읽거나 거절하면 이 판정이 못 읽는다.
 * 그런 문은 아래 시험이 **두 출구를 적은 문면**으로 세운다(정본에서는 통제군이 판정이 죽었는지를 따로 잰다).
 *
 * 두 방향을 다 단언한다 — 「없음」만 세면 ③층을 전부 지워도 초록이고, 「있음」만 세면 이 결함이 다시 난다.
 *
 * ## 이 파일은 고객 트리에도 실린다 — 정본에서만 서는 단언이 있다
 *
 * ①층 면제는 **파일 상단의 마커**(`// zalkera-allow-cross-origin: <사유>` · 첫 `export` 앞 · 사유는 같은 줄)가
 * 정한다 — 검사기 X1 과 같은 규칙이고 `AGENTS.md` 가 고객에게 허락한 길이다. **정본 레포**에서는 면제가 곧
 * 심의 대상이라 면제 집합이 [CROSS_ORIGIN_EXEMPT] 와 같아야 한다. 정본 판별은 CI 의 정본 전용 스텝과 같은
 * 교집합(`presets/` + `scripts/pack-preset.mjs`)이다.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PRESETS = join(ROOT, "presets");
const ts: typeof TS = createRequire(import.meta.url)("typescript");

/** 정본 레포인가 — CI 의 정본 전용 스텝과 같은 판별자. 고객이 `presets/` 만 만들어서는 참이 안 된다. */
const CANONICAL = existsSync(PRESETS) && existsSync(join(ROOT, "scripts", "pack-preset.mjs"));

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

/** 이 노드 **안에서** 그 이름을 부르는가(import 만 해 두고 안 쓰는 것과 가른다). */
function calls(root: TS.Node, name: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name)
            found = true;
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

/**
 * export 된 HTTP 메서드와 **그 본문** — 선언형(`export async function POST`)과 화살표형
 * (`export const POST = async (req) => {}`) 둘 다. 화살표형을 빼면 그 형태로 갈아타는 순간 그물이 눈을 감는다
 * (memo118 §4 가 1회전에 잡은 네 우회의 첫째가 그 형태였고, 이 그물의 2회전 변이가 같은 구멍을 다시 열었다).
 *
 * 본문을 함께 돌려주는 이유: 한 파일이 메서드를 둘 이상 export 하면 판정이 갈린다 —
 * `cart/items/[variantId]` 는 PATCH 만 본문이 필수이고 DELETE 는 본문이 없다. 파일 단위로 재면
 * DELETE 에 ③층을 걸어도 안 잡힌다(그 상태로 실서버를 누르면 415).
 *
 * 첫 인자 이름도 돌려준다 — 본문 읽기를 **그 이름으로** 판정한다. `req` 로 고정하면 `(r: Request)` 로 쓴
 * 본문 필수 문이 「본문 없는 문」으로 읽혀 ③층을 떼라는 거짓 문면이 선다.
 */
const HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);

type Fn = TS.FunctionDeclaration | TS.ArrowFunction | TS.FunctionExpression;
type Handler = {name: string; body: TS.Node; param: string | null};

function isExported(node: TS.Node): boolean {
    return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** 식이 함수면 그 함수 — 괄호·`as`·`satisfies` 를 벗기고, 래퍼 호출(`wrap(async (req) => {…})`)이면 인자로 넘긴 함수. */
function asFn(e: TS.Expression | undefined): Fn | null {
    if (!e) return null;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
    if (ts.isCallExpression(e)) {
        for (const a of e.arguments) {
            const f = asFn(a);
            if (f) return f;
        }
    }
    return null;
}

/**
 * 읽는 꼴: `export async function POST` · `export const POST = async (req) => {}` · `export const POST = wrap(async (req) => {})`
 * · `export {POST}`·`export {handler as POST}`(같은 파일의 함수·상수). 그 밖의 꼴로 export 한 메서드는
 * [unreadableMethods] 가 돌려주고 통제군이 red 로 세운다 — 못 읽는 핸들러는 가드를 잴 수 없는 핸들러다.
 */
function exportedHandlers(sf: TS.SourceFile): Handler[] {
    const out: Handler[] = [];
    const firstParam = (fn: Fn): string | null => {
        const p = fn.parameters[0];
        return p && ts.isIdentifier(p.name) ? p.name.text : null;
    };
    const local = new Map<string, Fn>();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && st.body) local.set(st.name.text, st);
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                const f = ts.isIdentifier(d.name) ? asFn(d.initializer) : null;
                if (f && ts.isIdentifier(d.name)) local.set(d.name.text, f);
            }
        }
    }
    const push = (name: string, fn: Fn | null | undefined): void => {
        if (fn?.body) out.push({name, body: fn.body, param: firstParam(fn)});
    };
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && isExported(st)) push(st.name.text, st);
        if (ts.isVariableStatement(st) && isExported(st)) {
            for (const d of st.declarationList.declarations)
                if (ts.isIdentifier(d.name)) push(d.name.text, asFn(d.initializer));
        }
        if (
            ts.isExportDeclaration(st) &&
            !st.moduleSpecifier &&
            st.exportClause &&
            ts.isNamedExports(st.exportClause)
        ) {
            for (const el of st.exportClause.elements) push(el.name.text, local.get((el.propertyName ?? el.name).text));
        }
    }
    return out;
}

/** 모듈이 export 하는 HTTP 메서드 이름 중 [exportedHandlers] 가 못 읽은 것. `export *` 는 이름을 모르므로 `*` 로 센다. */
function unreadableMethods(sf: TS.SourceFile): string[] {
    const names: string[] = [];
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && isExported(st)) names.push(st.name.text);
        if (ts.isVariableStatement(st) && isExported(st)) {
            for (const d of st.declarationList.declarations) names.push(ts.isIdentifier(d.name) ? d.name.text : "*");
        }
        if (ts.isExportDeclaration(st)) {
            if (st.exportClause && ts.isNamedExports(st.exportClause))
                for (const el of st.exportClause.elements) names.push(el.name.text);
            else names.push("*");
        }
    }
    const read = new Set(exportedHandlers(sf).map((h) => h.name));
    return names.filter((n) => (HTTP_METHODS.has(n) || n === "*") && !read.has(n));
}

/** 그 핸들러가 본문을 읽는가 — `readJsonBody(…)` 든 첫 인자의 `.json()` 이든(인자 이름은 무엇이든). */
function readsBody(root: TS.Node, param: string | null): boolean {
    if (calls(root, "readJsonBody")) return true;
    if (param === null) return false;
    let found = false;
    const visit = (node: TS.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "json" &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === param
        ) {
            found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

/** 본문이 없을 때 400 을 내는가 — 표준 헬퍼든, 그 자리에서 직접 내든. */
function rejectsMissingBody(root: TS.Node): boolean {
    if (calls(root, "invalidBody")) return true;
    let found = false;
    const visit = (node: TS.Node): void => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === "INVALID_BODY")
            found = true;
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

/**
 * ①층 면제 마커의 사유 — **검사기 X1 과 같은 규칙**(`@zalkera/client` `bin/validate-storefront.mjs` 의
 * `allowMarker("cross-origin")` 정규식 · 「첫 `export` 앞까지」 자르기). 그 함수는 import 하는 순간 검사기가
 * 실행되는 파일에 있어 옮겨 적었다 — 두 벌이 갈리면 검사기는 면제하는데 이 그물은 막는(또는 그 반대) 자리가 생긴다.
 * 사유가 없거나(맨몸 마커) 다음 줄에 있거나 첫 `export` 뒤에 있으면 `null` 이다.
 */
const H_SPACE = "[ \\t\\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]";
const INVISIBLE = "[\\p{Cf}\\p{Mn}\\p{Me}]";
const CROSS_ORIGIN_MARKER = new RegExp(
    `//${H_SPACE}*(?:zalkera|oneq(?:ue?)?)-allow-cross-origin:(?:${H_SPACE}|${INVISIBLE})*(?!\\s|${INVISIBLE})(\\S.*)`,
    "u",
);
/** 마커를 **달려고 한** 흔적 — 사유가 없거나 자리가 틀려 면제로 인정되지 않는 마커를 가려낸다. */
const CROSS_ORIGIN_MARKER_ATTEMPT = /\/\/\s*(?:zalkera|oneq(?:ue?)?)-allow-cross-origin\b/u;

function crossOriginExemptReason(text: string): string | null {
    const head = text.slice(0, text.search(/^export\b/m) + 1 || text.length);
    return head.match(CROSS_ORIGIN_MARKER)?.[1].trim() ?? null;
}

/** 그 이름을 부르는 자리의 수 — 식별자 호출이든 멤버 호출이든. */
function countCalls(root: TS.Node, name: string): number {
    let n = 0;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node)) {
            const e = node.expression;
            if ((ts.isIdentifier(e) && e.text === name) || (ts.isPropertyAccessExpression(e) && e.name.text === name))
                n++;
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return n;
}

/** 이름으로 부르는가 — 식별자 호출(`f()`)이든 멤버 호출(`zalkera.f()`)이든. */
function callsName(root: TS.Node, name: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node)) {
            const e = node.expression;
            if ((ts.isIdentifier(e) && e.text === name) || (ts.isPropertyAccessExpression(e) && e.name.text === name))
                found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

/** 요청 인자를 가드가 아닌 함수에 그대로 넘기는가 — 넘기면 본문을 그 안에서 읽을 수 있어 이 그물이 필수 여부를 모른다. */
const NON_READERS = new Set([
    "assertSameOrigin",
    "assertJsonContentType",
    "readJsonBody",
    "requestOrigin",
    "isSameOriginRequest",
]);
function passesRequestElsewhere(root: TS.Node, param: string | null): boolean {
    if (param === null) return false;
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node)) {
            const e = node.expression;
            const callee = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
            if (!NON_READERS.has(callee) && node.arguments.some((a) => ts.isIdentifier(a) && a.text === param))
                found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

/** `src/` 아래에서 `app/api` 의 `route.ts` 가 아닌 소스 — 시험 파일은 뺀다. */
function nonRouteSources(srcDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name !== "node_modules") walk(p);
            } else if (
                /\.(ts|tsx)$/.test(e.name) &&
                !/\.test\.tsx?$/.test(e.name) &&
                !(e.name === "route.ts" && p.includes(join("app", "api")))
            )
                out.push(p);
        }
    };
    walk(srcDir);
    return out;
}

function parseAny(path: string): TS.SourceFile {
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

interface Row {
    label: string;
    route: string;
    /** 메서드 이름 — 한 파일이 여럿을 export 하면 행도 여럿이다. */
    method: string;
    mutation: boolean;
    bodyRequired: boolean;
    hasCtGuard: boolean;
    hasOriginGuard: boolean;
    /** 파일 상단에 사유 있는 ①층 면제 마커가 있다. */
    exempt: boolean;
    readsBody: boolean;
    /** 요청 인자를 가드가 아닌 함수에 넘긴다 — 그 안에서 본문을 읽는지 이 그물은 모른다. */
    passesRequestElsewhere: boolean;
}

function survey(): Row[] {
    const rows: Row[] = [];
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const sf = parse(path);
            const exempt = crossOriginExemptReason(readFileSync(path, "utf8")) !== null;
            const route = relative(join(dir, "app", "api"), path)
                .split("\\")
                .join("/");
            for (const h of exportedHandlers(sf)) {
                rows.push({
                    label,
                    route,
                    method: h.name,
                    mutation: MUTATION_METHODS.has(h.name),
                    // 본문 필수 = 그 핸들러가 본문을 읽고 + 없으면 400 을 낸다
                    bodyRequired: readsBody(h.body, h.param) && rejectsMissingBody(h.body),
                    readsBody: readsBody(h.body, h.param),
                    passesRequestElsewhere: passesRequestElsewhere(h.body, h.param),
                    hasCtGuard: calls(h.body, "assertJsonContentType"),
                    hasOriginGuard: calls(h.body, "assertSameOrigin"),
                    exempt,
                });
            }
        }
    }
    return rows;
}

test("통제군 — 라우트를 실제로 읽는다(변이 문과 본문 필수 문이 둘 다 있다)", () => {
    const rows = survey();
    // 🔴 **못 읽은 핸들러는 잴 수 없는 핸들러다.** 개수로 세면 GET 몇 줄이 그 자리를 메워, 변이 핸들러를 이 그물이 못 읽는
    //    꼴로 바꾸고 ①층을 빼도 초록이 된다. 그래서 파일마다 export 한 메서드 이름으로 맞춘다.
    const unreadable: string[] = [];
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            for (const m of unreadableMethods(parse(path)))
                unreadable.push(`${label}:${relative(join(dir, "app", "api"), path)}#${m}`);
        }
    }
    assert.deepEqual(
        unreadable,
        [],
        "이 그물이 못 읽는 꼴로 HTTP 메서드를 export 했다 — 가드를 잴 수 없다. `export async function POST(req: Request)` 로 쓰거나, 같은 파일의 핸들러 함수를 `export {POST}` 로 내보낸다",
    );
    // 본문을 읽는 변이 문이 있으면 그중 하나는 본문 필수로 읽혀야 한다 — 신호(`invalidBody()`·`INVALID_BODY`)가 통째로
    // 사라지면 ③층 판정 전체가 눈을 감는다. 본문을 읽는 변이 문이 하나도 없는 트리(능력을 지운 트리)는 잴 것이 없다.
    const readers = rows.filter((r) => r.mutation && r.readsBody);
    assert.ok(
        readers.length === 0 || readers.some((r) => r.bodyRequired),
        `본문을 읽는 변이 문 ${readers.length}개 중 본문 필수로 읽히는 문이 없다 — 판정 신호가 사라졌다. 본문이 필수인 문은 없을 때 400 응답에 \`code: "INVALID_BODY"\` 를 싣는다(\`invalidBody()\`)`,
    );
    // ⚠ **아래는 정본에서만 선다** — 고객 트리는 능력을 지울 수 있다.
    if (CANONICAL) {
        assert.ok(rows.length >= 20, `라우트를 못 읽었다: ${rows.length}`);
        assert.ok(
            PACK_SRCS.length >= 2,
            `정본 레포인데 프리셋 사본을 못 찾았다: ${PACK_SRCS.map(([l]) => l).join(",")}`,
        );
        assert.ok(
            rows.some((r) => r.mutation && !r.bodyRequired),
            "본문 없는 변이 문이 하나도 안 잡혔다 — 판정이 죽었다",
        );
    }
});

test("🔴 본문 필수 문에는 ③층이 있다", () => {
    const missing = survey().filter((r) => r.bodyRequired && !r.hasCtGuard);
    assert.deepEqual(
        missing.map((r) => `${r.label}:${r.route}#${r.method}`),
        [],
        "본문 필수로 읽히는데 Content-Type 관문이 없다 — 폼 운반체가 ①층 하나에만 기댄다.\n" +
            "  · 본문이 필수인 문이면: ①층 바로 뒤에 `assertJsonContentType(req)` 를 둔다.\n" +
            "  · 본문이 없어도 되는 문이면(취소·구매확정처럼 본문 없이 POST 하는 호출이 있다): `invalidBody()`·`INVALID_BODY` 를 쓰지 않는다 — 이 그물은 그 코드를 「필수」 신호로 읽고, ③층을 달면 본문 없는 호출이 415 로 튕긴다.",
    );
});

test("🔴 본문 없는 변이 문에는 ③층이 없다 — 있으면 정상 동선이 415 로 깨진다", () => {
    // 고객 트리에서 요청을 다른 함수로 넘기는 문은 필수 여부를 모른다 — 모르는 문에 「③층을 뗀다」를 말하지 않는다.
    const wrong = survey().filter(
        (r) => r.mutation && !r.bodyRequired && r.hasCtGuard && (CANONICAL || !r.passesRequestElsewhere),
    );
    assert.deepEqual(
        wrong.map((r) => `${r.label}:${r.route}#${r.method}`),
        [],
        "본문 필수로 읽히지 않는 문에 Content-Type 관문이 걸렸다 — 본문 없이 POST 하는 브라우저 호출이 415 로 튕긴다.\n" +
            '  · 본문이 필수인 문이면: 핸들러 안에서 직접 읽고(`readJsonBody(req)`·`req.json()` — 자기 헬퍼 안에서 읽으면 이 그물이 못 읽는다) 없을 때 400 응답에 `code: "INVALID_BODY"` 를 싣는다(`invalidBody()` 가 그 모양 · 문구는 자유).\n' +
            "  · 본문이 없어도 되는 문이면(마이페이지 취소·구매확정처럼): ③층을 뗀다.",
    );
});

/** **정본 레포의** ①층 면제 — 이 목록뿐이다. 늘리려면 이 줄을 고쳐야 하고, 그 자리가 곧 심의 대상이다. 고객 트리에서는 마커가 정한다. */
const CROSS_ORIGIN_EXEMPT = ["revalidate/route.ts"];

test("🔴 변이 문은 모두 ①층(assertSameOrigin)을 부른다 — 5벌 일관 제거를 잡는다", () => {
    const open = survey()
        .filter((r) => r.mutation && !r.exempt && !r.hasOriginGuard)
        .map((r) => `${r.label}:${r.route}#${r.method}`);
    assert.deepEqual(
        open,
        [],
        "변이 문이 ①층 없이 열려 있다 — 교차사이트 폼 자동제출이 그대로 통과한다. 첫 구문에 `assertSameOrigin(req)` 를 둔다(정당한 예외는 파일 상단 `// zalkera-allow-cross-origin: <사유>` — AGENTS.md BFF 절)",
    );
});

test("🔴 ①층 면제 마커는 사유를 같은 줄에 갖는다 — 정본에서는 면제 집합이 심의 목록과 같다", () => {
    const exempt = new Set<string>();
    const unrecognized: string[] = [];
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const text = readFileSync(path, "utf8");
            const route = relative(join(dir, "app", "api"), path)
                .split("\\")
                .join("/");
            if (crossOriginExemptReason(text) !== null) exempt.add(route);
            else if (CROSS_ORIGIN_MARKER_ATTEMPT.test(text)) unrecognized.push(`${label}:${route}`);
        }
    }
    assert.deepEqual(
        unrecognized,
        [],
        "면제 마커가 면제로 인정되지 않는다 — 사유가 같은 줄에 없거나 첫 `export` 뒤에 있다(검사기 X1 과 같은 규칙). 파일 상단에 `// zalkera-allow-cross-origin: <사유>`",
    );
    if (CANONICAL) {
        assert.deepEqual(
            [...exempt].sort(),
            [...CROSS_ORIGIN_EXEMPT].sort(),
            "정본 레포의 면제 집합이 심의 목록과 달라졌다 — 면제를 늘리려면 CROSS_ORIGIN_EXEMPT 를 고쳐 심의를 받는다",
        );
    }
});

test("🔴 소셜 교환 문이 ②층(consumeOAuthState)을 부른다 — 콜백 경유 code 주입을 막는 그 한 줄", () => {
    // 경로가 아니라 **부르는 것**으로 찾는다 — 폴더를 옮기거나 교환 라우트를 하나 더 만들어도 잡힌다.
    // 교환·발행을 부르는 핸들러가 하나도 없는 고객 트리는 소셜 로그인을 지운 트리다 — 잴 문이 없다.
    const missing: string[] = [];
    let exchanges = 0;
    let starts = 0;
    for (const [label, dir] of PACK_SRCS) {
        for (const path of routeFiles(dir)) {
            const route = relative(join(dir, "app", "api"), path);
            const sf = parse(path);
            const handlers = exportedHandlers(sf);
            // 같은 파일의 헬퍼 안에서 부르면 핸들러에서 state 를 잴 수 없다 — 부르는 자리 수를 핸들러 본문 안의 수와 맞춘다.
            for (const name of ["socialLogin", "buildAuthorizeUrl"]) {
                const inHandlers = handlers.reduce((n, h) => n + countCalls(h.body, name), 0);
                if (countCalls(sf, name) > inHandlers)
                    missing.push(`${label}:${route} — ${name} 을 핸들러 밖에서 부른다`);
            }
            for (const h of handlers) {
                if (callsName(h.body, "socialLogin")) {
                    exchanges++;
                    if (!calls(h.body, "consumeOAuthState")) missing.push(`${label}:${route}#${h.name} 교환`);
                }
                if (callsName(h.body, "buildAuthorizeUrl")) {
                    starts++;
                    if (!calls(h.body, "issueOAuthState")) missing.push(`${label}:${route}#${h.name} 발행`);
                }
            }
        }
        // 라우트 핸들러 밖에서 부르면 같은 핸들러에서 state 를 잴 수 없다.
        for (const path of nonRouteSources(dir)) {
            if (path.endsWith(join("lib", "oauth.ts"))) continue; // `buildAuthorizeUrl` 의 정의가 사는 곳
            const sf = parseAny(path);
            if (callsName(sf, "socialLogin") || callsName(sf, "buildAuthorizeUrl"))
                missing.push(`${label}:${relative(dir, path)} — 라우트 핸들러 밖`);
        }
    }
    if (CANONICAL) assert.ok(exchanges > 0 && starts > 0, `소셜 교환 ${exchanges}·발행 ${starts} — 판정이 죽었다`);
    assert.deepEqual(
        missing,
        [],
        "state 대조·발행이 빠졌다 — 피해자 브라우저에 공격자 세션이 주입된다. 교환(`socialLogin`)·발행(`buildAuthorizeUrl`)은 라우트 핸들러 안에서 부르고, 같은 핸들러에서 `consumeOAuthState`·`issueOAuthState` 를 부른다",
    );
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

/**
 * ⚠ **스킵하지 않는다.** 사본이 하나뿐인 팩 트리에서 건너뛰면 통과 수가 한 개 줄고(스킵은 통과로 안 센다)
 * 하한표가 정본 레포(8)와 팩 트리(7) 어느 쪽에도 못 맞는다 — 한쪽을 맞추면 다른 쪽 게이트가 빨개진다.
 * 재현: `node scripts/lib/floor-gate.mjs` 를 이 레포와 `presets/skeleton` 양쪽에서.
 * 사본이 하나면 드리프트가 없는 것이 **참**이므로 그대로 통과시킨다.
 */
test("프리셋 5벌의 판정이 정본과 같다 — 한 벌만 고치는 사고를 잡는다", () => {
    const rows = survey();
    const byRoute = new Map<string, Map<string, string>>();
    for (const r of rows) {
        if (!byRoute.has(`${r.route}#${r.method}`)) byRoute.set(`${r.route}#${r.method}`, new Map());
        byRoute
            .get(`${r.route}#${r.method}`)!
            .set(r.label, `${r.mutation}/${r.bodyRequired}/${r.hasCtGuard}/${r.hasOriginGuard}/${r.exempt}`);
    }
    const drift: string[] = [];
    for (const [route, byLabel] of byRoute) {
        const shapes = new Set(byLabel.values());
        if (shapes.size > 1) drift.push(`${route}: ${[...byLabel].map(([l, s]) => `${l}=${s}`).join(" · ")}`);
        if (byLabel.size !== PACK_SRCS.length)
            drift.push(`${route}: 사본 ${byLabel.size}/${PACK_SRCS.length} 벌에만 있다`);
    }
    assert.deepEqual(drift, [], "프리셋 사본 사이에 ③층 배선이 갈렸다");
});
