/**
 * **납품 zip 검사기의 판정 자리를 문다.**
 *
 * ■ 왜 생겼나
 *   `verify-zip.mjs` 안의 판정(시크릿 스캔·실효 루트·못 읽은 자리 보고)은 시험이 0건이었다.
 *   그중 시크릿 스캔은 **과거에 실제로 뚫린 자리**다 — 이름만 보던 시절 `src/lib/cfg.ts` 에 박힌
 *   라이브 키가 `rc 0 · ✅ 시크릿 0` 으로 통과했고, 그다음엔 `.git` 을 스캔에서 빼 놓고 같은 초록을
 *   찍었다. 그 수리들이 살아 있는지 아무도 안 묻고 있었다.
 *
 * ■ 왜 실제로 띄워서 재나
 *   판정이 CLI 안의 지역 함수라 직접 부를 수 없다. 그리고 이 자리에서 정말 중요한 것은 판정과
 *   **그 판정이 종료 코드가 되는 배선**이다 — 진입점으로 재면 둘 다 걸린다. 합성 zip 은 100ms 다.
 *
 * 사용: `node --test scripts/lib/verifyZipJudgments.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";
import {writeMiniZip} from "./miniZip.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "verify-zip.mjs");
const made = [];
process.on("exit", () => {
    for (const d of made.splice(0)) rmSync(d, {recursive: true, force: true});
});

/** 검사기가 반려하지 않는 최소 프로젝트. 여기에 결함을 하나씩 얹어 판정을 잰다. */
const BASE = {
    "proj/package.json": '{"name":"t","version":"1.0.0"}\n',
    "proj/package-lock.json": '{"name":"t","lockfileVersion":3}\n',
    "proj/src/lib/cfg.ts": "export const x = 1;\n",
};

/**
 * 검사기 출력에서 **그 검사 한 줄**을 뽑는다.
 *
 * ⚠ 종료 코드로 재지 않는다. 최소 zip 은 `npm run build` 같은 뒤 단계에서 어차피 반려되므로
 *   rc 로는 「무엇 때문에 반려됐는지」를 못 가른다 — 시크릿 판정이 통째로 꺼져도 rc 는 그대로다.
 */
function verdict(out, name) {
    const line = out.split("\n").find((l) => l.includes(name) && /^[✅❌]/.test(l.trim()));
    if (!line) return null;
    return {ok: line.trim().startsWith("✅"), line: line.trim()};
}

function run(entries, {wrap = true} = {}) {
    const box = mkdtempSync(join(tmpdir(), "zalkera-vzj-"));
    made.push(box);
    const zip = join(box, "case.zip");
    const shaped = wrap ? entries : Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.replace(/^proj\//, ""), v]));
    writeMiniZip(zip, shaped);
    const r = spawnSync(process.execPath, [RUNNER, zip], {
        encoding: "utf8",
        env: {...process.env, TMPDIR: box},
    });
    return {rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
}

test("양성 통제군 — 결함 없는 zip 은 시크릿 0 이다", () => {
    // 이것이 없으면 「무엇이든 반려」 구현으로도 아래 전부가 초록이 된다.
    const {out} = run(BASE);
    const v = verdict(out, "시크릿");
    assert.ok(v, `시크릿 판정 줄이 없다: ${out.slice(-600)}`);
    assert.equal(v.ok, true, v.line);
});

test("이름이 평범한 파일에 박힌 라이브 키를 잡는다 — 이름 검사만으로는 못 잡던 자리다", () => {
    const {out} = run({
        ...BASE,
        // 실제 값이 아니라 **모양**만 맞춘 것이다. 검사기가 보는 것도 모양이다.
        "proj/src/lib/cfg.ts": 'export const k = "AKIA' + "IOSFODNN7EXAMPLE" + '";\n',
    });
    const v = verdict(out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line ?? out.slice(-600)}`);
    assert.match(v.line + out, /cfg\.ts/);
});

test("개인키 블록도 잡는다", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nQUJD\n-----END RSA PRIVATE KEY-----\n";
    const v = verdict(run({...BASE, "proj/src/lib/cfg.ts": pem}).out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line}`);
});

test("`.env` 는 이름만으로 잡고, `.env.example` 은 통과시킨다", () => {
    const bad = verdict(run({...BASE, "proj/.env": "ZALKERA_STOREFRONT_KEY=oqsk_live\n"}).out, "시크릿");
    assert.ok(bad && !bad.ok, `.env 를 놓쳤다: ${bad?.line}`);

    // 예시 파일은 값이 없다 — 막으면 배송 문서가 시키는 일을 우리가 반려하는 셈이다.
    const ok = verdict(run({...BASE, "proj/.env.example": "ZALKERA_STOREFRONT_KEY=\n"}).out, "시크릿");
    assert.ok(ok && ok.ok, `예시 파일을 막았다: ${ok?.line}`);
});

test("`.git` 이 실려 오면 **풀기 전에** 반려한다", () => {
    // git 이력은 되돌릴 수 없어 사후 수습이 불가능하다. 업로드 태생 테넌트는 작업트리를 통째로
    // zip 하고 이 러너가 그들의 유일한 관문이다.
    //
    // ⚠ 잡는 것은 시크릿 스캔이 아니라 **정크 관문**이다 — 엔트리 목록만 보고 임시공간을 쓰기
    //   전에 끊는다. 시크릿 스캔의 `.git` 처리는 그 뒤에 서는 2차선이라 이 경로로는 안 닿는다.
    //   그 순서를 여기 적어 두는 이유: 이 시험이 시크릿 판정을 재는 줄 알고 시크릿 스캔에서
    //   `.git` 을 다시 빼면, 이 시험은 초록인 채로 2차선이 사라진다.
    const {rc, out} = run({...BASE, "proj/.git/config": "[core]\n\tbare = false\n"});
    assert.notEqual(rc, 0, out.slice(-600));
    assert.match(out, /\.git/);
    assert.match(out, /풀는|푸는|미포함/, `사유가 정크 반려가 아니다: ${out.slice(-400)}`);
});

test("시크릿 스캔은 `.git` 을 건너뛰지 않는다 — 정크 관문 뒤의 2차선", () => {
    // 정크 관문이 먼저 끊으므로 실제 zip 으로는 이 경로에 못 닿는다. 그래서 **소스로** 못 박는다:
    // 스캔이 건너뛰는 이름 목록에 `.git` 이 들어가면 2차선이 사라진다.
    const runner = readFileSync(RUNNER, "utf8");
    const scan = runner.slice(runner.indexOf("function scanSecrets"), runner.indexOf("function countImages"));
    // 주석이 아니라 **건너뛰는 줄**을 본다 — 그 함수의 머리말은 `.git` 을 안 뺀 이유를 적고 있다.
    const skipLine = scan.split("\n").find((l) => /if \(e\.name ===/.test(l) && /continue;/.test(l));
    assert.ok(skipLine, "시크릿 스캔의 건너뛰기 줄을 못 찾았다 — 이 시험이 낡았다");
    assert.match(skipLine, /node_modules/, "건너뛰기 줄이 아니다");
    assert.doesNotMatch(skipLine, /\.git/, `시크릿 스캔이 .git 을 건너뛴다 — 2차선이 사라졌다: ${skipLine.trim()}`);
});

test("`.pem`·`.key`·`.p12` 는 내용을 안 봐도 잡는다", () => {
    for (const name of ["proj/deploy.pem", "proj/id_rsa.key", "proj/cert.p12"]) {
        const v = verdict(run({...BASE, [name]: "아무거나\n"}).out, "시크릿");
        assert.ok(v && !v.ok, `${name} 이 통과했다: ${v?.line}`);
    }
});

test("한 폴더로 감싼 zip 을 편다 — 감싸는 것이 Mac·사이트빌더의 관례다", () => {
    // 못 펴면 `package.json` 을 못 찾아 멀쩡한 납품이 「프로젝트가 아님」으로 반려된다.
    for (const wrap of [true, false]) {
        const v = verdict(run(BASE, {wrap}).out, "프로젝트 형상");
        assert.ok(v && v.ok, `${wrap ? "감싼" : "안 감싼"} zip 을 못 읽었다: ${v?.line}`);
    }
});

test("`node_modules` 가 실려 오면 조기에 반려한다", () => {
    // 훑으면 수만 파일이라 스캔에서 뺀다. 거기에 숨겨 통과시키는 길이 되면 안 되므로 **정크
    // 반려**가 1차로 막는다.
    const {rc, out} = run({...BASE, "proj/node_modules/x/index.js": "module.exports = 1;\n"});
    assert.notEqual(rc, 0, out.slice(-600));
    assert.match(out, /node_modules/);
});
