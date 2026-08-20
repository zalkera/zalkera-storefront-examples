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
    // 블록 본문의 범위는 **키 열**과 **지시자**가 정한다 — YAML 이 그렇게 읽는다.
    //
    // ⚠ 대시 열로 재면 안 된다. `- run: |` 에서 대시 열을 쓰면 같은 스텝의 뒤따르는 키
    //   (`env:`·`if:`·`name:`)가 전부 본문으로 삼켜진다. 그러면 GitHub 보안 문서가 권하는
    //   처방(`env:` 로 옮기기)과 가장 흔한 조건문(`if: <식>`)이 「셸 주입」으로 보고되고,
    //   고객은 오류문이 시키는 대로 이미 했는데도 고칠 수가 없다.
    //
    // ⚠ 지시자(`|2`)가 있으면 본문 들여쓰기는 **키 열 + 그 숫자**다. 첫 본문 줄로만 재면, 첫
    //   줄이 과들여쓰기됐을 때 그보다 얕은 **진짜 본문 줄**을 블록 밖으로 본다 — 그 자리의
    //   주입을 통째로 놓친다.
    let keyIndent = -1;
    let bodyIndent = -1;
    let pending = false;
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (pending || bodyIndent >= 0) {
            if (ln.trim() === "") continue;
            const col = ln.length - ln.trimStart().length;
            if (pending) {
                // 첫 본문 줄. 키 열보다 깊어야 본문이다 — 아니면 블록이 비어 있었다.
                if (col > keyIndent) {
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
        const block = /^(\s*)(-\s+)?(?:"run"|'run'|run):\s*[|>]([-+]?\d*|\d*[-+]?)\s*(?:#.*)?$/.exec(ln);
        if (block) {
            keyIndent = block[1].length + (block[2] ? block[2].length : 0);
            // ⚠ `|0` 은 YAML 상 무효다. 그리고 0 을 받으면 본문 들여쓰기가 **키 열과 같아져**
            //    형제 키(`env:`·`if:`)를 본문으로 삼킨다 — 앞서 두 번 차단됐던 그 형상이다.
            const digits = /\d+/.exec(block[3] ?? "");
            if (digits && Number(digits[0]) >= 1) {
                bodyIndent = keyIndent + Number(digits[0]);
                pending = false;
            } else {
                bodyIndent = -1;
                pending = true;
            }
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
 * 소스로 되돌아간다. 그래서 「신뢰 없는 값이 담긴 `env` 이름」을 모으고, `run:` 안에서 그 이름을
 * 식으로 꺼내는 자리를 잡는다. 셸 변수(`"$REF"`)는 잡지 않는다 — 그쪽이 안전한 길이다.
 *
 * ⚠ **이름에는 유효 범위가 있다.** 파일 전체에 뿌리면 잡 A 의 오염 이름이 잡 B 의 무해한 같은
 *   이름을 걸고, 스텝 A 의 것이 스텝 B 를 건다. 고객이 고칠 수 없는 거짓 실패다.
 *   범위는 그 `env:` 의 **형제 묶음이 끝날 때까지**다 — 워크플로 수준이면 파일 전체, 잡 수준이면
 *   그 잡, 스텝 수준이면 그 스텝.
 *
 * ⚠ **키 열로 잰다.** `- env:` 에서 대시 열을 쓰면 뒤따르는 형제 키(`with:` 등)를 매핑 안으로
 *   삼켜, 무해한 인자가 이름을 오염시킨다. `run:` 쪽과 같은 계열의 결함이다.
 */
function taintedRegions(src) {
    const lines = src.split("\n");
    const regions = [];
    for (let i = 0; i < lines.length; i++) {
        const head = /^(\s*)(-\s+)?env:\s*(?:#.*)?$/.exec(lines[i]);
        if (!head) continue;
        const keyCol = head[1].length + (head[2] ? head[2].length : 0);
        // 매핑의 끝: 키 열보다 **깊지 않은** 첫 줄.
        let mapEnd = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === "") continue;
            const c = lines[j].length - lines[j].trimStart().length;
            if (c <= keyCol) {
                mapEnd = j;
                break;
            }
        }
        // 이름의 유효 범위: 그 `env:` 의 **형제 묶음** 전체.
        //
        // ⚠ `env:` 줄부터 세면 안 된다. YAML·GitHub 은 선언 **순서와 무관하게** 그 묶음 전체에
        //   값을 먹이므로, `steps:` 뒤에 `env:` 를 둔 잡에서 위쪽 `run:` 을 통째로 놓친다.
        //   다만 `- env:`(시퀀스 항목)는 그 항목 자체가 묶음이라 그 줄부터다.
        let scopeFrom = i + 1;
        if (!head[2]) {
            for (let j = i - 1; j >= 0; j--) {
                if (lines[j].trim() === "") continue;
                const c = lines[j].length - lines[j].trimStart().length;
                if (c < keyCol) break;
                scopeFrom = j + 1;
            }
        }
        let scopeEnd = lines.length;
        for (let j = mapEnd; j < lines.length; j++) {
            if (lines[j].trim() === "") continue;
            const c = lines[j].length - lines[j].trimStart().length;
            if (c < keyCol) {
                scopeEnd = j;
                break;
            }
        }
        for (let j = i + 1; j < mapEnd; j++) {
            const entry = /^(\s*)([A-Za-z_][A-Za-z0-9_-]*):\s*(.+)$/.exec(lines[j]);
            if (!entry) continue;
            if (!entry[3].includes(EXPR_OPEN)) continue;
            if (!UNTRUSTED.some((bad) => bad.test(entry[3]))) continue;
            regions.push({name: entry[2], from: scopeFrom, to: scopeEnd});
        }
    }
    return regions;
}

/** 사람이 이름을 정할 수 있는 값이 **셸 소스로** 되돌아가는 자리. */
export function runInjections(src) {
    const found = [];
    const runLines = new Set(runRanges(src).map((r) => r.line));
    const tainted = taintedRegions(src);
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
        if (viaEnv && tainted.some((r) => r.name === viaEnv[1] && line >= r.from && line <= r.to)) {
            found.push({line, expr: e.body.trim(), where: "env"});
        }
    }
    return found;
}

/**
 * 워크플로 파일 목록. **건너뛴 것을 함께 돌려준다.**
 *
 * ⚠ 조용히 건너뛰면 그것이 구멍이다 — 이름이 `*.yml` 인 디렉터리나 읽기 권한 없는 파일이 있으면
 *   그 자리는 아무도 안 본 채 초록이 된다. 실패시키지는 않되(고객 CI 를 죽일 일이 아니다)
 *   **무엇을 안 봤는지는 말한다.**
 *
 * 심링크는 `isFile()` 이 거짓이라 여기서 빠진다 — 공유 워크플로를 심링크로 두는 트리가 통째로
 * 미검사가 되지 않게, 그 사실도 `skipped` 로 알린다.
 */
export function listWorkflowFiles(dir, fs) {
    const isYaml = (name) => name.endsWith(".yml") || name.endsWith(".yaml");
    let entries;
    try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
        return {files: [], skipped: []};
    }
    const files = [];
    const skipped = [];
    for (const e of entries) {
        if (!isYaml(e.name)) continue;
        if (!e.isFile()) {
            skipped.push({name: e.name, why: e.isDirectory() ? "디렉터리" : "일반 파일이 아님(심링크 등)"});
            continue;
        }
        files.push(e.name);
    }
    return {files: files.sort(), skipped};
}

/** 읽어 본다. 못 읽으면 `null` — 읽기 실패는 이 검사기가 판정할 성질이 아니다. */
export function readWorkflow(dir, name, fs) {
    try {
        return fs.readFileSync(`${dir}/${name}`, "utf8");
    } catch (error) {
        return null;
    }
}
