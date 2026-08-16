/**
 * 산출물·의존성 선판정의 변이 시험. 압축을 풀기 전에 거르는 자리이므로, 여기가 틀리면
 * 검수 러너가 남의 실수만큼 임시공간을 쓴다.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {junkTopLevel} from "./junkEntries.mjs";

test("정상 팩은 통과한다", () => {
    assert.deepEqual(junkTopLevel(["package.json", "src/app/page.tsx", "scripts/verify-zip.mjs", ""]), []);
});

test("최상위 node_modules·.next·.git 을 찾는다", () => {
    assert.deepEqual(junkTopLevel(["node_modules/x/y.js", "package.json"]), ["node_modules"]);
    assert.deepEqual(junkTopLevel([".next/static/a.js"]), [".next"]);
    assert.deepEqual(junkTopLevel([".git/config"]), [".git"]);
});

test("한 겹 감싼 zip 에서도 찾는다", () => {
    assert.deepEqual(junkTopLevel(["pack/node_modules/x.js", "pack/package.json"]), ["node_modules"]);
    assert.deepEqual(junkTopLevel(["wrapped-pack/.next/a"]), [".next"]);
});

test("여럿이면 전부 정렬해 돌려준다", () => {
    assert.deepEqual(junkTopLevel([".git/c", ".next/a", "node_modules/b"]), [".git", ".next", "node_modules"]);
});

test("이름이 비슷한 정상 경로를 벌하지 않는다", () => {
    for (const e of ["src/node_modules_readme.md", "docs/.nextjs-notes.md", "src/lib/.gitkeep", "public/images/next.png"]) {
        assert.deepEqual(junkTopLevel([e]), [], `${e} 가 잘못 걸렸다`);
    }
});

test("깊이 3 이상은 최상위가 아니다 — 고객 소스 안의 같은 이름은 통과", () => {
    assert.deepEqual(junkTopLevel(["src/vendor/node_modules/x.js"]), []);
});

test("빈 목록·공백 줄에 죽지 않는다", () => {
    assert.deepEqual(junkTopLevel([]), []);
    assert.deepEqual(junkTopLevel(["", "   ", "\t"]), []);
});
