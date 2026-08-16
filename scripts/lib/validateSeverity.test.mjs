/**
 * **토큰 노출 축(E1·E2)의 severity 를 못박는다.** 정본 전용(배송 제외).
 *
 * `CUSTOMIZE.md` 는 `npm run validate` 를 고객의 **유일한 자가 관문**으로 지목한다. 그런데 이 축은
 * 무인자 모드에서 **경고**다 — 서버 주소·토큰이 브라우저 번들에 실리는 형상이 `✅ 통과 · rc=0` 을
 * 받는다. 문서가 그것을 "오류"라 적었던 적이 있고, 그 문장이 고객을 "통과 = 안전"으로 오도했다.
 *
 * 여기서 재는 것은 **검사기의 행동 하나**다. 문서 표를 파싱하지 않는다 — 그러면 표 서식이 바뀔
 * 때마다 이 시험이 죽고, 그건 제품 결함이 아니라 잡음이다. 검사기가 이 축을 오류로 올리는 날
 * 이 시험이 죽고, 그때 문서를 같이 고치면 된다.
 *
 * 사용: `node --test scripts/lib/validateSeverity.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {join, dirname} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VALIDATOR = join(ROOT, "scripts", "validate-storefront.mjs");

/** 클라이언트 파일에서 서버 싱글턴을 값으로 import 하는 형상 하나를 심고 검사기를 돌린다. */
function measure(gate) {
    const dir = mkdtempSync(join(tmpdir(), "sev-"));
    try {
        cpSync(join(ROOT, "src"), join(dir, "src"), {recursive: true});
        const p = join(dir, "src", "components", "LeadForm.tsx");
        const s = readFileSync(p, "utf8");
        assert.match(s, /^"use client";/m, "형상을 못 만들었다 — 그 파일이 클라이언트 컴포넌트가 아니다");
        writeFileSync(p, s.replace('"use client";', '"use client";\nimport {zalkera} from "@/lib/zalkera";\nconst __z = zalkera;'));
        const r = spawnSync(process.execPath, [VALIDATOR, join(dir, "src"), ...(gate ? ["--gate"] : [])], {
            cwd: ROOT,
            encoding: "utf8",
        });
        return {rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

test("토큰 노출 축은 `npm run validate` 에서 **경고**다 — 통과가 안전을 뜻하지 않는다", () => {
    const {rc, out} = measure(false);
    assert.match(out, /\[E[12]\]/, `형상이 검사기에 안 잡혔다 — 이 시험의 전제가 깨졌다:\n${out}`);
    assert.equal(rc, 0, `무인자 모드가 이 축을 막는다 — 문서의 severity 표를 같이 고쳐라:\n${out}`);
});

test("`--gate` 에서는 오류다 — 우리가 서빙할 때만 막힌다", () => {
    const {rc, out} = measure(true);
    assert.equal(rc, 1, `--gate 가 이 축을 안 막는다 — 문서와 러너 주석을 같이 고쳐라:\n${out}`);
});

test("통제군 — 위반이 없으면 두 모드 다 통과한다", () => {
    for (const args of [[], ["--gate"]]) {
        const r = spawnSync(process.execPath, [VALIDATOR, join(ROOT, "src"), ...args], {cwd: ROOT, encoding: "utf8"});
        assert.equal(r.status, 0, `${r.stdout ?? ""}${r.stderr ?? ""}`);
    }
});
