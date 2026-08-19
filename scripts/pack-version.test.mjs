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
import {readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join, resolve} from "node:path";
import {test} from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(REPO, "scripts", "pack-preset.mjs");

/** 스크립트를 그대로 돌린다 — 검사 대상은 **배송되는 진입점**이지 내부 함수가 아니다. */
function run(...args) {
    const before = listing();
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {cwd: REPO, encoding: "utf8"});
    const after = listing();
    // ⚠ **여기서 잰다.** 호출부마다 손으로 부르면 자리가 빠진다 — 실제로 여덟 시험 중 둘에만
    //   걸려 있었고, 나머지 여섯 경로는 산출물이 남아도 초록이었다.
    if (r.status !== 0) strictEqual(after, before, "버전 관문이 걸렸는데 dist-presets 가 바뀌었다");
    return {code: r.status, err: `${r.stderr}${r.stdout}`, before, after};
}

/**
 * `dist-presets` 의 **파일 목록**. `run()` 이 실행 전후로 불러 관문이 산출물을 남겼는지 잰다.
 *
 * ⚠ **존재가 아니라 목록의 변화를 본다.** 종전에는 `existsSync(dist-presets)` 를 봤는데, 그 폴더는
 *   한 번 팩하면 남으므로 **팩을 구운 트리에서는 영구히 거짓**이었다 — `ci.yml` 이 돌리는
 *   `floor-gate.mjs` 가 그 실패로 죽고, 그러면 스위트별 통과 수 하한이 **아예 안 걸린다.**
 *   CI 는 새 체크아웃이라 초록이어서 이 적색은 사람 손에서만 났다.
 *
 *   ⚠ **낮은 번호가 얹히는 것은 이 오라클이 못 막는다.** 그쪽은 팩이 성공하는 경로(rc=0)이고
 *     여기서 재는 것은 반려 경로뿐이다. 그 형상은 `pack-preset.mjs` 의 **단조성 관문**이 막는다
 *     (아래 시험이 함께 잰다).
 *
 * ⚠ **이름만 본다.** 같은 이름을 제자리에서 덮어쓰는 것은 못 잡는다. 그리고 이 판정은 **파일을
 *   읽기 전에 서는 관문**에만 해당한다 — 팩은 zip 을 쓴 뒤 `verify-zip` 을 돌리므로, 검수 실패로
 *   rc=1 이 되면서 새 zip 이 남는 경로가 배송 도구에 실재한다.
 */
function listing() {
    try {
        return readdirSync(join(REPO, "dist-presets")).sort().join("\n");
    } catch {
        return "";
    }
}

test("--version 이 없으면 멈춘다 — 기본값을 쓰지 않는다", () => {
    const result = run();
    strictEqual(result.code, 1, "인자 없이 부르면 무언가를 구웠다");
    ok(/--version 이 없습니다/.test(result.err), result.err.slice(0, 200));
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
        const result = run("--version", bad);
        strictEqual(result.code, 1, `"${bad}" 이 통과했다`);
        ok(/semver core/.test(result.err), `"${bad}": ${result.err.slice(0, 160)}`);
    }
});

test("앞자리 0 은 안 받는다 — 사람 눈에 같은 번호가 다른 객체가 된다", () => {
    for (const bad of ["01.2.3", "1.02.3", "1.2.03", "00.0.0"]) {
        const {code, err} = run("--version", bad);
        strictEqual(code, 1, `"${bad}" 이 통과했다`);
        ok(/semver core/.test(err), `"${bad}": ${err.slice(0, 160)}`);
    }
});

test("이미 있는 것보다 낮은 번호는 안 굽는다 — 되돌릴 수 없는 자리다", () => {
    // 이 도구가 `--version` 을 필수로 만든 이유가 그 형상인데, 정작 낮은 번호는 안 막고 있었다.
    // ⚠ 이 관문은 **로컬 폴더만** 본다 — 카탈로그의 최신은 원장이 안다. 그 한계는 KDoc 에 적혀 있다.
    const zips = listing()
        .split("\n")
        .filter(Boolean)
        .map((n) => /-(\d+\.\d+\.\d+)\.zip$/.exec(n)?.[1])
        .filter(Boolean);
    if (zips.length === 0) return; // 구운 것이 없으면 잴 것이 없다(CI 의 새 체크아웃).
    const max = zips.sort((a, b) => {
        const x = a.split(".").map(Number);
        const y = b.split(".").map(Number);
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })[zips.length - 1];
    const [j, n, p2] = max.split(".").map(Number);
    for (const low of [`${j}.${n}.${p2}`, `${j}.${n}.${Math.max(p2 - 1, 0)}`, "0.0.1"]) {
        const result = run("--version", low, "skeleton", "--no-verify", "--allow-dirty");
        strictEqual(result.code, 1, `"${low}" 이 통과했다(현재 최대 ${max})`);
        ok(/보다 높지 않습니다/.test(result.err), result.err.slice(0, 200));
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
    // `--allow-rewind` 는 **단조성 관문을 비키기 위한 것**이다 — 여기서 재는 것은 형식 관문이고,
    // 낮은 번호를 안 쓰면 이 시험이 판마다 낡는다.
    const {code, err} = run("--version", "1.2.3", "BAD_Code", "--allow-rewind");
    strictEqual(code, 1);
    ok(/프리셋 디렉터리 이름/.test(err), err.slice(0, 200));
    ok(!/--version/.test(err), `버전 관문이 옳은 번호를 막았다: ${err.slice(0, 200)}`);
});

test("0.0.0 은 옳은 형식이다 — 과소독이 아니다", () => {
    const {code, err} = run("--version", "0.0.0", "BAD_Code", "--allow-rewind");
    strictEqual(code, 1);
    ok(/프리셋 디렉터리 이름/.test(err), err.slice(0, 200));
});
