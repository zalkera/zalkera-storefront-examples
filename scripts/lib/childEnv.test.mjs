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
import {join} from "node:path";
import {tmpdir} from "node:os";

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
