/**
 * 하한 판정의 변이 시험. **이 파일이 그 판정의 계약이다.**
 *
 * 여기 있는 각 시험은 실제로 게이트를 뚫었거나 뚫을 수 있는 형태다. 손으로 한 번 확인하고 버리면
 * 다음 판에서 같은 자리가 다시 열리므로, 확인을 여기 남긴다.
 *
 * 사용: `node --test scripts/lib/floors.test.mjs`
 */
import {describe, test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {judgeFloors, REQUIRED_FLOORS, REPO_ONLY_FLOORS, FLOOR_KEY_REGEX, isCanonicalRepo} from "./floors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 요구 스위트가 전부 있는 트리.
 *
 * ⚠ 무엇이든 있다고 답하므로 `presets`·`scripts/pack-preset.mjs` 도 참이 되고, 그래서 **정본 저장소**로
 * 판정된다 — 그러면 요구가 `REPO_ONLY_FLOORS` 까지 늘어난다. 그 사실을 모르고 쓰면 「표를
 * 비우면 반려한다」 같은 시험이 엉뚱한 사유로 초록이 된다.
 */
const allExist = () => true;
/** 팩 트리(정본이 아닌 트리). 요구는 [REQUIRED_FLOORS] 뿐이다. */
const packTree = (f) => f !== "presets" && f !== "scripts/pack-preset.mjs";
/** 정상 표 — 정본 저장소의 요구치와 같다. */
const ok = () => ({...REQUIRED_FLOORS, ...REPO_ONLY_FLOORS});
/** 정본 저장소가 요구하는 스위트 수. */
const wantAll = Object.keys(REQUIRED_FLOORS).length + Object.keys(REPO_ONLY_FLOORS).length;

test("정상 표는 통과하고 요구 스위트를 전부 집행한다", () => {
    const {bad, effective} = judgeFloors(ok(), allExist);
    assert.deepEqual(bad, []);
    assert.equal(Object.keys(effective).length, wantAll);
});

test("표를 비우면 반려한다 — 집행은 살지만 비우기는 게이트를 끄려는 시도다", () => {
    const {bad, effective} = judgeFloors({}, allExist);
    assert.ok(
        bad.some((b) => b.includes("하한표 항목이 0개")),
        `비운 표가 통과했다: ${JSON.stringify(bad)}`,
    );
    // 요구치는 살아 있어야 한다 — 비워도 집행이 0 이 되면 안 된다.
    assert.equal(Object.keys(effective).length, wantAll);
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

/**
 * **하한 집계가 «실행된 시험»만 세는가.**
 *
 * ⚠ node 러너는 **skip·todo 된 시험에도 `test:pass` 를 보낸다.** 그것을 세면 `test(` 를
 * `test.skip(` 으로 바꾸는 한 글자 편집만으로 가드 스위트를 통째로 재우고도 하한을 통과한다 —
 * 시험 본문은 그대로 남아 있어 코드 리뷰에서도 눈에 안 띈다. 하한이 세는 대상이 「실행된 단언」이
 * 아니라 「등록된 이름」이 되는 자리다.
 *
 * 종전 오라클(`# pass N`)은 skip 을 안 셌으므로, 이 성질은 **잃으면 안 되는 것**이다.
 */
describe("하한 집계는 실행된 시험만 센다", () => {
    const REPORTER = fileURLToPath(new URL("./floor-reporter.mjs", import.meta.url));

    /** 픽스처를 만들어 ⑴ 종전 오라클과 ⑵ 이 리포터로 각각 잰다. */
    function measure(body) {
        const dir = mkdtempSync(join(tmpdir(), "zalkera-floor-fx-"));
        const file = join(dir, "fixture.test.mjs");
        // ⚠ **환경을 정규화한다.** 이 시험 자신이 node 러너 안에서 도므로 `NODE_TEST_CONTEXT` 가
        //   상속되고, 그러면 자식이 다른 모드로 돌아 요약도 리포터 출력도 안 나온다(둘 다 0 이 된다).
        const env = {...process.env};
        for (const k of ["NODE_TEST_CONTEXT", "NODE_OPTIONS"]) delete env[k];
        try {
            writeFileSync(file, body, "utf8");
            const old = spawnSync(process.execPath, ["--test", "--", file], {encoding: "utf8", env, cwd: dir});
            const legacy = Number(`${old.stdout ?? ""}`.match(/^# pass (\d+)$/m)?.[1] ?? -1);
            // ⚠ **글롭으로 부른다 — 게이트의 실제 호출 형상이다.** 파일을 절대경로로 직접 넘기면
            //   node 가 `name` 도 절대경로로 실어, 「빈 파일은 자기 이름으로 통과 1건을 낸다」를
            //   거르는 판정이 **시험에서만** 우연히 걸린다. 그러면 실제로는 안 걸리는 필터가 초록이 된다.
            const now = spawnSync(process.execPath, ["--test", `--test-reporter=${REPORTER}`, "*.test.mjs"], {
                encoding: "utf8",
                env,
                cwd: dir,
            });
            const line = `${now.stdout ?? ""}`.split("\n").find((l) => l.includes("\t"));
            return {legacy, counted: line ? Number(line.split("\t")[1]) : 0};
        } finally {
            rmSync(dir, {recursive: true, force: true});
        }
    }

    test("skip 한 시험은 안 센다 — 종전 오라클과 같은 값", () => {
        const {legacy, counted} = measure(
            'import {test} from "node:test";\n' +
                'test("도는 것", () => {});\n' +
                'test("재운 것", {skip: true}, () => {});\n' +
                'test("이유 있는 skip", (t) => { t.skip("나중에"); });\n',
        );
        assert.equal(counted, 1, `skip 을 셌다(종전 오라클은 ${legacy})`);
        assert.equal(counted, legacy, "종전 오라클과 값이 갈렸다");
    });

    test("todo 한 시험도 안 센다", () => {
        const {legacy, counted} = measure(
            'import {test} from "node:test";\n' +
                'test("도는 것", () => {});\n' +
                'test("할 일", {todo: true}, () => {});\n',
        );
        assert.equal(counted, 1);
        assert.equal(counted, legacy);
    });

    test("중첩 describe 안의 시험은 센다 — 정상 리팩터가 CI 를 세우면 안 된다", () => {
        const {legacy, counted} = measure(
            'import {describe, test} from "node:test";\n' +
                'test("최상위", () => {});\n' +
                'describe("묶음", () => { test("a", () => {}); test("b", () => {}); });\n',
        );
        assert.equal(counted, 3, "묶음 자신을 세거나 중첩을 빠뜨렸다");
        assert.equal(counted, legacy);
    });

    test("시험이 없는 파일은 0 — 종전 오라클보다 엄하다", () => {
        // 종전 `# pass` 는 파일 자신을 1건으로 셌다. 하한 1 짜리 스위트는 빈 파일로 갈아치워도 통과했다.
        const {legacy, counted} = measure('import {test} from "node:test";\n');
        assert.equal(counted, 0);
        assert.equal(legacy, 1, "종전 오라클이 빈 파일을 0 으로 세기 시작했다면 이 시험의 전제가 바뀐 것이다");
    });
});

test("팩 트리에서는 정본 전용 스위트를 요구하지 않는다 — 요구하면 멀쩡한 팩이 막힌다", () => {
    // 팩에 안 실리는 것을 공통 요구로 올리면 「가드 미달」이라는 **틀린 사유**로 배송이 멈춘다.
    // 그 사유는 고객에게 「당신 소스에 가드가 없다」로 읽힌다.
    const {bad} = judgeFloors({...REQUIRED_FLOORS}, packTree);
    assert.deepEqual(bad, [], `팩 트리가 반려됐다: ${JSON.stringify(bad)}`);
});

test("팩 트리에서도 실리는 스위트는 그대로 요구한다", () => {
    const missing = (f) => packTree(f) && f !== "src/lib/crossOrigin.test.ts";
    const {bad} = judgeFloors({...REQUIRED_FLOORS}, missing);
    assert.ok(
        bad.some((b) => b.includes("crossOrigin.test.ts 가 없습니다")),
        `팩에 실리는 가드가 사라졌는데 통과했다: ${JSON.stringify(bad)}`,
    );
});

test("정본 저장소에서는 정본 전용 스위트도 요구한다 — 안 하면 조용히 지울 수 있다", () => {
    const missing = (f) => f !== "scripts/lib/packGate.test.mjs";
    const {bad} = judgeFloors(ok(), missing);
    assert.ok(
        bad.some((b) => b.includes("packGate.test.mjs 가 없습니다")),
        `정본에서 팩 관문 시험이 사라졌는데 통과했다: ${JSON.stringify(bad)}`,
    );
});

test("판별자는 둘 다 있어야 참이다 — 폴더 이름 하나로 고객 트리가 정본이 되면 안 된다", () => {
    // 고객이 `presets/` 를 만드는 것만으로 참이 되면, 그 트리에 없는 스위트를 요구해 고객 CI 가
    // 영구 적색이 된다. 그 사이 그 사이트는 「말로 고치기」가 구조적으로 막힌다.
    assert.equal(isCanonicalRepo(() => true), true);
    assert.equal(isCanonicalRepo((f) => f === "presets"), false);
    assert.equal(isCanonicalRepo((f) => f === "scripts/pack-preset.mjs"), false);
    assert.equal(isCanonicalRepo(() => false), false);
});

test("두 표는 겹치지 않는다 — 겹치면 어느 쪽 하한이 참인지 알 수 없다", () => {
    const both = Object.keys(REQUIRED_FLOORS).filter((f) => f in REPO_ONLY_FLOORS);
    assert.deepEqual(both, []);
});

test("이름 안의 점을 받는다 — 거부하면 고객이 막다른 길에 갇힌다", () => {
    // 표에 안 적으면 「하한표 밖」, 적으면 「키 형태 위반」 — 양쪽 다 반려인데 오류 문면은
    // 「표에 적으라」고만 한다. 시키는 대로 해도 안 풀린다.
    for (const k of [
        "src/lib/foo.bar.test.ts",
        "src/a/b/c.d.test.ts",
        "src/lib/a.test.tsx",
        "scripts/lib/a.b.test.mjs",
    ]) {
        assert.equal(FLOOR_KEY_REGEX.test(k), true, `${k} 가 거부됐다`);
    }
});

test("점을 받아도 경로 이탈·플래그는 여전히 막는다", () => {
    for (const k of [
        "../x.test.ts",
        "src/../etc/x.test.ts",
        "src/lib/../../x.test.ts",
        "src/.hidden/x.test.ts",
        "src/-flag/x.test.ts",
        "src/lib/..test.ts",
        "-src/lib/x.test.ts",
        "src/lib/x.test.js",
        "etc/x.test.ts",
    ]) {
        assert.equal(FLOOR_KEY_REGEX.test(k), false, `${k} 가 통과했다`);
    }
});

test("키 형태가 받는 확장자를 러너의 글롭이 전부 돈다", () => {
    // 글롭이 좁으면 그 확장자로 등록한 스위트는 파일이 있는데도 통과 0건 — 고치는 길이 없는
    // 영구 미달이다.
    const gate = readFileSync(join(HERE, "floor-gate.mjs"), "utf8");
    for (const ext of ["ts", "tsx"]) {
        assert.ok(
            gate.includes(`"src/**/*.test.${ext}"`),
            `키 형태는 .${ext} 를 받는데 러너 글롭에 없다`,
        );
    }
    assert.ok(gate.includes('"scripts/**/*.test.mjs"'), "scripts 글롭이 없다");
});
