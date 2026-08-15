import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";

/**
 * **프리뷰 쓰기 가드의 회귀 픽스처.**
 *
 * ## 왜 이 파일이 생겼나
 *
 * `preview.ts` 가 적용 지점을 주석에 **손으로 나열**했고, 그 목록이 둘에서 멈춰 있는 사이 장바구니
 * 수량 변경·항목 삭제·비우기가 무방비였다. 그동안 `CUSTOMIZE.md` 는 프리뷰가 "장바구니 쓰기를
 * 막아 운영 데이터를 건드릴 걱정이 없다"고 **보증**했다 — 심의가 프리뷰 빌드를 띄워 항목 삭제가
 * 운영 백엔드까지 가는 것을 실측했다.
 *
 * ## ⚠ 이 검사는 **세 판 연속** 뚫렸다. 자르기를 건드릴 때 그 이력을 먼저 읽어라
 *
 * ⑴ **파일 내용에 `"isPreview"` 가 있는가** — 가드를 통째로 지워도 **import 줄**이 남아 초록.
 * ⑵ **`^export async function (POST|…)` 만 핸들러로 셈** — `export const POST = async`·비동기 아닌
 *    `function`·`route.js`·`api/` 밖이 **세어지지도 않았다.** 심의가 그 형태를 심고 프리뷰
 *    standalone 에서 **HTTP 200** 을 받아냈다(대조군 `api/cart/items` 는 403).
 * ⑶ **몸통을 다음 `^export ` 까지 자름** — 마지막 핸들러가 **파일 끝까지**를 자기 몸통으로 봐서
 *    아래 비export 헬퍼의 가드가 그것을 세탁했고, 절단자가 공백 리터럴이라 **탭 하나**로 절단이
 *    실패했다. 게다가 미지형태 판정이 `starts.length === 0` **안에만** 있어, 같은 파일에 아는
 *    핸들러가 하나라도 있으면 `export {del as DELETE}` 가 통째로 안 보였다.
 *
 * 그래서 지금은 **핸들러 자기 중괄호**로 몸통을 잡는다(괄호깊이 0 의 여는 `{` ~ 짝 `}`). 미지형태
 * 판정은 분기 밖에서 **아는 이름과 차집합**으로 돌고, 재수출(`export *`)은 형태 불문 반려한다.
 *
 * ## 규칙
 *
 * 쓰기 핸들러(`POST`·`PATCH`·`PUT`·`DELETE`)는 **자기 몸통 안에서** `if (isPreview())` 로 돌아가거나,
 * 파일 **머리**에 `// zalkera-allow-preview-write: <한 줄 이유>` 를 단다.
 *
 * ## 이 검사가 재는 범위 (넘겨짚지 마라)
 *
 * `src/app/**\/route.{ts,tsx,js,jsx,…}` 의 **내보낸** 쓰기 핸들러뿐이다. 서버 액션(`"use server"`)·
 * 미들웨어·라이브러리 함수는 범위 밖이다. 자를 수 없는 형태를 만나면 통과가 아니라 **반려**한다.
 *
 * ## 검사기가 자기를 검증한다
 *
 * 마지막 시험이 **알려진 불량 입력 14형태와 정상 7형태**를 직접 넣어 판정 함수를 시험한다. 위 ⑴⑵⑶
 * 에서 실제로 샜던 형태가 전부 그 목록에 있다. 이것이 없으면 판정을 무력화해 놓고도 "위반 0건"으로
 * 초록이 된다 — 같은 파일명에 자명 시험을 넣는 우회도 여기서 닫힌다.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const M = "POST|PATCH|PUT|DELETE";
const ROUTE_FILE = /^route\.[cm]?[jt]sx?$/;

/** 자를 수 있는 선언 형태. */
const HANDLER = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+(${M})\\b|^export\\s+(?:const|let|var)\\s+(${M})\\s*[:=]`,
    "gm",
);
/**
 * 쓰기 메서드를 **내보내는 낌새** — 별칭·나열 포함. 아는 이름으로 다 설명되지 않으면 반려한다.
 *
 * ⚠ 한 패턴에 `[\s\S]*?` 를 쓰면 **줄을 넘어가** 무관한 `export` 줄이 뒤쪽 메서드 이름을 끌어와
 *   정상 파일을 헛잡는다(초판에서 실측). 그래서 **문장 단위 둘**로 나눈다: 한 줄짜리 export 와
 *   중괄호 나열 블록.
 */
const EXPORT_LINE = /^export[^\n]*/gm;
const EXPORT_BLOCK = /^export\s*\{[\s\S]*?\}/gm;
/** 라우트 파일에서 정당한 쓰임이 없고, 들여다볼 수도 없는 형태. */
const OPAQUE_REEXPORT = /^export\s*\*\s*(?:as\s+\w+\s*)?from\s/m;
const EXEMPT_MARKER = /^\/\/ zalkera-allow-preview-write:[ \t]*\S/m;

function stripLiterals(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** 면제 마커는 **파일 머리**(첫 `export` 앞)에서만, 문자열 밖에서만 인정한다. */
function hasExemption(src: string): boolean {
    const head = src.split(/^export\s/m)[0];
    return EXEMPT_MARKER.test(
        head
            .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
            .replace(/"(?:\\.|[^"\\])*"/g, '""')
            .replace(/'(?:\\.|[^'\\])*'/g, "''"),
    );
}

/**
 * 선언 시작점에서 **그 핸들러 자신의 몸통**만 잘라 낸다.
 * 괄호깊이 0 에서 처음 만나는 `{` 가 몸통이고 짝이 맞는 `}` 까지다 — 매개변수의 `{params}` 는 깊이>0.
 * 못 찾으면 `null`(간결 화살표 `=> expr` 이라 가드가 있을 수 없다 · 안 닫힌 몸통은 판정 불가).
 */
function bodyOf(code: string, from: number): string | null {
    let paren = 0;
    for (let i = from; i < code.length; i++) {
        const c = code[i];
        if (c === "(") paren++;
        else if (c === ")") paren--;
        else if (c === ";" && paren === 0) return null;
        else if (c === "{" && paren === 0) {
            let d = 0;
            for (let j = i; j < code.length; j++) {
                if (code[j] === "{") d++;
                else if (code[j] === "}" && --d === 0) return code.slice(i, j + 1);
            }
            return null;
        }
    }
    return null;
}

/** 가드를 부르고 **그 분기 안에서** 돌아가는가. 죽은 가드(`if (isPreview()) {}`)는 통과가 아니다. */
function guardedBody(body: string | null): boolean {
    if (body === null) return false;
    const m = /\bif\s*\(\s*isPreview\s*\(\s*\)\s*\)\s*/.exec(body);
    if (!m) return false;
    const after = body.slice(m.index + m[0].length);
    if (!after.startsWith("{")) return /^return\b/.test(after);
    let d = 0;
    for (let i = 0; i < after.length; i++) {
        if (after[i] === "{") d++;
        else if (after[i] === "}" && --d === 0) return /\breturn\b/.test(after.slice(1, i));
    }
    return false;
}

/** 한 파일의 판정. 반환: 위반 사유 배열(비면 통과). */
export function offencesIn(src: string, label = "route.ts"): string[] {
    const code = stripLiterals(src);
    const bad: string[] = [];
    const known = new Set<string>();

    for (const m of [...code.matchAll(HANDLER)]) {
        const name = (m[1] ?? m[2]) as string;
        known.add(name);
        if (!guardedBody(bodyOf(code, (m.index ?? 0) + m[0].length))) bad.push(`${label}:${name}`);
    }

    if (OPAQUE_REEXPORT.test(code)) {
        bad.push(`${label}: 재수출(export *)은 들여다볼 수 없습니다 — 핸들러를 이 파일에 펴십시오`);
    }
    for (const stmt of [...code.matchAll(EXPORT_LINE), ...code.matchAll(EXPORT_BLOCK)].map((x) => x[0])) {
        const named = [...stmt.matchAll(new RegExp(`\\b(${M})\\b`, "g"))].map((x) => x[1]);
        if (!named.length || named.every((n) => known.has(n))) continue;
        bad.push(
            `${label}: 쓰기 메서드를 내보내는데 형태를 모릅니다 — 검사를 넓히십시오 (${stmt.replace(/\s+/g, " ").trim().slice(0, 60)})`,
        );
    }

    if (bad.length && hasExemption(src)) return [];
    return bad;
}

function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, {withFileTypes: true})) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...routeFiles(full));
        else if (ROUTE_FILE.test(e.name)) out.push(full);
    }
    return out;
}

const files = routeFiles(APP);
const handlerCount = files.reduce(
    (n, f) => n + [...stripLiterals(readFileSync(f, "utf8")).matchAll(HANDLER)].length,
    0,
);

test("통제군 — 라우트와 핸들러를 실제로 걷고 잘랐다(빈 목록을 '위반 0'으로 세지 않는다)", () => {
    assert.ok(files.length >= 10, `route 파일을 ${files.length}개만 찾았다 — 걷기가 깨졌다`);
    assert.ok(handlerCount >= 12, `쓰기 핸들러를 ${handlerCount}개만 잘랐다 — 자르기가 깨졌다`);
});

test("쓰기 핸들러는 저마다 프리뷰 가드를 부르거나, 파일 머리가 사유를 적고 면제한다", () => {
    const offenders = files.flatMap((f) => offencesIn(readFileSync(f, "utf8"), relative(APP, f)));
    assert.deepEqual(
        offenders,
        [],
        `프리뷰에서 운영 데이터를 쓰는 핸들러가 있다. isPreview() 로 403 을 내거나, 막으면 안 되는 ` +
            `사정이 있으면 파일 머리에 "// zalkera-allow-preview-write: <이유>" 를 달아라.`,
    );
});

test("검사기 자기검증 — 알려진 불량 입력을 실제로 잡고, 정상을 헛잡지 않는다", () => {
    const G =
        "export async function POST() {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n    return Response.json({});\n}\n";
    const U = "export async function POST() {\n    return Response.json({});\n}\n";
    const BAD: [string, string][] = [
        ["무가드 async function", U],
        ["무가드 const 화살표", "export const POST = async (req: Request) => Response.json({});\n"],
        ["무가드 function(비동기 아님)", "export function DELETE() {\n    return Response.json({});\n}\n"],
        [
            "매개변수 구조분해 + 무가드",
            "export async function PATCH(req, {params}) {\n    return Response.json({});\n}\n",
        ],
        [
            "죽은 가드(반환 없음)",
            "export async function POST() {\n    if (isPreview()) {}\n    return Response.json({});\n}\n",
        ],
        ["주석 처리한 가드", U.replace("return", "// if (isPreview()) return x;\n    return")],
        ["문자열 안 가드", U.replace("return", 'const s = "if (isPreview()) return x";\n    return')],
        ["파일 끝의 면제 마커", `${U}// zalkera-allow-preview-write: 늦게 단 마커\n`],
        ["문자열 안의 면제 마커", `const s = "// zalkera-allow-preview-write: 가짜";\n${U}`],
        // ↓ ⑶판이 샜던 형태들 — 지우지 마라.
        ["가드된 POST + 별칭 재수출", `${G}export {del as DELETE};\n`],
        ["별칭 재수출 단독", "export {del as DELETE};\n"],
        ["가드된 POST + export * from", `${G}export * from "./handlers";\n`],
        ["export * from 단독", 'export * from "./handlers";\n'],
        [
            "무가드 POST + 하단 비export 헬퍼의 가드",
            `${U}function helper() {\n    if (isPreview()) {\n        return null;\n    }\n}\n`,
        ],
        [
            "무가드 POST + 탭 구분 export const",
            `${U}export\tconst DELETE = async () => {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n};\n`,
        ],
    ];
    for (const [why, src] of BAD) assert.notDeepEqual(offencesIn(src), [], `놓쳤다: ${why}`);

    const OK: [string, string][] = [
        ["정상 가드", G],
        [
            "화살표 + 가드",
            "export const PATCH = async () => {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n    return Response.json({});\n};\n",
        ],
        [
            "구조분해 매개변수 + 가드",
            "export async function DELETE(req, {params}) {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n    return Response.json({});\n}\n",
        ],
        ["머리의 면제 마커", `// zalkera-allow-preview-write: 정당한 사유\n${U}`],
        ["머리 마커 + 재수출", '// zalkera-allow-preview-write: 정당한 사유\nexport * from "./h";\n'],
        ["읽기 전용 라우트", "export async function GET() {\n    return Response.json({});\n}\n"],
        ["GET 만 있는 media 라우트", "export async function GET(req, {params}) {\n    return Response.json({});\n}\n"],
    ];
    for (const [why, src] of OK) assert.deepEqual(offencesIn(src), [], `헛잡았다: ${why}`);
});
