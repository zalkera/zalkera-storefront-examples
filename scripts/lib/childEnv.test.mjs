/**
 * 측정 자식을 띄울 때의 **불변식** 시험.
 *
 * 이 러너가 어떤 환경에서 불릴지 우리가 정하지 못한다. 상속 변수가 자식의 **판정을 바꾸면**
 * 우리는 그 바뀐 결과를 사실로 읽는다. 그 자리를 두 축으로 잠근다:
 *   ⑴ 환경 — 판정을 바꾸는 변수를 지우고 띄운다
 *   ⑵ 인자 — 신뢰 밖 경로를 `--` 뒤로 보내 플래그로 해석될 여지를 없앤다
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from "node:fs";
import {join, dirname} from "node:path";
import {tmpdir} from "node:os";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

/** 시험용 트리 하나. `evil.mjs` 는 실행되면 흔적을 남긴다. */
function fixture() {
    const dir = mkdtempSync(join(tmpdir(), "childenv-"));
    const marker = join(dir, "EVIL-RAN");
    writeFileSync(join(dir, "evil.mjs"), `import {writeFileSync as w} from "node:fs";\nw(${JSON.stringify(marker)}, "1");\n`);
    mkdirSync(join(dir, "src", "lib"), {recursive: true});
    writeFileSync(join(dir, "src", "lib", "p.test.ts"), 'import {test} from "node:test";\ntest("a", () => {});\ntest("b", () => {});\n');
    return {dir, marker};
}

/** 상속 잡음을 지운 환경 — `verify-zip` 의 `childEnv` 와 같은 규율. */
function clean() {
    const env = {...process.env};
    for (const k of ["NODE_TEST_CONTEXT", "NODE_OPTIONS"]) delete env[k];
    return env;
}

test("통제군 — `--` 없이는 `-` 로 시작하는 인자가 node 플래그로 실행된다", () => {
    const {dir, marker} = fixture();
    try {
        spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--import=./evil.mjs"], {cwd: dir, env: clean(), encoding: "utf8"});
        assert.equal(existsSync(marker), true, "위험이 재현되지 않았다 — 이 시험의 전제가 깨졌다");
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("`--` 를 두면 같은 인자가 파일로 취급되어 실행되지 않는다", () => {
    const {dir, marker} = fixture();
    try {
        spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--", "--import=./evil.mjs"], {cwd: dir, env: clean(), encoding: "utf8"});
        assert.equal(existsSync(marker), false, "`--` 뒤인데도 플래그로 실행됐다");
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("`--` 를 둬도 정상 경로는 그대로 돈다 — 과잉 차단이 아니다", () => {
    const {dir} = fixture();
    try {
        const r = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--", "src/lib/p.test.ts"], {cwd: dir, env: clean(), encoding: "utf8"});
        assert.match(`${r.stdout ?? ""}`, /^# pass 2$/m, `정상 경로가 안 돌았다: ${r.stdout}`);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("통제군 — `NODE_TEST_CONTEXT` 가 남으면 `# pass N` 요약이 사라진다", () => {
    const {dir} = fixture();
    try {
        const dirty = {...clean(), NODE_TEST_CONTEXT: "child-v8"};
        const r = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--", "src/lib/p.test.ts"], {cwd: dir, env: dirty, encoding: "utf8"});
        assert.equal(/^# pass \d+$/m.test(`${r.stdout ?? ""}`), false, "오염이 재현되지 않았다 — 이 시험의 전제가 깨졌다");
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("그 변수를 지우면 요약이 돌아온다 — 하한 파싱이 산다", () => {
    const {dir} = fixture();
    try {
        const r = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--", "src/lib/p.test.ts"], {cwd: dir, env: clean(), encoding: "utf8"});
        assert.match(`${r.stdout ?? ""}`, /^# pass 2$/m);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

/**
 * 위 두 시험은 **node 가 그렇게 동작한다**만 증명한다. 러너가 실제로 그 규율을 쓰는지는
 * 별개이고, 실제로 두 자리가 빠진 채 초록이었다(규약 검사·산출물 검사기).
 *
 * 그래서 **소스에서 뽑아 잰다** — `vendorSet.test.mjs` 와 같은 방식이다.
 */
const RUNNER = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "verify-zip.mjs"), "utf8");

/**
 * 판정 자식 spawn 만 고른다. `unzip`·`chmod` 는 판정을 안 낸다.
 * 괄호 균형으로 호출을 통째로 뜬다 — 정규식으로 끝을 잡으면 형태가 조금만 달라도 놓친다.
 */
function judgingSpawns() {
    const out = [];
    let i = 0;
    while ((i = RUNNER.indexOf("spawnSync(", i)) !== -1) {
        let depth = 0;
        let j = i + "spawnSync".length;
        for (; j < RUNNER.length; j++) {
            if (RUNNER[j] === "(") depth++;
            else if (RUNNER[j] === ")") {
                depth--;
                if (depth === 0) break;
            }
        }
        const call = RUNNER.slice(i, j + 1);
        if (!/spawnSync\(\s*"(unzip|chmod)"/.test(call)) {
            out.push({call, line: RUNNER.slice(0, i).split("\n").length});
        }
        i = j + 1;
    }
    return out;
}

test("판정 자식은 **전부** 정규화한 환경으로 띄운다", () => {
    const spawns = judgingSpawns();
    assert.ok(spawns.length >= 5, `판정 spawn 을 ${spawns.length}개만 찾았다 — 추출이 깨졌다`);
    const bare = spawns.filter((s) => !/env:\s*childEnv\(/.test(s.call));
    assert.deepEqual(
        bare.map((s) => s.line),
        [],
        `상속 환경으로 띄우는 자리: ${bare.map((s) => `${s.line}행`).join(" · ")}`,
    );
});

test("신뢰 밖 경로는 `--` 뒤로 넘긴다", () => {
    const floorRun = judgingSpawns().find((s) => /--experimental-strip-types/.test(s.call) && /"--test"/.test(s.call));
    assert.ok(floorRun, "하한 스위트를 돌리는 spawn 을 못 찾았다 — 추출이 깨졌다");
    assert.match(floorRun.call, /"--test",\s*"--",/, `키가 \`--\` 뒤가 아니다:\n${floorRun.call}`);
});
