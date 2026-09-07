import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {dirname, join, relative} from "node:path";
import type TS from "typescript";

/**
 * **문면이 아니라 타입으로 판정하는 그물.**
 *
 * ## 왜 문면이 아니라 타입인가
 *
 * 정규식은 **한 식(式) 안의 결합만** 센다. 아래 셋은 그 그물을 그냥 지나간다:
 *
 * ```
 * const d = new Date(iso); d.toLocaleDateString("ko-KR")   // 값을 재사용하는 가장 자연스러운 리팩터
 * new Intl.DateTimeFormat("ko-KR").format(new Date(iso))   // 같은 일을 하는 다른 API
 * new Date(iso).getMonth()                                 // 로컬 getter — 달력 묶음이 하루 밀린다
 * ```
 *
 * 셋 다 **방문자 브라우저 시간대**로 계산한다 — 이 그물이 잡으려는 바로 그 버그다.
 * 주석 안의 예시 코드까지 위반으로 세는 것도 문면 판정의 성질이다.
 *
 * ⛔ **정규식을 더 정교하게 만들지 마라 — 같은 부류가 계속 샌다.** 대신 **TypeScript 타입 체커**에
 * 묻는다. 수신자의 타입이 `Date` 인가는 컴파일러가 아는 사실이지 우리가 문자열로 추측할 것이
 * 아니다. 그래서 금액(`number.toLocaleString()`)과 시각(`Date.toLocaleString()`)이 같은 이름을
 * 써도 안 헷갈린다.
 *
 * ⚠ **비용**: `ts.createProgram` 이 1.5초쯤 걸린다. 그래서 이 파일이 프로그램을 **한 번만** 만들고
 * 여러 규칙이 그것을 나눠 쓴다. 규칙을 더할 때도 파일을 늘리지 말고 여기에 넣어라.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const ts: typeof TS = require("typescript");

/** 프로그램은 비싸다 — 한 번 만들어 규칙들이 나눠 쓴다. */
const program = (() => {
    const cfgPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
    assert.ok(cfgPath, "tsconfig.json 을 못 찾았다 — 이 그물은 컴파일러 설정 위에 선다");
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, ROOT);
    return ts.createProgram(parsed.fileNames, parsed.options);
})();
const checker = program.getTypeChecker();

/** 우리 소스만 본다 — `node_modules`·선언 파일은 남의 것이다. */
function ourSourceFiles(): TS.SourceFile[] {
    return program
        .getSourceFiles()
        .filter((sf) => !sf.isDeclarationFile && sf.fileName.startsWith(join(ROOT, "src") + "/"));
}

function relPath(sf: TS.SourceFile): string {
    return relative(join(ROOT, "src"), sf.fileName).split("\\").join("/");
}

function lineOf(sf: TS.SourceFile, node: TS.Node): number {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** 수신자의 타입이 `Date` 인가 — **컴파일러에게 묻는다**(문자열로 추측하지 않는다). */
function isDateReceiver(node: TS.Expression): boolean {
    return checker.typeToString(checker.getTypeAtLocation(node)) === "Date";
}

test("통제군 — 프로그램이 우리 소스를 실제로 읽는다", () => {
    const files = ourSourceFiles();
    // 빈손이면 아래 모든 규칙이 공허참이다.
    assert.ok(files.length > 40, `우리 소스를 ${files.length}개만 찾았다 — 프로그램이 죽었다`);
    assert.ok(
        files.some((f) => relPath(f) === "lib/datetime.ts"),
        "소유자 파일이 프로그램에 없다",
    );
});

/**
 * **시각을 말하는 자리는 `src/lib/datetime.ts` 하나다.**
 *
 * ⛔ 면제를 늘리려면 **왜 그 파일이 시간대를 스스로 정하는지** 적어라. 「거기서만 쓰니까」는
 * 이유가 아니다 — 그 논리로 모든 파일이 면제된다.
 */
const TIME_OWNERS = new Set(["lib/datetime.ts", "lib/datetime.test.ts"]);

/** `Date` 인스턴스에서 **기계 시간대**로 계산하는 멤버. 전부 소유자 밖에서 금지다. */
const LOCAL_TIME_MEMBERS = new Set([
    "toLocaleDateString",
    "toLocaleTimeString",
    "toLocaleString",
    "toString",
    "toDateString",
    "toTimeString",
    "getFullYear",
    "getMonth",
    "getDate",
    "getDay",
    "getHours",
    "getMinutes",
    "getSeconds",
    "getMilliseconds",
]);

test("Date 를 기계 시간대로 읽는 자리가 소유자 밖에 없다", () => {
    const offenders: string[] = [];
    for (const sf of ourSourceFiles()) {
        const rel = relPath(sf);
        if (TIME_OWNERS.has(rel)) continue;
        const walk = (node: TS.Node): void => {
            if (
                ts.isPropertyAccessExpression(node) &&
                LOCAL_TIME_MEMBERS.has(node.name.text) &&
                isDateReceiver(node.expression)
            ) {
                offenders.push(`${rel}:${lineOf(sf, node)} — Date.${node.name.text}()`);
            }
            ts.forEachChild(node, walk);
        };
        walk(sf);
    }

    assert.deepEqual(
        offenders,
        [],
        `기계 시간대로 시각을 읽는 자리다 — \`src/lib/datetime.ts\` 의 함수를 써라:\n  ${offenders.join("\n  ")}`,
    );
});

test("`Intl.DateTimeFormat` 을 직접 만들지 않는다 — 같은 일을 하는 다른 문", () => {
    const offenders: string[] = [];
    for (const sf of ourSourceFiles()) {
        const rel = relPath(sf);
        if (TIME_OWNERS.has(rel)) continue;
        const walk = (node: TS.Node): void => {
            if (
                ts.isPropertyAccessExpression(node) &&
                node.name.text === "DateTimeFormat" &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === "Intl"
            ) {
                offenders.push(`${rel}:${lineOf(sf, node)}`);
            }
            ts.forEachChild(node, walk);
        };
        walk(sf);
    }

    assert.deepEqual(offenders, [], `Intl.DateTimeFormat 직접 사용:\n  ${offenders.join("\n  ")}`);
});

test("양성 통제군 — 금액의 `toLocaleString` 은 안 걸린다(시간대와 무관하다)", () => {
    // 이 단언이 없으면 위 규칙이 「전부 금지」로 굳어도 아무도 모른다.
    // 재현: `npm test` → 이 시험이 세는 건수가 0 이면 판정이 Date 쪽으로 쏠린 것이다.
    let numberFormats = 0;
    for (const sf of ourSourceFiles()) {
        const walk = (node: TS.Node): void => {
            if (
                ts.isPropertyAccessExpression(node) &&
                node.name.text === "toLocaleString" &&
                !isDateReceiver(node.expression)
            ) {
                numberFormats += 1;
            }
            ts.forEachChild(node, walk);
        };
        walk(sf);
    }
    assert.ok(numberFormats >= 5, `금액 포맷을 ${numberFormats}건만 봤다 — 판정이 Date 쪽으로 쏠렸다`);
});

/**
 * **클라이언트 경계로 비밀이 될 수 있는 값을 흘리지 않는다.**
 *
 * `/checkout` 은 정적 프리렌더라, 클라이언트 컴포넌트에 넘긴 값은 **모든 방문자에게 구운 채로**
 * 나간다. 3.5.0 이 계좌 객체를 그렇게 넘겼고(주석은 「안 내려보낸다」고 적고 있었다) 심의가
 * RSC 페이로드에서 계좌번호를 뽑아 실증했다.
 *
 * ⛔ **되돌려도 아무 게이트가 안 잡았다** — 그래서 여기서 형상을 잠근다. 폼이 알아야 하는 것은
 * 「계좌가 있다」는 사실뿐이므로 **불리언 하나**가 맞는 형상이다.
 */
test("CheckoutForm 은 «계좌가 있다»만 받는다 — 계좌 문자열을 클라이언트로 넘기지 않는다", () => {
    const sf = ourSourceFiles().find((f) => relPath(f) === "app/checkout/CheckoutForm.tsx");
    assert.ok(sf, "CheckoutForm.tsx 를 프로그램에서 못 찾았다");

    let props: TS.Type | undefined;
    const walk = (node: TS.Node): void => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === "CheckoutForm") {
            const param = node.parameters[0];
            assert.ok(param, "CheckoutForm 이 props 를 안 받는다 — 형상이 통째로 바뀌었다");
            props = checker.getTypeAtLocation(param);
        }
        ts.forEachChild(node, walk);
    };
    walk(sf);
    assert.ok(props, "CheckoutForm 선언을 못 찾았다");

    const shape = checker
        .getPropertiesOfType(props)
        .map((p) => `${p.name}: ${checker.typeToString(checker.getTypeOfSymbol(p))}`)
        .sort();

    // 값을 그대로 단언한다 — 「문자열 필드가 없다」는 필드가 0개여도 참이라 공허하다.
    assert.deepEqual(
        shape,
        ["bankTransferAvailable: boolean"],
        "폼의 props 형상이 바뀌었다. 계좌 문자열을 넘기면 정적 프리렌더에 구워져 모든 방문자에게 나간다",
    );
});
