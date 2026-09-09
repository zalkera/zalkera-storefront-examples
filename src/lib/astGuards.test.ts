import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync} from "node:fs";
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

/**
 * **글 본문은 구조로 그린다** — 평문으로 되돌리는 회귀를 판정 층에서 잡는다.
 *
 * 🔴 저작이 마크다운인데 문자열을 그대로 내면 `h2`·`a`·`img` 가 하나도 안 생긴다. 답변 엔진이
 *    인용할 청크 경계도, 크롤러가 따라갈 내부 링크도 없는 문서가 된다.
 * ⚠ 문면이 아니라 **AST** 로 본다 — 주석 안의 예시나 다른 파일의 같은 문자열에 안 걸린다.
 *
 * ⚠ **정본만 재면 안 된다.** 위 `program` 은 `tsconfig` 를 따르는데 그것은 `presets` 를 **제외**한다
 *   (팩 소스를 자기 것으로 알면 루트 타입체크가 죽는다). 그래서 고객이 실제로 받는 4벌은 단언이
 *   0건이었다 — 넷에서 렌더러를 통째로 빼도 초록이었다. 타입이 필요 없는 판정(요소·속성의 형상)은
 *   체커 없이 파일마다 파서를 돌려 **5벌 전부**를 본다.
 */
// ⚠ **팩에는 `presets/` 가 없다** — 이 파일은 고객 zip 에도 그대로 실린다. 없으면 자기 `src` 만
//   본다(그 레포에서는 그것이 전부다). 있으면 4벌을 함께 잰다.
const PRESETS = join(ROOT, "presets");
const PACK_SRCS: [label: string, dir: string][] = [
    ["src", join(ROOT, "src")],
    ...(existsSync(PRESETS)
        ? readdirSync(PRESETS, {withFileTypes: true})
              .filter((e) => e.isDirectory() && existsSync(join(PRESETS, e.name, "src")))
              .map((e): [string, string] => [`presets/${e.name}`, join(PRESETS, e.name, "src")])
        : []),
];

/** 5벌의 같은 파일. 없으면 그것도 위반이다 — 파일을 지우는 것이 가드를 고치는 것보다 쉬우면 안 된다. */
function packCopies(relative: string): {label: string; sf: TS.SourceFile}[] {
    return PACK_SRCS.map(([label, dir]) => {
        const path = join(dir, relative);
        const text = readFileSync(path, "utf8"); // 없으면 여기서 죽는다(그것이 판정이다)
        return {label, sf: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)};
    });
}

/** 그 파일이 이 태그를 **요소로** 그리는가. 문면이 아니라 JSX 노드를 센다. */
function rendersTag(sf: TS.SourceFile, tag: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === tag) {
            found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** 그 파일이 이 함수를 **부르는가**(import 만 해 두고 안 쓰는 것과 가른다). */
function callsFunction(sf: TS.SourceFile, name: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
            found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

test("블로그 상세 5벌이 본문을 `Markdown` 으로 그린다 — 평문 복귀를 잡는다", () => {
    const copies = packCopies("app/blog/[slug]/page.tsx");
    assert.equal(copies.length, PACK_SRCS.length);
    for (const {label, sf} of copies) {
        assert.ok(rendersTag(sf, "Markdown"), `${label}: 본문을 «Markdown» 으로 안 그린다`);
    }
});

test("양성 통제군 — 그 판정이 «없음» 을 실제로 구분한다", () => {
    // ⚠ 종전 통제군은 `getFullText().includes("<Markdown")` 이라 **위 판정을 한 번도 안 불렀다** —
    //    문면 검사로 AST 그물을 통제하는 동어반복이었다. 같은 함수에 물어야 통제군이다.
    const [{sf}] = packCopies("lib/datetime.ts");
    assert.equal(rendersTag(sf!, "Markdown"), false, "통제군이 오염됐다 — 다른 파일을 고르라");
    assert.equal(rendersTag(packCopies("app/blog/[slug]/page.tsx")[0]!.sf, "존재하지않는태그"), false);
});

test("블로그 쪽 5벌이 공유 카드를 단다 — `pageMetadata` 를 실제로 부른다", () => {
    // 프리셋 4벌은 고객이 받는 것이다 — 여기서 안 재면 그 넷에서 호출이 사라져도 아무도 못 본다.
    for (const relative of ["app/blog/page.tsx", "app/blog/[slug]/page.tsx"]) {
        for (const {label, sf} of packCopies(relative)) {
            assert.ok(callsFunction(sf, "pageMetadata"), `${label}/${relative}: 공유 카드가 없다`);
        }
    }
});

/**
 * **본문 렌더러의 주소는 판정을 거쳐서만 속성이 된다.**
 *
 * 🔴 이 그물이 없어 팩은 `media:{id}` 를 소독기에 그대로 태우고 있었다 — 모르는 스킴이라 `#` 이
 *    되어 **본문 이미지가 전부 깨진** 채 배송됐다. 반대로 해석만 남기고 소독을 빼면 콘솔 입력
 *    `javascript:` 가 링크가 된다. 그래서 **어느 함수를 태우는지**를 값으로 못박는다.
 *
 * ⚠ 판정은 「함수 이름이 파일 어딘가에 있다」가 아니다 — 속성 초기화식을 따라가 그 자리의
 *   호출을 본다(변수 한 단계는 같은 파일의 선언으로 되짚는다). `src={node.src}` 로 되돌리면 red.
 */
const URL_ATTRS = new Set([
    "src",
    "href",
    // ⚠ **`src`·`href` 만 세면 그 밖으로 새면 그만이다.** 아래는 전부 브라우저가 **요청을 내는**
    //   속성이다. `poster` 는 영상 썸네일, `srcSet` 은 같은 `img` 에서 `src` 를 **이긴다**.
    "poster",
    "srcSet",
    "action",
    "formAction",
    "cite",
    "ping",
    "background",
    "data",
]);

/**
 * `<태그>.<속성> ← <부른 함수>()` 목록. 못 따라가면 그 사실을 그대로 적는다(«?» 도 값이다).
 *
 * ⚠ **이름이 갈리는 모든 자리를 «여러 갈래» 로 적는다.** 한 이름이 어디선가 호출식으로, 다른
 *   데서 맨 값으로 묶이면(`let src = ""; src = node.src;`) 그 이름의 배선은 더 이상 하나가 아니다.
 *   그것을 하나로 접으면 소독을 통째로 우회하는 형태가 초록으로 지나간다.
 */
function urlWiring(sf: TS.SourceFile): string[] {
    // 같은 파일의 `const x = f(...)` 한 단계만 되짚는다. 이름이 여러 갈래면 그 사실을 남긴다.
    const origins = new Map<string, Set<string>>();
    const note = (name: string, origin: string): void => {
        const set = origins.get(name) ?? new Set<string>();
        set.add(origin);
        origins.set(name, set);
    };
    const collect = (node: TS.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const init = node.initializer;
            if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
                note(node.name.text, `${init.expression.text}()`);
            } else if (init) {
                note(node.name.text, "맨 값");
            } else {
                note(node.name.text, "선언만");
            }
        }
        // 재대입은 그 자체로 갈래다 — 선언만 보면 뒤에서 바뀐 값을 못 본다.
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left)
        ) {
            note(node.left.text, "재대입");
        }
        ts.forEachChild(node, collect);
    };
    collect(sf);

    const originOf = (name: string): string => {
        const set = origins.get(name);
        if (!set) return `변수 ${name}`;
        return set.size === 1 ? `${[...set][0]}` : `여러 갈래(${[...set].sort().join("|")})`;
    };

    const out: string[] = [];
    const visit = (node: TS.Node): void => {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const tag = node.tagName.getText(sf);
            for (const attr of node.attributes.properties) {
                if (!ts.isJsxAttribute(attr)) continue;
                const name = attr.name.getText(sf);
                if (!URL_ATTRS.has(name)) continue;
                const init = attr.initializer;
                let origin = "없음";
                if (init && ts.isJsxExpression(init) && init.expression) {
                    const expr = init.expression;
                    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
                        origin = `${expr.expression.text}()`;
                    } else if (ts.isIdentifier(expr)) {
                        origin = originOf(expr.text);
                    } else {
                        origin = `식(${expr.getText(sf).slice(0, 40)})`;
                    }
                } else if (init && ts.isStringLiteral(init)) {
                    origin = `"${init.text}"`;
                }
                out.push(`${tag}.${name} ← ${origin}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out.sort();
}

test("본문 렌더러 5벌이 주소를 해석기·소독기에 태운다", () => {
    // 값을 그대로 단언한다 — 「소독 안 한 자리가 없다」는 자리가 0개여도 참이라 공허하다.
    const expected = [
        "a.href ← safeLinkUrl()", // 본문 링크
        "a.href ← safeLinkUrl()", // 외부 영상 펜스
        "img.src ← bodyMediaSrc()",
        // 영상은 한 겹 더 좁다(외부 주소를 안 받는다) — 그래서 자기 함수다.
        "video.src ← bodyVideoSrc()",
    ];
    for (const {label, sf} of packCopies("components/Markdown.tsx")) {
        assert.deepEqual(urlWiring(sf), expected, `${label}: 본문 렌더러의 주소 배선이 다르다`);
    }
});

test("양성 통제군 — 그 판정이 «맨 값» 을 구분한다", () => {
    // 소독을 뺀 형태를 실제로 지나가게 해 본다. 늘 초록이면 위 시험은 공허하다.
    const sf = ts.createSourceFile(
        "mutant.tsx",
        "const x = <><img src={node.src} /><a href={safeLinkUrl(u)}>t</a></>;",
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    assert.deepEqual(urlWiring(sf), ["a.href ← safeLinkUrl()", "img.src ← 식(node.src)"]);
});

/**
 * **소독기 이름이 «어디서» 오는가.**
 *
 * 🔴 배선 그물은 호출식의 **이름**만 본다. 그래서 import 를 지우고 같은 이름의 통과 함수를 같은
 *    파일에 심으면 배선 문자열이 그대로라 전 게이트가 초록이다 — 실제로 그 형상에서 본문의
 *    그 형상에서는 `media:13` 이 해석·소독을 통째로 우회해 **원문 그대로** 나간다.
 *    그래서 **이름의 출처**를 값으로 못박는다.
 */
const SANITIZER_NAMES = ["bodyMediaSrc", "bodyVideoSrc", "safeLinkUrl"];

/** `이름 ← 출처` — import 면 모듈 이름, 같은 파일이 만들었으면 «지역 선언». */
function nameSources(sf: TS.SourceFile): string[] {
    const out: string[] = [];
    const note = (name: string, origin: string): void => {
        if (SANITIZER_NAMES.includes(name)) out.push(`${name} ← ${origin}`);
    };

    const visit = (node: TS.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const bindings = node.importClause?.namedBindings;
            if (bindings && ts.isNamedImports(bindings)) {
                for (const element of bindings.elements) note(element.name.text, node.moduleSpecifier.text);
            }
        }
        // 같은 파일이 그 이름을 만들면 import 를 가린다 — 그것이 이 규칙이 잡는 형상이다.
        if (ts.isFunctionDeclaration(node) && node.name) note(node.name.text, "지역 선언");
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) note(node.name.text, "지역 선언");
        if (ts.isClassDeclaration(node) && node.name) note(node.name.text, "지역 선언");
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out.sort();
}

test("본문 렌더러 5벌이 소독기를 «정본 모듈에서» 가져온다 — 동명 지역함수로 못 가린다", () => {
    const expected = ["bodyMediaSrc ← @/lib/mediaRef", "bodyVideoSrc ← @/lib/mediaRef", "safeLinkUrl ← @/lib/safeUrl"];
    for (const {label, sf} of packCopies("components/Markdown.tsx")) {
        assert.deepEqual(nameSources(sf), expected, `${label}: 소독기 이름의 출처가 다르다`);
    }
});

test("양성 통제군 — 그 판정이 «자기가 만든 이름» 을 구분한다", () => {
    const sf = ts.createSourceFile(
        "shadow.tsx",
        'const bodyMediaSrc = (s: string) => s;\nimport {safeLinkUrl} from "@/lib/safeUrl";',
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    assert.deepEqual(nameSources(sf), ["bodyMediaSrc ← 지역 선언", "safeLinkUrl ← @/lib/safeUrl"]);
});
