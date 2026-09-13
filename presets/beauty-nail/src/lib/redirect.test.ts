import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import type TS from "typescript";
// ⚠ 확장자를 붙인다 — `node --test` 의 ESM 해석은 `next/server` 를 못 찾는다.
import {NextResponse} from "next/server.js";
import {pathOnlyRedirect, withSearchParam} from "./redirect.ts";

/**
 * **이동 주소에 호스트가 없다** — 서빙 컨테이너의 `req.url` 은 `http://0.0.0.0:3000` 이라, 그 origin 으로
 * 만든 이동은 방문자를 `0.0.0.0` 으로 보낸다(상용 재현: `/api/auth/refresh` → `http://0.0.0.0:3000/login`).
 * `next dev` 에서는 요청 주소와 방문자 주소가 같아 어떤 시험도 이것을 못 봤다 — 그래서 **주소를 만드는 자리**를 잰다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const ts: typeof TS = require("typescript");

test("경로만 싣는다 — Location 이 준 경로 그대로다", () => {
    for (const path of ["/login", "/mypage?r=1", "/orders/A-1?phone=010&r=1", "/"]) {
        const init = pathOnlyRedirect(path, {"Cache-Control": "no-store"});
        const headers = new Headers(init.headers);
        assert.equal(init.status, 307);
        assert.equal(headers.get("location"), path);
        assert.equal(headers.get("cache-control"), "no-store");
    }
});

test("호스트를 싣는 값은 던진다 — 해석기가 호스트로 읽는 변형까지", () => {
    for (const bad of [
        "https://evil.example/x",
        "//evil.example",
        "/\\evil.example",
        "/\t/evil.example",
        "login",
        "",
    ]) {
        assert.throws(() => pathOnlyRedirect(bad), /호스트/, `통과시켰다: ${JSON.stringify(bad)}`);
    }
});

test("쿼리에 값을 더해도 경로다 — 기존 쿼리와 조각을 지킨다", () => {
    assert.equal(withSearchParam("/mypage", "r", "1"), "/mypage?r=1");
    assert.equal(withSearchParam("/orders/A-1?phone=010", "r", "1"), "/orders/A-1?phone=010&r=1");
    assert.equal(withSearchParam("/a#top", "r", "1"), "/a?r=1#top");
    assert.throws(() => withSearchParam("//evil.example/a", "r", "1"));
});

test("NextResponse 가 경로를 절대 주소로 바꾸지 않는다 — 쿠키를 얹어도 307·경로 그대로", () => {
    // 이 라우트가 실제로 내는 형상 그대로다: 응답을 만들고 표시 쿠키를 얹는다.
    const res = new NextResponse(null, pathOnlyRedirect("/mypage?r=1", {"Cache-Control": "no-store"}));
    res.cookies.set("zalkera_authed", "1", {path: "/"});
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), "/mypage?r=1");
    assert.match(res.headers.get("set-cookie") ?? "", /zalkera_authed=1/);
});

// ── 주소를 만드는 자리의 그물 ────────────────────────────────────────────────────────────

/** URL 의 **어느 호스트**를 말하는 읽기. `searchParams`·`pathname` 은 호스트와 무관해 통과다. */
const HOST_READS = new Set(["origin", "host", "hostname", "href", "port", "protocol"]);
const HOST_CALLS = new Set(["clone", "toString", "toJSON"]);

/**
 * 라우트 처리 함수가 **요청 주소에서 호스트를 꺼내는 자리**를 돌려준다.
 *
 * 요청 주소 = 처리 함수 첫 인자의 `.url`·`.nextUrl`, 그리고 `new URL(<그것>)` 과 그것을 받은 지역 이름(한 단계).
 * 잡는 것: 그 값의 `origin`·`host` 류 읽기 · `clone()` 류 호출 · `new URL(경로, <그것>)` 의 기준 · `{origin} =` 구조분해 ·
 * `NextResponse.redirect(<그것>)`. Origin **헤더**를 해석한 값은 방문자가 보낸 것이라 여기 안 든다.
 */
export function hostReadsFromRequestUrl(source: string, fileName = "route.ts"): string[] {
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const found: string[] = [];
    const at = (node: TS.Node, what: string) =>
        found.push(`${fileName}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${what}`);

    const visitFunction = (fn: TS.FunctionLikeDeclaration) => {
        const first = fn.parameters[0];
        if (!first || !ts.isIdentifier(first.name) || !fn.body) return;
        const req = first.name.text;
        const tainted = new Set<string>();

        const isRequestUrl = (e: TS.Expression): boolean => {
            const x = ts.isParenthesizedExpression(e) ? e.expression : e;
            if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === req) {
                return x.name.text === "url" || x.name.text === "nextUrl";
            }
            if (ts.isIdentifier(x)) return tainted.has(x.text);
            if (ts.isNewExpression(x) && x.expression.getText(sf) === "URL") {
                const arg = x.arguments?.[0];
                return !!arg && isRequestUrl(arg);
            }
            return false;
        };

        const walk = (node: TS.Node): void => {
            if (ts.isVariableDeclaration(node) && node.initializer && isRequestUrl(node.initializer)) {
                if (ts.isIdentifier(node.name)) tainted.add(node.name.text);
                if (ts.isObjectBindingPattern(node.name)) {
                    for (const el of node.name.elements) {
                        const key = (el.propertyName ?? el.name).getText(sf);
                        if (HOST_READS.has(key)) at(el, `구조분해 {${key}}`);
                    }
                }
            }
            if (ts.isPropertyAccessExpression(node) && isRequestUrl(node.expression)) {
                const name = node.name.text;
                const called = ts.isCallExpression(node.parent) && node.parent.expression === node;
                if (HOST_READS.has(name) || (called && HOST_CALLS.has(name))) at(node, `.${name}`);
            }
            if (ts.isNewExpression(node) && node.expression.getText(sf) === "URL") {
                const base = node.arguments?.[1];
                if (base && isRequestUrl(base)) at(node, "new URL(경로, 요청 주소)");
            }
            if (ts.isCallExpression(node) && /(^|\.)redirect$/.test(node.expression.getText(sf))) {
                const target = node.arguments[0];
                if (target && isRequestUrl(target)) at(node, "redirect(요청 주소)");
            }
            ts.forEachChild(node, walk);
        };
        walk(fn.body);
    };

    const visit = (node: TS.Node): void => {
        if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
            visitFunction(node);
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

test("그물이 잡는 형상 — 요청 주소의 호스트를 이동에 쓰는 여섯 가지", () => {
    const red = {
        "origin 을 기준으로": `export async function GET(req: Request) { const url = new URL(req.url); return NextResponse.redirect(new URL("/login", url.origin)); }`,
        "요청 주소를 기준으로": `export async function GET(request: Request) { return NextResponse.redirect(new URL("/login", request.url)); }`,
        "한 줄 origin": `export async function GET(req: Request) { const o = new URL(req.url).origin; return o; }`,
        nextUrl: `export async function GET(req: NextRequest) { const to = req.nextUrl.clone(); to.pathname = "/login"; return NextResponse.redirect(to); }`,
        구조분해: `export const GET = async (req: Request) => { const {origin} = new URL(req.url); return origin; };`,
        "요청 주소로 바로": `export async function GET(req: Request) { return Response.redirect(req.url); }`,
    };
    for (const [name, source] of Object.entries(red)) {
        assert.ok(hostReadsFromRequestUrl(source).length > 0, `못 잡았다: ${name}`);
    }
});

test("정당한 형상은 통과 — 쿼리 읽기·Origin 헤더·백엔드가 준 외부 주소·경로만 이동", () => {
    const green = {
        쿼리: `export async function GET(req: Request) { const {searchParams} = new URL(req.url); return searchParams.get("id"); }`,
        경로: `export async function GET(req: Request) { return new URL(req.url).pathname; }`,
        "Origin 헤더": `export async function POST(req: Request) { const sent = new URL(req.headers.get("origin") ?? "").origin; return sent; }`,
        "외부 주소": `export async function GET(_req: Request) { const location = res.headers.get("location"); return NextResponse.redirect(location); }`,
        "경로만 이동": `export async function GET(req: Request) { return new NextResponse(null, pathOnlyRedirect("/login")); }`,
    };
    for (const [name, source] of Object.entries(green)) {
        assert.deepEqual(hostReadsFromRequestUrl(source), [], `정당한 형상을 막았다: ${name}`);
    }
});

/** `src/app` 아래의 라우트 처리 파일 전부. */
function routeFiles(dir = join(ROOT, "src", "app")): string[] {
    return readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return routeFiles(full);
        return e.name === "route.ts" ? [full] : [];
    });
}

test("실제 라우트 전부가 요청 주소의 호스트를 이동에 안 쓴다", () => {
    const files = routeFiles();
    // 통제군 — 파일을 못 읽는 그물은 무엇이든 초록이다.
    assert.ok(
        files.some((f) => f.endsWith(join("api", "auth", "refresh", "route.ts"))),
        "갱신 라우트를 못 찾았다 — 경로가 바뀌었으면 그물도 옮겨라",
    );
    const hits = files.flatMap((f) => hostReadsFromRequestUrl(readFileSync(f, "utf8"), relative(ROOT, f)));
    assert.deepEqual(hits, []);
});
