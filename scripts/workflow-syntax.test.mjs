/**
 * **워크플로 파일이 GitHub 에서 실제로 기동하는가.**
 *
 * ■ 왜 생겼나
 *   `client-upgrade.yml` 이 세 번 연속 **startup failure** 였다. 원인은 `run: |` 블록 안에 적어 둔
 *   주석이었다 — 블록 스칼라 안에서는 `#` 이 YAML 주석이 아니라 **본문**이라, 거기 글자 그대로
 *   쓴 GitHub 식(달러 + 이중 중괄호)이 진짜 식으로 읽혔다. 안이 비어 있어 파일 전체가
 *   「An expression was expected」로 파싱에 실패했고, 워크플로는 한 번도 안 돌았다.
 *   보간을 경고하는 주석이 보간으로 파일을 죽였다.
 *
 * ■ 왜 로컬 검사로 잡히지 않았나
 *   YAML 파서는 통과시킨다. 블록 스칼라 본문은 파서에게 그냥 문자열이다. GitHub 만 그 문자열을
 *   한 번 더 해석한다 — 즉 **YAML 이 유효한 것과 워크플로가 유효한 것은 다른 문제**다.
 *   그래서 여기서 재는 것은 「식이 문법적으로 성립하는가」다.
 *
 * ■ 왜 팩에도 실리나
 *   이 워크플로는 고객 레포로 그대로 간다. 정본에서만 재면 고객 트리에서 같은 병이 나도 아무도
 *   모른다. `npm test` 에 붙어 고객 레포에서도 돈다.
 *
 * 재현: `node --experimental-strip-types --test scripts/workflow-syntax.test.mjs`
 */
import {ok, strictEqual} from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, ".github", "workflows");

/**
 * 사람이 이름 붙일 수 있는 값 — GitHub 이 「신뢰할 수 없다」고 문서에 적어 둔 칸이다.
 * `run:` 안에 보간되면 `$( )`·백틱이 셸에서 평가된다. `env:` 로 넘기면 셸이 값으로만 본다.
 *
 * 넓게 `github.` 전부를 막지 않는 이유: `github.sha`·`github.repository` 는 안전하고 흔해서
 * 막으면 면제가 늘어난다. **면제는 구멍이다** — 위험한 칸만 닫힌 목록으로 둔다.
 */
const UNTRUSTED = [
    /\bgithub\.event\b/,
    /\bgithub\.head_ref\b/,
    /\bgithub\.ref_name\b/,
    /\bgithub\.ref\b/,
    /\binputs\./,
];

/** 워크플로 파일 목록. 없으면 `null` — 고객이 `.github/` 를 지운 트리에서 거짓 실패를 내지 않는다. */
function workflowFiles() {
    let names;
    try {
        names = readdirSync(DIR);
    } catch {
        return null;
    }
    return names.filter((n) => n.endsWith(".yml") || n.endsWith(".yaml")).sort();
}

/** `${` + `{` 로 열리는 자리를 전부 찾는다. 이 파일 자체가 그 글자를 안 갖게 조립해 쓴다. */
const OPEN = "$" + "{{";

/** `run:` 블록 스칼라의 본문 줄만 골라 `{line, text}` 로 준다. */
function runBlockLines(src) {
    const lines = src.split("\n");
    const out = [];
    let indent = -1;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const m = /^(\s*)(?:-\s+)?run:\s*[|>][-+]?\s*$/.exec(ln);
        if (m) {
            indent = m[1].length;
            continue;
        }
        if (indent < 0) continue;
        if (ln.trim() === "") continue;
        if (ln.length - ln.trimStart().length <= indent) {
            indent = -1;
            continue;
        }
        out.push({line: i + 1, text: ln});
    }
    return out;
}

test("워크플로의 모든 식은 본문이 있다 — 빈 식 하나면 파일이 기동조차 못 한다", () => {
    const files = workflowFiles();
    if (files === null) return; // `.github/workflows` 자체가 없는 트리(고객이 지웠다).
    ok(files.length > 0, `${DIR} 가 있는데 워크플로 파일이 0개다 — 검사가 헛돈다`);
    for (const name of files) {
        const src = readFileSync(join(DIR, name), "utf8");
        let at = 0;
        for (;;) {
            const start = src.indexOf(OPEN, at);
            if (start < 0) break;
            const end = src.indexOf("}}", start);
            const line = src.slice(0, start).split("\n").length;
            ok(end > 0, `${name}:${line} 식이 닫히지 않았다`);
            const body = src.slice(start + OPEN.length, end).trim();
            ok(
                body.length > 0,
                `${name}:${line} 빈 식이다 — GitHub 이 「An expression was expected」로 파일 전체를 거부하고 ` +
                    `워크플로가 기동하지 않는다. 주석에 식을 글자 그대로 쓰지 말 것(블록 스칼라 안에서는 주석이 본문이다).`,
            );
            at = end + 2;
        }
    }
});

test("`run:` 안에 사람이 이름 붙인 값을 보간하지 않는다 — 셸이 그것을 코드로 읽는다", () => {
    const files = workflowFiles();
    if (files === null) return;
    for (const name of files) {
        for (const {line, text} of runBlockLines(readFileSync(join(DIR, name), "utf8"))) {
            const start = text.indexOf(OPEN);
            if (start < 0) continue;
            const end = text.indexOf("}}", start);
            const body = end > 0 ? text.slice(start + OPEN.length, end) : text.slice(start);
            for (const bad of UNTRUSTED) {
                ok(
                    !bad.test(body),
                    `${name}:${line} 이 값(${body.trim()})은 사람이 이름을 정할 수 있다 — ` +
                        `\`run:\` 에 보간되면 큰따옴표 안에서도 \`$( )\`·백틱이 평가된다. ` +
                        `스텝 \`env:\` 로 넘기고 셸에서는 변수로 읽을 것.`,
                );
            }
        }
    }
});

test("양성 통제군 — 검사기가 실제로 무언가를 훑었다", () => {
    const files = workflowFiles();
    if (files === null) return;
    const total = files.reduce((n, name) => n + runBlockLines(readFileSync(join(DIR, name), "utf8")).length, 0);
    ok(total > 0, "`run:` 블록 본문을 한 줄도 못 찾았다 — 블록 인식이 깨졌다면 위 두 시험은 공허하다");
    strictEqual(
        files.includes("client-upgrade.yml"),
        true,
        "이 병이 난 파일이 목록에 없다 — 이름이 바뀌었으면 이 줄을 같이 고칠 것",
    );
});
