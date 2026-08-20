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
import {ok, strictEqual} from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {EXPR_OPEN, emptyExpressions, runInjections, runRanges} from "./lib/workflow-syntax.mjs";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), ".github", "workflows");

/** 워크플로 파일 목록. 없으면 빈 배열 — 고객이 `.github/` 를 지운 트리에서 거짓 실패를 내지 않는다. */
function workflowFiles() {
    try {
        return readdirSync(DIR)
            .filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))
            .sort();
    } catch {
        return [];
    }
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
    for (const name of workflowFiles()) {
        const src = readFileSync(join(DIR, name), "utf8");
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

test("`run:` 범위 인식이 살아 있다 — 깨지면 위 두 판정이 공허해진다", () => {
    const src = `steps:\n  - run: |\n      a\n      b\n  - run: c\n  - name: x\n    run: >\n      d\n`;
    const lines = runRanges(src).map((r) => r.text.trim());
    ok(lines.includes("a") && lines.includes("b"), `블록 본문을 놓쳤다: ${JSON.stringify(lines)}`);
    ok(lines.includes("c"), `한 줄 run 을 놓쳤다: ${JSON.stringify(lines)}`);
    ok(lines.includes("d"), `\`>\` 블록을 놓쳤다: ${JSON.stringify(lines)}`);
    strictEqual(runRanges("steps:\n  - uses: actions/checkout@v4\n").length, 0, "run 이 아닌 줄을 셌다");
});
