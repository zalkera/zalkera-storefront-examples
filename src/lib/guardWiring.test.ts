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

/** Next 가 라우트로 읽는 확장자(`pageExtensions` 기본값) — `route.ts` 만 보면 `route.js` 로 옮긴 문이 그물 밖이다. */
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx)$/;

function routeFiles(srcDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (ROUTE_FILE.test(e.name)) out.push(p);
        }
    };
    const api = join(srcDir, "app", "api");
    if (existsSync(api)) walk(api);
    return out.sort();
}

function parse(path: string): TS.SourceFile {
    const kind = path.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : path.endsWith(".jsx")
          ? ts.ScriptKind.JSX
          : /\.[cm]?js$/.test(path)
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;
    return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, kind);
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

/** 시험 파일의 꼴 — `packSources` 가 빼는 것과 같은 규칙. 운영 코드가 이것을 가져오면 면제가 구멍이 된다. */
const TEST_LIKE = /(^|\/)__tests__(\/|$)|\.(test|spec)(\.[cm]?[jt]sx?)?$/;

/**
 * 노드가 모듈 지정자를 들고 있으면 그 문자열 — `import`·`export … from`·`import()`·`require()`. 타입 전용 import 도 센다(런타임엔
 * 안 실려도 운영→시험 의존 방향은 막는다 — 위 `createZalkeraClient` 훑기가 타입 자리를 면제하는 것과 다른 물음이다).
 * 치환 있는 템플릿·식별자 인자 같은 **동적 지정자는 `"<dynamic>"`** 으로 돌려준다 — 번들러가 디렉터리째 묶어 시험 파일까지 실을 수
 * 있어 셀 수 없는 것은 red 다.
 */
function moduleSpecifierOf(n: TS.Node): string | null {
    // 치환 있는 템플릿은 머리·꼬리 리터럴로만 판정한다 — 꼬리가 `.json` 처럼 소스 파일일 수 없는 꼴이면 통과(`next-intl` 의
    // `import(`./messages/${locale}.json`)` 같은 정당한 꼴), 꼬리가 비었거나 소스 확장자면 셀 수 없는 것으로 red.
    const specifierOf = (expr: TS.Expression): string => {
        if (ts.isStringLiteralLike(expr)) return expr.text;
        if (ts.isTemplateExpression(expr)) {
            const tail = expr.templateSpans[expr.templateSpans.length - 1].literal.text;
            // 빈 꼬리·소스 확장자 꼬리(`./lib/${n}.ts` — 번들러가 디렉터리째 묶어 시험 파일까지 싣는 꼴)·`__tests__` 머리는 셀 수 없다.
            const uncountable =
                tail === "" || /\.[cm]?[jt]sx?$/.test(tail) || /(^|\/)__tests__(\/|$)/.test(expr.head.text);
            return uncountable ? "<dynamic>" : `${expr.head.text}…${tail}`;
        }
        return "<dynamic>";
    };
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier)
        return specifierOf(n.moduleSpecifier);
    if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
            const [arg] = n.arguments;
            return arg ? specifierOf(arg) : "<dynamic>";
        }
    }
    return null;
}

/** 팩 소스 전부 — 시험 파일은 뺀다(그 면제가 서는 조건은 아래 「운영 코드가 시험 파일을 가져오지 않는다」 시험). */
function packSources(srcDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const p = join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name !== "node_modules" && e.name !== "__tests__") walk(p);
            } else if (/\.[cm]?[jt]sx?$/.test(e.name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) out.push(p);
        }
    };
    walk(srcDir);
    return out;
}

/**
 * `src/lib/zalkera.ts` 의 입구 형상이 어긋난 까닭 — 맞으면 `null`.
 * `createZalkeraClient` 를 한 번 불러 곧바로 구조분해하고, 뗀 `socialLogin` 은 `bindSocialExchange(…)` 의 첫 인자로만 쓴다.
 */
function socialEntranceProblem(sf: TS.SourceFile, hits: TS.Node[]): string | null {
    const creates = hits.filter((h) => ts.isCallExpression(h.parent) && h.parent.expression === h);
    if (creates.length !== 1 || hits.some((h) => !creates.includes(h) && !ts.isImportSpecifier(h.parent)))
        return "createZalkeraClient 를 한 번만 불러 그 결과를 곧바로 구조분해해야 한다";
    const decl = creates[0].parent.parent;
    if (!ts.isVariableDeclaration(decl) || !ts.isObjectBindingPattern(decl.name))
        return "createZalkeraClient 의 결과를 구조분해하지 않는다 — socialLogin 이 싱글턴에 남는다";
    const login = decl.name.elements.find((e) => {
        const key = e.propertyName ?? e.name;
        return !e.dotDotDotToken && (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && key.text === "socialLogin";
    });
    if (!login || !ts.isIdentifier(login.name)) return "구조분해에서 socialLogin 을 떼지 않는다";
    const local = login.name;
    const uses: TS.Identifier[] = [];
    const visit = (n: TS.Node): void => {
        if (ts.isIdentifier(n) && n !== local && n.text === local.text) uses.push(n);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    const onlyUse = uses.length === 1 ? uses[0].parent : undefined;
    const bound =
        onlyUse !== undefined &&
        ts.isCallExpression(onlyUse) &&
        onlyUse.arguments[0] === uses[0] &&
        ts.isIdentifier(onlyUse.expression) &&
        onlyUse.expression.text === "bindSocialExchange";
    return bound ? null : "뗀 socialLogin 을 bindSocialExchange(…) 의 첫 인자 말고 다른 데서 쓴다";
}

/**
 * **소셜 교환은 한 입구로만** — 싱글턴 `zalkera` 에는 `socialLogin` 이 없고, 교환은 `exchangeSocialLogin`(state 대조·소각 →
 * 교환)으로만 한다. 이 시험은 그 입구가 **하나인지**만 잰다: 클라이언트를 `src/lib/zalkera.ts` 밖에서 또 만들거나
 * (`createZalkeraClient` 는 고유한 이름이라 같은 철자의 다른 뜻이 없다), 뗀 `socialLogin` 을 다른 데로 넘기면 red.
 * 대조·소각·교환의 **행위**는 `oauthState.test.ts` 가 잠근다.
 * ⚠ 교환 **호출을 찾는** 그물로 되돌리지 마라 — 찾는 범위를 넓히면 같은 철자의 설정 칸·props 가 거짓 red, 좁히면
 *   별칭·래퍼가 샌다.
 */
test("🔴 소셜 교환은 한 입구로만 — 클라이언트는 `lib/zalkera.ts` 에서만 만들고 `socialLogin` 을 뗀다", () => {
    const bad: string[] = [];
    let shaped = 0;
    let specifiers = 0; // 양성 짝 — 지정자 훑기가 죽어 빈 채로 초록이 되지 않게
    for (const [label, dir] of PACK_SRCS) {
        const owner = join(dir, "lib", "zalkera.ts");
        for (const path of packSources(dir)) {
            const sf = parse(path);
            const hits: TS.Node[] = [];
            const testImports: string[] = [];
            const visit = (n: TS.Node): void => {
                // 시험 파일은 위 훑기에서 빠진다 — 운영 코드가 시험 파일을 가져오면 거기서 만든 클라이언트가 운영에 실리므로 면제가 구멍이다.
                const spec = moduleSpecifierOf(n);
                if (spec !== null) {
                    specifiers++;
                    if (spec === "<dynamic>" || TEST_LIKE.test(spec)) testImports.push(spec);
                }
                // 타입 자리(`typeof createZalkeraClient`)와 type-only import 는 클라이언트를 만들지 않는다.
                if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && n.text === "createZalkeraClient") {
                    const p = n.parent;
                    const typeOnly =
                        ts.isTypeQueryNode(p) ||
                        (ts.isImportSpecifier(p) && (p.isTypeOnly || p.parent.parent.isTypeOnly));
                    if (!typeOnly) hits.push(n);
                }
                ts.forEachChild(n, visit);
            };
            visit(sf);
            const rel = relative(dir, path).split("\\").join("/");
            for (const spec of testImports)
                bad.push(
                    spec === "<dynamic>"
                        ? `${label}:${rel} — 동적 지정자로 가져온다(무엇이 실리는지 셀 수 없다)`
                        : `${label}:${rel} — 운영 코드가 시험 파일을 가져온다(${spec})`,
                );
            if (hits.length === 0) continue;
            if (path !== owner) {
                bad.push(`${label}:${rel} — 클라이언트를 lib/zalkera.ts 밖에서 만든다`);
                continue;
            }
            const problem = socialEntranceProblem(sf, hits);
            if (problem) bad.push(`${label}:${rel} — ${problem}`);
            else shaped++;
        }
    }
    if (CANONICAL) {
        assert.equal(shaped, PACK_SRCS.length, `입구 형상을 확인한 사본 ${shaped}/${PACK_SRCS.length} — 판정이 죽었다`);
        assert.ok(specifiers > 0, "지정자를 하나도 못 읽었다 — 시험 파일 가져오기 훑기가 죽었다");
    }
    assert.deepEqual(
        bad,
        [],
        "소셜 교환의 입구가 하나가 아니다 — state 대조 없이 교환할 길이 열린다. 클라이언트는 `src/lib/zalkera.ts` 에서 `const {socialLogin, ...client} = createZalkeraClient(…)` 로 만들고, `socialLogin` 은 `bindSocialExchange(socialLogin, …)` 에만 넘긴다",
    );
});

/** `oauthState.ts` 가 내보내는 state 쿠키 이름의 값 — 없으면 `null`(그 파일이 없거나 리터럴이 아니다). */
function stateCookieName(oauthStatePath: string): string | null {
    if (!existsSync(oauthStatePath)) return null;
    let name: string | null = null;
    const visit = (n: TS.Node): void => {
        if (
            ts.isVariableDeclaration(n) &&
            ts.isIdentifier(n.name) &&
            n.name.text === "OAUTH_STATE_COOKIE" &&
            n.initializer
        ) {
            let init: TS.Expression = n.initializer;
            while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
            if (ts.isStringLiteralLike(init)) name = init.text;
        }
        ts.forEachChild(n, visit);
    };
    visit(parse(oauthStatePath));
    return name;
}

/**
 * `.set(…)` 호출이 state 쿠키를 심는가 — 이름을 식별자로 · 값 리터럴로 · Next 의 객체형(`{name, value, …}`)으로 주는 세 꼴 전부.
 * 받는 쪽(`jar`·`response.cookies`·아무 이름)은 묻지 않는다 — 정본 줄을 그대로 두고 옆에 더하는 형상을 세려는 것이다.
 * 한계: 이름을 별칭·문자열 조합으로 만들거나 `.set` 을 `Reflect.apply`·`.call` 로 부르는 형상은 이 세 꼴 밖이다(문면 그물).
 */
function setsStateCookie(call: TS.CallExpression, cookieName: string): boolean {
    const [first] = call.arguments;
    if (!first) return false;
    const isName = (n: TS.Node): boolean =>
        (ts.isIdentifier(n) && n.text === "OAUTH_STATE_COOKIE") || (ts.isStringLiteralLike(n) && n.text === cookieName);
    if (isName(first)) return true;
    return (
        ts.isObjectLiteralExpression(first) &&
        first.properties.some(
            (p) =>
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                p.name.text === "name" &&
                isName(p.initializer),
        )
    );
}

/**
 * `session.ts` 가 state 쿠키를 심을 때 쓰는 옵션 리터럴이 어긋난 까닭 — 맞으면 `null`.
 * `{...OAUTH_STATE_COOKIE_OPTIONS, secure}` 만 허용한다 — 발행 상수를 펼친 뒤 `sameSite`·`httpOnly`·`path`·`maxAge` 를 덮으면
 * 검사기(X3)가 읽는 상수와 실제 심는 값이 갈려 「lax 로 심는다」는 문서·검사가 거짓이 된다. `secure` 는 **축약**으로만 — 축약이어야
 * 이 파일의 형제 쿠키 넷과 같은 바인딩(모듈 상단의 환경 판정 하나)을 쓰는 것이 보장되고, `secure: isProd` 같은 재작성은 같은 사실의
 * 두 번째 표현이라 시험이 `secure: false` 와 가를 수 없다. 펼치는 상수는 `oauthState` 모듈에서 가져온 것이어야 한다 — 같은 이름의
 * 지역 상수로 가리면 이름만 같고 값이 다르다.
 */
function issuedCookieOptionsProblem(sf: TS.SourceFile, call: TS.CallExpression): string | null {
    if (call.arguments.length !== 3) return "state 쿠키를 (이름, 값, 옵션) 세 인자로 심지 않는다";
    const options = call.arguments[2];
    if (!ts.isObjectLiteralExpression(options)) return "옵션이 객체 리터럴이 아니다";
    const [first, ...rest] = options.properties;
    if (
        !first ||
        !ts.isSpreadAssignment(first) ||
        !ts.isIdentifier(first.expression) ||
        first.expression.text !== "OAUTH_STATE_COOKIE_OPTIONS"
    )
        return "첫 항이 `...OAUTH_STATE_COOKIE_OPTIONS` 가 아니다";
    const secureOnly = rest.length === 1 && ts.isShorthandPropertyAssignment(rest[0]) && rest[0].name.text === "secure";
    if (!secureOnly) {
        const names = rest.map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : "?"));
        if (names.length === 0) return "`secure` 가 없다 — 상용에서 Secure 없는 state 쿠키가 나간다";
        if (names.length === 1 && names[0] === "secure")
            return "`secure` 는 축약으로만 — 형제 쿠키와 같은 환경 판정 하나를 쓴다(다른 표기는 두 번째 Secure 정책이다)";
        return `펼친 뒤의 항이 축약 \`secure\` 하나가 아니다: ${names.join(", ")} — 검사기가 읽는 값과 심는 값이 갈린다`;
    }
    // 출처 — `oauthState` 모듈의 import 로 들어온 이름이어야 하고, 같은 이름의 다른 선언이 파일에 없어야 한다. `secure` 도 같다 —
    // 파일 안 유일한 선언이 모듈 상단 `const secure = process.env.NODE_ENV === "production"` 이어야 축약 `secure` 가 그 값이다
    // (함수 안 `const secure = false`·매개변수 기본값이면 꼴은 같은데 상용에 Secure 없는 쿠키가 나간다).
    let fromOauthState = false;
    let shadowed = false;
    const secureDecls: TS.Node[] = [];
    const declaredName = (n: TS.Node): string | null => {
        if (ts.isImportSpecifier(n)) return n.name.text;
        if (
            (ts.isVariableDeclaration(n) ||
                ts.isFunctionDeclaration(n) ||
                ts.isClassDeclaration(n) ||
                ts.isEnumDeclaration(n) ||
                ts.isBindingElement(n) ||
                ts.isParameter(n)) &&
            n.name &&
            ts.isIdentifier(n.name)
        )
            return n.name.text;
        return null;
    };
    const visit = (n: TS.Node): void => {
        const name = declaredName(n);
        if (name === "OAUTH_STATE_COOKIE_OPTIONS") {
            const mod = ts.isImportSpecifier(n) ? n.parent.parent.parent.moduleSpecifier : undefined;
            // 별칭(`{X as OAUTH_STATE_COOKIE_OPTIONS}`)은 다른 것을 이 이름으로 부르는 것 — 출처로 안 친다.
            if (
                mod &&
                ts.isStringLiteralLike(mod) &&
                /^(@\/lib|\.)\/oauthState(\.[cm]?[jt]s)?$/.test(mod.text) &&
                !(n as TS.ImportSpecifier).propertyName
            )
                fromOauthState = true;
            else shadowed = true;
        } else if (name === "secure") {
            secureDecls.push(n);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!fromOauthState) return "OAUTH_STATE_COOKIE_OPTIONS 를 `@/lib/oauthState` 에서 가져오지 않는다";
    if (shadowed)
        return "OAUTH_STATE_COOKIE_OPTIONS 와 같은 이름의 선언이 파일에 또 있다 — 펼치는 것이 발행 상수가 아니다";
    if (secureDecls.length !== 1)
        return `\`secure\` 의 선언이 ${secureDecls.length}곳 — 모듈 상단 \`const secure = process.env.NODE_ENV === "production"\` 하나여야 한다`;
    const [secureDecl] = secureDecls;
    const topLevelConst =
        ts.isVariableDeclaration(secureDecl) &&
        ts.isVariableDeclarationList(secureDecl.parent) &&
        (secureDecl.parent.flags & ts.NodeFlags.Const) !== 0 &&
        ts.isVariableStatement(secureDecl.parent.parent) &&
        ts.isSourceFile(secureDecl.parent.parent.parent);
    const initializer =
        ts.isVariableDeclaration(secureDecl) && secureDecl.initializer ? secureDecl.initializer.getText(sf) : "";
    if (!topLevelConst || initializer.replace(/\s+/g, "") !== 'process.env.NODE_ENV==="production"')
        return `\`secure\` 가 모듈 상단 \`const secure = process.env.NODE_ENV === "production"\` 이 아니다(지금: \`${secureDecl.getText(sf)}\`) — 형제 쿠키 넷과 같은 판정이어야 한다`;
    return null;
}

test("🔴 state 쿠키는 `session.ts` 한 곳에서 발행 상수 그대로 심는다 — 펼친 뒤 덮거나 옆에 더하거나 가리지 않는다", () => {
    const bad: string[] = [];
    let shaped = 0;
    for (const [label, dir] of PACK_SRCS) {
        const cookieName = stateCookieName(join(dir, "lib", "oauthState.ts"));
        if (cookieName === null) {
            // 지킬 대상이 없으면 지킬 약속도 없다(`floors.mjs` 의 능력별 규칙) — 로그인 화면을 걷은 고객 트리는 이 파일을 지울 수 있다.
            // 정본에서는 없을 수 없고, 어느 트리든 파일은 없는데 발행 호출이 남아 있으면 그것은 걷다 만 것이라 red.
            if (CANONICAL) bad.push(`${label}:lib/oauthState.ts — OAUTH_STATE_COOKIE 리터럴을 찾지 못했다`);
            else if (packSources(dir).some((path) => /\bOAUTH_STATE_COOKIE\b/.test(readFileSync(path, "utf8"))))
                bad.push(`${label} — lib/oauthState.ts 는 없는데 OAUTH_STATE_COOKIE 를 쓰는 운영 소스가 남아 있다`);
            continue;
        }
        // 심는 자리 — 운영 소스 전부에서 세 꼴을 다 센다. 정확히 하나여야 하고 `lib/session.ts` 여야 한다.
        const issued: {path: string; sf: TS.SourceFile; call: TS.CallExpression}[] = [];
        for (const path of packSources(dir)) {
            const sf = parse(path);
            const visit = (n: TS.Node): void => {
                if (
                    ts.isCallExpression(n) &&
                    ts.isPropertyAccessExpression(n.expression) &&
                    n.expression.name.text === "set" &&
                    setsStateCookie(n, cookieName)
                )
                    issued.push({path, sf, call: n});
                ts.forEachChild(n, visit);
            };
            visit(sf);
        }
        const owner = join(dir, "lib", "session.ts");
        const where = issued.map((i) => relative(dir, i.path).split("\\").join("/"));
        if (issued.length !== 1 || issued[0].path !== owner) {
            bad.push(
                `${label} — state 쿠키를 심는 자리가 ${issued.length}곳(${where.join(", ") || "없음"}) — lib/session.ts 한 곳이어야 한다`,
            );
            continue;
        }
        const problem = issuedCookieOptionsProblem(issued[0].sf, issued[0].call);
        if (problem) bad.push(`${label}:lib/session.ts — ${problem}`);
        else shaped++;
    }
    // 사유부터 — `shaped` 단언이 앞서면 어느 사본이 왜 어긋났는지가 「4/5」 뒤에 숨는다.
    assert.deepEqual(
        bad,
        [],
        "state 쿠키 발행이 발행 상수와 갈린다 — `lib/session.ts` 에서만 `jar.set(OAUTH_STATE_COOKIE, …, {...OAUTH_STATE_COOKIE_OPTIONS, secure})` 꼴로",
    );
    if (CANONICAL)
        assert.equal(shaped, PACK_SRCS.length, `발행 옵션을 확인한 사본 ${shaped}/${PACK_SRCS.length} — 판정이 죽었다`);
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
 * 하한표가 정본 레포(9)와 팩 트리(8) 어느 쪽에도 못 맞는다 — 한쪽을 맞추면 다른 쪽 게이트가 빨개진다.
 * 재현: 이 레포에서 `node scripts/lib/floor-gate.mjs` · 사본 하나뿐인 꼴은 `node --experimental-strip-types --test presets/skeleton/src/lib/guardWiring.test.ts`(9 통과).
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
