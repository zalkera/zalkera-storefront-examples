/**
 * 하한 판정의 변이 시험. **이 파일이 그 판정의 계약이다.**
 *
 * 여기 있는 각 시험은 실제로 게이트를 뚫었거나 뚫을 수 있는 형태다. 손으로 한 번 확인하고 버리면
 * 다음 판에서 같은 자리가 다시 열리므로, 확인을 여기 남긴다.
 *
 * 사용: `node --test scripts/lib/floors.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {judgeFloors, REQUIRED_FLOORS, FLOOR_KEY_REGEX} from "./floors.mjs";

/** 요구 스위트가 전부 있는 트리. */
const allExist = () => true;
/** 정상 표 — 요구치와 같다. */
const ok = () => ({...REQUIRED_FLOORS});

test("정상 표는 통과하고 요구 스위트를 전부 집행한다", () => {
    const {bad, effective} = judgeFloors(ok(), allExist);
    assert.deepEqual(bad, []);
    assert.equal(Object.keys(effective).length, Object.keys(REQUIRED_FLOORS).length);
});

test("표를 비우면 반려한다 — 집행은 살지만 비우기는 게이트를 끄려는 시도다", () => {
    const {bad, effective} = judgeFloors({}, allExist);
    assert.ok(
        bad.some((b) => b.includes("하한표 항목이 0개")),
        `비운 표가 통과했다: ${JSON.stringify(bad)}`,
    );
    // 요구치는 살아 있어야 한다 — 비워도 집행이 0 이 되면 안 된다.
    assert.equal(Object.keys(effective).length, Object.keys(REQUIRED_FLOORS).length);
});

test("항목을 줄이면 반려한다", () => {
    const f = ok();
    delete f["src/lib/safeUrlDrift.test.ts"];
    const {bad} = judgeFloors(f, allExist);
    assert.ok(bad.some((b) => b.includes("하한표 항목이")));
});

test("하한을 낮추면 그 스위트를 지목해 반려한다", () => {
    const f = {...ok(), "src/lib/crossOrigin.test.ts": 1};
    const {bad} = judgeFloors(f, allExist);
    assert.ok(bad.some((b) => b.includes("하한을 낮췄습니다 1 < 18")), JSON.stringify(bad));
});

test("하한을 올리는 것은 허용한다 — zip 은 요구를 강화할 수 있다", () => {
    const {bad, effective} = judgeFloors({...ok(), "src/lib/crossOrigin.test.ts": 99}, allExist);
    assert.deepEqual(bad, []);
    assert.equal(effective["src/lib/crossOrigin.test.ts"], 99);
});

test("스위트를 더하는 것은 허용한다", () => {
    const {bad, effective} = judgeFloors({...ok(), "src/lib/extra.test.ts": 3}, allExist);
    assert.deepEqual(bad, []);
    assert.equal(effective["src/lib/extra.test.ts"], 3);
});

test("하한이 양의 정수가 아니면 반려한다", () => {
    for (const v of ["18", true, 6.5, 0, -1, null]) {
        const {bad} = judgeFloors({...ok(), "src/lib/crossOrigin.test.ts": v}, allExist);
        assert.ok(
            bad.some((b) => b.includes("양의 정수가 아닙니다")),
            `${JSON.stringify(v)} 가 통과했다`,
        );
    }
});

/**
 * 이 키는 `spawnSync("node", [..., "--test", key])` 의 argv 로 들어간다. `-` 로 시작하면 파일이
 * 아니라 **플래그**로 해석돼 그 코드가 러너를 돌리는 기계에서 실행된다.
 *
 * 통제군을 같이 둔다 — node 가 정말 그렇게 해석하는지 먼저 확인한다. 안 그러면 무엇을 막았는지
 * 모르는 시험이 된다.
 */
test("통제군 — node 는 `--import=` 를 파일이 아니라 플래그로 먹는다", () => {
    // 이 시험들이 무엇을 막는지 보이려면 위험이 실재함을 먼저 확인해야 한다.
    //
    // ⚠ 셋을 실제 호출과 맞춰야 통제군이 선다:
    //   ⑴ 돌 시험 파일이 하나는 있어야 한다 — 없으면 자식이 안 떠서 `--import` 가 발화하지 않는다.
    //   ⑵ 인자 순서가 `verify-zip` 과 같아야 한다 — 키를 **마지막 위치 인자**로 준다. 위치 인자
    //      뒤에 두면 node 가 그것을 파일로 보고 플래그로 안 먹는다.
    //   ⑶ 판정을 stdout 이 아니라 **파일 흔적**으로 한다 — 이 시험 자신이 `--test` 안에서 돌아
    //      중첩 실행에서는 자식 출력이 그대로 안 올라온다.
    //   ⑷ 상속된 `NODE_TEST_CONTEXT` 를 **지운다** — 그것이 남으면 자식 러너가 다른 모드로 돌아
    //      `--import` 이 발화하지 않고, 통제군이 "위험이 없다"고 잘못 말한다.
    const dir = mkdtempSync(join(tmpdir(), "floors-ctl-"));
    try {
        const marker = join(dir, "EVIL-RAN");
        writeFileSync(join(dir, "evil.mjs"), `import {writeFileSync as w} from "node:fs";\nw(${JSON.stringify(marker)}, "1");\n`);
        mkdirSync(join(dir, "src", "lib"), {recursive: true});
        writeFileSync(join(dir, "src", "lib", "probe.test.ts"), 'import {test} from "node:test";\ntest("t", () => {});\n');
        const env = {...process.env};
        delete env.NODE_TEST_CONTEXT;
        spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--import=./evil.mjs"], {
            cwd: dir,
            env,
            encoding: "utf8",
        });
        assert.equal(existsSync(marker), true, "node 가 그 인자를 플래그로 안 먹었다 — 이 시험의 전제가 깨졌다");
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("argv 플래그로 해석되는 키를 전부 반려한다", () => {
    const attacks = [
        "--import=./evil.mjs",
        "-r./evil.cjs",
        "--require=./evil.cjs",
        "--experimental-loader=./evil.mjs",
        "--env-file=./.env",
        "--conditions=evil",
        "-",
        "--",
    ];
    for (const k of attacks) {
        assert.equal(FLOOR_KEY_REGEX.test(k), false, `${k} 가 키 형태를 통과했다`);
        const {bad} = judgeFloors({...ok(), [k]: 1}, allExist);
        assert.ok(bad.some((b) => b.includes("키 형태 위반")), `${k} 가 판정을 통과했다`);
    }
});

test("트리 밖을 가리키는 키를 반려한다", () => {
    for (const k of [
        "src/../../etc/passwd.test.ts",
        "src/%2e%2e/x.test.ts",
        "src/lib/../../../x.test.ts",
        "/etc/x.test.ts",
        "../src/x.test.ts",
    ]) {
        assert.equal(FLOOR_KEY_REGEX.test(k), false, `${k} 가 키 형태를 통과했다`);
    }
});

test("제어문자·유니코드 혼동자를 반려한다", () => {
    for (const k of [
        "src/x.test.ts\n--import=./evil.mjs",
        "src/x.test.ts\r",
        "src/x.test.ts\0",
        "src/x.test.ts ",
        " src/x.test.ts",
        "ｓrc/x.test.ts", // 전각 s
        "src／x.test.ts", // 전각 슬래시
        "src/x.test．ts", // 전각 점
        "src/​x.test.ts", // 제로폭 공백
    ]) {
        assert.equal(FLOOR_KEY_REGEX.test(k), false, `${JSON.stringify(k)} 가 통과했다`);
    }
});

test("표가 배열이거나 `_` 뿐이면 반려한다", () => {
    assert.ok(judgeFloors([], allExist).bad.length);
    assert.ok(judgeFloors({_: "설명"}, allExist).bad.some((b) => b.includes("하한표 항목이 0개")));
});

test("요구 스위트 파일이 없으면 그 이름을 대고 반려한다", () => {
    const missing = "src/lib/safeUrlDrift.test.ts";
    const {bad} = judgeFloors(ok(), (f) => f !== missing);
    assert.ok(bad.some((b) => b.startsWith(missing) && b.includes("없습니다")), JSON.stringify(bad));
});

test("정상 키 형태는 통과한다 — 과잉 차단이 아님을 보인다", () => {
    for (const k of Object.keys(REQUIRED_FLOORS)) {
        assert.equal(FLOOR_KEY_REGEX.test(k), true, `${k} 가 거부됐다`);
    }
    for (const k of ["src/a.test.ts", "src/lib/a/b/c.test.tsx", "src/lib/safeUrlDrift.test.ts"]) {
        assert.equal(FLOOR_KEY_REGEX.test(k), true, `${k} 가 거부됐다`);
    }
});
