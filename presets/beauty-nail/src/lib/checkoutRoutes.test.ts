import {strict as assert} from "node:assert";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import type TS from "typescript";

const ts: typeof TS = createRequire(import.meta.url)("typescript");

/**
 * **주문을 세우는 문의 배선 그물.**
 *
 * ⛔ **멱등키는 「이 카트 · 이 내용」이라야 한다**(`orderIdempotencyKey`). 카트 키만 쓰면 내용을 고쳐
 * 다시 내는 것이 409 가 되고, 회전이 성공 응답에만 실리므로 카트 쿠키 수명만큼 이어진다.
 * ⛔ **충돌 갈래에서 카트 키를 돌리지 않는다.** 본문 지문을 키에 섞은 뒤 남는 409 는 **같은 내용의
 * 동시 제출**뿐이고, 그때 키를 돌리면 재시도가 두 번째 주문이 된다.
 * ⛔ **방문자 IP 선언**: 주문 생성에 `context.clientIp` 가 없으면 백엔드가 보는 IP 가 서빙 박스다.
 * 속도 제한이 사이트 전체를 한 칸으로 뭉치고, `consents` 를 보내면 청약 증빙의 IP 가 서버 것이 된다.
 *
 * 규칙은 함수(`orderIdempotencyKey`)가 지고 **행위로 잰다.** 구문 트리 쪽은 「라우트가 그 함수를 쓰는가 ·
 * 충돌 갈래가 회전을 안 부르는가」만 본다. 판정식은 마지막 시험이 가짜 소스에 직접 돌려 잰다.
 */
const ROUTES = ["checkout"] as const;

function sourceOf(text: string, name = "fake.ts"): TS.SourceFile {
    return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
}

function routeSource(name: string): {file: TS.SourceFile; rel: string} {
    const rel = `src/app/api/${name}/route.ts`;
    const path = resolve(import.meta.dirname, "..", "app", "api", name, "route.ts");
    return {file: sourceOf(readFileSync(path, "utf8"), rel), rel};
}

function walk(node: TS.Node, visit: (n: TS.Node) => void): void {
    visit(node);
    node.forEachChild((child) => walk(child, visit));
}

function find(node: TS.Node, pick: (n: TS.Node) => boolean): boolean {
    let hit = false;
    walk(node, (c) => {
        if (pick(c)) hit = true;
    });
    return hit;
}

function checkoutCalls(file: TS.SourceFile): TS.CallExpression[] {
    const calls: TS.CallExpression[] = [];
    walk(file, (n) => {
        if (!ts.isCallExpression(n)) return;
        const callee = n.expression;
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "checkout") calls.push(n);
    });
    return calls;
}

/** **판정 ①** — `checkout` 호출 전부가 멱등키를 **그 함수로** 만드는가(손으로 만든 키가 섞이면 거짓). */
function everyCheckoutUsesKeyBuilder(file: TS.SourceFile): boolean {
    const calls = checkoutCalls(file);
    if (calls.length === 0) return false;
    const builds = (n: TS.Node): boolean =>
        find(
            n,
            (c) =>
                ts.isCallExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "orderIdempotencyKey",
        );
    return calls.every((c) => {
        const key = c.arguments[2];
        if (!key) return false;
        // ⚠ 삼항이면 **참 가지**에 있어야 한다 — 양팔을 뒤집으면 정상 요청 전부가 멱등키 없이 나가는데
        //   「인자 안 어딘가에 있다」만 보면 그 변이가 살아남는다.
        if (ts.isConditionalExpression(key)) return builds(key.whenTrue) && !builds(key.whenFalse);
        return builds(key);
    });
}

/**
 * **판정 ②** — 멱등 충돌 갈래가 **있고**, 무언가를 **돌려주고**, 카트 키를 **안 돌리는가**.
 *
 * 「안 돌린다」만 보면 갈래를 통째로 지운 변이가 공허참으로 통과한다 — 교착이 돌아오지는 않지만
 * 사람이 읽을 문장이 사라지고 백엔드 원문이 그대로 뜬다. 그래서 **있음**을 같이 문다.
 */
function conflictBranchAnswers(file: TS.SourceFile): boolean {
    let found = false;
    let ok = true;
    walk(file, (n) => {
        if (!ts.isIfStatement(n)) return;
        if (!find(n.expression, (c) => ts.isStringLiteral(c) && c.text === "IDEMPOTENCY_CONFLICT")) return;
        found = true;
        const rotates = find(
            n.thenStatement,
            (c) =>
                ts.isCallExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "rotateCartSessionKey",
        );
        const answers = find(n.thenStatement, (c) => ts.isReturnStatement(c) && !!c.expression);
        if (rotates || !answers) ok = false;
    });
    return found && ok;
}

/** **판정 ③** — `checkout` 호출 전부가 방문자 IP 를 선언하는가(인라인이든 변수든). */
function everyCheckoutDeclaresIp(file: TS.SourceFile): boolean {
    const declaresIp = (node: TS.Node): boolean =>
        find(node, (c) => {
            if (!ts.isPropertyAssignment(c) || !ts.isIdentifier(c.name) || c.name.text !== "context") return false;
            return find(c.initializer, (p) => {
                if (ts.isShorthandPropertyAssignment(p)) return p.name.text === "clientIp";
                if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || p.name.text !== "clientIp") return false;
                return p.initializer.getText() !== "undefined";
            });
        });
    const carries = (expr: TS.Node, file: TS.SourceFile): boolean => {
        if (declaresIp(expr)) return true;
        if (!ts.isIdentifier(expr)) return false;
        // ⚠ 변수로 뺀 세션도 선언까지 따라간다 — 인라인만 보면 객체를 변수로 빼는 정리 한 번에 그물이 꺼진다.
        return find(
            file,
            (c) =>
                ts.isVariableDeclaration(c) &&
                ts.isIdentifier(c.name) &&
                c.name.text === expr.text &&
                !!c.initializer &&
                declaresIp(c.initializer),
        );
    };
    const calls = checkoutCalls(file);
    if (calls.length === 0) return false;
    return calls.every((c) => {
        const session = c.arguments[1];
        return !!session && carries(session, file);
    });
}

test("주문 문들이 그 키를 쓰고, 충돌 갈래에서 카트를 안 돌린다", () => {
    for (const name of ROUTES) {
        const {file, rel} = routeSource(name);
        assert.ok(everyCheckoutUsesKeyBuilder(file), `${rel}: 멱등키를 손으로 만든다 — 내용이 바뀌면 409 로 막힌다`);
        assert.ok(conflictBranchAnswers(file), `${rel}: 충돌 갈래가 카트 키를 돌린다 — 재시도가 두 번째 주문이 된다`);
        assert.ok(everyCheckoutDeclaresIp(file), `${rel}: checkout 에 context.clientIp 가 없다`);
    }
});

test("위 판정 셋이 실제로 판정한다 — 같은 식을 가짜 소스에 돌려 잰다", () => {
    // ⛔ 「가짜 소스에 if 가 없다」 같은 항진명제를 재지 않는다. 라우트가 쓰는 **바로 그 함수**를 짝에 돌린다.
    const cases: ReadonlyArray<readonly [(f: TS.SourceFile) => boolean, string, boolean, string]> = [
        [everyCheckoutUsesKeyBuilder, "z.checkout(b, s, `co-${s.cartSessionKey}`);", false, "손으로 만든 키가 통과"],
        [
            everyCheckoutUsesKeyBuilder,
            "// orderIdempotencyKey 를 쓴다\nz.checkout(b, s, k);",
            false,
            "주석만 있어도 통과",
        ],
        [everyCheckoutUsesKeyBuilder, "z.checkout(b, s, orderIdempotencyKey(c, b));", true, "정당한 형상을 막았다"],
        [
            everyCheckoutUsesKeyBuilder,
            "z.checkout(a, s, orderIdempotencyKey(c, a)); z.checkout(b, s, `co-${c}`);",
            false,
            "호출 하나만 지켜도 통과",
        ],
        [
            conflictBranchAnswers,
            'if (e.code === "IDEMPOTENCY_CONFLICT") { rotateCartSessionKey(r); return r; }',
            false,
            "돌리는데 통과",
        ],
        [conflictBranchAnswers, 'if (e.code === "IDEMPOTENCY_CONFLICT") { return j(); }', true, "정당한 형상을 막았다"],
        [conflictBranchAnswers, "return j();", false, "갈래가 없는데 통과(공허참)"],
        [
            conflictBranchAnswers,
            'if (e.code === "IDEMPOTENCY_CONFLICT") { const c = j(); }',
            false,
            "아무것도 안 돌려주는데 통과",
        ],
        [
            everyCheckoutUsesKeyBuilder,
            "z.checkout(b, s, c ? undefined : orderIdempotencyKey(c, b));",
            false,
            "삼항 양팔이 뒤집혔는데 통과",
        ],
        [
            everyCheckoutDeclaresIp,
            "z.checkout(b, {...s, context: {clientIp: undefined}}, k);",
            false,
            "undefined 도 통과",
        ],
        [everyCheckoutDeclaresIp, "// context: {clientIp}\nz.checkout(b, s, k);", false, "주석만 있어도 통과"],
        [
            everyCheckoutDeclaresIp,
            "const w = {...s, context: {clientIp}}; z.checkout(b, w, k);",
            true,
            "변수를 못 따라간다",
        ],
    ];
    for (const [predicate, text, expected, why] of cases) {
        assert.equal(predicate(sourceOf(text)), expected, `${why}: ${text}`);
    }
});
