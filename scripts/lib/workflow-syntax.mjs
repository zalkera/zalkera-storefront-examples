/**
 * **워크플로가 GitHub 에서 기동하는가, 그리고 셸에 남의 글자를 흘리지 않는가.** 판정부만 둔다.
 *
 * ■ YAML 이 유효한 것과 워크플로가 유효한 것은 다르다
 *   블록 스칼라 안에서는 `#` 이 YAML 주석이 아니라 **본문**이다. 거기 글자 그대로 쓴 GitHub 식은
 *   진짜 식으로 읽히고, 안이 비어 있으면 「An expression was expected」로 파일 전체가 파싱에
 *   실패한다. 잡의 실패가 아니라 **기동 실패**라 로그도 안 남는다. YAML 파서는 통과시킨다.
 *
 * ■ 왜 트리가 아니라 여기를 시험하나
 *   종전 시험은 「우리 워크플로 파일이 트리에 있는가」를 통제군으로 삼았다. 그 파일은 **고객
 *   소유**다 — 지우는 것이 정상적인 선택(그 워크플로는 쓰기 권한을 갖는다)인데, 지우면 고객의
 *   `npm test` 가 빨개지고 배포가 막혔다. 통제군은 **검출기가 도는가**를 물어야지 남의 파일이
 *   있는가를 물으면 안 된다. 그래서 판정을 순수 함수로 내리고, 시험은 픽스처로 건다.
 */

/** 이 파일 자신이 그 글자를 안 갖도록 조립해서 쓴다 — 안 그러면 자기 검사에 걸린다. */
export const EXPR_OPEN = "$" + "{{";

/**
 * 사람이 이름을 정할 수 있는 값. `run:` 에 보간되면 큰따옴표 안에서도 `$( )`·백틱이 평가된다.
 *
 * `github.` 전부를 막지 않는 이유: `github.sha`·`github.repository` 는 안전하고 흔해서 막으면
 * 면제가 늘어난다. **면제는 구멍이다** — 위험한 칸만 닫힌 목록으로 둔다.
 */
export const UNTRUSTED = [
    /\bgithub\.event\b/,
    /\bgithub\.head_ref\b/,
    /\bgithub\.base_ref\b/,
    /\bgithub\.ref_name\b/,
    /\bgithub\.ref\b/,
    /\binputs\./,
];

/** 줄 번호를 **누적**으로 센다. `src.slice(0, i).split("\n")` 는 발견마다 앞부분을 통째로 복사해 제곱이 된다. */
function lineCounter(src) {
    let scanned = 0;
    let line = 1;
    return (at) => {
        for (let k = scanned; k < at; k++) if (src.charCodeAt(k) === 10) line++;
        scanned = at;
        return line;
    };
}

/** 파일 안의 모든 `${`+`{ … }}` 를 위치와 함께. 안 닫힌 것은 `end === null`. */
export function expressions(src) {
    const at = lineCounter(src);
    const out = [];
    let i = 0;
    for (;;) {
        const start = src.indexOf(EXPR_OPEN, i);
        if (start < 0) break;
        const end = src.indexOf("}}", start + EXPR_OPEN.length);
        out.push({
            start,
            end: end < 0 ? null : end,
            line: at(start),
            body: end < 0 ? src.slice(start + EXPR_OPEN.length) : src.slice(start + EXPR_OPEN.length, end),
        });
        if (end < 0) break;
        i = end + 2;
    }
    return out;
}

/** 「기동조차 못 하는」 식 — 본문이 비었거나 안 닫혔다. */
export function emptyExpressions(src) {
    return expressions(src)
        .filter((e) => e.end === null || e.body.trim().length === 0)
        .map((e) => ({line: e.line, why: e.end === null ? "안 닫힘" : "본문 없음"}));
}

/**
 * `run:` 이 셸에 넘기는 글자의 범위. **블록 스칼라와 한 줄 형태를 둘 다** 본다.
 *
 * 한 줄 `- run: echo "…"` 은 이 취약점의 가장 흔한 작성 형태다 — 블록만 보면 그 자리를 통째로 놓친다.
 * 들여쓰기 지시자(`|2`)와 지시자 뒤 주석도 블록으로 인정한다 — YAML 이 그것을 블록으로 읽는다.
 */
export function runRanges(src) {
    const lines = src.split("\n");
    const out = [];
    // 블록 본문의 범위는 **첫 본문 줄의 들여쓰기**가 정한다 — YAML 이 그렇게 읽는다.
    //
    // ⚠ 헤더 줄의 들여쓰기로 재면 안 된다. `- run: |` 에서 그 값은 **대시 열**이라, 같은 스텝의
    //   뒤따르는 키(`env:`·`if:`·`name:`)가 전부 본문으로 삼켜진다. 그러면 GitHub 보안 문서가
    //   권하는 처방(`env:` 로 옮기기)과 가장 흔한 조건문(`if: <식>`)이 「셸 주입」으로 보고되고,
    //   고객은 오류문이 시키는 대로 이미 했는데도 고칠 수가 없다.
    let headerIndent = -1;
    let bodyIndent = -1;
    let pending = false;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (pending || bodyIndent >= 0) {
            if (ln.trim() === "") continue;
            const col = ln.length - ln.trimStart().length;
            if (pending) {
                // 첫 본문 줄. 헤더보다 깊어야 본문이다 — 아니면 블록이 비어 있었다는 뜻이다.
                if (col > headerIndent) {
                    bodyIndent = col;
                    pending = false;
                    out.push({line: i + 1, text: ln});
                    continue;
                }
                pending = false;
                bodyIndent = -1;
            } else if (col >= bodyIndent) {
                out.push({line: i + 1, text: ln});
                continue;
            } else {
                bodyIndent = -1;
            }
        }
        // 지시자와 chomp 는 **어느 순서로도** 온다(`|2-` · `|-2`). 둘 다 받는다.
        const block = /^(\s*)(?:-\s+)?(?:"run"|'run'|run):\s*[|>](?:[-+]?\d*|\d*[-+]?)\s*(?:#.*)?$/.exec(ln);
        if (block) {
            headerIndent = block[1].length;
            pending = true;
            continue;
        }
        const inline = /^(\s*)(?:-\s+)?(?:"run"|'run'|run):[^\S\n](.*)$/.exec(ln);
        if (inline && inline[2].trim().length > 0) out.push({line: i + 1, text: inline[2]});
    }
    return out;
}

/**
 * `env:` 로 **옮기는** 것은 처방이지 결함이 아니다. `env: REF: <식>` 은 셸이 그 값을 코드가 아니라
 * 데이터로 보게 하는 정석이다. 여기서 그것을 막으면 우리 처방 자체가 걸리고, 고칠 방법이 없다.
 *
 * 위험한 것은 **다시 꺼내는 쪽**이다. `run:` 안에서 `<식> env.REF }}` 로 꺼내면 그 글자가 셸
 * 소스로 되돌아간다. 그래서 「신뢰 없는 값이 담긴 `env` 이름」을 먼저 모으고, `run:` 안에서
 * 그 이름을 식으로 꺼내는 자리를 잡는다. 셸 변수(`"$REF"`)는 잡지 않는다 — 그쪽이 안전한 길이다.
 */
function taintedEnvNames(src) {
    const names = new Set();
    // ⚠ **`env:` 매핑 아래만 본다.** 파일 전역에서 「이름: 값」을 주우면 `with: ref: <식>` 같은
    //   무해한 인자까지 이름을 오염시키고, 그러면 딴 곳의 멀쩡한 `env.ref` 가 걸린다.
    let envIndent = -1;
    for (const ln of src.split("\n")) {
        if (ln.trim() === "") continue;
        const col = ln.length - ln.trimStart().length;
        if (envIndent >= 0 && col <= envIndent) envIndent = -1;
        if (/^\s*(?:-\s+)?env:\s*(?:#.*)?$/.test(ln)) {
            envIndent = col;
            continue;
        }
        if (envIndent < 0) continue;
        const m = /^\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.+)$/.exec(ln);
        if (!m || !m[2].includes(EXPR_OPEN)) continue;
        if (UNTRUSTED.some((bad) => bad.test(m[2]))) names.add(m[1]);
    }
    return names;
}

/** 사람이 이름을 정할 수 있는 값이 **셸 소스로** 되돌아가는 자리. */
export function runInjections(src) {
    const found = [];
    const runLines = new Set(runRanges(src).map((r) => r.line));
    const tainted = taintedEnvNames(src);
    const at = lineCounter(src);
    for (const e of expressions(src)) {
        const line = at(e.start);
        if (!runLines.has(line)) continue;
        const direct = UNTRUSTED.find((bad) => bad.test(e.body));
        if (direct) {
            found.push({line, expr: e.body.trim(), where: "run"});
            continue;
        }
        const viaEnv = /\benv\.([A-Za-z_][A-Za-z0-9_-]*)/.exec(e.body);
        if (viaEnv && tainted.has(viaEnv[1])) {
            found.push({line, expr: e.body.trim(), where: "env"});
        }
    }
    return found;
}
