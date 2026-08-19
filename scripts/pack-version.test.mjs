/**
 * **팩 버전은 짐작하지 않는다** — `--version` 이 없거나 형식이 틀리면 zip 을 하나도 쓰지 않는다.
 *
 * 이 시험이 지키는 것은 문장이 아니라 **키**다. 팩은 `{code}/{version}.zip` 으로 올라가므로 번호가
 * 하나 낮으면 그것은 덮어쓰기가 아니라 새 객체이고, promote 하면 신규 테넌트가 그 판을 받는다.
 * 되돌릴 방법이 없으니 판정은 **팩 시작 전**에, 그리고 fail-closed 로 끝나야 한다.
 *
 * 재현: `node --experimental-strip-types --test scripts/pack-version.test.mjs`
 */
import {ok, strictEqual} from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {test} from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(REPO, "scripts", "pack-preset.mjs");

/** 스크립트를 그대로 돌린다 — 검사 대상은 **배송되는 진입점**이지 내부 함수가 아니다. */
function run(...args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {cwd: REPO, encoding: "utf8"});
    return {code: r.status, err: `${r.stderr}${r.stdout}`};
}

/** 어느 경로로 죽든 산출물은 없어야 한다. */
function noZips() {
    ok(!existsSync(join(REPO, "dist-presets")), "게이트가 걸렸는데 dist-presets 가 생겼다");
}

test("--version 이 없으면 멈춘다 — 기본값을 쓰지 않는다", () => {
    const {code, err} = run();
    strictEqual(code, 1, "인자 없이 부르면 무언가를 구웠다");
    ok(/--version 이 없습니다/.test(err), err.slice(0, 200));
    noZips();
});

test("--version 뒤에 값이 없으면 멈춘다", () => {
    const {code, err} = run("--version");
    strictEqual(code, 1);
    ok(/--version 이 없습니다/.test(err), err.slice(0, 200));
});

test("--version 뒤가 다른 플래그면 값으로 삼지 않는다", () => {
    // 값이 빠진 것을 사람이 못 알아채는 가장 흔한 형태다.
    const {code, err} = run("--version", "--allow-dirty");
    strictEqual(code, 1);
    ok(/semver core/.test(err), err.slice(0, 200));
});

test("형식이 아니면 멈춘다", () => {
    for (const bad of ["1.2.3-rc1", "1.2.3+b1", "1.2.3.4", "v1.2.3", " 1.2.3 ", "", "1.2", "abc"]) {
        const {code, err} = run("--version", bad);
        strictEqual(code, 1, `"${bad}" 이 통과했다`);
        ok(/semver core/.test(err), `"${bad}": ${err.slice(0, 160)}`);
    }
    noZips();
});

test("앞자리 0 은 안 받는다 — 사람 눈에 같은 번호가 다른 객체가 된다", () => {
    for (const bad of ["01.2.3", "1.02.3", "1.2.03", "00.0.0"]) {
        const {code, err} = run("--version", bad);
        strictEqual(code, 1, `"${bad}" 이 통과했다`);
        ok(/semver core/.test(err), `"${bad}": ${err.slice(0, 160)}`);
    }
});

test("컬럼 폭을 넘기면 팩 전에 멈춘다 — 적재 400 을 미리 잡는다", () => {
    const {code, err} = run("--version", `1.0.${"9".repeat(38)}`);
    strictEqual(code, 1);
    ok(/상한 40자/.test(err), err.slice(0, 200));
});

test("양성 통제군 — 옳은 번호는 버전 관문을 지난다", () => {
    // 프리셋 코드 검사는 버전 검사 **바로 뒤**에 있다. 그 문구가 나왔다는 것은 버전이 통과했다는 뜻이고,
    // 몇 분짜리 게이트·빌드를 돌리지 않고도 그것을 확인할 수 있다.
    const {code, err} = run("--version", "1.2.3", "BAD_Code");
    strictEqual(code, 1);
    ok(/프리셋 디렉터리 이름/.test(err), err.slice(0, 200));
    ok(!/--version/.test(err), `버전 관문이 옳은 번호를 막았다: ${err.slice(0, 200)}`);
});

test("0.0.0 은 옳은 형식이다 — 과소독이 아니다", () => {
    const {code, err} = run("--version", "0.0.0", "BAD_Code");
    strictEqual(code, 1);
    ok(/프리셋 디렉터리 이름/.test(err), err.slice(0, 200));
});
