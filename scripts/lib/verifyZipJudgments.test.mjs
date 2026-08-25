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

function run(entries, {wrap = true, pack = false, byo = false} = {}) {
    const box = mkdtempSync(join(tmpdir(), "zalkera-vzj-"));
    made.push(box);
    const zip = join(box, "case.zip");
    const shaped = wrap ? entries : Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.replace(/^proj\//, ""), v]));
    writeMiniZip(zip, shaped);
    const r = spawnSync(process.execPath, [RUNNER, zip, ...(pack ? ["--pack"] : []), ...(byo ? ["--byo"] : [])], {
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
        //
        // ⚠ **AWS 가 자기 문서에 쓰는 자리표시자(`AKIA…EXAMPLE`)를 표본으로 쓰지 않는다.**
        //   그것은 검사기가 일부러 통과시키는 값이라(비-비밀임이 공표돼 있다), 표본으로 쓰면
        //   이 시험이 재는 것이 「라이브 키를 잡는가」가 아니라 「예외가 없는가」가 된다.
        "proj/src/lib/cfg.ts": 'export const k = "AKIA' + "2E0A8F3B244C9986" + '";\n',
    });
    const v = verdict(out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line ?? out.slice(-600)}`);
    assert.match(v.line + out, /cfg\.ts/);
});

test("AWS 문서의 자리표시자는 통과시킨다 — 비-비밀임이 공표된 값이다", () => {
    // 위 시험과 짝이다. 이것이 없으면 「AKIA 면 무엇이든 반려」 구현으로도 위가 초록이 된다.
    const v = verdict(run({...BASE, "proj/src/lib/cfg.ts": 'export const k = "AKIA' + "IOSFODNN7EXAMPLE" + '";\n'}).out, "시크릿");
    assert.ok(v && v.ok, `자리표시자를 반려했다: ${v?.line}`);
});

test("대소문자가 달라도 `.env` 는 잡는다 — `.Env.Local` 이 양쪽 그물을 다 빠졌다", () => {
    // 이름축 정규식에 `/i` 가 없어 이름으로도 안 걸리고, 확장자 그물에도 안 들어 **무검사**였다.
    const v = verdict(run({...BASE, "proj/.Env.Local": "ZALKERA_STOREFRONT_KEY=oqsk_live\n"}).out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line}`);
});

test("`.envrc`·`.env~`·`config.env` 도 잡는다 — 접두에 점을 하나 더 요구하면 샌다", () => {
    // `.envrc` 는 direnv(`export AWS_SECRET_ACCESS_KEY=…` 가 관례), `.env~` 는 편집기 백업
    // (= `.env` 의 바이트 사본), `config.env` 는 compose `env_file` 관례다.
    for (const name of [".envrc", ".env~", "config.env"]) {
        const v = verdict(run({...BASE, [`proj/${name}`]: "K=oqsk_live\n"}).out, "시크릿");
        assert.ok(v && !v.ok, `${name} 을 놓쳤다: ${v?.line}`);
    }
});

test("채워 넣은 `.env.example` 은 이름으로 허용돼도 **내용으로** 걸린다", () => {
    // 허용과 미검사는 다른 말이다 — 허용한 것일수록 내용을 봐야 한다.
    const v = verdict(run({...BASE, "proj/.env.example": "ZALKERA_STOREFRONT_KEY=oqsk_live1234\n"}).out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line}`);
});

test("로컬 자리표시자 DB URL 은 통과시킨다 — 닿을 수 없는 자리의 열쇠는 못 쓴다", () => {
    // `postgres://user:pass@localhost/db` 는 Node·Compose 서식의 가장 흔한 한 줄이다.
    // 이것을 반려하면 대행사가 이유를 알기 어려운 반려를 받는다.
    const v = verdict(run({...BASE, "proj/.env.example": "DB=postgres://user:pass@localhost:5432/db\n"}).out, "시크릿");
    assert.ok(v && v.ok, `정상 서식을 반려했다: ${v?.line}`);
});

test("원격 호스트의 자격증명 URL 은 잡는다 — 위 시험의 짝이다", () => {
    const v = verdict(run({...BASE, "proj/.env.example": "DB=postgres://real:S3cr3tPw@db.acme.co/app\n"}).out, "시크릿");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line}`);
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
    // ⚠ **조기 반려 고유 문면으로 본다.** 이 러너에는 정크를 보는 자리가 둘 있다 — 엔트리 목록만
    //   보는 조기 관문과, 푼 **뒤**의 2차 검사. 「미포함」은 둘 다 쓰는 낱말이라 그것으로 재면
    //   조기 관문을 통째로 무력화해도 이 시험이 초록이 된다.
    //   재현: `junkEntries.mjs` 의 `JUNK_TOP` 을 비우고 이 스위트를 돌리면 rc=1 로 서야 한다.
    assert.match(
        out,
        /임시공간을 쓰기 전에/,
        `조기 반려가 아니라 추출 뒤 2차 검사로 잡혔다 — 임시공간을 이미 썼다: ${out.slice(-400)}`,
    );
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

/*
 * 최상위 구성 — 거부 목록이 못 막는 자리를 여기서 막는다.
 *
 * `pack-preset.mjs` 는 `git ls-files` − `SOURCE_EXCLUDES` 를 싣는다. 즉 **커밋하면 배송이
 * 기본값**이라, 새 최상위 이름을 만든 사람에게 아무도 묻지 않는다. 실제로 `spec/` 이 그렇게
 * 전 테넌트로 나갔고, 그 디렉터리는 특정 납품건의 결함 보고서를 들고 있었다.
 *
 * 넷이 함께 서야 한다. ③이 없으면 「무엇이든 반려」와 구분되지 않고, ④가 없으면 고객 zip 까지
 * 우리 구성을 강요하는 판을 못 잡는다.
 */
{
    // 팩이 실제로 싣는 최상위 이름 전부. 하나라도 빠지면 「있어야 하는데 없습니다」가 뜬다.
    const FULL = Object.fromEntries(
        [
            ".env.example",
            ".gitignore",
            ".prettierignore",
            ".prettierrc.json",
            "AGENTS.md",
            "CUSTOMIZE.md",
            "README.md",
            "llms.txt",
            "next.config.ts",
            "package.json",
            "package-lock.json",
            "postcss.config.mjs",
            "tsconfig.json",
            ".github/w.yml",
            ".zalkera/pack.json",
            "content/index.ts",
            "docs/g.md",
            "scripts/s.mjs",
            "src/lib/cfg.ts",
        ].map((f) => [`proj/${f}`, f.endsWith(".json") ? "{}\n" : "x\n"]),
    );

    test("최상위 구성 — 허용 목록에 없는 이름을 반려한다", () => {
        const {out} = run({...FULL, "proj/spec/handoff/other.md": "x\n"}, {pack: true});
        const v = verdict(out, "최상위 구성");
        assert.ok(v, `판정 줄이 없다: ${out.slice(-600)}`);
        assert.equal(v.ok, false, v.line);
        assert.match(v.line, /spec\//);
    });

    test("최상위 구성 — 있어야 하는 이름이 빠지면 반려한다", () => {
        const {"proj/llms.txt": _drop, ...rest} = FULL;
        const {out} = run(rest, {pack: true});
        const v = verdict(out, "최상위 구성");
        assert.ok(v, `판정 줄이 없다: ${out.slice(-600)}`);
        assert.equal(v.ok, false, v.line);
        assert.match(v.line, /llms\.txt/);
    });

    test("양성 통제군 — 목록대로면 통과한다(무엇이든 반려가 아니다)", () => {
        const {out} = run(FULL, {pack: true});
        const v = verdict(out, "최상위 구성");
        assert.ok(v, `판정 줄이 없다: ${out.slice(-600)}`);
        assert.equal(v.ok, true, v.line);
    });

    test("고객 zip(--pack 아님)에는 이 검사를 들이대지 않는다", () => {
        // 납품 zip 의 트리 구성은 납품사 것이다 — 우리 팩의 형상을 강요할 자리가 아니다.
        const {out} = run({...FULL, "proj/spec/handoff/other.md": "x\n"});
        assert.equal(verdict(out, "최상위 구성"), null, out.slice(-600));
    });
}

/**
 * **⑥-b 배선을 문다** — 판정부(`lib/devCompile.mjs`)가 아니라 CLI 가 그 판정을 `record`·
 * `recordSkip`·`failed` 로 옮기는 자리다. 그 배선에 시험이 0건이면 다음 변이가 조용히 산다:
 *   · `failed = true` 삭제      → 깨진 팩이 ❌ 를 찍고도 rc 0
 *   · `recordSkip` → `record(true)` → 미검사가 ✅ 로 둔갑
 *
 * ⚠ **rc 로 재려면 다른 검사가 전부 통과하는 픽스처가 필요하다.** 최소 zip 은 빌드·하한·산출물에서
 *   어차피 반려라 rc 가 「무엇 때문인지」를 못 가른다(이 파일 머리말의 `verdict()` 가 그래서 있다).
 *   `--byo` 는 하한·관문을 걷으므로, `build` 가 standalone 을 만들어 주기만 하면 rc 0 이 선다 —
 *   그 자리에서만 `failed` 배선이 rc 로 드러난다.
 *
 * **Next 없이 잰다.** 러너는 `npm run dev` 를 부를 뿐이라, `dev` 가 원하는 상태를 내는 한 줄짜리
 * node 서버면 충분하다. 의존이 0개라 `npm ci` 가 즉시 끝난다.
 */
const devServer = (status) =>
    `const http=require("http");http.createServer((q,s)=>{s.writeHead(${status},{"content-type":"text/html"});s.end("x")})` +
    `.listen(process.env.PORT,"127.0.0.1");\n`;

const withDev = (status, extra = {}) => ({
    ...BASE,
    "proj/package.json": JSON.stringify({name: "t", version: "1.0.0", scripts: {dev: "node dev.js"}}) + "\n",
    "proj/dev.js": devServer(status),
    ...extra,
});

test("개발 서버가 200 이면 그 자리는 ✅ 다 — 양성 통제군", () => {
    // 이것이 없으면 「무엇이든 ❌」 구현으로도 아래 시험들이 초록이 된다.
    const v = verdict(run(withDev(200)).out, "개발 서버 컴파일");
    assert.ok(v, "판정 줄이 없다");
    assert.equal(v.ok, true, v.line);
});

test("개발 서버가 500 이면 반려다 — 이 검사가 생긴 자리다", () => {
    const {out} = run(withDev(500));
    const v = verdict(out, "개발 서버 컴파일");
    assert.ok(v && !v.ok, `놓쳤다: ${v?.line ?? out.slice(-600)}`);
    assert.match(out, /500/);
});

test("dev 스크립트가 없으면 **기본 모드에서 반려**다 — zip 이 검사를 끄지 못한다", () => {
    // `--byo` 없이 도는 실행에서 `package.json` 한 줄로 가드가 꺼지면 안 된다.
    const v = verdict(run(BASE).out, "개발 서버 컴파일");
    assert.ok(v && !v.ok, `미검사로 샜다: ${v?.line ?? "판정 줄 없음"}`);
});

test("`--byo` 에서는 dev 부재가 미검사다 — 없는 요건을 집행하지 않는다", () => {
    const {out} = run(BASE, {byo: true});
    assert.equal(verdict(out, "개발 서버 컴파일"), null, "✅/❌ 로 찍혔다 — 미검사여야 한다");
    assert.match(out, /➖ 개발 서버 컴파일/);
    assert.match(out, /통과가 아니라 미검사입니다/);
});

/** `--byo` 에서 나머지 검사가 전부 통과하는 최소 트리. `dev` 상태만 바꿔 rc 를 가른다. */
const byoPassing = (status) => ({
    "proj/package.json": JSON.stringify({name: "b", version: "1.0.0", scripts: {dev: "node dev.js", build: "node build.js"}}) + "\n",
    "proj/package-lock.json": JSON.stringify({name: "b", version: "1.0.0", lockfileVersion: 3, requires: true, packages: {"": {name: "b", version: "1.0.0"}}}) + "\n",
    "proj/dev.js": devServer(status),
    "proj/build.js": 'require("fs").mkdirSync(".next/standalone",{recursive:true});require("fs").writeFileSync(".next/standalone/server.js","");\n',
});

test("개발 서버 반려가 **종료 코드까지** 간다 — ❌ 를 찍고 rc 0 으로 나가지 않는다", () => {
    // 양성 통제군이 rc 0 이라야 이 시험이 「무엇이든 rc 1」을 재는 것이 아님을 보인다.
    assert.equal(run(byoPassing(200), {byo: true}).rc, 0, "정상 픽스처가 rc 0 이 아니다 — 이 시험이 아무것도 안 문다");
    const bad = run(byoPassing(500), {byo: true});
    assert.equal(bad.rc, 1, `dev 500 인데 rc ${bad.rc} 다 — failed 배선이 끊겼다`);
    assert.equal(verdict(bad.out, "개발 서버 컴파일")?.ok, false);
});
