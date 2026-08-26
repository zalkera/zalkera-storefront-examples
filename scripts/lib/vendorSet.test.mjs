/**
 * `verify-zip` 의 **런타임 의존 집합**을 잠근다.
 *
 * 이 러너는 외주에 사본으로 나간다. 한 파일이라도 빠지면 그 검사가 `MODULE_NOT_FOUND` 로 죽고,
 * 그것이 `record()` 에 실려 **정상 납품이 전부 반려**된다 — 조치 불가능한 문면으로.
 *
 * 목록을 주석에 적어 두는 것으로는 부족하다(적어 뒀는데 둘이 빠져 있었다). 소스에서 뽑아 잰다.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "verify-zip.mjs");
const src = readFileSync(RUNNER, "utf8");

/**
 * 그 자리가 **주석이나 문자열 안**인가. 앞에서부터 훑어서 판정한다.
 *
 * ⚠ 줄 안에서 `//` 를 찾는 방식은 양쪽으로 틀린다: 같은 줄 앞에 `"http://x"` 가 있으면 진짜
 *   `import()` 를 주석으로 보아 **놓치고**, 한 줄짜리 블록 주석은 못 알아보아 **오검**한다.
 *   문자열·주석 상태를 앞에서부터 세면 둘이 같이 닫힌다.
 */
function findStringEnd(src, open) {
    const q = src[open];
    let i = open + 1;
    while (i < src.length) {
        if (src[i] === "\\") {
            i += 2;
            continue;
        }
        if (src[i] === q) return i;
        i += 1;
    }
    return src.length;
}

function inComment(src, at) {
    let quote = null;
    let i = 0;
    while (i < at) {
        const c = src[i];
        const next = src[i + 1];
        if (quote) {
            if (c === "\\") {
                i += 2;
                continue;
            }
            if (c === quote) quote = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'" || c === "`") {
            // 문자열이 `at` 을 감싸면 그 자리는 코드가 아니다 — 예시를 적어 둔 문자열이 의존으로 잡힌다.
            const close = findStringEnd(src, i);
            if (close > at) return true;
            i = close + 1;
            continue;
        }
        if (c === "/" && next === "/") {
            const nl = src.indexOf("\n", i);
            if (nl === -1 || nl >= at) return true;
            i = nl + 1;
            continue;
        }
        if (c === "/" && next === "*") {
            const end = src.indexOf("*/", i + 2);
            if (end === -1 || end + 2 > at) return true;
            i = end + 2;
            continue;
        }
        i += 1;
    }
    return false;
}

/** 사본을 건넬 때 같이 가야 하는 파일. 러너 옆(`scripts/`) 기준 상대 경로. */
export const VENDOR_SET = [
    "verify-zip.mjs",
    "validate-storefront.mjs",
    "lib/childEnv.mjs",
    "lib/devCompile.mjs",
    "lib/floors.mjs",
    "lib/junkEntries.mjs",
    // 동봉 시크릿 판정표. `verify-zip.mjs` 가 고객 트리에서 읽는다 — 빠지면 그 사본이 죽는다.
    "lib/secret-content.mjs",
    "lib/routes.mjs",
    "lib/gate-behavior.mjs",
    "lib/content-routes.mjs",
    "lib/floor-gate.mjs",
    "lib/floor-reporter.mjs",
];

test("목록의 파일이 전부 실재한다", () => {
    for (const f of VENDOR_SET) {
        assert.equal(existsSync(join(HERE, "..", f)), true, `${f} 가 없다`);
    }
});

test("소스가 부르는 형제를 목록이 전부 덮는다 — 빠지면 사본이 죽는다", () => {
    const needed = new Set();
    // ⚠ **한 겹만 보면 뚫린다.** 러너가 부르는 파일이 또 남을 부른다 — `lib/floor-gate.mjs` 가
    //   `lib/floor-reporter.mjs` 를 리포터로 넘기는 식이다. 러너 소스만 훑으면 그 손자가 안 잡히고,
    //   사본은 «있는데 안 도는» 상태가 된다. 그래서 목록의 파일을 **전부** 훑는다.
    for (const entry of VENDOR_SET) {
        const at = join(HERE, "..", entry);
        if (!existsSync(at)) continue; // 존재는 위 시험이 잡는다
        const body = readFileSync(at, "utf8");
        const dir = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/")) : "";
        const rebase = (rel) => (dir ? `${dir}/${rel}` : rel);
        // ⑴ 상대 import — 그 파일이 있는 폴더 기준이다.
        //    ⚠ **`import`/`export` 문에서 시작하는 것만 본다.** 아무 데서나 `from "./x"` 를 찾으면
        //      주석이나 문자열 안의 예시가 의존으로 잡힌다 — `// import <이름> from "./pages/x.json";`
        //      같은 설명 한 줄에 오검이 난다. 오검이 나면 다음 판에 붙는 것은 수정이 아니라 면제다.
        //
        //    ⚠ **작은따옴표도 본다.** 이 레포는 큰따옴표로 쓰지만, 사본을 손보는 쪽이 그러리란
        //      보장이 없다. 표기 하나 때문에 의존이 안 보이면 사본이 죽는다.
        //
        //    ⚠ **여러 줄에 걸친 import 도 잡는다.** `[^\n]*?` 로 좁히면 아래 형태를 놓친다:
        //        import {
        //            무엇,
        //        } from "./형제.mjs";
        //      줄 단위로 좁히는 것이 오검을 막는 방법처럼 보이지만, 그러면 은닉이 생긴다.
        //      대신 `;` 를 만나기 전까지만 훑어 문장 경계를 지킨다.
        for (const m of body.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']\.\/([^"']+)["']/g)) {
            needed.add(rebase(m[1]));
        }
        // ⑴-b **동적 `import("./x")`** — 조건부 적재도 사본이 없으면 그 자리에서 죽는다.
        //    문 형태가 아니라 호출이라 위 정규식이 못 본다.
        //    ⚠ 위 ⑴ 은 줄머리 앵커로 주석 속 예시를 피하는데, 이쪽은 호출이라 앵커를 못 건다.
        //      대신 **그 줄에서 `//` 앞에 있는지**만 본다 — 주석 안의 `await import("./x")` 예시가
        //      의존으로 잡히면 그 오검이 곧 면제가 된다.
        for (const m of body.matchAll(/\bimport\s*\(\s*["']\.\/([^"']+)["']\s*\)/g)) {
            if (!inComment(body, m.index ?? 0)) needed.add(rebase(m[1]));
        }
        // ⑵ `join(HERE, …)` 로 만들어 spawn 하는 경로
        for (const m of body.matchAll(/join\(HERE,\s*"([^"]+)"(?:,\s*"([^"]+)")?\)/g)) {
            needed.add(rebase([m[1], m[2]].filter(Boolean).join("/")));
        }
    }
    assert.ok(needed.size >= 4, `형제 참조를 ${needed.size}개만 찾았다 — 추출이 깨졌다`);
    const missing = [...needed].filter((f) => !VENDOR_SET.includes(f));
    assert.deepEqual(missing, [], `목록에 없는 런타임 의존: ${missing.join(" · ")}`);
});

test("주석이 적은 목록과 이 목록이 같다", () => {
    // 주석 안 표를 뽑아 대조한다 — 둘이 갈리면 사본을 만드는 사람이 주석을 믿는다.
    const listed = [...src.matchAll(/^ \*     ([A-Za-z0-9_./-]+\.mjs)\s/gm)].map((m) => m[1]);
    assert.deepEqual([...listed].sort(), [...VENDOR_SET].sort(), `주석 목록: ${listed.join(" · ")}`);
});
