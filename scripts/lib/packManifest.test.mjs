/**
 * 굽는 도구가 만드는 `content/index.ts` 의 계약. **정본 전용**(`pack-preset.mjs` 와 같이 배송 제외).
 *
 * 이 생성물은 고객이 **손으로 이어 고치는 파일**이다 — 배송 문서가 "여기에 두 줄"이라고 가르친다.
 * 그래서 여기서 나오는 형상이 곧 고객이 흉내 낼 형상이고, 틀린 형상은 그대로 복제된다.
 *
 * 재는 것은 둘이다.
 *   ⑴ **맵의 키가 slug 인가** — 키가 곧 URL 이다. 축약 표기는 키를 식별자로 만들어 `/our-story` 를
 *      404 로 만드는데, 파일은 멀쩡히 있고 `[N3]` 도 통과한다(그쪽은 import **경로**를 본다).
 *   ⑵ **식별자가 유효한가** — slug 규칙 `^[a-z0-9-]+$` 는 `2025-report`·`3d` 를 허용한다.
 *
 * 사용: `node --test scripts/lib/packManifest.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {contentManifest, identifierOf} from "./contentManifest.mjs";
import {REPO_ONLY_FLOORS} from "./floors.mjs";

const TSC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".bin", "tsc");

/** 굽는 도구가 프리셋 slug 에 거는 규칙(`pack-preset.mjs` 의 `SLUG_FORMAT`). */
const SLUG_FORMAT = /^[a-z0-9-]+$/;

/** 생성물에서 `export const pages = {...}` 의 키를 뽑는다. */
function mapKeys(source) {
    const body = source.slice(source.indexOf("export const pages"));
    return [...body.matchAll(/^\s{4}("(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*)\s*:/gm)].map((m) =>
        m[1].startsWith('"') ? JSON.parse(m[1]) : m[1],
    );
}

/**
 * 생성물이 **TypeScript 로 성립하는가**. 생성물은 `.ts` 라 `new Function` 으로는 못 잰다
 * (`const pages: Record<…>` 에서 죽는다 — 그건 도구 결함이지 생성물 결함이 아니다).
 *
 * json import 는 번들러가 푸는 것이라 여기서 해석할 수 없다 → `declare const` 로 바꿔 **식별자 토큰은
 * 그대로 두고** 파서에 물린다. 숫자로 시작하는 식별자는 이 형태에서도 똑같이 죽는다.
 */
function typeChecks(source) {
    const dir = mkdtempSync(join(tmpdir(), "manifest-"));
    try {
        const file = join(dir, "index.ts");
        writeFileSync(file, source.replace(/^import\s+(\S+)\s+from\s+.*$/gm, "declare const $1: unknown;"));
        // ⚠ `--typeRoots` 를 빈 디렉터리로 돌린다 — 안 그러면 레포의 `@types/*` 가 딸려 들어와
        //   **생성물과 무관한 오류**(undici-types·csstype 미해결)로 이 시험이 붉어진다.
        const empty = join(dir, "no-types");
        mkdirSync(empty);
        const r = spawnSync(
            TSC,
            ["--noEmit", "--strict", "--target", "esnext", "--module", "esnext", "--typeRoots", empty, file],
            {encoding: "utf8"},
        );
        return {ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

test("맵의 키는 **slug 그대로**다 — 키가 곧 URL 이다", () => {
    const keys = mapKeys(contentManifest(["home", "our-story", "about"]));
    assert.deepEqual(keys, ["home", "our-story", "about"]);
});

test("하이픈 slug 가 축약으로 무너지지 않는다", () => {
    const out = contentManifest(["our-story"]);
    // 축약이면 `    our_story,` 가 나오고 키가 식별자가 된다.
    assert.match(out, /"our-story":\s*our_story,/);
    assert.equal(mapKeys(out).includes("our_story"), false, "식별자가 키로 샜다 — /our-story 가 404 다");
});

test("slug 규칙을 통과하는 값은 **전부** 유효한 매니페스트를 만든다", () => {
    // 규칙이 허용하는 형태를 넓게 든다. 숫자로 시작하는 것이 실제로 굽기를 죽이던 자리다.
    const slugs = ["home", "about", "our-story", "2025-report", "3d", "a--b", "-lead", "trail-", "x", "0"];
    for (const s of slugs) assert.equal(SLUG_FORMAT.test(s), true, `${s} 가 규칙을 못 지난다 — 표본이 틀렸다`);
    const out = contentManifest(slugs);
    const {ok, out: diag} = typeChecks(out);
    assert.equal(ok, true, `생성물이 TypeScript 로 안 선다:\n${diag}\n---\n${out}`);
    assert.deepEqual(mapKeys(out), slugs);
});

test("숫자로 시작하는 slug 의 식별자는 유효하다", () => {
    for (const s of ["2025-report", "3d", "0"]) {
        const ident = identifierOf(s);
        assert.doesNotThrow(() => new Function(`let ${ident};`), `${s} → \`${ident}\` 는 식별자가 아니다`);
    }
});

test("통제군 — 평범한 slug 의 식별자는 건드리지 않는다", () => {
    assert.equal(identifierOf("about"), "about");
    assert.equal(identifierOf("our-story"), "our_story");
});

test("import 경로는 slug 그대로다 — 식별자 정규화가 파일명을 바꾸지 않는다", () => {
    const out = contentManifest(["2025-report", "our-story"]);
    assert.match(out, /from "\.\/pages\/2025-report\.json"/);
    assert.match(out, /from "\.\/pages\/our-story\.json"/);
    assert.equal(/pages\/_?2025_report\.json/.test(out), false, "파일명이 식별자로 바뀌었다");
});

test("생성물이 스스로 가르치는 형상과 실제 형상이 같다", () => {
    // 머리말이 `"<slug>": <이름>,` 라고 적는데 본문이 축약이면, 고객은 본문을 흉내 낸다.
    const out = contentManifest(["our-story"]);
    assert.match(out, /"<slug>": <이름>,/);
    assert.match(out, /^\s{4}"our-story": our_story,$/m);
});

/**
 * **정본 전용 시험은 팩에서 빠져야 한다** — `REPO_ONLY_FLOORS` ↔ `SOURCE_EXCLUDES` 불변식.
 *
 * 왜 못 박나: 팩의 하한표는 `REQUIRED_FLOORS` 로 **다시 지어지므로**(`pack-preset.mjs` 의
 * `shippedFloorTable`) 정본 전용 항목이 안 실린다. 그런데 `floor-gate.mjs` 는 표의 키가 아니라
 * `scripts/** 아래 *.test.mjs` **글롭**으로 시험을 돌린다. 그래서 파일이 팩에 남으면 「하한표 밖의
 * 스위트」로 **모든 팩이 자기 검수에서 죽고**, `ci.yml` 이 배송되므로 전 테넌트 CI 가 적색이 된다.
 *
 * 이 불변식은 지금까지 사람의 기억이 지켰고, **한 번 어긋났다**(`devCompile.test.mjs` 를 새로
 * 만들 때 배제 목록에 빠뜨렸다가 심의에서 잡혔다). 그래서 기계로 옮긴다.
 *
 * ⚠ **문면으로 읽는다.** `pack-preset.mjs` 는 import 하면 도는 CLI 라 상수를 가져올 수 없다 —
 *   `vendorSet.test.mjs` 가 주석표를 읽는 것과 같은 규율이다.
 */
test("정본 전용 `scripts/** 아래 *.test.mjs` 는 전부 팩 배제 목록에 있다", () => {
    const src = readFileSync(new URL("../pack-preset.mjs", import.meta.url), "utf8");
    const block = /const SOURCE_EXCLUDES = \[([\s\S]*?)\n\];/.exec(src);
    assert.ok(block, "SOURCE_EXCLUDES 배열을 못 찾았다 — 이 시험이 아무것도 안 보고 있다");
    const excluded = new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(excluded.size >= 10, `배제 항목을 ${excluded.size}개만 찾았다 — 추출이 깨졌다`);

    const repoOnlyScriptTests = Object.keys(REPO_ONLY_FLOORS).filter((f) => f.startsWith("scripts/") && f.endsWith(".test.mjs"));
    assert.ok(repoOnlyScriptTests.length > 0, "정본 전용 스크립트 시험이 0건이다 — 표본이 틀렸다");
    const leaking = repoOnlyScriptTests.filter((f) => !excluded.has(f));
    assert.deepStrictEqual(leaking, [], `팩에 실리면 「하한표 밖의 스위트」로 모든 팩이 죽는다: ${leaking.join(" · ")}`);
});
