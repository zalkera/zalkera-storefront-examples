/**
 * **배선 동일성 판정의 회귀 픽스처.**
 *
 * ■ 왜 생겼나
 *   이 검사기는 팩 4벌이 갈리는 것을 막는 **유일한 자리**인데 시험이 0건이었다. 판정 갈래가 넷이고
 *   (파일 부재·파일 드리프트·디렉터리 드리프트·디렉터리 부재) 그중 둘은 「깨뜨려 확인」에서 나중에
 *   발견된 구멍을 메운 것이다 — 그 메움이 살아 있는지 아무도 안 묻고 있었다.
 *
 * ■ 합성 트리로 잰다
 *   실제 레포를 대상으로 하면 「지금 통과한다」만 재고 **판정이 무엇을 잡는지**는 못 잰다. 트리를
 *   지어서 갈래마다 하나씩 물린다.
 *
 * 사용: `node --test scripts/lib/wiringParity.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {checkWiringParity, WIRING_DIRS, WIRING_FILES} from "./wiring-parity.mjs";

const made = [];
process.on("exit", () => {
    for (const dir of made.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function put(root, rel, body) {
    const full = join(root, rel);
    mkdirSync(dirname(full), {recursive: true});
    writeFileSync(full, body);
    return full;
}

/**
 * 소스 `trees` 벌을 가진 트리. 배선 파일은 전부 같은 바이트로 깐다.
 *
 * @param names 프리셋 이름들. 루트 `src/` 는 언제나 있다 — 그것이 기준선이다.
 */
function tree(names = ["alpha", "beta"]) {
    const root = mkdtempSync(join(tmpdir(), "zalkera-wiring-"));
    made.push(root);
    for (const base of ["src", ...names.map((n) => `presets/${n}/src`)]) {
        for (const rel of WIRING_FILES) {
            put(root, join(base, rel.slice("src/".length)), `// ${rel}\n`);
        }
        for (const prefix of WIRING_DIRS) {
            put(root, join(base, prefix.slice("src/".length), "route.ts"), `// ${prefix}route\n`);
        }
    }
    return root;
}

const codes = (problems) => problems.map((p) => p.slice(1, p.indexOf("]"))).sort();

test("양성 통제군 — 세 벌이 바이트 동일이면 통과한다", () => {
    // 이것이 없으면 「무엇이든 위반」 구현으로도 아래 전부가 초록이 된다.
    assert.deepEqual(checkWiringParity(tree()), []);
});

test("배선 파일의 바이트가 한 벌만 다르면 잡는다", () => {
    const root = tree();
    put(root, "presets/beta/src/lib/crossOrigin.ts", "// 갈렸다\n");
    const problems = checkWiringParity(root);
    assert.deepEqual(codes(problems), ["WIRING_DRIFT"]);
    assert.match(problems[0], /crossOrigin\.ts/);
    // 어느 벌이 갈렸는지 말해야 한다 — 안 말하면 사람이 넷을 다 열어 본다.
    assert.match(problems[0], /presets\/beta/);
});

test("배선 파일이 한 벌에서 없으면 잡는다 — 지우는 것이 고치는 것보다 쉬우면 안 된다", () => {
    const root = tree();
    unlinkSync(join(root, "presets/alpha/src/middleware.ts"));
    const problems = checkWiringParity(root);
    assert.ok(codes(problems).includes("WIRING_MISSING"), JSON.stringify(problems));
    assert.match(problems.join("\n"), /middleware\.ts/);
});

test("회귀 픽스처도 배선이다 — 시험 파일이 갈려도 잡는다", () => {
    // 규칙은 한 줄만 흔들려도 조용히 열리고, `npm test` 는 레포 루트에서만 돈다.
    assert.ok(WIRING_FILES.includes("src/lib/crossOrigin.test.ts"), "픽스처가 목록에서 빠졌다");
    const root = tree();
    put(root, "presets/alpha/src/lib/crossOrigin.test.ts", "// 시험만 갈아치웠다\n");
    assert.deepEqual(codes(checkWiringParity(root)), ["WIRING_DRIFT"]);
});

test("전송층 디렉터리가 갈리면 잡는다", () => {
    const root = tree();
    put(root, "presets/beta/src/app/api/route.ts", "// assertSameOrigin 을 뺐다\n");
    const problems = checkWiringParity(root);
    assert.deepEqual(codes(problems), ["WIRING_DRIFT"]);
    assert.match(problems[0], /src\/app\/api\/route\.ts/);
});

test("한 팩에만 있는 파일은 위반이 아니다 — 그것은 그 팩의 새 능력이다", () => {
    const root = tree();
    put(root, "presets/alpha/src/app/api/only-alpha/route.ts", "// alpha 만의 능력\n");
    assert.deepEqual(checkWiringParity(root), []);
});

test("여러 벌이 가진 전송층 파일이 한 벌에서만 사라지면 잡는다 — 삭제도 드리프트다", () => {
    // 「한 팩에만 있으면 새 능력」의 뒤집힌 쪽. 남은 벌이 서로 동일하면 드리프트 검사는 통과한다.
    const root = tree(["alpha", "beta", "gamma"]);
    unlinkSync(join(root, "presets/gamma/src/app/media/route.ts"));
    const problems = checkWiringParity(root);
    assert.ok(codes(problems).includes("WIRING_MISSING"), JSON.stringify(problems));
    assert.match(problems.join("\n"), /gamma/);
});

test("전송층 파일이 **모든** 벌에서 빠지면 위반이 아니다 — 능력을 통째로 뺀 것이다", () => {
    const root = tree();
    for (const base of ["src", "presets/alpha/src", "presets/beta/src"]) {
        unlinkSync(join(root, base, "app/media/route.ts"));
    }
    assert.deepEqual(checkWiringParity(root), []);
});

test("소스가 한 벌이면 조용히 통과한다 — 고객 zip 이 그 형상이다", () => {
    // 잴 대상이 없는 것과 위반은 다르다. 여기서 반려하면 고객 트리가 이유 없이 빨개진다.
    const root = mkdtempSync(join(tmpdir(), "zalkera-wiring-solo-"));
    made.push(root);
    for (const rel of WIRING_FILES) put(root, rel, `// ${rel}\n`);
    assert.deepEqual(checkWiringParity(root), []);
});

test("목록이 비지 않았다 — 비면 위 시험이 전부 공허하게 초록이 된다", () => {
    assert.ok(WIRING_FILES.length >= 20, `배선 파일 ${WIRING_FILES.length}개`);
    assert.ok(WIRING_DIRS.length >= 3, `배선 디렉터리 ${WIRING_DIRS.length}개`);
    assert.ok(WIRING_FILES.includes("src/middleware.ts"), "미리보기 쓰기 차단의 집행 지점이 빠졌다");
    assert.ok(WIRING_DIRS.includes("src/app/api/"), "BFF 전량이 빠졌다");
});
