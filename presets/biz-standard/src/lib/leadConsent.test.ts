import {strict as assert} from "node:assert";
import {existsSync, readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import ts from "typescript";
import type * as TS from "typescript";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 상담 신청 폼의 **개인정보 수집·이용 동의**가 실제로 서 있는가.
 *
 * 이름·연락처를 받는 폼이라 동의가 **필수**이고, 마케팅 수신 동의와 **다른 사실**이다(SDK 교본).
 * 그리고 **화면에 보인 문장과 판**을 같이 보내야 원장이 「무엇에 동의했나」에 답한다 — 코드만 남기면 못 답한다.
 *
 * 왜 구문 트리로 보나: 이 셋은 지워도 타입·빌드가 초록이고, 폼은 그대로 제출된다(백엔드가 400 을 낼 뿐이다).
 * 그때 조용히 도는 것은 **동의 없이 받은 접수**라 회수가 안 된다.
 *
 * 재현: `node --experimental-strip-types --test src/lib/leadConsent.test.ts; echo rc=$?` → rc=0
 */
const FORM = join(SRC, "components/LeadForm.tsx");

function parse(): TS.SourceFile {
    assert.ok(existsSync(FORM), "리드 폼이 없다 — 이 스위트는 그 폼을 재는 자리다");
    return ts.createSourceFile(FORM, readFileSync(FORM, "utf8"), ts.ScriptTarget.Latest, true);
}

function find(sf: TS.SourceFile, pred: (n: TS.Node) => boolean): boolean {
    let hit = false;
    const visit = (n: TS.Node): void => {
        if (pred(n)) hit = true;
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return hit;
}

/** POST 본문 객체의 칸 이름들 — `JSON.stringify({...})` 안을 본다. */
function bodyKeys(sf: TS.SourceFile): string[] {
    const keys: string[] = [];
    find(sf, (n) => {
        if (
            ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            n.expression.name.text === "stringify" &&
            n.arguments.length === 1 &&
            ts.isObjectLiteralExpression(n.arguments[0])
        ) {
            for (const p of n.arguments[0].properties) {
                if (p.name !== undefined && ts.isIdentifier(p.name)) keys.push(p.name.text);
            }
        }
        return false;
    });
    return keys;
}

test("🔴 수집·이용 동의를 수신 동의와 **다른 칸**으로 보낸다 — 판·문장도 같이", () => {
    const keys = bodyKeys(parse());
    for (const key of ["consentPrivacy", "consentVersion", "consentLabel"]) {
        assert.ok(keys.includes(key), `본문에 ${key} 가 없다 — 원장이 「무엇에 동의했나」에 못 답한다`);
    }
    // 양성 짝 — 수신 동의는 그대로 있다(둘은 다른 사실이라 하나로 합치면 안 된다).
    assert.ok(keys.includes("consentMarketing"), "수신 동의 칸이 사라졌다");
});

test("🔴 그 체크박스는 **필수**다 — 빼면 동의 없이 접수된다", () => {
    const sf = parse();
    const required = find(
        sf,
        (n) =>
            ts.isJsxSelfClosingElement(n) &&
            n.tagName.getText() === "input" &&
            n.attributes.properties.some((a) => a.name?.getText() === "required") &&
            n.attributes.properties.some(
                (a) =>
                    ts.isJsxAttribute(a) &&
                    a.name.getText() === "checked" &&
                    /consentPrivacy/.test(a.initializer?.getText() ?? ""),
            ),
    );
    assert.ok(required, "수집·이용 동의 체크박스에 required 가 없다");
});

test("동의 문장과 판은 **상수 한 자리**에서 온다 — 화면과 원장이 갈리지 않게", () => {
    const source = readFileSync(FORM, "utf8");
    assert.match(source, /const PRIVACY_CONSENT_VERSION = "/, "판 상수가 없다");
    assert.match(source, /const PRIVACY_CONSENT_LABEL =/, "문장 상수가 없다");
    // 화면이 그 상수를 그린다 — 다른 문장을 그리면 원장의 문장이 거짓이 된다.
    assert.match(source, /\{PRIVACY_CONSENT_LABEL\}/, "화면이 그 문장을 안 그린다");
});
