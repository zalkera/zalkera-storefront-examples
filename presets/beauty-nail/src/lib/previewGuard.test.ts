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
 * 수량 변경·항목 삭제·비우기 셋이 무방비였다. 그동안 `CUSTOMIZE.md` 는 프리뷰가 "장바구니 쓰기를
 * 막아 운영 데이터를 건드릴 걱정이 없다"고 **보증**하고 있었다 — 심의가 프리뷰 빌드를 띄워 항목
 * 삭제가 운영 백엔드까지 가는 것을 실측했다. 배송된 카트 UI 의 유일한 변이 버튼이 그 라우트였다.
 *
 * 목록은 반드시 낡는다. 그래서 목록을 늘리는 대신 **규칙을 기계에 걸었다.**
 *
 * ## 규칙
 *
 * 쓰기 핸들러(`POST`·`PATCH`·`PUT`·`DELETE`)는 **자기 본문에서** `isPreview()` 를 부르거나,
 * 파일 머리에 `// zalkera-allow-preview-write: <한 줄 이유>` 를 단다. 둘 다 없으면 여기가 빨개진다.
 * 면제는 **사유와 함께 배송물에 남는다** — 조용히 빠지지 않는다. 마커 이름은 이 레포가 이미 쓰는
 * `zalkera-allow-cross-origin` 과 같은 형태다.
 *
 * ## ⚠ 파일 단위로 재지 마라 — 첫 판이 그래서 뚫렸다
 *
 * 처음엔 `파일 내용에 "isPreview" 가 있는가` 로 쟀다. 가드 블록을 통째로 지워도 **import 줄이
 * 남아** 초록이었다(변이 실측). 게다가 파일 단위 판정은 한 파일에 쓰기 핸들러가 둘일 때 한쪽만
 * 막혀 있어도 통과하는데, **바로 그 형상**(`cart/items/[variantId]` 의 PATCH·DELETE)이 이 사고의
 * 원본이었다. 그래서 핸들러 본문을 잘라 `isPreview()` **호출**을 확인한다.
 *
 * ## 통제군이 있다
 *
 * "위반 0건"은 라우트를 하나도 못 찾았을 때도 참이다. 발견 개수의 하한을 같이 걸어, 경로가 깨지거나
 * 자르기가 죽으면 그쪽이 먼저 빨개지게 했다.
 */
const API = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "api");
const WRITE_HANDLER = /^export async function (POST|PATCH|PUT|DELETE)\b/gm;
const EXEMPT_MARKER = /^\/\/ zalkera-allow-preview-write:[ \t]*\S/m;
const CALLS_GUARD = /\bisPreview\s*\(\s*\)/;

function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, {withFileTypes: true})) {
        const full = join(dir, e.name);
        if (e.isDirectory()) out.push(...routeFiles(full));
        else if (e.name === "route.ts") out.push(full);
    }
    return out;
}

/** 쓰기 핸들러를 **본문 단위**로 자른다 — 다음 최상위 `export` 앞까지가 한 핸들러다. */
function writeHandlers(src: string): {method: string; body: string}[] {
    const starts = [...src.matchAll(WRITE_HANDLER)];
    return starts.map((m) => {
        const from = m.index ?? 0;
        const rest = src.slice(from + m[0].length);
        const next = rest.search(/^export /m);
        return {method: m[1], body: rest.slice(0, next === -1 ? undefined : next)};
    });
}

const files = routeFiles(API);
const handlers = files.flatMap((f) => writeHandlers(readFileSync(f, "utf8")).map((h) => ({...h, file: f})));

test("통제군 — 라우트와 핸들러를 실제로 잘랐다(빈 목록을 '위반 0'으로 세지 않는다)", () => {
    assert.ok(files.length >= 10, `route.ts 를 ${files.length}개만 찾았다 — 걷기가 깨졌다`);
    assert.ok(handlers.length >= 12, `쓰기 핸들러를 ${handlers.length}개만 잘랐다 — 자르기가 깨졌다`);
    // 본문이 비면 어떤 검사도 통과한다 — 자르기가 죽는 가장 흔한 방향이다.
    const empty = handlers.filter((h) => h.body.trim().length < 20).map((h) => relative(API, h.file));
    assert.deepEqual(empty, [], "핸들러 본문이 비었다 — 자르기가 깨졌다");
});

test("쓰기 핸들러는 저마다 프리뷰 가드를 부르거나, 파일이 사유를 적고 면제한다", () => {
    const offenders = handlers
        .filter((h) => !CALLS_GUARD.test(h.body) && !EXEMPT_MARKER.test(readFileSync(h.file, "utf8")))
        .map((h) => `${relative(API, h.file)}:${h.method}`);
    assert.deepEqual(
        offenders,
        [],
        `프리뷰에서 운영 데이터를 쓰는 핸들러가 있다. isPreview() 로 403 을 내거나, 막으면 안 되는 ` +
            `사정이 있으면 파일 머리에 "// zalkera-allow-preview-write: <이유>" 를 달아라.`,
    );
});

test("면제 마커에는 반드시 이유가 붙는다(빈 마커로 뚫리지 않는다)", () => {
    const bare = files
        .filter((f) => /^\/\/ zalkera-allow-preview-write:/m.test(readFileSync(f, "utf8")))
        .filter((f) => !EXEMPT_MARKER.test(readFileSync(f, "utf8")))
        .map((f) => relative(API, f));
    assert.deepEqual(bare, [], "이유 없는 면제 마커");
});
