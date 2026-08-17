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

/** 사본을 건넬 때 같이 가야 하는 파일. 러너 옆(`scripts/`) 기준 상대 경로. */
export const VENDOR_SET = [
    "verify-zip.mjs",
    "validate-storefront.mjs",
    "lib/floors.mjs",
    "lib/junkEntries.mjs",
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
        //    ⚠ **줄 첫머리의 `import`/`export` 문만 본다.** 아무 데서나 `from "./x"` 를 찾으면
        //      주석이나 문자열 안의 예시가 의존으로 잡힌다(실제로 한 번 그렇게 오검이 났다:
        //      `// import <이름> from "./pages/<slug>.json";` 라는 설명 한 줄).
        //      오검이 나면 다음 판에 붙는 것은 수정이 아니라 면제다.
        for (const m of body.matchAll(/^\s*(?:import|export)\b[^\n]*?\bfrom\s+"\.\/([^"]+)"/gm)) {
            needed.add(rebase(m[1]));
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
