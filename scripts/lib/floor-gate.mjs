#!/usr/bin/env node
/**
 * **가드 회귀 스위트의 하한을 `npm test` 한 번으로 집행한다.**
 *
 * ■ 왜 이 형태인가
 *   종전엔 `npm test` 뒤에 스위트를 **한 벌씩 다시** 돌려 통과 수를 셌다. 그 재실행이 Test 스텝의
 *   73%였고 그중 절반 이상이 단언 0건짜리 프로세스 기동이었다(빈 `.ts` 자식 104ms · `.mjs` 77ms).
 *   직렬이라 러너를 키워도 안 줄어든다. `test:pass` 이벤트의 `file` 로 같은 값을 한 번에 얻는다.
 *
 * ■ 부수 효과 — **공격면이 하나 사라진다**
 *   종전 루프는 하한표의 키를 `node` 의 argv 로 넘겼다. `-` 로 시작하는 키가 플래그로 해석되는
 *   것을 막으려고 `--` 분리와 키 형태 정규식이 심층방어로 서 있었다. 여기서는 키가 argv 에
 *   **아예 안 들어간다** — 표에서 읽어 파일 존재만 묻는다.
 *
 * ■ 판정은 여기 없다
 *   `judgeFloors`(lib/floors.mjs)가 든다. `ci.yml` 과 `verify-zip --pack` 이 같은 것을 쓴다 —
 *   두 정본이 갈리면 어느 쪽이 참인지 알 수 없다.
 *
 * 사용: `node scripts/lib/floor-gate.mjs [트리]`
 */
import {spawnSync} from "node:child_process";
import {existsSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {judgeFloors, REQUIRED_FLOORS} from "./floors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? ".");
const REPORTER = join(HERE, "floor-reporter.mjs");

/** zip 이 든 표. 못 읽으면 `null` — 요구치는 그래도 산다. */
let declared = null;
const tablePath = join(root, "scripts", "lib", "test-floors.json");
try {
    declared = JSON.parse(readFileSync(tablePath, "utf8"));
} catch (e) {
    // ⚠ **부재도 반려다.** 종전 러너는 이것을 "읽지 못한 자리"로 잡았는데, 없으면 넘어가게 두면
    //   **파일 하나를 지우는 것이 게이트를 끄는 가장 쉬운 길**이 된다(가드를 지우는 것이 고치는
    //   것보다 쉬우면 안 된다). 요구치는 `REQUIRED_FLOORS` 가 들고 있으므로 판정은 그대로 선다.
    console.error(`❌ 하한표를 못 읽었습니다 — ${tablePath} [${e.code ?? "PARSE"}]`);
    console.error(`   요구 스위트 ${Object.keys(REQUIRED_FLOORS).length}개의 하한을 잴 수 없습니다(통과가 아닙니다).`);
    process.exit(e.code === "ENOENT" ? 1 : 2);
}

const {bad, effective} = judgeFloors(declared, (f) => existsSync(join(root, f)));
if (bad.length) {
    console.error("❌ 가드 회귀 스위트 — 하한표가 판정을 통과하지 못했습니다:");
    for (const b of bad) console.error(`   · ${b}`);
    process.exit(1);
}

// ⚠ **환경을 정규화한다.** `NODE_TEST_CONTEXT` 가 남으면 자식 러너가 다른 모드로 돌고,
//   `NODE_OPTIONS` 는 자식의 의미를 바꾼다. 값이 아니라 **뜻**이 달라지는 변수들이다.
const env = {...process.env};
for (const k of ["NODE_TEST_CONTEXT", "NODE_OPTIONS"]) delete env[k];

// ⚠ **리포터를 둘 건다.** 사람이 읽는 출력(`spec`)을 stdout 으로 그대로 흘리고, 통과 수는 파일로
//   받는다. 하나만 걸면 CI 로그에 시험 결과가 안 남아, 빨개졌을 때 **무엇이 깨졌는지** 알 수 없다.
const tally = join(tmpdir(), `zalkera-floors-${process.pid}.tsv`);
const r = spawnSync(
    "node",
    [
        "--experimental-strip-types",
        "--test",
        "--test-reporter=spec",
        "--test-reporter-destination=stdout",
        `--test-reporter=${REPORTER}`,
        `--test-reporter-destination=${tally}`,
        "src/**/*.test.ts",
        "scripts/**/*.test.mjs",
    ],
    {cwd: root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "inherit", "inherit"]},
);
if (r.status !== 0) {
    rmSync(tally, {force: true});
    console.error("❌ 가드 회귀 스위트 — 시험이 실패했습니다(하한을 재기 전입니다).");
    process.exit(1);
}

let tsv = "";
try {
    tsv = readFileSync(tally, "utf8");
} catch (e) {
    console.error(`❌ 가드 회귀 스위트 — 통과 수 집계를 못 읽었습니다 [${e.code ?? "UNKNOWN"}](통과가 아닙니다).`);
    process.exit(2);
} finally {
    rmSync(tally, {force: true});
}

/** 리포터 출력(TSV) → 트리 상대경로별 통과 수. */
const counted = new Map();
for (const line of tsv.split("\n")) {
    if (!line.includes("\t")) continue;
    const [file, n] = line.split("\t");
    counted.set(relative(root, file), Number(n));
}
// ⚠ **리포터가 아무것도 못 냈으면 통과가 아니다.** 글롭이 안 물거나 러너 형식이 바뀌면
//   빈 출력이 나오고, 그것을 "위반 0" 으로 읽으면 게이트가 조용히 꺼진다.
if (counted.size === 0) {
    console.error("❌ 가드 회귀 스위트 — 통과 수를 한 건도 못 읽었습니다(통과가 아닙니다).");
    process.exit(2);
}

const short = [];
for (const [f, min] of Object.entries(effective)) {
    const got = counted.get(f) ?? 0;
    if (got < min) short.push(`${f} — 통과 ${got}건(하한 ${min})`);
}
if (short.length) {
    console.error("❌ 가드 회귀 스위트 — 하한 미달:");
    for (const s of short) console.error(`   · ${s}`);
    console.error("\n   이 스위트들이 그 가드가 옳은지 재는 유일한 자리입니다.");
    process.exit(1);
}

console.log(`✅ 가드 회귀 스위트 — 스위트별 하한 통과(${Object.keys(effective).length}개)`);
