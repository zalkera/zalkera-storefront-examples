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
        // 외부 이미지 — `<img>` 로 안 그리고 링크로 그린다(방문자 브라우저가 남의 호스트를
        // 자동으로 안 부른다). 소독과 꼴 판정을 **자기 함수**가 진다 — 그 파일은 5벌이 바이트로
        // 잠겨 있어 한 벌만 갈리면 CI 가 빨강이다.
        "a.href ← bodyImageHref()",
        "a.href ← safeLinkUrl()", // 본문 링크
        "a.href ← safeLinkUrl()", // 외부 영상 펜스
        // 이미지·영상은 한 겹 더 좁다(외부 주소를 안 받는다) — 그래서 자기 함수다.
        "img.src ← bodyMediaSrc()",
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
const SANITIZER_NAMES = ["bodyImageHref", "bodyMediaSrc", "bodyVideoSrc", "safeLinkUrl"];

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

/** 팩 사본 하나 아래의 `.ts`·`.tsx` 전부(재귀). `program` 은 presets 를 안 보므로 손으로 훑는다. */
function sourcesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string): void => {
        for (const entry of readdirSync(d, {withFileTypes: true})) {
            const path = join(d, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (/\.tsx?$/.test(entry.name)) out.push(path);
        }
    };
    walk(dir);
    return out;
}

/** `수신자.멤버(...)` 호출이 있는가 — **주석·문자열 안의 같은 이름에 안 걸린다**. */
function callsMember(sf: TS.SourceFile, receiver: string, member: string): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.expression.getText(sf) === receiver &&
            node.expression.name.getText(sf) === member
        ) {
            found = true;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

function sourceOf(path: string): TS.SourceFile {
    return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** 그 파일이 `dangerouslySetInnerHTML` 을 **JSX 속성으로** 쓰는가. 문자열 등장이 아니라 속성 노드다. */
function setsInnerHtml(sf: TS.SourceFile): boolean {
    let found = false;
    const visit = (node: TS.Node): void => {
        if (ts.isJsxAttribute(node) && node.name.getText(sf) === "dangerouslySetInnerHTML") found = true;
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/**
 * 원시 HTML 을 넣는 자리는 **정확히 한 곳**이고, 거기서도 이스케이프를 남에게 맡긴다.
 *
 * 이 팩의 소스를 고치는 주체는 고객의 LLM 이다. JSON-LD 에 실리는 값(제목·작성자·태그·회사명)은
 * 콘솔에서 사람이 적은 자유 문자열이라, 그 자리에서 `JSON.stringify` 를 직접 부르면 `</script>` 로
 * 스크립트가 닫히고 그 뒤가 마크업이 된다. 그래서 **자리 자체**를 고정한다.
 */
test("원시 HTML 삽입은 5벌 모두 JsonLd 한 곳뿐이다", () => {
    for (const [label, dir] of PACK_SRCS) {
        const files = sourcesUnder(dir);
        // 통제군 — 빈손이면 아래 단언이 공허참이다.
        assert.ok(files.length > 20, `${label}: 훑은 파일이 ${files.length}개뿐이다`);
        const offenders = files
            .filter((path) => setsInnerHtml(sourceOf(path)))
            .map((path) => relative(dir, path).split("\\").join("/"));
        assert.deepEqual(offenders.sort(), ["components/JsonLd.tsx"], `${label}: 원시 HTML 자리가 늘었다`);
    }
});

test("그 한 곳도 이스케이프를 `jsonLdScriptBody` 에 맡긴다 — 여기서 stringify 를 직접 부르지 않는다", () => {
    for (const {label, sf} of packCopies("components/JsonLd.tsx")) {
        assert.ok(callsFunction(sf, "jsonLdScriptBody"), `${label}: 소독기를 안 부른다`);
        // ⚠ 문면으로 세지 마라 — 바로 위 주석이 그 이름을 적고 있어서 **자기 설명에 걸린다**(실측).
        //   재현: 이 줄을 `sf.getFullText().includes("JSON.stringify")` 로 되돌리고
        //   `node --experimental-strip-types --test src/lib/astGuards.test.ts` → 이 시험만 red.
        assert.equal(callsMember(sf, "JSON", "stringify"), false, `${label}: stringify 를 직접 부른다`);
    }
});

test("본문 렌더러 5벌이 소독기를 «정본 모듈에서» 가져온다 — 동명 지역함수로 못 가린다", () => {
    const expected = [
        "bodyImageHref ← @/lib/mediaRef",
        "bodyMediaSrc ← @/lib/mediaRef",
        "bodyVideoSrc ← @/lib/mediaRef",
        "safeLinkUrl ← @/lib/safeUrl",
    ];
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

/**
 * 🔴 **섹션 렌더러 14종에는 그물이 0 이었다.**
 *
 * `Markdown.tsx` 는 5벌의 주소 배선을 값으로 못박는데, `components/sections/**` 는 아무것도 안
 * 잠겨 있었다. 심의가 `HeroSection.tsx` 의 `assetPath(c?.asset)` 을 `asString(c?.asset)` 으로
 * 바꿔 **임의 제3자 `<img src>`** 를 세웠는데 `validate`·`test`·`verify` 가 전부 초록이었다.
 * AI 유지보수 레인 A 가 손대는 것이 정확히 이 파일들이다.
 *
 * ⚠ **파일마다 목록을 값으로 못박지 않는다** — 섹션은 얼굴이라 갈려도 되고, 못박으면 새 섹션이
 *   생길 때마다 시험이 낡는다. 대신 **술어**를 건다: 주소를 내는 속성은 전부 «소독기를 거친 것»
 *   이거나 «리터럴» 이어야 한다. 그래서 새 섹션도 자동으로 분모에 든다.
 *
 * ⚠ 섹션의 관례는 **`.map()` 안에서 소독하고 객체에 담아 그리는 것**이라(`{asset: assetPath(...)}`
 *   → `item.asset`), 한 단계만 되짚는 `urlWiring` 으로는 그 꼴을 「식」으로만 읽는다. 그래서
 *   여기서는 **객체 리터럴 프로퍼티까지** 되짚는다 — 안 그러면 안전한 자리가 전부 빨강이 돼
 *   시험이 곧 꺼진다.
 */
const SECTION_URL_SANITIZERS = new Set(["assetPath", "mediaSrc", "safeLinkUrl", "blogPagePath"]);

/**
 * 주소를 내는 속성 이름.
 *
 * ⛔ **태그가 HTML 인가로 가르지 마라.** `next/link` 의 `<Link href>` 는 정확히 `<a href>` 로
 *    나간다 — 대문자 태그를 빼면 이 트리의 링크 소독이 통째로 그물 밖에 선다.
 *    **속성 이름으로** 가른다. 대신 URL 이 아닌 동명 prop(`JsonLd.data`)은 이름 목록에서 뺀다.
 */
const SECTION_URL_ATTRS = new Set([
    "src",
    "srcSet",
    "href",
    "poster",
    "action",
    "formAction",
    "ping",
    "cite",
    "background",
    "style",
]);
// ⚠ `data` 는 뺐다 — HTML 의 `<object data>` 보다 `JsonLd data` 가 이 트리에서 훨씬 흔하고,
//   그 값은 주소가 아니라 JSON-LD 객체다. `<object>` 는 이 팩에 0건이다.

/**
 * 섹션 파일 하나의 «주소 속성 → 출처» 목록. 출처를 못 따라가면 그 사실을 적는다(«?» 도 값이다).
 *
 * 되짚는 것: 변수 선언 · **객체 리터럴 프로퍼티** · 삼항·`&&`·`??` 의 **모든 가지**.
 */
function sectionUrlOrigins(sf: TS.SourceFile): string[] {
    const varInit = new Map<string, TS.Node[]>();
    const propInit = new Map<string, TS.Node[]>();
    const push = (m: Map<string, TS.Node[]>, k: string, v: TS.Node): void => {
        const list = m.get(k) ?? [];
        list.push(v);
        m.set(k, list);
    };
    const collect = (node: TS.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            push(varInit, node.name.text, node.initializer);
        }
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
            push(propInit, node.name.text, node.initializer);
        }
        // `{asset}` 축약 — 값의 출처는 같은 이름의 변수다.
        if (ts.isShorthandPropertyAssignment(node)) push(propInit, node.name.text, node.name);
        ts.forEachChild(node, collect);
    };
    collect(sf);

    const out: string[] = [];
    const origin = (node: TS.Node, depth: number): string => {
        if (depth > 4) return "?(너무 깊다)";
        if (ts.isParenthesizedExpression(node)) return origin(node.expression, depth);
        if (ts.isNonNullExpression(node) || ts.isAsExpression(node)) return origin(node.expression, depth);
        if (ts.isJsxExpression(node)) return node.expression ? origin(node.expression, depth) : "?(빈 식)";
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return "리터럴";
        if (ts.isTemplateExpression(node)) {
            return node.templateSpans.map((sp) => origin(sp.expression, depth + 1)).join("+") || "리터럴";
        }
        if (ts.isCallExpression(node)) {
            const callee = ts.isIdentifier(node.expression) ? node.expression.text : node.expression.getText(sf);
            return SECTION_URL_SANITIZERS.has(callee) ? "소독" : `${callee}()`;
        }
        if (ts.isConditionalExpression(node)) {
            const both = [origin(node.whenTrue, depth + 1), origin(node.whenFalse, depth + 1)];
            return both.every((o) => o === "소독" || o === "리터럴") ? "소독" : both.join("|");
        }
        if (ts.isBinaryExpression(node)) {
            const both = [origin(node.left, depth + 1), origin(node.right, depth + 1)];
            return both.every((o) => o === "소독" || o === "리터럴") ? "소독" : both.join("|");
        }
        const name = ts.isIdentifier(node)
            ? node.text
            : ts.isPropertyAccessExpression(node)
              ? node.name.text
              : ts.isPropertyAccessChain(node)
                ? node.name.text
                : null;
        if (name === null) return `?(${node.getText(sf).slice(0, 40)})`;
        const seeds = [...(varInit.get(name) ?? []), ...(propInit.get(name) ?? [])].filter((n) => n !== node);
        if (seeds.length === 0) return `?(${name})`;
        const kinds = new Set(seeds.map((n) => origin(n, depth + 1)));
        return kinds.size === 1 ? [...kinds][0]! : `여러 갈래(${[...kinds].sort().join("|")})`;
    };

    const visit = (node: TS.Node): void => {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const tag = node.tagName.getText(sf);
            for (const attr of node.attributes.properties) {
                if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
                const an = attr.name.text;
                if (!SECTION_URL_ATTRS.has(an) || attr.initializer === undefined) continue;
                out.push(`${tag}.${an} ← ${origin(attr.initializer, 0)}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

test("🔴 섹션 렌더러가 내는 주소는 전부 소독기를 거친다 — 5벌 전수", () => {
    const dir = "components/sections";
    const names = readdirSync(join(PACK_SRCS[0]![1], dir))
        .filter((f) => f.endsWith(".tsx"))
        .sort();
    assert.ok(names.length >= 10, `섹션이 ${names.length}개뿐이다 — 분모가 무너졌다(이 시험이 공허참이다)`);

    const bad: string[] = [];
    let checked = 0;
    for (const name of names) {
        for (const {label, sf} of packCopies(`${dir}/${name}`)) {
            for (const entry of sectionUrlOrigins(sf)) {
                checked += 1;
                const from = entry.split("← ")[1] ?? "";
                if (from !== "소독" && from !== "리터럴") bad.push(`${label} ${name}: ${entry}`);
            }
        }
    }
    assert.deepEqual(bad, [], "소독기를 안 거친 주소 배선");
    // 통제군 — 훑어서 본 배선이 0이면 위 단언이 공허참이다.
    assert.ok(checked > 0, "섹션에서 주소 배선을 하나도 못 봤다 — 훑개가 죽었다");
});

test("양성 통제군 — 섹션 판정이 «소독 안 한 값» 을 구분한다", () => {
    const mk = (code: string): TS.SourceFile =>
        ts.createSourceFile("m.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    // 소독 → 통과
    assert.deepEqual(sectionUrlOrigins(mk("const a = assetPath(x); const v = <img src={a} />;")), ["img.src ← 소독"]);
    // `.map()` 안에서 소독하고 객체로 담는 섹션 관례 → 통과
    assert.deepEqual(
        sectionUrlOrigins(
            mk("const items = raw.map((i) => ({asset: assetPath(i.a)})); const v = <img src={item.asset} />;"),
        ),
        ["img.src ← 소독"],
    );
    // 소독을 뺀 형태 → 잡힌다
    assert.deepEqual(sectionUrlOrigins(mk("const a = asString(x); const v = <img src={a} />;")), [
        "img.src ← asString()",
    ]);
    assert.deepEqual(sectionUrlOrigins(mk("const v = <img src={item.asset} />;")), ["img.src ← ?(asset)"]);
    // 🔴 `next/link` 의 `href` 는 `<a href>` 가 된다 — 대문자 태그라고 빼면 안 된다.
    assert.deepEqual(sectionUrlOrigins(mk("const v = <Link href={item.href}>t</Link>;")), ["Link.href ← ?(href)"]);
    assert.deepEqual(sectionUrlOrigins(mk("const v = <Link href={safeLinkUrl(u)}>t</Link>;")), ["Link.href ← 소독"]);
    // URL 이 아닌 동명 prop 은 이름 목록에서 뺐다.
    assert.deepEqual(sectionUrlOrigins(mk('const v = <JsonLd data={{"@context": "https://x"}} />;')), []);
});
