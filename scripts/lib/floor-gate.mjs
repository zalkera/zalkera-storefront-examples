#!/usr/bin/env node
/**
 * **가드 회귀 스위트의 하한을 시험 한 판으로 집행한다.**
 *
 * ■ 왜 이 형태인가
 *   스위트를 한 벌씩 다시 돌려 세면 그 재실행이 Test 스텝의 대부분을 먹고, 그중 상당수가 단언
 *   0건짜리 프로세스 기동이다. 직렬이라 러너를 키워도 안 줄어든다. `test:pass` 이벤트가 `file` 을
 *   실으므로 같은 값을 한 판에서 얻는다.
 *
 *   재현(이 기계 3.02초 → 1.08초):
 *     node scripts/lib/floor-gate.mjs
 *     npm test && for f in $(node -p 'Object.keys(require("./scripts/lib/test-floors.json")).filter(k=>k!=="_").join(" ")'); do node --experimental-strip-types --test -- "$f"; done
 *
 * ■ 부수 효과 — **공격면이 하나 사라진다**
 *   종전 루프는 하한표의 키를 `node` 의 argv 로 넘겼다. `-` 로 시작하는 키가 플래그로 해석되는
 *   것을 막으려고 `--` 분리와 키 형태 정규식이 심층방어로 서 있었다. 여기서는 키가 argv 에
 *   **아예 안 들어간다** — 표에서 읽어 파일 존재만 묻는다.
 *
 * ■ **`npm test` 를 부르지 않는다**
 *   `node --test` 를 직접 부른다. 그래서 검사 대상이 정한 `test` 스크립트 문자열이 안 돈다 —
 *   임의 명령 싱크가 하나 줄었다. 다만 두 글롭 밖의 시험은 이제 안 돌고, `package.json` 의
 *   `test` 가 깨져 있어도 여기서는 모른다.
 *
 * ■ 판정은 여기 없다
 *   `judgeFloors`(lib/floors.mjs)가 든다. `ci.yml` 과 `verify-zip --pack` 이 같은 것을 쓴다 —
 *   두 정본이 갈리면 어느 쪽이 참인지 알 수 없다.
 *
 * 사용: `node scripts/lib/floor-gate.mjs [트리]`
 */
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, realpathSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {childEnv} from "./childEnv.mjs";
import {judgeFloors, REQUIRED_FLOORS} from "./floors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// ⚠ **실경로로 맞춘다.** node 러너는 시험 파일을 realpath 로 보고한다. 뿌리에 심링크가 끼어 있으면
//   (`TMPDIR` 이 심링크인 박스·macOS 의 `/tmp`) `relative(root, file)` 이 전부 어긋나 **12개 스위트가
//   통째로 «통과 0건»으로 오반려**된다 — 멀쩡한 팩을 «고객 가드가 미달»이라는 틀린 사유로 막는다.
const root = realpathSync(resolve(process.argv[2] ?? "."));
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

const {bad, effective, skipped} = judgeFloors(declared, (f) => existsSync(join(root, f)));
// ⚠ **건너뛴 자리는 반드시 찍는다.** 조용히 넘어가면 「대상을 지워 가드를 끈다」가 무비용이 된다.
for (const {suite, subject} of skipped) {
    console.log(`ℹ 가드 회귀 스위트 — ${suite} 는 요구하지 않습니다: ${subject} 가 이 트리에 없습니다.`);
}
if (bad.length) {
    console.error("❌ 가드 회귀 스위트 — 하한표가 판정을 통과하지 못했습니다:");
    for (const b of bad) console.error(`   · ${b}`);
    process.exit(1);
}

// ⚠ **환경 정규화는 공용 문 하나다**(`childEnv.mjs`). 여기에 목록을 손으로 적으면 그 사본이
//   갈린다 — 이 레포가 이미 겪은 병이고, `childEnv.mjs` 가 생긴 이유가 그것이다(사본이 넷 중
//   둘만 지웠고, 빠진 `NEXT_PUBLIC_*_PREVIEW` 는 **미리보기 빌드를 상용인 줄 알고 재게** 한다).
const env = childEnv();

// ⚠ **리포터를 둘 건다.** 사람이 읽는 출력(`spec`)을 stdout 으로 그대로 흘리고, 통과 수는 파일로
//   받는다. 하나만 걸면 CI 로그에 시험 결과가 안 남아, 빨개졌을 때 **무엇이 깨졌는지** 알 수 없다.
// ⚠ **우리가 만든 디렉터리 안에** 둔다. `tmpdir()` 바로 아래 예측 가능한 이름을 쓰면 그 자리를
//   미리 심링크로 잡아 둘 수 있고, 리포터는 심링크를 따라가 대상 파일을 자른다.
//   같은 uid 공격자에게 새 권한을 주지는 않지만, 논의 자체를 없애는 편이 싸다.
const tallyDir = mkdtempSync(join(tmpdir(), "zalkera-floors-"));
const tally = join(tallyDir, "counts.tsv");
const r = spawnSync(
    "node",
    [
        "--experimental-strip-types",
        "--test",
        "--test-reporter=spec",
        "--test-reporter-destination=stdout",
        `--test-reporter=${REPORTER}`,
        `--test-reporter-destination=${tally}`,
        // ⚠ **`FLOOR_KEY_REGEX` 가 받는 확장자와 같아야 한다.** 여기가 좁으면 그 확장자로 등록한
        //    스위트는 파일이 있는데도 통과 0건이 되어 영구 미달이다 — 고치는 길이 없는 반려다.
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "scripts/**/*.test.mjs",
    ],
    {cwd: root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "inherit", "inherit"]},
);
if (r.status !== 0) {
    rmSync(tallyDir, {recursive: true, force: true});
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
    rmSync(tallyDir, {recursive: true, force: true});
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

// ⚠ **표 밖의 스위트를 남기지 않는다.** 표에 없으면 하한이 없고, 하한이 없으면 그 스위트는
//   **조용히 지울 수 있다.** 팩 관문·팩 매니페스트처럼 배송을 막는 판정을 재는 것이 그 상태로
//   있으면, 지우는 것이 고치는 것보다 싸진다.
//
//   재현: `cp scripts/lib/floors.test.mjs scripts/lib/stray.test.mjs; node scripts/lib/floor-gate.mjs;
//         echo rc=$?; rm scripts/lib/stray.test.mjs` → rc=1
//
//   대상은 «통과를 낸 파일»이다. 통과 0건짜리 빈 스위트는 이 그물 밖이다 — 그것은 애초에
//   가드가 아니고, 트리를 따로 훑으면 러너의 글롭 의미를 두 벌로 흉내 내게 된다.
// ⚠ **걷어낸 스위트는 «표 밖»이 아니다.** 지킬 대상이 없어 요구에서 뺀 것이고(위 ℹ 줄),
//    트리에는 파일이 남아 있어 러너가 세고 온다. 그것을 「모르는 스위트」로 세면 완화가
//    곧 반려가 된다 — 의도적 면제와 미지를 갈라야 한다.
const skippedSuites = new Set(skipped.map((s) => s.suite));
const unlisted = [...counted.keys()].filter((f) => !(f in effective) && !skippedSuites.has(f));
if (unlisted.length) {
    console.error("❌ 가드 회귀 스위트 — 하한표 밖의 스위트가 있습니다:");
    for (const f of unlisted.sort()) console.error(`   · ${f}`);
    console.error("\n   표에 없으면 하한이 없고, 하한이 없으면 그 스위트는 조용히 지울 수 있습니다.");
    console.error("   scripts/lib/floors.mjs 의 REQUIRED_FLOORS 와 scripts/lib/test-floors.json 에 적으십시오.");
    process.exit(1);
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
