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
import {childEnv, INHERITED_NOISE} from "./childEnv.mjs";

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

test("하한표의 키를 argv 로 넘기지 않는다", () => {
    // ⚠ 종전엔 하한표의 키를 `node --test <키>` 의 argv 로 넘겼다. `-` 로 시작하는 키가 파일이 아니라
    //   **플래그**로 해석돼 이 러너를 돌리는 기계에서 임의 코드가 돌 수 있었고, `--` 분리와 키 형태
    //   정규식이 심층방어로 서 있었다. 지금은 시험 **한 판**에서 파일별 통과 수를 뽑으므로
    //   키가 argv 에 **아예 안 들어간다** — 방어가 아니라 공격면 자체가 없다.
    //
    //   이 시험이 무는 것: 누군가 재실행 루프를 되살리면 키가 다시 argv 로 간다.
    const suspicious = judgingSpawns().filter((s) => /test-floors|floors\[|Object\.entries\(floors/.test(s.call));
    assert.deepEqual(
        suspicious.map((s) => s.line),
        [],
        `하한표 키를 argv 로 넘기는 자리: ${suspicious.map((s) => `${s.line}행`).join(" · ")}`,
    );
    // 하한 집행은 게이트 하나에 위임한다 — 그 자리가 사라지면 집행이 통째로 없어진다.
    const gate = judgingSpawns().find((s) => /floor-gate\.mjs/.test(s.call));
    assert.ok(gate, "하한 게이트를 부르는 spawn 이 없다 — 집행 지점이 사라졌다");
    assert.match(gate.call, /join\(HERE,/, `러너 자신의 게이트가 아니라 zip 의 사본을 부른다:\n${gate.call}`);
});

// ── 규율의 **실물**을 문다 ─────────────────────────────────────────────────
//
// 위 시험들은 규율을 **베껴 적은 사본**(`clean()`)을 잰다. 사본은 넷 중 둘만 지웠고, 나머지 둘을
// 목록에서 빼도 아무도 안 죽었다 — 그중 `NEXT_PUBLIC_*_PREVIEW` 는 **빌드의 뜻을 바꾼다**.
// 여기서부터는 `verify-zip` 이 실제로 부르는 그 함수를 직접 부른다.

test("판정을 바꾸는 상속 변수를 전부 지운다", () => {
    const base = {
        PATH: "/usr/bin",
        NODE_TEST_CONTEXT: "child-v8",
        NODE_OPTIONS: "--import=./evil.mjs",
        NEXT_PUBLIC_ZALKERA_PREVIEW: "1",
        NEXT_PUBLIC_ONEQUE_PREVIEW: "1",
    };
    const env = childEnv({}, base);
    for (const k of INHERITED_NOISE) {
        assert.equal(k in env, false, `${k} 가 자식에게 그대로 갔다`);
    }
    assert.equal(env.PATH, "/usr/bin", "무해한 변수까지 지웠다");
});

test("미리보기 판별자는 **이름 둘 다** 지운다 — 한쪽만 지우면 다른 쪽으로 샌다", () => {
    // 개명 과도기라 이름이 둘이다. 한쪽만 막으면 미리보기 빌드를 상용인 줄 알고 재게 된다.
    assert.ok(INHERITED_NOISE.includes("NEXT_PUBLIC_ZALKERA_PREVIEW"));
    assert.ok(INHERITED_NOISE.includes("NEXT_PUBLIC_ONEQUE_PREVIEW"));
});

test("선언한 값은 상속값을 덮는다 — 그리고 그것도 잡음이면 지워진다", () => {
    assert.equal(childEnv({A: "새것"}, {A: "옛것"}).A, "새것");
    // 얹은 값이라도 판정을 바꾸는 이름이면 남기지 않는다 — 규율이 얹는 쪽만 비켜 가면 구멍이다.
    assert.equal("NODE_OPTIONS" in childEnv({NODE_OPTIONS: "--x"}, {}), false);
});

test("원본 환경을 건드리지 않는다", () => {
    const base = {NODE_OPTIONS: "--x", KEEP: "1"};
    childEnv({}, base);
    assert.equal(base.NODE_OPTIONS, "--x", "부른 쪽의 환경이 바뀌었다");
});

test("`verify-zip` 이 이 문을 실제로 쓴다 — 사본이 다시 생기면 잡는다", () => {
    // 규율이 두 벌이 되는 것이 이 파일이 고친 병이다. 문면으로 본다: 자기 `INHERITED_NOISE` 를
    // 다시 선언하면 그것은 사본이다.
    const runner = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "verify-zip.mjs"), "utf8");
    assert.match(runner, /import \{childEnv\} from "\.\/lib\/childEnv\.mjs"/, "공용 문을 안 쓴다");
    assert.doesNotMatch(runner, /const INHERITED_NOISE\s*=/, "규율이 두 벌이 됐다");
});
