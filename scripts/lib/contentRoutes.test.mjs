/**
 * **콘텐츠 라우트 검사기의 «못 잼» 축.**
 *
 * ■ 왜 생겼나
 *   이 검사기의 ⓑ(sitemap 제외 목록 대조)는 입력이 하나라도 없으면 **조용히 꺼지고 rc 0** 이었다.
 *   두 호출부(`ci.yml`·`verify-zip --pack`)는 전부 빌드 뒤에 부르므로 산출물이 없다는 것은
 *   「잴 것이 없다」가 아니라 **「못 쟀다」**다. 그 둘을 가르지 않으면 빌드 없이 부른 실행이
 *   언제나 초록이 되고, 그 초록은 아무것도 재지 않은 초록이다.
 *
 * 사용: `node --test scripts/lib/contentRoutes.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "content-routes.mjs");
const made = [];
process.on("exit", () => {
    for (const d of made.splice(0)) rmSync(d, {recursive: true, force: true});
});

/**
 * 최소 트리. `patch` 로 조각을 빼거나 바꾼다.
 * - `noList` — 예약 세그먼트 목록 파일을 안 만든다.
 * - `noBuild` — 빌드 산출물을 안 만든다.
 * - `routes` — 빌드가 아는 라우트(경로 → URL).
 * - `reserved` — 목록에 적힌 이름들.
 * - `listRaw` — 목록 파일의 **원문**을 그대로 쓴다(서식 변형 시험용).
 */
function tree(patch = {}) {
    const root = mkdtempSync(join(tmpdir(), "zalkera-croutes-"));
    made.push(root);
    mkdirSync(join(root, "content", "pages"), {recursive: true});
    // ⓐ 축이 이 맵을 파싱한다 — 닫는 괄호가 제 줄에 있어야 읽는다.
    writeFileSync(join(root, "content", "index.ts"), "export const pages = {\n};\n");
    if (!patch.noList) {
        mkdirSync(join(root, "src", "lib"), {recursive: true});
        const names = patch.reserved ?? ["cart"];
        writeFileSync(
            join(root, "src", "lib", "reservedSegments.ts"),
            patch.listRaw ??
                `export const RESERVED_SEGMENTS = new Set([\n${names.map((n) => `    "${n}",`).join("\n")}\n]);\n`,
        );
    }
    if (!patch.noBuild) {
        mkdirSync(join(root, ".next"), {recursive: true});
        const routes = patch.routes ?? {"/cart/page": "/cart"};
        writeFileSync(join(root, ".next", "app-path-routes-manifest.json"), JSON.stringify(routes));
        // ⓒ(프리렌더 상태) 축이 이것을 요구한다 — 없으면 그 축이 먼저 «검사 불능»으로 서서
        // 이 파일이 재려는 ⓑ 축에 닿지 못한다.
        writeFileSync(
            join(root, ".next", "prerender-manifest.json"),
            JSON.stringify({version: 4, routes: {}, dynamicRoutes: {}}),
        );
    }
    return root;
}

function run(root) {
    const r = spawnSync(process.execPath, [BIN, root], {encoding: "utf8"});
    return {rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
}

test("양성 통제군 — 목록이 라우트를 덮으면 통과한다", () => {
    const {rc, out} = run(tree());
    assert.equal(rc, 0, out.slice(-500));
});

test("빌드 산출물이 없으면 «통과»가 아니라 «검사 불능»이다", () => {
    // 종전에는 여기서 조용히 rc 0 이었다 — 빌드 없이 부르면 언제나 초록.
    const {rc, out} = run(tree({noBuild: true}));
    assert.equal(rc, 2, out.slice(-500));
    assert.match(out, /라우트 산출물이 없습니다/);
    assert.match(out, /npm run build/, "다음에 할 일을 안 말한다");
});

test("예약 세그먼트 목록이 없으면 «검사 불능»이다", () => {
    const {rc, out} = run(tree({noList: true}));
    assert.equal(rc, 2, out.slice(-500));
    assert.match(out, /reservedSegments\.ts 가 없습니다/);
});

test("가려지는데 목록에 없으면 반려한다", () => {
    // 죽은 URL 을 크롤러에 광고하는 자리다.
    const {rc, out} = run(tree({routes: {"/cart/page": "/cart", "/blog/page": "/blog"}, reserved: ["cart"]}));
    assert.equal(rc, 1, out.slice(-500));
    assert.match(out, /목록에 없습니다: blog/);
});

test("산출물이 깨진 JSON 이면 «검사 불능»이다", () => {
    const root = tree();
    writeFileSync(join(root, ".next", "app-path-routes-manifest.json"), "{ 깨짐");
    const {rc, out} = run(root);
    assert.equal(rc, 2, out.slice(-500));
    assert.match(out, /못 읽었습니다/);
});

test("동적·내부 라우트는 목록에 없어도 통과한다 — 오탐은 배포를 막는다", () => {
    const {rc, out} = run(
        tree({
            routes: {
                "/cart/page": "/cart",
                "/[slug]/page": "/[slug]",
                "/_next/x/page": "/_next",
                "/robots.txt/route": "/robots.txt",
                "/a/b/page": "/a/b",
            },
            reserved: ["cart"],
        }),
    );
    assert.equal(rc, 0, out.slice(-500));
});

/*
 * 목록을 **구조로** 읽는가 — 서식으로 읽으면 정상 코드를 반려한다.
 *
 * 종전 파서는 `^\s*"([^"]+)",` 라 항목이 한 줄에 하나씩 있어야 읽었다. 납품 zip 하나가 그 목록을
 * 한 줄로 적었고(`new Set(["contact", "policies"])`), 검사기는 **한 개도 못 읽고** 두 이름을
 * 「목록에 없습니다」로 반려했다 — 정상 코드를 막고 사유까지 거짓이었다.
 */
test("한 줄로 적은 목록도 읽는다 — 서식이 판정을 바꾸지 않는다", () => {
    const {rc, out} = run(
        tree({
            routes: {"/contact/page": "/contact", "/policies/page": "/policies"},
            listRaw: 'export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set(["contact", "policies"]);\n',
        }),
    );
    assert.equal(rc, 0, out.slice(-500));
});

test("목록 상수를 못 찾으면 «통과»가 아니라 «못 읽음»이다", () => {
    // 빈 집합으로 흘려보내면 실재 라우트가 전부 「목록에 없다」로 반려되어 사유가 거짓이 된다.
    const {rc, out} = run(
        tree({
            routes: {"/contact/page": "/contact"},
            listRaw: 'export const SOMETHING_ELSE = new Set(["contact"]);\n',
        }),
    );
    assert.equal(rc, 2, out.slice(-500));
    assert.match(out, /RESERVED_SEGMENTS 를 못 읽었습니다/);
});

/*
 * 목록을 **반만 읽었으면 「읽었다」가 아니다.**
 *
 * 첫 판은 이름 뒤 **첫 대괄호**를 물었다. 그래서 타입의 인덱스 접근이나 뒤에 오는 무관한 배열을
 * 읽어 **조용히 다른 집합**을 내놓았고, 그 답으로 판정하니 실재 라우트 전부가 「목록에 없습니다」로
 * 반려됐다 — 이 파서가 없애려던 바로 그 결함이다. 부분 답보다 «모른다»가 낫다.
 */
for (const [name, listRaw] of [
    ["파생 상수", 'const ALL = ["contact"];\nexport const RESERVED_SEGMENTS: ReadonlySet<(typeof ALL)[number]> = new Set(ALL);\n'],
    ["뒤에 무관 배열", "export const RESERVED_SEGMENTS = new Set(NAMES);\nconst OTHER = [\"zzz\"];\n"],
    ["스프레드", 'export const RESERVED_SEGMENTS = new Set([...BASE, "contact"]);\n'],
]) {
    test(`${name} 은 «못 읽음»으로 선다 — 반만 읽고 반려하지 않는다`, () => {
        const {rc, out} = run(tree({routes: {"/contact/page": "/contact"}, listRaw}));
        assert.equal(rc, 2, out.slice(-500));
        assert.match(out, /RESERVED_SEGMENTS 를 못 읽었습니다/);
    });
}

test("선언 앞 문자열이 이름을 담고 있어도 진짜 선언을 읽는다", () => {
    const {rc, out} = run(
        tree({
            routes: {"/contact/page": "/contact"},
            listRaw: 'const S = "RESERVED_SEGMENTS[0]";\nexport const RESERVED_SEGMENTS = new Set(["contact"]);\n',
        }),
    );
    assert.equal(rc, 0, out.slice(-500));
});
