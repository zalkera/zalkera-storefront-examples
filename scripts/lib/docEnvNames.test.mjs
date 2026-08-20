/**
 * **배송 문서가 안내하는 env 이름이 코드에 실재하는가.**
 *
 * ■ 왜 생겼나
 *   `docs/byo-headless-guide.md` 는 자기 인프라로 사이트를 돌리는 사람에게 **넣어야 할 env 이름**을
 *   알려 준다. 그 이름이 코드와 갈리면 그 사람은 시키는 대로 다 했는데 사이트가 안 뜬다 — 그리고
 *   그 어긋남을 볼 눈이 아무 데도 없었다. `env.ts` 머리말이 스스로 「이 이름 하나다」라고 못 박는데
 *   그 못이 문서까지 닿지 않았다.
 *
 * ■ 반대 방향은 안 본다
 *   코드가 읽는 이름 전부를 문서가 적을 필요는 없다(`ZALKERA_OFFLINE_BUILD` 는 내부 빌드 축이다).
 *   **문서가 말한 것이 참인가**만 본다 — 거짓말하는 문서가 문제이지, 말 안 한 것은 문제가 아니다.
 *
 * 사용: `node --test scripts/lib/docEnvNames.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDE = join(ROOT, "docs", "byo-headless-guide.md");
const NAME = /ZALKERA_[A-Z0-9_]+/g;

/** `src/` 아래 소스 파일 전부. */
function sourceFiles() {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(dir, {withFileTypes: true})) {
            const full = join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\.(tsx?|mjs)$/.test(e.name)) out.push(full);
        }
    };
    walk(join(ROOT, "src"));
    return out;
}

/** 문서가 안내하는 이름들. */
function guideNames() {
    return [...new Set(readFileSync(GUIDE, "utf8").match(NAME) ?? [])].sort();
}

/**
 * 소스가 **실제로 읽는** 이름들.
 *
 * ⚠ **문면이 아니라 구문으로 본다.** 정규식으로 훑으면 주석 속 이름이 「읽는다」로 세어진다 —
 *   코드에서 지우고 주석만 남기는 반쪽 개명이 가장 흔한 형태인데, 그때 이 검사가 조용히 통과한다.
 */
function readNames(text, fileName = "x.ts") {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Set();
    const visit = (node) => {
        if (
            ts.isPropertyAccessExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText() === "process" &&
            node.expression.name.getText() === "env" &&
            /^ZALKERA_[A-Z0-9_]+$/.test(node.name.getText())
        ) {
            found.add(node.name.getText());
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}

/** `src/` 전체가 읽는 이름의 합집합. */
function readNamesInSource() {
    const all = new Set();
    for (const file of sourceFiles()) {
        for (const n of readNames(readFileSync(file, "utf8"), file)) all.add(n);
    }
    return all;
}

test("문서가 이름을 실제로 안내하고 있다 — 0개면 이 시험이 아무것도 안 잰다", () => {
    const names = guideNames();
    assert.ok(names.length >= 3, `문서에서 env 이름을 ${names.length}개만 찾았다: ${names.join(" ")}`);
});

test("문서가 안내하는 env 이름은 전부 코드가 읽는 이름이다", () => {
    // 갈리면 안내를 따른 사람이 「다 했는데 안 뜬다」에 갇힌다.
    const read = readNamesInSource();
    const ghosts = guideNames().filter((n) => !read.has(n));
    assert.deepEqual(ghosts, [], `코드가 안 읽는 이름을 안내한다: ${ghosts.join(" ")}`);
});

test("주석에만 있는 이름은 «읽는다»로 세지 않는다", () => {
    // 이름을 코드에서 지우고 주석만 남기는 것이 가장 흔한 반쪽 개명이다.
    const onlyComment = "// process.env.ZALKERA_GHOST 를 읽던 자리\nexport const x = 1;\n";
    assert.equal(readNames(onlyComment).has("ZALKERA_GHOST"), false);
    assert.equal(readNames("const v = process.env.ZALKERA_GHOST;").has("ZALKERA_GHOST"), true);
});

test("음성 통제군 — 코드에 없는 이름을 안내하면 잡는다", () => {
    const read = readNamesInSource();
    assert.equal(read.has("ZALKERA_NOT_A_REAL_NAME"), false, "이 시험의 전제가 깨졌다");
});
