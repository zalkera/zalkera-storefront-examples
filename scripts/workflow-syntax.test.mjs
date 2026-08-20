/**
 * **워크플로 검사 — 판정은 픽스처로, 집행은 트리로.**
 *
 * ■ 통제군이 트리를 물면 안 된다
 *   종전 통제군은 「`client-upgrade.yml` 이 트리에 있는가」였다. 그 파일은 **고객 소유**이고
 *   지우는 것이 정상적인 선택인데(그 워크플로는 레포 쓰기 권한을 갖는다), 지우면 고객의
 *   `npm test` 가 빨개지고 `floor-gate` 까지 죽어 **배포가 막혔다.** 거짓 양성은 고객의 배포를
 *   무환불로 막고, 거짓 음성은 우리가 못 잡을 뿐이다 — 이 레포가 `visitor-ip-parity` 를 배송에서
 *   뺀 근거와 같다.
 *
 * ■ 그래서 통제군은 검출기를 문다
 *   픽스처에 결함을 심어 「검출기가 실제로 잡는가」를 재고, 트리에 대해서는 「걸리는 것이
 *   없는가」만 본다. 그러면 고객이 워크플로를 어떻게 두든 판별력이 안 죽는다.
 *
 * 재현: `node --experimental-strip-types --test scripts/workflow-syntax.test.mjs`
 */
import {deepStrictEqual, ok, strictEqual} from "node:assert/strict";
import * as fsMod from "node:fs";
import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {
    EXPR_OPEN,
    emptyExpressions,
    listWorkflowFiles,
    readWorkflow,
    runInjections,
    runRanges,
    unreadableRun,
} from "./lib/workflow-syntax.mjs";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), ".github", "workflows");

/** 이 트리의 워크플로. 못 본 것이 있으면 큰 소리로 남긴다 — 조용한 건너뛰기가 구멍이다. */
function scanned() {
    const {files, skipped} = listWorkflowFiles(DIR, fsMod);
    for (const s of skipped) {
        console.error(`[workflow-syntax] 건너뜀: ${s.name} — ${s.why}`);
    }
    return files;
}

const O = EXPR_OPEN;

test("통제군 — 빈 식을 잡는다. 이것 하나면 워크플로가 기동조차 못 한다", () => {
    // 실제 사고 형상: `run: |` 블록 안 「주석」에 식을 글자 그대로 적었다. 블록 안에서는 `#` 이
    // 주석이 아니라 본문이라 GitHub 이 그것을 식으로 읽는다.
    const src = `jobs:\n  j:\n    steps:\n      - run: |\n          # ${O} }} 는 이렇게 쓰지 마라\n          echo hi\n`;
    const hits = emptyExpressions(src);
    strictEqual(hits.length, 1, "빈 식을 못 잡았다");
    strictEqual(hits[0].why, "본문 없음");

    strictEqual(emptyExpressions(`x: "${O} github.sha "`).length, 1, "안 닫힌 식을 못 잡았다");
    strictEqual(emptyExpressions(`x: "${O} github.sha }}"`).length, 0, "정상 식을 잡았다(오탐)");
});

test("통제군 — `run:` 안 보간을 잡는다. 블록도 한 줄도", () => {
    const block = `steps:\n  - run: |\n      git push origin HEAD:"${O} github.ref_name }}"\n`;
    strictEqual(runInjections(block).length, 1, "블록 스칼라를 못 잡았다");

    // 가장 흔한 작성 형태다. 블록만 보는 판정은 이 자리를 통째로 놓친다.
    const inline = `steps:\n  - run: echo "${O} github.head_ref }}"\n`;
    strictEqual(runInjections(inline).length, 1, "한 줄 run 을 못 잡았다");

    // 한 줄에 식이 둘이고 위험한 쪽이 뒤에 있다 — 첫 매치만 보면 놓친다.
    const second = `steps:\n  - run: echo "${O} github.sha }} ${O} github.head_ref }}"\n`;
    strictEqual(runInjections(second).length, 1, "줄의 두 번째 식을 못 잡았다");

    // 들여쓰기 지시자와 지시자 뒤 주석도 YAML 은 블록으로 읽는다.
    const indicator = `steps:\n  - run: |2 # 주석\n      echo "${O} github.ref }}"\n`;
    strictEqual(runInjections(indicator).length, 1, "`|2` 를 블록으로 못 읽었다");
});

test("통제군 — `env:` 를 거쳐 다시 꺼내는 자리를 잡는다", () => {
    // 옮기는 것은 처방이다. 위험한 것은 `run:` 안에서 식으로 **다시 꺼내는** 쪽이다.
    const relaunder = `jobs:\n  j:\n    env:\n      TITLE: ${O} github.event.issue.title }}\n    steps:\n      - run: echo "${O} env.TITLE }}"\n`;
    const hits = runInjections(relaunder);
    strictEqual(hits.length, 1, "세탁된 값을 다시 꺼내는 자리를 못 잡았다");
    strictEqual(hits[0].where, "env");
});

test("음성 통제군 — `env:` 로 옮기고 셸 변수로 읽는 것이 정석이다. 이것을 막으면 안 된다", () => {
    // 이 레포의 실제 처방이다. 여기서 걸리면 고칠 방법이 없다(실제로 한 번 걸렸다).
    const safe = `steps:\n  - name: push\n    env:\n      REF: "${O} github.ref_name }}"\n    run: |\n      git push origin "HEAD:$REF"\n`;
    strictEqual(runInjections(safe).length, 0, "정석 처방을 막았다");

    // 오염되지 않은 env 를 꺼내는 것도 막지 않는다.
    const clean = `jobs:\n  j:\n    env:\n      NAME: hello\n    steps:\n      - run: echo "${O} env.NAME }}"\n`;
    strictEqual(runInjections(clean).length, 0, "멀쩡한 env 를 막았다");
});

test("음성 통제군 — 정상 워크플로를 막지 않는다. 거짓 실패가 고객 배포를 막는다", () => {
    const fine = [
        `steps:\n  - run: echo "${O} matrix.platform }}"\n`,
        `steps:\n  - run: echo "${O} needs.build.outputs.sha }}"\n`,
        `steps:\n  - run: echo "${O} github.sha }} ${O} github.repository }}"\n`,
        `steps:\n  - run: npm ci\n`,
        `steps:\n  - uses: actions/checkout@v4\n    with:\n      ref: "${O} github.ref_name }}"\n`,
        `steps:\n  - run: echo "${O} fromJSON('{"a":1}').a }}"\n`,
    ];
    for (const src of fine) {
        strictEqual(runInjections(src).length, 0, `거짓 실패: ${src.trim()}`);
        strictEqual(emptyExpressions(src).length, 0, `거짓 실패(빈 식): ${src.trim()}`);
    }
    // `with:` 는 셸이 아니다 — 인자로 넘어가므로 `$( )` 가 평가되지 않는다. 여기서 막으면
    // 우리 `checkout` 자신이 걸리고, 고객은 그것을 고칠 방법이 없다.
});

test("트리 — 여기 있는 워크플로에 걸리는 것이 없다", () => {
    // 고객이 워크플로를 지웠든 자기 것으로 갈았든 **없으면 잴 것이 없다.** 위 통제군이 검출기의
    // 판별력을 이미 증명했으므로, 여기서 트리의 모양을 요구하지 않는다.
    for (const name of scanned()) {
        const src = readWorkflow(DIR, name, fsMod);
        if (src === null) {
            // ⚠ 조용히 넘기면 그 자리는 아무도 안 본 채 초록이 된다. 실패시키지는 않되 말한다.
            console.error(`[workflow-syntax] 건너뜀: ${name} — 읽지 못했습니다(권한 등)`);
            continue;
        }
        const empty = emptyExpressions(src);
        ok(
            empty.length === 0,
            `${name}: 빈 식 — GitHub 이 「An expression was expected」로 파일 전체를 거부하고 ` +
                `워크플로가 기동하지 않는다. 자리: ${empty.map((e) => `${e.line}행(${e.why})`).join(", ")}`,
        );
        const inj = runInjections(src);
        ok(
            inj.length === 0,
            `${name}: 사람이 이름을 정할 수 있는 값이 셸로 간다 — 스텝 \`env:\` 로 넘기고 셸에서는 ` +
                `변수로 읽을 것. 자리: ${inj.map((h) => `${h.line}행 ${h.expr}`).join(", ")}`,
        );
    }
});

test("블록 뒤에 오는 같은 스텝의 키를 본문으로 삼키지 않는다", () => {
    // 블록의 끝을 **헤더 줄의 들여쓰기**로 재면, `- run: |` 에서 그 값이 대시 열이라 뒤따르는
    // `env:`·`if:`·`name:` 이 전부 본문이 된다. 그러면 GitHub 이 권하는 처방과 가장 흔한 조건문이
    // 「셸 주입」으로 보고되고, 고객은 오류문대로 이미 했는데도 고칠 수가 없다.
    const after = (tail) => `jobs:\n  j:\n    steps:\n      - run: |\n          npm ci\n        ${tail}\n`;
    strictEqual(runInjections(after(`env:\n          TITLE: ${O} github.event.head_commit.message }}`)).length, 0, "env 를 삼켰다");
    strictEqual(runInjections(after(`if: ${O} github.ref == 'refs/heads/main' }}`)).length, 0, "if 를 삼켰다");
    strictEqual(runInjections(after(`name: ${O} github.ref_name }}`)).length, 0, "name 을 삼켰다");
});

test("지시자와 chomp 는 어느 순서로도 온다", () => {
    // `|2-` 를 못 읽으면 그 안의 진짜 주입을 통째로 놓친다.
    for (const head of ["|2-", "|-2", "|2", "|-", ">-"]) {
        const src = `steps:\n  - run: ${head}\n      echo "${O} github.head_ref }}"\n`;
        strictEqual(runInjections(src).length, 1, `${head} 를 블록으로 못 읽었다`);
    }
});

test("오염 이름은 `env:` 매핑 아래에서만 모은다", () => {
    // `with: ref: <식>` 은 셸이 아니라 인자다. 그것이 `ref` 를 오염시키면 딴 곳의 멀쩡한
    // `env.ref` 가 걸린다 — 고객이 고칠 방법이 없는 거짓 실패다.
    const src =
        `jobs:\n  j:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: "${O} github.head_ref }}"\n` +
        `      - run: echo "${O} env.ref }}"\n`;
    strictEqual(runInjections(src).length, 0, "with: 의 인자가 이름을 오염시켰다");
});

test("목록이 못 보는 것을 조용히 넘기지 않는다", () => {
    // 이 판정이 시험 밖에 있으면 무력화해도 전건 초록이 된다 — 그래서 여기서 문다.
    // 이름이 `*.yml` 인 디렉터리나 못 읽는 파일이 있으면 그 자리는 아무도 안 본 채 초록이 된다.
    const root = mkdtempSync(join(tmpdir(), "zalkera-wf-"));
    try {
        writeFileSync(join(root, "a.yml"), "name: a\n");
        writeFileSync(join(root, "b.txt"), "무관");
        mkdirSync(join(root, "c.yml"));
        symlinkSync(join(root, "a.yml"), join(root, "d.yml"));

        const {files, skipped} = listWorkflowFiles(root, fsMod);
        deepStrictEqual(files, ["a.yml"], "일반 파일만 남아야 한다");
        deepStrictEqual(
            skipped.map((s) => s.name).sort(),
            ["c.yml", "d.yml"],
            "건너뛴 것을 안 알리면 조용한 구멍이다",
        );
        for (const s of skipped) ok(s.why.length > 0, `${s.name}: 사유가 없다`);

        strictEqual(readWorkflow(root, "a.yml", fsMod), "name: a\n");
        strictEqual(readWorkflow(root, "없는파일.yml", fsMod), null, "못 읽으면 null 이어야 한다");
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test("폴더가 없으면 조용히 빈 목록 — 고객이 .github 를 지운 트리", () => {
    const {files, skipped} = listWorkflowFiles(join(tmpdir(), "zalkera-없는폴더-xyz"), fsMod);
    deepStrictEqual(files, []);
    deepStrictEqual(skipped, []);
});

test("지시자가 있으면 그 숫자가 본문 들여쓰기다 — 첫 줄로만 재면 진짜 본문을 놓친다", () => {
    // 첫 줄이 과들여쓰기되면, 그보다 얕은 **진짜 본문 줄**이 블록 밖으로 밀린다.
    // 기준점은 **키 열**이다(대시 열이 아니다) — PyYAML 로 대조해 확인한 규칙이다.
    const over = `jobs:\n  j:\n    steps:\n      - run: |2\n            npm ci\n          echo "${O} github.event.issue.title }}"\n`;
    strictEqual(runInjections(over).length, 1, "지시자 수준의 본문 줄을 놓쳤다");

    // `|0` 은 YAML 상 무효이고, 0 을 받으면 본문 들여쓰기가 키 열과 같아져 형제 키를 삼킨다.
    const zero = `jobs:\n  j:\n    steps:\n      - run: |0\n          npm ci\n        env:\n          T: ${O} github.event.issue.title }}\n`;
    strictEqual(runInjections(zero).length, 0, "`|0` 이 형제 env 를 본문으로 삼켰다");
});

test("빈 블록 바로 뒤의 형제 키를 삼키지 않는다 — 대시 열로 재면 걸린다", () => {
    // 이 형상이 대시 열 결함의 최소 재현이다. 본문이 없으므로 「첫 본문 줄」이 존재하지 않고,
    // 기준을 대시 열로 잡으면 바로 다음 형제 키가 본문으로 들어간다.
    const empty = `jobs:\n  j:\n    steps:\n      - run: |\n        if: ${O} github.ref }}\n`;
    strictEqual(runInjections(empty).length, 0, "빈 블록 뒤 형제 if 를 삼켰다");
});

test("오염된 env 이름은 그 묶음 안에서만 산다", () => {
    const T = `${O} github.event.issue.title }}`;
    // 잡 경계 — 잡 a 의 오염이 잡 b 의 같은 이름을 걸면 고객이 고칠 수 없는 거짓 실패다.
    const jobs = `jobs:\n  a:\n    env:\n      T: ${T}\n    steps:\n      - run: echo hi\n  b:\n    env:\n      T: 고정\n    steps:\n      - run: echo "${O} env.T }}"\n`;
    strictEqual(runInjections(jobs).length, 0, "잡 경계를 안 봤다");

    // 스텝 경계 — 범위가 한 줄만 더 가도 다음 스텝의 첫 줄을 문다.
    const steps = `jobs:\n  j:\n    steps:\n      - env:\n          T: ${T}\n        run: echo "$T"\n      - run: echo "${O} env.T }}"\n`;
    strictEqual(runInjections(steps).length, 0, "다음 스텝까지 범위가 샜다");

    // 선언 **순서와 무관**하다 — YAML 도 GitHub 도 그렇게 먹인다.
    const after = `jobs:\n  j:\n    steps:\n      - run: echo "${O} env.T }}"\n    env:\n      T: ${T}\n`;
    strictEqual(runInjections(after).length, 1, "env 를 뒤에 선언하면 놓친다");

    // 과소독 아님 — 같은 묶음 안에서는 여전히 잡는다.
    const inside = `jobs:\n  j:\n    env:\n      T: ${T}\n    steps:\n      - run: echo "${O} env.T }}"\n`;
    strictEqual(runInjections(inside).length, 1, "잡아야 할 것을 놓쳤다");
});

test("스텝의 첫 줄이 대시줄이어도 그 스텝이 묶음이다", () => {
    // 가장 흔한 작성 순서다 — `- run: …` 을 쓰고 그 아래 `env:` 를 단다. 뒤로 훑기가 대시줄에서
    // 끊기면 그 run 이 범위 밖으로 밀려 진짜 주입을 통째로 놓친다.
    const T = `${O} github.event.issue.title }}`;
    const src = `jobs:\n  j:\n    steps:\n      - run: echo "${O} env.T }}"\n        env:\n          T: ${T}\n`;
    strictEqual(runInjections(src).length, 1, "한 줄 run 뒤 env 후선언을 놓쳤다");
});

test("대시 뒤 공백은 한 칸이 아닐 수 있다", () => {
    // `-  run:` 도 유효한 YAML 이다. 이 파일의 다른 정규식은 전부 `-\s+` 로 그것을 받으므로,
    // 여기만 한 칸으로 박으면 검사기가 자기 문법과 어긋난다.
    const T = `${O} github.event.issue.title }}`;
    for (const gap of [1, 2, 3]) {
        const dash = "-" + " ".repeat(gap);
        const ind = " ".repeat(6 + 1 + gap);
        const src = `jobs:\n  j:\n    steps:\n      ${dash}run: echo "${O} env.T }}"\n${ind}env:\n${ind}  T: ${T}\n`;
        strictEqual(runInjections(src).length, 1, `대시 뒤 ${gap}칸을 놓쳤다`);
    }
});

test("`steps:` 와 첫 스텝 사이의 주석도 훑기를 끊지 않는다", () => {
    // 앞으로 훑는 마지막 자리(`scopeEnd`)다. 되돌려도 아무도 모르던 곳이라 여기서 문다.
    const T = `${O} github.event.issue.title }}`;
    const src = `jobs:\n  j:\n    env:\n      T: ${T}\n    steps:\n# 주석\n      - run: echo "${O} env.T }}"\n`;
    strictEqual(runInjections(src).length, 1, "주석이 잡 범위를 끊었다");
});

test("주석은 훑기를 끊지 않는다 — YAML 은 주석 들여쓰기에 뜻을 두지 않는다", () => {
    // 열 0 주석 한 줄이 훑기를 끊으면, 위 수정 자체가 주석 하나로 무력화된다.
    const T = `${O} github.event.issue.title }}`;
    const src = `jobs:\n  j:\n    steps:\n      - run: echo "${O} env.T }}"\n# 주석\n    env:\n      T: ${T}\n`;
    strictEqual(runInjections(src).length, 1, "주석이 훑기를 끊었다");
});

test("매핑 안의 주석이 `env:` 를 조기에 끊지 않는다", () => {
    // 열 0 주석이 매핑을 끊으면 그 아래 오염 이름을 통째로 못 본다.
    const T = `${O} github.event.issue.title }}`;
    const src = `jobs:\n  j:\n    env:\n      SAFE: hi\n# 주석\n      T: ${T}\n    steps:\n      - run: echo "${O} env.T }}"\n`;
    strictEqual(runInjections(src).length, 1, "주석 아래 오염 이름을 놓쳤다");
});

test("`env:` 와 같은 열의 형제 키는 그 매핑 안이 아니다", () => {
    // 매핑의 끝을 「키 열보다 **깊지 않은** 첫 줄」로 잡아야 한다. `<` 로 두면 같은 열의 형제
    // (`name:`·`if:`)가 env 항목으로 잡혀, 그 이름을 꺼내는 자리가 거짓으로 걸린다.
    const src =
        `jobs:\n  j:\n    env:\n      SAFE: hi\n    name: ${O} github.event.issue.title }}\n` +
        `    steps:\n      - run: echo "${O} env.name }}"\n`;
    strictEqual(runInjections(src).length, 0, "형제 키를 env 항목으로 셌다");
});

test("`- env:` 가 스텝 첫 키여도 뒤따르는 형제를 매핑 안으로 삼키지 않는다", () => {
    // 대시 열로 재면 `with:` 가 env 매핑 안으로 들어가 무해한 인자가 이름을 오염시킨다.
    const src =
        `jobs:\n  j:\n    steps:\n      - env:\n          SAFE: hi\n        uses: actions/checkout@v4\n        with:\n          ref: "${O} github.head_ref }}"\n` +
        `      - run: echo "${O} env.ref }}"\n`;
    strictEqual(runInjections(src).length, 0, "with: 의 인자가 이름을 오염시켰다");
});

test("`run:` 범위 인식이 살아 있다 — 깨지면 위 두 판정이 공허해진다", () => {
    const src = `steps:\n  - run: |\n      a\n      b\n  - run: c\n  - name: x\n    run: >\n      d\n`;
    const lines = runRanges(src).map((r) => r.text.trim());
    ok(lines.includes("a") && lines.includes("b"), `블록 본문을 놓쳤다: ${JSON.stringify(lines)}`);
    ok(lines.includes("c"), `한 줄 run 을 놓쳤다: ${JSON.stringify(lines)}`);
    ok(lines.includes("d"), `\`>\` 블록을 놓쳤다: ${JSON.stringify(lines)}`);
    strictEqual(runRanges("steps:\n  - uses: actions/checkout@v4\n").length, 0, "run 이 아닌 줄을 셌다");
});

// ── 위험 목록의 미검증 축 ───────────────────────────────────────────────────
//
// `UNTRUSTED` 는 여섯인데 픽스처가 무는 것은 둘이었다. 목록에 이름만 있고 아무도 안 물면,
// 정규식 하나를 지워도 전건 초록이다 — 그 자리가 곧 다음 판의 구멍이다.

test("사람이 이름을 정하는 값은 전부 잡는다 — 목록에 이름만 있으면 안 된다", () => {
    const shapes = {
        "github.event": "${{ github.event.pull_request.title }}",
        "github.head_ref": "${{ github.head_ref }}",
        "github.base_ref": "${{ github.base_ref }}",
        "github.ref_name": "${{ github.ref_name }}",
        "github.ref": "${{ github.ref }}",
        "inputs.": "${{ inputs.name }}",
    };
    for (const [what, expr] of Object.entries(shapes)) {
        const src = `jobs:\n  a:\n    steps:\n      - run: echo ${expr}\n`;
        const found = runInjections(src);
        strictEqual(found.length, 1, `${what} 를 놓쳤다`);
        strictEqual(found[0].where, "run", what);
    }
});

test("같은 값들이 `env:` 를 거쳐 와도 잡는다", () => {
    for (const expr of ["${{ github.base_ref }}", "${{ inputs.name }}", "${{ github.ref }}"]) {
        const src = `jobs:\n  a:\n    env:\n      A: ${expr}\n    steps:\n      - run: echo \${{ env.A }}\n`;
        const found = runInjections(src);
        strictEqual(found.length, 1, `env 경유 ${expr} 를 놓쳤다`);
        strictEqual(found[0].where, "env");
    }
});

test("음성 통제군 — 사람이 못 정하는 값은 잡지 않는다", () => {
    // 「무엇이든 잡는다」 구현이면 위 시험이 전부 초록이다. 오탐은 고객 배포를 무환불로 막는다.
    for (const expr of [
        "${{ secrets.NPM_TOKEN }}",
        "${{ github.sha }}",
        "${{ github.repository }}",
        "${{ runner.os }}",
        "${{ matrix.node }}",
        "${{ github.run_id }}",
        "${{ steps.x.outputs.y }}",
        "${{ env.SAFE }}",
    ]) {
        const src = `jobs:\n  a:\n    steps:\n      - run: echo ${expr}\n`;
        deepStrictEqual(runInjections(src), [], `오탐: ${expr}`);
    }
});

test("`env:` 에 든 값이 안전하면 그 이름을 쓰는 run 도 통과한다", () => {
    const src = "jobs:\n  a:\n    env:\n      A: ${{ github.sha }}\n    steps:\n      - run: echo ${{ env.A }}\n";
    deepStrictEqual(runInjections(src), []);
});

test("`.yaml` 확장자도 본다 — 한쪽만 보면 이름만 바꿔 검사를 피한다", () => {
    const dir = mkdtempSync(join(tmpdir(), "zalkera-wfext-"));
    try {
        writeFileSync(join(dir, "a.yml"), "on: push\n");
        writeFileSync(join(dir, "b.yaml"), "on: push\n");
        writeFileSync(join(dir, "c.txt"), "on: push\n");
        writeFileSync(join(dir, "d.yamlx"), "on: push\n");
        const {files, skipped} = listWorkflowFiles(dir, fsMod);
        deepStrictEqual(files, ["a.yml", "b.yaml"]);
        deepStrictEqual(skipped, []);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("`env:` 가 열 0 로 길게 이어져도 제곱이 되지 않는다", () => {
    // 이 검사기는 팩에 실려 고객 트리에서도 돈다. 판정이 제곱이면 큰 워크플로 하나가 그 CI 를
    // 붙잡는다. 재현·수치: `node scripts/lib/workflow-syntax.bench.mjs`
    const src = "env:\n".repeat(20_000) + "jobs:\n  a:\n    steps:\n      - run: echo ${{ github.event.x }}\n";
    const started = Date.now();
    const found = runInjections(src);
    const ms = Date.now() - started;
    strictEqual(found.length, 1, "판정이 바뀌었다");
    ok(ms < 2_000, `20,000줄에 ${ms}ms 걸렸다 — 선형이 아니다`);
});

test("키와 콜론 사이 공백으로 검사기를 피할 수 없다", () => {
    // `run : …` 는 유효한 YAML 이고 GitHub 이 그대로 실행한다. 한 칸으로 판정을 통째로 피할 수
    // 있으면 그것은 가드가 아니다. 형태의 근거는 `lib/workflow-syntax.mjs` 의 재현 명령에 있다.
    const shapes = [
        "jobs:\n  a:\n    steps:\n      - run : echo ${{ github.event.x }}\n",
        "jobs:\n  a:\n    steps:\n      - run  : |\n          echo ${{ github.event.x }}\n",
        'jobs:\n  a:\n    steps:\n      - "run" : echo ${{ github.event.x }}\n',
    ];
    for (const src of shapes) strictEqual(runInjections(src).length, 1, `놓쳤다: ${src.trim()}`);
});

test("흐름형 `run` 은 «통과»가 아니라 «못 읽음»으로 선다", () => {
    // `- {run: "…"}` 도 유효한 YAML 이다. 줄 단위 판정으로는 못 읽는데, 조용히 넘기면 한 줄로
    // 검사기를 피할 수 있고 그 사실이 아무 데서도 안 보인다.
    const flow = 'jobs:\n  a:\n    steps:\n      - {run: "echo ${{ github.event.x }}"}\n';
    strictEqual(runInjections(flow).length, 0, "줄 단위 판정이 흐름형을 읽은 척했다");
    strictEqual(unreadableRun(flow).length, 1, "못 읽은 것을 조용히 넘겼다");
});

test("못 읽음 판정은 평범한 줄을 잡지 않는다", () => {
    // 거짓 실패는 고객 배포를 무환불로 막는다.
    for (const src of [
        "jobs:\n  a:\n    steps:\n      - run: echo ${{ github.sha }}\n",
        "jobs:\n  a:\n    steps:\n      - run: echo '{}'\n",
        "jobs:\n  a:\n    steps:\n      - with: {node: 22}\n",
        "jobs:\n  a:\n    steps:\n      - run: jq '{a: .b}' x.json\n",
        // 쉼표는 흐름형의 구분자이기도 하다 — 중괄호가 없으면 그냥 셸 명령의 쉼표다.
        "jobs:\n  a:\n    steps:\n      - run: echo one, run: two\n",
        "jobs:\n  a:\n    steps:\n      - run: sed 's/a,run:/x/' f\n",
    ]) {
        deepStrictEqual(unreadableRun(src), [], `오탐: ${src.trim()}`);
    }
});

test("이 트리의 워크플로에는 못 읽는 `run` 이 없다", () => {
    // 있으면 그 자리는 아무도 안 본 채 초록이다. 새로 생기면 여기서 멈춘다.
    for (const name of scanned()) {
        const src = readWorkflow(DIR, name, fsMod);
        ok(src !== null, `${name} 을 못 읽었다`);
        deepStrictEqual(
            unreadableRun(src),
            [],
            `${name}: 흐름형 run 은 이 검사기가 못 읽습니다 — 블록 스타일로 적어 주십시오`,
        );
    }
});
