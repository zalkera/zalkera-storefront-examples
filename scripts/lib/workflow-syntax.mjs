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
        // ⚠ **키와 콜론 사이에 공백이 올 수 있다.** `run : |` 은 유효한 YAML 이고 GitHub 이 그대로
        //    실행한다. 여기만 공백을 안 받으면 한 칸으로 이 검사기를 통째로 피할 수 있다.
        //    재현: `printf 'jobs:\n  a:\n    steps:\n      - run : echo hi\n' |
        //          python3 -c 'import yaml,sys; print(yaml.safe_load(sys.stdin)["jobs"]["a"]["steps"][0])'`
        //          → `{'run': 'echo hi'}`
        const block = /^(\s*)(-\s+)?(?:"run"|'run'|run)\s*:\s*[|>]([-+]?\d*|\d*[-+]?)\s*(?:#.*)?$/.exec(ln);
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
        const inline = /^(\s*)(?:-\s+)?(?:"run"|'run'|run)\s*:[^\S\n](.*)$/.exec(ln);
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
/**
 * 내용줄(빈 줄·주석 제외)마다 세 가지를 **한 번에** 구한다.
 *
 * ⚠ 이것이 없으면 `taintedRegions` 가 **제곱**이 된다. 열 0 의 `env:` 는 ⑴ 위로 더 얕은 줄을
 *   영영 못 만나 꼭대기까지 훑고 ⑵ 아래로도 더 얕은 줄이 없어 파일 끝까지 훑기 때문이다.
 *   실측(열 0 `env:` 만 있는 파일): 고치기 전 2,000줄 67ms · 8,000줄 1,056ms · 20,000줄 6,592ms.
 *   재현: `node scripts/lib/workflow-syntax.bench.mjs`
 *
 * 이 검사기는 **고객 트리에서도 돈다**(팩에 실린다). 고객이 만든 큰 워크플로 하나가 그 CI 를
 * 붙잡고 있게 둘 이유가 없다.
 *
 * - `shallower[i]` — 위쪽으로 처음 만나는 **더 얕은** 내용줄(없으면 `-1`).
 * - `nextAtOrShallower[i]` — 아래쪽으로 처음 만나는 **같거나 더 얕은** 내용줄(없으면 줄 수).
 * - `nextShallower[i]` — 아래쪽으로 처음 만나는 **더 얕은** 내용줄(없으면 줄 수).
 *
 * 빈 줄과 주석은 어느 축에서도 세지 않는다 — YAML 은 주석의 들여쓰기에 뜻을 두지 않는다.
 */
function indentIndex(lines) {
    const n = lines.length;
    const content = [];
    const indent = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        const t = lines[i].trim();
        if (t === "" || t.startsWith("#")) continue;
        indent[i] = lines[i].length - lines[i].trimStart().length;
        content.push(i);
    }
    const shallower = new Array(n).fill(-1);
    const nextAtOrShallower = new Array(n).fill(n);
    const nextShallower = new Array(n).fill(n);

    // 위쪽: 들여쓰기가 단조 증가하는 스택.
    const up = [];
    for (const i of content) {
        while (up.length > 0 && indent[up[up.length - 1]] >= indent[i]) up.pop();
        shallower[i] = up.length > 0 ? up[up.length - 1] : -1;
        up.push(i);
    }
    // 아래쪽: 같은 스택을 뒤에서부터. 두 축을 따로 굴린다(하나는 `<=`, 하나는 `<`).
    const downLE = [];
    const downLT = [];
    for (let k = content.length - 1; k >= 0; k--) {
        const i = content[k];
        while (downLE.length > 0 && indent[downLE[downLE.length - 1]] > indent[i]) downLE.pop();
        nextAtOrShallower[i] = downLE.length > 0 ? downLE[downLE.length - 1] : n;
        downLE.push(i);

        while (downLT.length > 0 && indent[downLT[downLT.length - 1]] >= indent[i]) downLT.pop();
        nextShallower[i] = downLT.length > 0 ? downLT[downLT.length - 1] : n;
        downLT.push(i);
    }
    /** 파일의 첫 내용줄(없으면 `-1`). */
    const first = content.length > 0 ? content[0] : -1;
    return {indent, shallower, nextAtOrShallower, nextShallower, first, content};
}

/**
 * `stop` 다음이면서 `before` 앞인 첫 내용줄. 없으면 `-1`.
 *
 * 이 구간은 **한 형제 묶음 안**이라 파일 크기와 무관하게 짧다 — 여기만 직접 훑어도 제곱이 안 된다.
 */
function nextContentAfter(lines, ix, stop, before) {
    for (let j = stop + 1; j < before; j++) {
        if (ix.indent[j] >= 0) return j;
    }
    return -1;
}

function taintedRegions(src) {
    const lines = src.split("\n");
    const ix = indentIndex(lines);
    const regions = [];
    for (let i = 0; i < lines.length; i++) {
        const head = /^(\s*)(-\s+)?env:\s*(?:#.*)?$/.exec(lines[i]);
        if (!head) continue;
        const keyCol = head[1].length + (head[2] ? head[2].length : 0);
        // 매핑의 끝: 키 열보다 **깊지 않은** 첫 줄. `- env:` 는 키 열이 대시 뒤라 그 줄 자신의
        // 들여쓰기와 다르다 — 그때만 미리 계산을 못 쓰고 직접 훑는다(시퀀스 항목은 드물고 짧다).
        let mapEnd;
        if (ix.indent[i] === keyCol) {
            mapEnd = ix.nextAtOrShallower[i];
        } else {
            mapEnd = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (ix.indent[j] < 0) continue;
                if (ix.indent[j] <= keyCol) {
                    mapEnd = j;
                    break;
                }
            }
        }
        // 이름의 유효 범위: 그 `env:` 의 **형제 묶음** 전체.
        //
        // ⚠ `env:` 줄부터 세면 안 된다. YAML·GitHub 은 선언 **순서와 무관하게** 그 묶음 전체에
        //   값을 먹이므로, `steps:` 뒤에 `env:` 를 둔 잡에서 위쪽 `run:` 을 통째로 놓친다.
        //   `- env:`(시퀀스 항목)는 그 항목 자체가 묶음이라 그 줄부터다. 매핑 키일 때 위로 훑는
        //   범위는 **같은 열의 형제까지**이고, 그 앞의 대시줄은 스텝의 첫 줄이므로 함께 든다.
        let scopeFrom = i + 1;
        if (!head[2]) {
            // 위로 훑던 것을 미리 계산한 표로 바꾼다. 뜻은 같다 — 「키 열보다 얕은 첫 줄에서
            // 멈추고, 그 사이를 전부 범위에 넣는다」.
            const stop = ix.shallower[i];
            if (stop >= 0) {
                // ⚠ **시퀀스 항목의 대시줄은 그 묶음의 첫 줄이다.** 대시의 열은 키 열보다 얕지만
                //    그 줄부터가 한 스텝이다 — 여기서 끊으면 `- run: …` 뒤에 `env:` 를 둔 스텝
                //    (가장 흔한 작성 순서)의 run 을 범위 밖으로 밀어낸다.
                // ⚠ **대시 뒤 공백은 한 칸이 아닐 수 있다.** `-  run:` 도 유효한 YAML 이고, 이 파일의
                //    다른 정규식은 전부 `-\s+` 로 그것을 받는다 — 여기만 `+2` 로 박으면 검사기가
                //    자기 문법과 어긋난다. 대시줄 **자신의 키 열**로 잰다.
                const dash = /^(\s*)-(\s+)\S/.exec(lines[stop]);
                if (dash && dash[1].length + 1 + dash[2].length === keyCol) {
                    scopeFrom = stop + 1;
                } else {
                    // 멈춘 줄 **다음**의 내용줄부터가 범위다. 바로 위가 멈춘 줄이면 범위는 그대로.
                    const firstInside = nextContentAfter(lines, ix, stop, i);
                    if (firstInside >= 0) scopeFrom = firstInside + 1;
                }
            } else if (ix.first >= 0 && ix.first < i) {
                // 더 얕은 줄이 위에 없다 — 파일 첫 내용줄까지 전부 범위다.
                scopeFrom = ix.first + 1;
            }
        }
        // 형제 묶음의 끝: `mapEnd` 부터 처음 만나는 **더 얕은** 줄.
        let scopeEnd;
        if (mapEnd >= lines.length) {
            scopeEnd = lines.length;
        } else if (ix.indent[mapEnd] < keyCol) {
            scopeEnd = mapEnd;
        } else if (ix.indent[mapEnd] === keyCol) {
            scopeEnd = ix.nextShallower[mapEnd];
        } else {
            scopeEnd = lines.length;
            for (let j = mapEnd; j < lines.length; j++) {
                if (ix.indent[j] >= 0 && ix.indent[j] < keyCol) {
                    scopeEnd = j;
                    break;
                }
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
 * **이 검사기가 못 읽는 `run`** — 흐름형 매핑 안에 든 것.
 *
 * `- {run: "echo …"}` 는 유효한 YAML 이고 GitHub 이 그대로 실행한다. 이 파일의 판정은 줄 단위
 * 블록 스타일을 읽으므로 그 형태를 **못 본다.**
 * 재현: `printf 'jobs:\n  a:\n    steps:\n      - {run: "echo hi"}\n' |
 *       python3 -c 'import yaml,sys; print(yaml.safe_load(sys.stdin)["jobs"]["a"]["steps"][0])'`
 *       → `{'run': 'echo hi'}`
 *
 * ⚠ **못 보는 것과 통과는 다르다.** 조용히 넘기면 한 줄로 검사기를 피할 수 있고, 그 사실이
 *   아무 데서도 안 보인다. 위반으로 단정하지도 않는다 — 흐름형 안의 값이 안전할 수도 있고,
 *   거짓 실패는 고객 배포를 무환불로 막는다. **못 읽었다고 말하는 것**이 이 함수의 전부다.
 *
 * 흐름형을 제대로 읽으려면 YAML 파서가 필요하다. 이 레포는 의존을 늘리지 않는 쪽을 골랐고,
 * 그 선택의 대가가 여기 보이게 두는 것이 그 선택을 정직하게 만든다.
 */
export function unreadableRun(src) {
    const out = [];
    // ⚠ **`run:` 본문 안은 보지 않는다.** 거기 있는 글자는 YAML 이 아니라 **셸 명령**이다.
    //    `run: jq '{run: .x}' f.json` 은 흔한 정상 코드인데, 줄만 보면 흐름형 매핑으로 읽힌다.
    //    그 오탐은 이 시험이 팩에 실려 고객 트리에서 도는 탓에 **고객 배포를 무환불로 막는다** —
    //    이 레포가 `visitor-ip-parity` 를 배송에서 뺀 근거와 같은 비대칭이다.
    //    재현: `node --input-type=module -e 'import {unreadableRun} from "./scripts/lib/workflow-syntax.mjs";
    //          console.log(unreadableRun("jobs:\\n  a:\\n    steps:\\n      - run: jq \\u0027{run: .x}\\u0027 f\\n").length)'` → 0
    const inRun = new Set(runRanges(src).map((r) => r.line));
    src.split("\n").forEach((ln, i) => {
        if (inRun.has(i + 1)) return;
        const brace = ln.indexOf("{");
        if (brace < 0) return;
        // `${{ … }}` 의 중괄호는 흐름형이 아니다.
        if (/\$\{\{/.test(ln.slice(0, brace + 1))) return;
        const after = ln.slice(brace);
        // ⚠ **명시적 키 표기(`{? run : …}`)도 흐름형이다.** pyyaml 이 그것을 run 스텝으로 읽는다.
        //    안 보면 「못 읽으면 반드시 보인다」는 이 함수의 계약이 그 형태에서 깨진다.
        if (/[{,]\s*\??\s*(?:"run"|'run'|run)\s*:/.test(after)) out.push({line: i + 1, text: ln.trim()});
    });
    return out;
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
