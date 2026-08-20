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
            `export const RESERVED = [\n${names.map((n) => `    "${n}",`).join("\n")}\n];\n`,
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
