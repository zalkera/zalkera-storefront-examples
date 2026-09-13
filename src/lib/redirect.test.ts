import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import type TS from "typescript";
// ⚠ 확장자를 붙인다 — `node --test` 의 ESM 해석은 `next/server` 를 못 찾는다.
import {NextResponse} from "next/server.js";
import {pathOnlyRedirect} from "./redirect.ts";

/**
 * **이동 주소에 호스트가 없다** — 서빙 컨테이너의 `req.url` 은 `http://0.0.0.0:3000` 이라, 그 origin 으로
 * 만든 이동은 방문자를 `0.0.0.0` 으로 보낸다(상용 재현: `/api/auth/refresh` → `http://0.0.0.0:3000/login`).
 * `next dev` 에서는 요청 주소와 방문자 주소가 같아 어떤 시험도 이것을 못 봤다.
 *
 * 그물은 **출력 쪽**을 잰다 — 라우트·도움 모듈에서 이동을 만드는 자리(`redirect(…)` 호출 · `Location` 리터럴)는
 * 소유자(`redirect.ts`) 아니면 허용 목록이어야 한다. 입력(`req.url` 의 어느 속성을 읽었나)을 쫓는 판정은
 * 헤더로 절대 주소를 만들거나 문자열을 자르거나 도움 함수로 빼는 형상을 놓친다 — 이동은 만들어지는 자리에서 센다.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const ts: typeof TS = require("typescript");

test("경로만 싣는다 — Location 이 준 경로 그대로다", () => {
    for (const path of ["/login", "/mypage", "/orders/A-1?phone=010", "/"]) {
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

test("같은 origin 인 경로는 통과한다 — `//` 가 안에 있어도(문자열 검사로 바꾸면 여기서 red)", () => {
    // 브라우저는 `/..//evil.example` 을 **경로**로 푼다(`https://우리/…//evil.example`). 이 판정은 그 해석기와
    // 같아야 하고, 원문을 그대로 실어야 한다 — 정규화한 값(`//evil.example`)을 실으면 남의 호스트가 된다.
    for (const path of ["/a//b", "/search?q=a//b", "/..//evil.example", "/x?next=//evil.example"]) {
        const headers = new Headers(pathOnlyRedirect(path).headers);
        assert.equal(headers.get("location"), path, `같은 origin 경로를 막았거나 바꿨다: ${JSON.stringify(path)}`);
    }
});

test("NextResponse 가 경로를 절대 주소로 바꾸지 않는다 — 쿠키를 얹어도 307·경로 그대로", () => {
    // 이 라우트가 실제로 내는 형상 그대로다: 응답을 만들고 표시 쿠키를 얹는다.
    const res = new NextResponse(null, pathOnlyRedirect("/mypage", {"Cache-Control": "no-store"}));
    res.cookies.set("zalkera_authed", "1", {path: "/"});
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), "/mypage");
    assert.match(res.headers.get("set-cookie") ?? "", /zalkera_authed=1/);
});

// ── 이동을 만드는 자리의 그물 ────────────────────────────────────────────────────────────

/**
 * 이동을 만드는 자리 — 소유자 밖에서 이것이 보이면 위반이다.
 *  · `….redirect(…)`·`redirect(…)` 호출(`NextResponse`·`Response`·`next/navigation` 어느 것이든)
 *  · **헤더 자리**의 `Location` — 객체의 키(`{Location: …}`·`{"Location": …}`)·`headers.set/append("Location", …)`
 *    의 첫 인자·`new Headers([["Location", …]])` 의 짝 이름. 다른 자리의 낱말 `location`(예약 세그먼트 `/location`
 *    · `res.headers.get("location")` 읽기)은 이동이 아니라 통과다.
 */
export function redirectSites(source: string, fileName = "route.ts"): string[] {
    const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const found: string[] = [];
    const at = (node: TS.Node, what: string) =>
        found.push(`${fileName}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${what}`);
    const isLocation = (text: string) => /^location$/i.test(text);

    /** 이 객체 리터럴이 헤더 묶음인가 — `headers: {…}` 의 값이거나 `new Headers({…})` 의 인자. */
    const isHeadersObject = (obj: TS.ObjectLiteralExpression): boolean => {
        const p = obj.parent;
        if (ts.isPropertyAssignment(p) && p.name.getText(sf) === "headers") return true;
        return ts.isNewExpression(p) && p.expression.getText(sf) === "Headers";
    };
    /**
     * 객체 키가 헤더 이름인가. 대문자 `Location` 은 HTTP 관용이라 어디서든 센다. 소문자 `location` 은 경로 이름
     * (`/location` 라벨 맵)으로도 쓰이므로 **헤더 묶음 안**에서만 센다.
     */
    const isHeaderKey = (prop: TS.PropertyAssignment): boolean => {
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : "";
        if (!isLocation(key)) return false;
        return key === "Location" || (ts.isObjectLiteralExpression(prop.parent) && isHeadersObject(prop.parent));
    };
    /** 이 리터럴이 헤더 **이름** 인자인가 — `set/append("Location", …)` 의 첫 인자 · `[["Location", …]]` 의 짝 이름. */
    const isHeaderNameArg = (lit: TS.StringLiteral): boolean => {
        const p = lit.parent;
        if (ts.isCallExpression(p) && p.arguments[0] === lit && ts.isPropertyAccessExpression(p.expression)) {
            return /^(set|append)$/.test(p.expression.name.text);
        }
        return ts.isArrayLiteralExpression(p) && p.elements.length === 2 && p.elements[0] === lit;
    };

    const walk = (node: TS.Node): void => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sf);
            if (/(^|\.)redirect$/.test(callee)) at(node, `${callee}(…)`);
        }
        if (ts.isStringLiteral(node) && isLocation(node.text) && isHeaderNameArg(node)) {
            at(node, `"${node.text}" 헤더 이름`);
        }
        if (ts.isPropertyAssignment(node) && isHeaderKey(node)) at(node, `${node.name.getText(sf)}: 헤더 키`);
        ts.forEachChild(node, walk);
    };
    walk(sf);
    return found;
}

test("그물이 잡는 형상 — 헤더로 절대 주소 · 요청 주소 수술 · 도움 함수 · Location 직접", () => {
    const red = {
        "헤더로 절대 주소": `export async function GET(req: Request) { const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host"); return NextResponse.redirect(new URL("/login", \`https://\${host}\`)); }`,
        "요청 주소 수술": `export async function GET(req: Request) { return NextResponse.redirect(req.url.replace(/\\/api\\/auth\\/refresh.*$/, "/login")); }`,
        "요청 주소 기준": `export async function GET(req: Request) { return Response.redirect(new URL("/login", req.url)); }`,
        "navigation redirect": `import {redirect} from "next/navigation"; export async function GET() { redirect(String(target)); }`,
        "도움 함수 안의 이동": `export function redirectFrom(req: Request, to: string) { return NextResponse.redirect(new URL(to, req.url)); }`,
        "Location 속성": `export async function GET(req: Request) { return new NextResponse(null, {status: 307, headers: {Location: new URL(req.url).origin + "/login"}}); }`,
        "Location set": `export async function GET(req: Request) { const h = new Headers(); h.set("Location", req.url); return new NextResponse(null, {status: 307, headers: h}); }`,
        "Headers 배열": `export async function GET(req: Request) { return new Response(null, {status: 302, headers: new Headers([["location", req.url]])}); }`,
        "소문자 키의 헤더 묶음": `export async function GET(req: Request) { return new NextResponse(null, {status: 307, headers: {location: req.url}}); }`,
        "따옴표 키": `export async function GET(req: Request) { return new NextResponse(null, {status: 307, headers: {"Location": req.url}}); }`,
        "Headers 생성자 객체": `export async function GET(req: Request) { return new Response(null, {status: 302, headers: new Headers({location: req.url})}); }`,
    };
    for (const [name, source] of Object.entries(red)) {
        assert.ok(redirectSites(source).length > 0, `못 잡았다: ${name}`);
    }
});

test("정당한 형상은 통과 — 소유자를 거친 이동 · Location 읽기 · 이동 없는 라우트", () => {
    const green = {
        "소유자 경유": `export async function GET(req: Request) { return new NextResponse(null, pathOnlyRedirect("/login", NO_STORE)); }`,
        "Location 읽기": `export async function GET() { const location = res.headers.get("location"); return NextResponse.json({location}); }`,
        "쿼리 읽기": `export async function GET(req: Request) { const {searchParams} = new URL(req.url); return NextResponse.json({id: searchParams.get("id")}); }`,
        "JSON 응답": `export async function POST(req: Request) { return NextResponse.json({authorizeUrl: buildAuthorizeUrl(origin)}); }`,
        "경로 이름으로서의 낱말": `export const RESERVED_SEGMENTS = new Set(["login", "location", "mypage"]); const label = {location: "오시는 길"};`,
    };
    for (const [name, source] of Object.entries(green)) {
        assert.deepEqual(redirectSites(source), [], `정당한 형상을 막았다: ${name}`);
    }
});

/**
 * 루프 가드의 표식이 **주소가 아니라 짧은 쿠키**다 — `?r=1` 은 주소창에 남아 다음 만료(15분 뒤)까지
 * 「이미 갱신했다」로 읽혀 로그인으로 떨어진다. 표식 수명은 돌아가 한 번 그리는 데 충분하되
 * 액세스 수명(15분)보다 훨씬 짧아야 한다. `session.ts` 는 `next/headers` 를 들여와 여기서 실행할 수 없어
 * 원문으로 잰다 — 행위는 standalone 에서 눌러 확인한다(브리프 재현 명령).
 */
test("갱신 성공 갈래가 표식 쿠키를 얹고, 그 수명이 액세스 수명보다 훨씬 짧다 — 주소(`?r=1`)에는 안 싣는다", () => {
    const route = readFileSync(join(ROOT, "src", "app", "api", "auth", "refresh", "route.ts"), "utf8");
    const session = readFileSync(join(ROOT, "src", "lib", "session.ts"), "utf8");
    const tokensAt = route.indexOf("setCustomerTokens(");
    const markAt = route.indexOf("markJustRefreshed(");
    assert.ok(tokensAt > 0 && markAt > tokensAt, "표식은 토큰을 심은 뒤 같은 갈래에서 얹는다");
    assert.equal((route.match(/markJustRefreshed\(/g) ?? []).length, 1, "표식은 성공 갈래 한 곳뿐이다");
    // 주석은 세지 않는다 — 옛 형상을 설명하는 문장이 있다. 코드 형상만 본다.
    assert.doesNotMatch(route, /withSearchParam\(|"r",\s*"1"/, "표식을 주소에 싣던 옛 형상이 남아 있다");
    const life = Number(session.match(/const REFRESH_MARK_SECONDS = (\d+);/)?.[1]);
    assert.ok(Number.isFinite(life) && life > 0 && life <= 60, `표식 수명이 이상하다: ${life}`);
    assert.match(
        session,
        /REFRESHED_COOKIE, "1", \{[^}]*httpOnly: true[^}]*maxAge: REFRESH_MARK_SECONDS/s,
        "표식 쿠키는 httpOnly 이고 그 수명을 쓴다",
    );
});

/** 이동의 **소유자**와, 이동을 만들어도 되는 자리. 늘릴 때는 사유를 같은 줄에 적는다. */
const REDIRECT_OWNER = "src/lib/redirect.ts";
const ALLOWED: ReadonlyArray<readonly [file: string, why: string]> = [
    ["src/app/media/[id]/route.ts", "백엔드가 준 서명 주소를 302 로 그대로 넘긴다 — 우리가 만드는 주소가 아니다"],
];

/** 라우트 처리 파일 + 도움 모듈(시험 제외). 도움 함수로 빼낸 이동도 여기서 잡힌다. */
function scannedFiles(): string[] {
    const list = (dir: string, keep: (name: string) => boolean): string[] =>
        readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
            const full = join(dir, e.name);
            if (e.isDirectory()) return list(full, keep);
            return keep(e.name) ? [full] : [];
        });
    return [
        ...list(join(ROOT, "src", "app"), (n) => n === "route.ts"),
        ...list(
            join(ROOT, "src", "lib"),
            (n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !/\.fixture\.ts$/.test(n),
        ),
    ];
}

test("라우트·도움 모듈의 이동은 전부 소유자를 거친다 — 허용 목록은 사유가 있는 한 줄뿐", () => {
    const files = scannedFiles();
    const rel = (f: string) => relative(ROOT, f).split("\\").join("/");
    // 통제군 — 파일을 못 읽는 그물은 무엇이든 초록이다.
    const refresh = files.find((f) => rel(f) === "src/app/api/auth/refresh/route.ts");
    assert.ok(refresh, "갱신 라우트를 못 찾았다 — 경로가 바뀌었으면 그물도 옮겨라");
    assert.ok(
        (readFileSync(refresh, "utf8").match(/pathOnlyRedirect\(/g) ?? []).length >= 3,
        "갱신 라우트의 세 갈래가 소유자를 안 거친다",
    );

    const allowed = new Map(ALLOWED);
    const hits = files.flatMap((f) => {
        const name = rel(f);
        if (name === REDIRECT_OWNER) return [];
        const sites = redirectSites(readFileSync(f, "utf8"), name);
        if (allowed.has(name)) {
            // 허용 목록의 파일은 실제로 이동을 만들어야 한다 — 안 만들면 목록이 낡은 것이다.
            assert.ok(sites.length > 0, `허용 목록이 낡았다: ${name} 은 이동을 안 만든다`);
            return [];
        }
        return sites;
    });
    assert.deepEqual(hits, []);
});
