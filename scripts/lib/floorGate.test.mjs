/**
 * **하한 게이트의 «집행»을 문다.**
 *
 * ■ 왜 따로 있나
 *   `floors.test.mjs` 는 `judgeFloors` — **판정**을 전수로 잰다. 그 판정을 읽고 종료 코드로
 *   바꾸는 자리는 `floor-gate.mjs` 안에 있다. 판정은 단단한데 그 판정을 **집행하는 배선**이
 *   사각이었다. 이 파일이 그 자리를 문다:
 *   재현(⚠ `git checkout` 으로 되돌리지 마라 — 미커밋 작업을 지운다):
 *     `cp scripts/lib/floor-gate.mjs /tmp/fg.bak;
 *      sed -i 's/if (short.length)/if (false)/' scripts/lib/floor-gate.mjs;
 *      node --test scripts/lib/floorGate.test.mjs; echo rc=$?;
 *      cp /tmp/fg.bak scripts/lib/floor-gate.mjs` → rc=1
 *
 * ■ 왜 합성 트리인가
 *   게이트는 대상 트리에서 `node --test` 를 돌린다. 이 레포를 대상으로 부르면 이 파일이 다시
 *   게이트를 부르는 **재귀**가 된다. 그래서 요구 스위트의 **이름만 같은** 최소 트리를 만들고
 *   그 안에서 돌린다 — 게이트가 보는 것은 파일 이름과 통과 수뿐이라 판정이 그대로 선다.
 *
 * 사용: `node --test scripts/lib/floorGate.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {REQUIRED_FLOORS} from "./floors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "floor-gate.mjs");
const made = [];

/** 만든 트리를 전부 지운다 — 가드를 재는 시험이 디스크를 남기면 안 된다. */
process.on("exit", () => {
    for (const dir of made.splice(0)) rmSync(dir, {recursive: true, force: true});
});

/** 통과 `n` 건짜리 시험 파일 본문. 단언은 뜻이 없다 — 게이트가 세는 것은 통과 수뿐이다. */
function suite(n) {
    return (
        'import {test} from "node:test";\n' +
        Array.from({length: n}, (_, i) => `test(${JSON.stringify(`t${i}`)}, () => {});`).join("\n") +
        "\n"
    );
}

/**
 * 요구 스위트가 전부 있고 하한을 정확히 채우는 트리.
 *
 * @param patch `{counts, table, omit}` — 통과 수 덮어쓰기 · 표 덮어쓰기(`null` 이면 안 씀) · 뺄 파일
 */
function tree(patch = {}) {
    const root = mkdtempSync(join(tmpdir(), "zalkera-floorgate-"));
    made.push(root);
    for (const [file, min] of Object.entries(REQUIRED_FLOORS)) {
        if (patch.omit?.includes(file)) continue;
        const full = join(root, file);
        mkdirSync(dirname(full), {recursive: true});
        writeFileSync(full, suite(patch.counts?.[file] ?? min));
    }
    if (patch.table !== null) {
        const tablePath = join(root, "scripts", "lib", "test-floors.json");
        mkdirSync(dirname(tablePath), {recursive: true});
        writeFileSync(tablePath, patch.table ?? JSON.stringify(REQUIRED_FLOORS, null, 2));
    }
    return root;
}

function runGate(root) {
    // `NODE_OPTIONS` 를 비운다 — 부모가 켠 값이 자식 러너의 뜻을 바꾼다.
    const env = {...process.env};
    delete env.NODE_OPTIONS;
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [GATE, root], {encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024});
    return {rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
}

test("양성 통제군 — 하한을 채운 트리는 통과한다", () => {
    // 이것이 없으면 「무엇을 넣어도 반려」 구현으로도 아래 전부가 초록이 된다.
    const {rc, out} = runGate(tree());
    assert.equal(rc, 0, out.slice(-600));
    assert.match(out, /스위트별 하한 통과/);
});

test("한 스위트가 하한에 모자라면 반려한다", () => {
    const file = "scripts/lib/floors.test.mjs";
    const {rc, out} = runGate(tree({counts: {[file]: REQUIRED_FLOORS[file] - 1}}));
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /하한 미달/);
    assert.match(out, /floors\.test\.mjs/);
});

test("요구 스위트를 지우면 반려한다 — 지우는 것이 고치는 것보다 쉬우면 안 된다", () => {
    const {rc, out} = runGate(tree({omit: ["scripts/lib/gateProbe.test.mjs"]}));
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /gateProbe\.test\.mjs 가 없습니다/);
});

test("하한표가 없으면 반려한다 — 파일 하나 지우기가 게이트를 끄는 길이 되면 안 된다", () => {
    const {rc, out} = runGate(tree({table: null}));
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /하한표를 못 읽었습니다/);
});

test("하한표가 깨진 JSON 이면 «검사 불능»으로 선다", () => {
    const {rc, out} = runGate(tree({table: "{ 이건 JSON 이 아니다"}));
    assert.equal(rc, 2, out.slice(-600));
    assert.match(out, /하한표를 못 읽었습니다/);
});

test("하한표를 null 로 덮어도 반려한다", () => {
    // 표를 지우는 대신 **비우는** 길. 실질 하한은 REQUIRED_FLOORS 가 계속 들지만, 표가 판정을
    // 통과했다고 말하면 그것이 거짓이 된다.
    const {rc, out} = runGate(tree({table: "null"}));
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /하한표가 객체가 아닙니다/);
});

test("하한을 낮춘 표는 반려한다", () => {
    const lowered = {...REQUIRED_FLOORS, "scripts/lib/floors.test.mjs": 1};
    const {rc, out} = runGate(tree({table: JSON.stringify(lowered)}));
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /하한을 낮췄습니다/);
});

test("시험이 실패하면 하한을 재기 전에 선다", () => {
    const root = tree();
    writeFileSync(
        join(root, "scripts/lib/vendorSet.test.mjs"),
        'import {test} from "node:test";\ntest("깨진다", () => { throw new Error("실패"); });\n',
    );
    const {rc, out} = runGate(root);
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /시험이 실패했습니다/);
});

test("통과 수를 한 건도 못 읽으면 «통과 0» 이 아니라 «검사 불능»이다", () => {
    // 글롭이 안 물거나 러너 형식이 바뀌면 빈 출력이 나온다. 그것을 «위반 0» 으로 읽으면 게이트가
    // 조용히 꺼진다 — 초록인데 아무것도 안 잰 상태다.
    const counts = Object.fromEntries(Object.keys(REQUIRED_FLOORS).map((f) => [f, 0]));
    const {rc, out} = runGate(tree({counts}));
    assert.equal(rc, 2, out.slice(-600));
    assert.match(out, /한 건도 못 읽었습니다/);
});

test("하한표 밖의 스위트가 있으면 반려한다 — 하한이 없으면 조용히 지울 수 있다", () => {
    // 표에 없으면 하한이 없다. 팩 관문·팩 매니페스트처럼 배송을 막는 판정을 재는 스위트가
    // 그 상태로 있으면, 지우는 것이 고치는 것보다 싸진다.
    const root = tree();
    const stray = join(root, "scripts", "lib", "stray.test.mjs");
    writeFileSync(stray, suite(3));
    const {rc, out} = runGate(root);
    assert.equal(rc, 1, out.slice(-600));
    assert.match(out, /하한표 밖의 스위트/);
    assert.match(out, /stray\.test\.mjs/);
});

test("표 밖 금지가 정상 트리를 막지 않는다", () => {
    // 이 통제군이 없으면 「무엇이든 반려」로도 위 시험이 초록이 된다.
    const {rc} = runGate(tree());
    assert.equal(rc, 0);
});
