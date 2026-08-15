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
 * 운영 백엔드까지 가는 것을 실측했다. 배송 카트 UI 의 유일한 변이 버튼이 그 라우트였다.
 *
 * 목록은 반드시 낡는다. 그래서 목록을 늘리는 대신 **규칙을 기계에 걸었다.**
 *
 * ## 규칙
 *
 * 쓰기 핸들러(`POST`·`PATCH`·`PUT`·`DELETE`)는 **자기 본문에서** `isPreview()` 를 부르고 그 안에서
 * 돌아가거나, 파일 **머리**에 `// zalkera-allow-preview-write: <한 줄 이유>` 를 단다. 둘 다 없으면
 * 여기가 빨개진다. 면제는 사유와 함께 배송물에 남는다 — 조용히 빠지지 않는다.
 *
 * ## ⚠ 이 검사는 두 판 연속 뚫렸다. 좁히지 마라
 *
 * ⑴ **파일 내용에 `"isPreview"` 가 있는가** — 가드 블록을 통째로 지워도 **import 줄이 남아** 초록.
 * ⑵ **`^export async function (POST|…)` 만 핸들러로 셈** — Next 가 똑같이 허용하는
 *    `export const POST = async …`·`export function POST`(비동기 아님)·`route.js`·`src/app` 직하
 *    라우트가 **핸들러로 세어지지도 않았다.** 심의가 그 네 형태를 심고 `next build` 로 `ƒ` 등록을
 *    확인한 뒤 프리뷰 standalone 에서 **HTTP 200** 을 받아냈다(대조군 `api/cart/items` 는 403).
 *    그런데 배송 문면 두 곳이 "빠뜨리면 `npm test` 가 잡습니다"라고 보증하고 있었다.
 *
 * 그래서 지금은 ⓐ 선언 형태 넷 + ⓑ `route.{ts,tsx,js,jsx,…}` + ⓒ 루트를 `src/app` 으로 올림
 * (배송 트리에 이미 `media/[id]/route.ts` 가 있다 — `api/` 만 보면 실물 배치보다 좁다) + ⓓ 주석·
 * 문자열을 걷어낸 뒤 호출 판정 + ⓔ **미지 형태 fail-closed** 로 잰다.
 *
 * ## 검사기가 자기를 검증한다
 *
 * 마지막 시험이 **알려진 불량 입력**을 직접 넣어 판정 함수가 잡는지 본다. 이것이 없으면 판정을
 * 무력화해 놓고도 "위반 0건"으로 초록이 된다 — 같은 파일명에 자명 통과 시험 몇 개를 넣는 우회도
 * 여기서 닫힌다.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const M = "POST|PATCH|PUT|DELETE";
const ROUTE_FILE = /^route\.[cm]?[jt]sx?$/;

/** 우리가 **자를 수 있는** 선언 형태. 넓히면 여기와 아래 `ANY_WRITE_EXPORT` 를 같이 본다. */
const HANDLER = new RegExp(
    `^export\\s+(?:async\\s+)?function\\s+(${M})\\b|^export\\s+(?:const|let|var)\\s+(${M})\\s*[:=]`,
    "gm",
);
/** 쓰기 메서드를 내보내는 **낌새**. 이게 있는데 위가 하나도 못 자르면 미지 형태다 — 통과시키지 않는다. */
const ANY_WRITE_EXPORT = new RegExp(`^export\\s[^\\n]*\\b(?:${M})\\b`, "m");
const EXEMPT_MARKER = /^\/\/ zalkera-allow-preview-write:[ \t]*\S/m;

/** 문자열·템플릿·주석을 지운다 — 주석 처리한 호출이나 문자열 안 마커로 뚫리지 않게. */
function stripLiterals(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** 파일 **머리**(첫 `export` 앞)에서만 마커를 본다. 문자열 안에 숨긴 마커도 거른다. */
function hasExemption(src: string): boolean {
    const head = src.split(/^export\s/m)[0];
    const noStrings = head
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''");
    return EXEMPT_MARKER.test(noStrings);
}

/**
 * 가드를 부르고 **그 분기 안에서 돌아가는가.**
 *
 * ⚠ 호출 유무만 보면 죽은 가드(`if (isPreview()) {}`)가 통과한다 — 초판이 그랬다. 뒤에 `return` 이
 *   있는지만 봐도 안 된다. 정상 핸들러는 어차피 마지막에 `return` 하므로 **전부** 통과한다.
 *   그래서 분기 블록을 중괄호로 잘라 **그 안**에 `return` 이 있는지 본다.
 *
 * 판정은 `if (isPreview())` 관용구를 요구한다. 배송 15곳이 전부 그 형태이고, 다른 형태를 쓰고
 * 싶으면 면제 마커라는 정식 출구가 있다 — 관용구를 하나로 두는 편이 다음 사람에게 읽힌다.
 */
function guarded(body: string): boolean {
    const code = stripLiterals(body);
    const m = /\bif\s*\(\s*isPreview\s*\(\s*\)\s*\)\s*/.exec(code);
    if (!m) return false;
    const after = code.slice(m.index + m[0].length);
    if (!after.startsWith("{")) return /^return\b/.test(after); // 중괄호 없는 한 줄 형태
    let depth = 0;
    for (let i = 0; i < after.length; i++) {
        if (after[i] === "{") depth++;
        else if (after[i] === "}" && --depth === 0) return /\breturn\b/.test(after.slice(1, i));
    }
    return false; // 닫히지 않음 — 판정 불가는 통과가 아니다
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

/** 한 파일의 판정. 반환: 위반 사유 배열(비면 통과). */
export function offencesIn(src: string, label = "route.ts"): string[] {
    const starts = [...src.matchAll(HANDLER)];
    if (!starts.length) {
        return ANY_WRITE_EXPORT.test(src)
            ? [`${label}: 쓰기 메서드를 내보내는데 이 검사가 형태를 모릅니다 — 검사를 넓히십시오`]
            : [];
    }
    if (hasExemption(src)) return [];
    const bad: string[] = [];
    for (const m of starts) {
        const from = (m.index ?? 0) + m[0].length;
        const rest = src.slice(from);
        const next = rest.search(/^export /m);
        if (!guarded(rest.slice(0, next === -1 ? undefined : next))) bad.push(`${label}:${m[1] ?? m[2]}`);
    }
    return bad;
}

const files = routeFiles(APP);
const handlers = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(HANDLER)]);

test("통제군 — 라우트와 핸들러를 실제로 걷고 잘랐다(빈 목록을 '위반 0'으로 세지 않는다)", () => {
    assert.ok(files.length >= 10, `route 파일을 ${files.length}개만 찾았다 — 걷기가 깨졌다`);
    assert.ok(handlers.length >= 12, `쓰기 핸들러를 ${handlers.length}개만 잘랐다 — 자르기가 깨졌다`);
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

test("검사기 자기검증 — 알려진 불량 입력을 실제로 잡는다", () => {
    const P = "export async function POST(req: Request) {\n    return Response.json({});\n}\n";
    const bad: [string, string][] = [
        ["무가드 async function", P],
        ["무가드 const 화살표", "export const POST = async (req: Request) => Response.json({});\n"],
        ["무가드 function(비동기 아님)", "export function DELETE() {\n    return Response.json({});\n}\n"],
        ["주석 처리한 가드", P.replace("return", "// if (isPreview()) return x;\n    return")],
        ["문자열 안 가드", P.replace("return", 'const s = "if (isPreview()) return x";\n    return')],
        [
            "죽은 가드(반환 없음)",
            "export async function POST() {\n    if (isPreview()) {}\n    return Response.json({});\n}\n",
        ],
        ["미지 선언 형태", "export {handler as POST};\n"],
        ["파일 끝의 면제 마커", `${P}// zalkera-allow-preview-write: 늦게 단 마커\n`],
        ["문자열 안의 면제 마커", `const s = "// zalkera-allow-preview-write: 가짜";\n${P}`],
    ];
    for (const [why, src] of bad) assert.notDeepEqual(offencesIn(src), [], `놓쳤다: ${why}`);

    const ok: [string, string][] = [
        [
            "정상 가드",
            "export async function POST() {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n    return Response.json({});\n}\n",
        ],
        [
            "화살표 + 가드",
            "export const PATCH = async () => {\n    if (isPreview()) {\n        return new Response(null, {status: 403});\n    }\n    return Response.json({});\n};\n",
        ],
        ["머리의 면제 마커", `// zalkera-allow-preview-write: 정당한 사유\n${P}`],
        ["읽기 전용 라우트", "export async function GET() {\n    return Response.json({});\n}\n"],
    ];
    for (const [why, src] of ok) assert.deepEqual(offencesIn(src), [], `헛잡았다: ${why}`);
});
