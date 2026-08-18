/**
 * 테마 enum 의 **정본에서 읽는다** — `src/lib/theme.ts` 의 `FONTS`·`RADII`·`DENSITIES` 선언.
 *
 * ⚠ 여기에 값을 **베껴 적지 않는다.** 베끼면 정본이 바뀔 때 이 사본이 낡고, 검사기가 낡은 표로
 *   초록을 찍는다 — 이 레포가 이미 여러 번 겪은 형상이다.
 *
 * ⚠ **정규식으로 읽지 않는다.** 앞 판이 `\{([^}]*)\}` + `(\w+)\s*:` 로 읽었는데 둘 다 틀렸다:
 *   ⑴ `[^}]*` 는 값 안의 **템플릿 보간**(`` `…${SYSTEM_STACK}` ``) 첫 `}` 에서 잘린다 — `FONTS` 는
 *      두 번째 항목 중간에서 끝나 세 번째 `noto-serif-kr` 을 **아예 못 봤다**.
 *   ⑵ `(\w+)\s*:` 는 따옴표 키(`"noto-serif-kr":`)를 못 잡고, 반대로 **값 안의** `foo:`(예: URL 의
 *      `https:`)를 키로 잡는다. 못 잡으면 정상 시드를 거짓 반려하고, 잘못 잡으면 계약 밖 값을 통과시킨다.
 *   선언을 파싱하는 일은 파서에게 시킨다. 문자열·주석 안의 가짜 선언에도 속지 않는다.
 *
 * **못 읽으면 통과가 아니라 중단이다.** 열거할 수 없는 형태(스프레드·계산된 키·객체가 아닌 초기자)를
 * 만나면 조용히 건너뛰지 않고 던진다 — 건너뛰면 허용목록이 작아져 정상 시드를 반려한다.
 */
import ts from "typescript";

/** 시드 필드 → `theme.ts` 의 선언 이름. */
export const THEME_DECLS = [
    ["font", "FONTS"],
    ["radius", "RADII"],
    ["density", "DENSITIES"],
];

/** 프로퍼티 이름 노드에서 키를 뽑는다. 정적으로 못 정하는 형태는 null 을 돌려 호출부가 던지게 한다. */
function staticKey(name) {
    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
    if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
    if (ts.isNumericLiteral(name)) return name.text;
    return null; // ComputedPropertyName — 값이 실행 시점에 정해진다
}

/** 소스 텍스트에서 `decl` 객체 리터럴의 키 목록. 못 읽으면 던진다. */
export function readEnumKeys(source, decl, where = "theme.ts") {
    const file = ts.createSourceFile(where, source, ts.ScriptTarget.Latest, true);

    let init = null;
    for (const stmt of file.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        for (const d of stmt.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === decl) init = d.initializer ?? null;
        }
    }
    if (init === null) throw new Error(`테마 계약을 읽지 못했습니다 — ${where} 에서 ${decl} 선언을 못 찾았습니다`);

    // 값을 바꾸지 않는 껍질을 벗긴다 — `as const`·`satisfies`·괄호·타입 단언. 그래도 객체가 아니면
    // 열거할 수 없다. ⚠ 껍질 하나를 빠뜨리면 그 관용구를 쓴 **정상 선언이 거짓 반려**된다
    // (`as const satisfies Record<…>` 는 객체 리터럴인데 "객체가 아니다"로 죽는다). fail-closed 라
    // 배송 결함은 아니지만 정상 리팩터링을 막는다.
    let node = init;
    for (;;) {
        if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
        else if (ts.isSatisfiesExpression?.(node)) node = node.expression;
        else if (ts.isTypeAssertionExpression?.(node)) node = node.expression;
        else if (ts.isNonNullExpression?.(node)) node = node.expression;
        else break;
    }
    if (!ts.isObjectLiteralExpression(node)) {
        throw new Error(`${decl} 이 객체 리터럴이 아닙니다 — 값을 열거할 수 없습니다(${where})`);
    }

    const keys = [];
    for (const p of node.properties) {
        if (ts.isSpreadAssignment(p)) {
            throw new Error(`${decl} 에 스프레드가 있습니다 — 값을 전부 열거할 수 없습니다(${where})`);
        }
        if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) {
            throw new Error(`${decl} 에 값 대입이 아닌 멤버가 있습니다 — 계약으로 읽을 수 없습니다(${where})`);
        }
        const key = staticKey(p.name);
        if (key === null) {
            throw new Error(`${decl} 에 계산된 키가 있습니다 — 정적으로 열거할 수 없습니다(${where})`);
        }
        keys.push(key);
    }
    if (keys.length === 0) throw new Error(`테마 계약이 비었습니다 — ${decl}(${where})`);
    return keys;
}

/** 시드 필드별 허용값. `readEnumKeys` 를 세 선언에 돌린다. */
export function readThemeEnums(source, where = "src/lib/theme.ts") {
    const out = {};
    for (const [field, decl] of THEME_DECLS) out[field] = readEnumKeys(source, decl, where);
    return out;
}
