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
 * ⛔ **결제 시작 번호는 주문 본문의 그 번호다.** 다른 값을 넣으면 같은 번호가 두 표기로 나간다.
 * ⛔ **본문은 길이 상한과 함께 읽는다.** 멱등키가 본문을 한 번 더 훑으므로, 상한이 없으면 큰 본문
 * 하나가 이벤트 루프를 오래 쥔다.
 *
 * 규칙은 함수(`orderIdempotencyKey`)가 지고 **행위로 잰다.** 구문 트리 쪽은 「라우트가 그 함수에 **주문
 * 본문을** 넣는가 · 충돌 갈래가 회전을 안 부르는가 · 결제 시작 번호 · 본문 상한」만 본다. 판정식은 마지막
 * 시험이 가짜 소스에 직접 돌려 잰다.
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

/** 파일 안에서 이 이름을 선언한 자리 수. */
function declarationCount(file: TS.SourceFile, name: string): number {
    let count = 0;
    walk(file, (n) => {
        if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && ts.isIdentifier(n.name) && n.name.text === name) {
            count += 1;
        }
    });
    return count;
}

/**
 * `checkout` 첫 인자(주문 본문)의 이름. 식별자가 아니거나 **파일 안에서 두 번 이상 선언된 이름**이면 `null` —
 * 바깥 원문과 안쪽 주문 본문이 같은 이름이면 이름만으로는 어느 값을 가리키는지 모른다.
 */
function orderBodyName(call: TS.CallExpression, file: TS.SourceFile): string | null {
    const body = call.arguments[0];
    if (!body || !ts.isIdentifier(body) || declarationCount(file, body.text) !== 1) return null;
    return body.text;
}

/**
 * **판정 ①** — `checkout` 호출 전부가 멱등키를 **그 함수로, 그 호출의 주문 본문을 넣어** 만드는가.
 * 함수를 부르는지만 보면 `orderIdempotencyKey(key, {})` 가 통과한다 — 지문이 늘 같아져 카트 키만 쓴 것과
 * 같은 409 가 돌아온다.
 */
function everyCheckoutUsesKeyBuilder(file: TS.SourceFile): boolean {
    const calls = checkoutCalls(file);
    if (calls.length === 0) return false;
    return calls.every((c) => {
        const body = orderBodyName(c, file);
        if (!body) return false;
        const builds = (n: TS.Node): boolean =>
            find(n, (k) => {
                if (!ts.isCallExpression(k) || !ts.isIdentifier(k.expression)) return false;
                if (k.expression.text !== "orderIdempotencyKey") return false;
                const hashed = k.arguments[1];
                return !!hashed && ts.isIdentifier(hashed) && hashed.text === body;
            });
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

/** **판정 ④** — `startPayment` 호출 전부가 번호로 **주문 본문의** `buyerPhone` 을 넘기는가. */
function paymentPhoneIsOrderPhone(file: TS.SourceFile): boolean {
    const calls = checkoutCalls(file);
    const names = calls.map((c) => orderBodyName(c, file));
    if (calls.length === 0 || names.some((n) => n === null)) return false;
    const starts: TS.CallExpression[] = [];
    walk(file, (n) => {
        if (!ts.isCallExpression(n)) return;
        const callee = n.expression;
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "startPayment") starts.push(n);
    });
    if (starts.length === 0) return false;
    return starts.every((call) => {
        const access = call.arguments[1];
        if (!access || !ts.isObjectLiteralExpression(access)) return false;
        const phone = access.properties.find(
            (p): p is TS.PropertyAssignment =>
                ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "phone",
        );
        if (!phone) return false;
        const init = phone.initializer;
        return (
            ts.isPropertyAccessExpression(init) &&
            init.name.text === "buyerPhone" &&
            ts.isIdentifier(init.expression) &&
            names.includes(init.expression.text)
        );
    });
}

/** **판정 ⑤** — 주문 본문을 `readJsonBody` 로 읽는다면 **길이 상한을 넘겨** 읽는가. */
function orderBodyIsBounded(file: TS.SourceFile): boolean {
    const names = new Set(checkoutCalls(file).map((c) => orderBodyName(c, file)));
    if (names.size === 0 || names.has(null)) return false;
    let ok = true;
    walk(file, (n) => {
        if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !names.has(n.name.text)) return;
        const init = n.initializer && ts.isAwaitExpression(n.initializer) ? n.initializer.expression : n.initializer;
        if (!init || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) return;
        if (init.expression.text === "readJsonBody" && init.arguments.length < 2) ok = false;
    });
    return ok;
}

test("주문 문들이 그 키를 쓰고, 충돌 갈래에서 카트를 안 돌린다", () => {
    for (const name of ROUTES) {
        const {file, rel} = routeSource(name);
        assert.ok(everyCheckoutUsesKeyBuilder(file), `${rel}: 멱등키를 손으로 만든다 — 내용이 바뀌면 409 로 막힌다`);
        assert.ok(conflictBranchAnswers(file), `${rel}: 충돌 갈래가 카트 키를 돌린다 — 재시도가 두 번째 주문이 된다`);
        assert.ok(everyCheckoutDeclaresIp(file), `${rel}: checkout 에 context.clientIp 가 없다`);
        assert.ok(
            paymentPhoneIsOrderPhone(file),
            `${rel}: 결제 시작 번호가 주문 번호와 다른 값이다 — 같은 번호가 두 표기로 나간다`,
        );
        assert.ok(orderBodyIsBounded(file), `${rel}: 주문 본문을 길이 상한 없이 읽는다`);
    }
});

test("위 판정들이 실제로 판정한다 — 같은 식을 가짜 소스에 돌려 잰다", () => {
    // ⛔ 「가짜 소스에 if 가 없다」 같은 항진명제를 재지 않는다. 라우트가 쓰는 **바로 그 함수**를 짝에 돌린다.
    const cases: ReadonlyArray<readonly [(f: TS.SourceFile) => boolean, string, boolean, string]> = [
        [everyCheckoutUsesKeyBuilder, "z.checkout(b, s, `co-${s.cartSessionKey}`);", false, "손으로 만든 키가 통과"],
        [
            everyCheckoutUsesKeyBuilder,
            "// orderIdempotencyKey 를 쓴다\nz.checkout(b, s, k);",
            false,
            "주석만 있어도 통과",
        ],
        [
            everyCheckoutUsesKeyBuilder,
            "const b = x; z.checkout(b, s, orderIdempotencyKey(c, b));",
            true,
            "정당한 형상을 막았다",
        ],
        [
            everyCheckoutUsesKeyBuilder,
            "const b = x; z.checkout(b, s, orderIdempotencyKey(c, {}));",
            false,
            "주문 본문 대신 고정값을 해시해도 통과",
        ],
        [
            everyCheckoutUsesKeyBuilder,
            "const b = x; const o = y; z.checkout(b, s, orderIdempotencyKey(c, o));",
            false,
            "다른 값을 해시해도 통과",
        ],
        [
            everyCheckoutUsesKeyBuilder,
            "const a = x; const b = y; z.checkout(a, s, orderIdempotencyKey(c, a)); z.checkout(b, s, `co-${c}`);",
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
            "const b = x; z.checkout(b, s, c ? undefined : orderIdempotencyKey(c, b));",
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
        [
            paymentPhoneIsOrderPhone,
            "const b = x; z.checkout(b, s, k); z.startPayment(n, {phone: b.buyerPhone});",
            true,
            "정당한 형상을 막았다",
        ],
        [
            paymentPhoneIsOrderPhone,
            "const b = x; z.checkout(b, s, k); z.startPayment(n, {phone: String(b.buyerPhone).trim()});",
            false,
            "다시 다듬은 번호가 통과",
        ],
        [
            paymentPhoneIsOrderPhone,
            "const b = x; z.checkout(b, s, k); z.startPayment(n, {phone: raw.phone});",
            false,
            "원문 번호가 통과",
        ],
        [
            paymentPhoneIsOrderPhone,
            "const b = raw; try { const b = y; z.checkout(b, s, k); } catch {} z.startPayment(n, {phone: b.buyerPhone});",
            false,
            "이름이 겹친 바깥 값이 통과",
        ],
        [paymentPhoneIsOrderPhone, "const b = x; z.checkout(b, s, k);", false, "결제 시작이 없는데 통과(공허참)"],
        [
            orderBodyIsBounded,
            "const b = await readJsonBody(req, MAX); z.checkout(b, s, k);",
            true,
            "정당한 형상을 막았다",
        ],
        [orderBodyIsBounded, "const b = await readJsonBody(req); z.checkout(b, s, k);", false, "상한 없이 읽어도 통과"],
    ];
    for (const [predicate, text, expected, why] of cases) {
        assert.equal(predicate(sourceOf(text)), expected, `${why}: ${text}`);
    }
});
