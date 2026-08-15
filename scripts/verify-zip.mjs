#!/usr/bin/env node
/**
 * 납품 zip 검수 러너 (memo108 §2 1단).
 *
 * 외주가 보낸 zip 하나를 받아 **받아도 되는 물건인지** 기계로 판정한다. 발주 스펙
 * (`backend/doc/vendor/site-build-spec.md`) §4 가 "검사기를 드립니다"라고 약속한 그 물건이고,
 * memo107 §5.2 체크리스트의 ①②③⑥을 기계화한다(④ 라이선스·⑦ 행위 안전은 여전히 사람 몫).
 *
 * **정본을 복사하지 않는다.** 규약 검사는 이 레포의 `validate-storefront.mjs` 를 **srcDir 인자로 참조 실행**
 * 한다 — 사본을 뜨면 그 순간 드리프트가 시작되고, 그게 이 프로젝트가 내내 싸우는 병이다(471946c).
 * 그 파일은 이제 `@zalkera/client` 의 `zalkera-validate` 를 부르는 wrapper 라(2026-08-01 이관), 이 러너가
 * 참조 실행하는 순간 판정은 **설치본 정본 한 벌**에서 나온다.
 *
 * ── 이 러너의 정본 위치(memo145 §7 T1-⑸) ────────────────────────────────────────
 * **정본은 이 파일이다**(`zalkera-storefront-examples/scripts/verify-zip.mjs`). `backend/doc/vendor/verify-zip.mjs`
 * 는 발주처에 건네는 **바이트 사본**이고, 고칠 곳은 언제나 여기다. 2026-08-01 에 그 둘이 **역방향으로**
 * 갈라진 채 발견됐다(사본만 lockfile 축을 고쳤고, 정본만 `--gate` 를 가졌다) — 사본을 손으로 고치면
 * 정확히 그 상태가 재생산된다. 합류시킨 뒤 사본은 `cp` 로 재고정했다.
 *
 * ── 이 러너가 왜 빌드까지 도는가(memo145) ───────────────────────────────────────
 * **빌드 성공과 서빙 요건은 서로 다른 것을 잰다.** 2026-08-01 에 우리 팩 zip 이 `npm run build` 를
 * 통과하고도 서빙 박스에서 반려됐다(exit 4) — `.next/standalone/server.js` 가 안 나왔기 때문이다.
 * 이 러너는 exit 0 만 보고 ✅ 를 찍고 있었다. 그 간극을 ⑧ 산출물 검사가 닫는다: **이미 지불한 빌드에서
 * 옳은 것을 읽는다**(추가 비용 0). "검사 통과"가 "서빙된다"를 뜻하지 않던 것이 그 사건의 본질이다.
 *
 * ── 검수 빌드는 **서빙 빌드의 조건을 닮아야 한다** ──────────────────────────────
 * 그래서 설치를 `npm ci --ignore-scripts --include=dev` 로 돈다(샌드박스 `build.sh` 와 같은 플래그).
 * 근거 둘: ⑴ 서빙 박스는 공급망 RCE 를 막으려 postinstall 을 **실행하지 않는다**(memo70 §3.6). 검수만
 * 실행하면 postinstall 산출에 기대는 소스가 여기서 ✅ 를 받고 서빙에서 죽는다 — ⑧이 막으려는 것과
 * 같은 종류의 거짓이다. ⑵ 납품 zip 은 **신뢰 밖 코드**다. 그 postinstall 을 검수자 기계에서 돌리는 것은
 * 그 자체로 사고다. `--include=dev` 는 이 러너에서는 기본 동작이지만, NODE_ENV=production 인 CI 러너에서
 * 돌 때 devDeps 가 빠져 멀쩡한 납품물이 거짓 반려되는 것을 막는다(샌드박스가 같은 이유로 붙였다).
 * 반대로 **일부러 다르게 두는 축**도 있다: `ZALKERA_OFFLINE_BUILD=1` — 러너에 백엔드가 없다는 선언이다
 * (아래 `BUILD_ENV` 주석 참조 — 이 플래그는 지금 동작을 바꾸지 않는다).
 *
 * lockfile 축도 같은 원리다 — 서빙 박스는 `npm ci` 뿐이라 yarn·pnpm lock 을 소비하지 못한다.
 * 넓게 받으면 "검사기는 통과했는데 업로드가 거절"이 만들어진다(백엔드 `SiteTypeDetector.LOCKFILES` 거울).
 *
 * ── `--pack` — 카탈로그 팩 모드(memo150 §8.2) ────────────────────────────────────
 * 기본은 **납품 검수기**다: 외주 zip 은 테넌트 사이트로 가므로 팩 신원 매니페스트(`.zalkera/pack.json`)를
 * 낼 의무가 없고(memo150 §8.4 비목표 — 고객 소스에 우리 형식을 강제하지 않는다), 카탈로그 입장 판정은
 * 서버가 한다. `--pack` 은 **이 zip 이 본사 카탈로그에 올라간다**는 선언이고, 그때만 매니페스트가 필수가
 * 되며 파일명(`{code}-{version}.zip`)과 대조한다. `pack-preset.mjs` 는 자기 산출물을 이 모드로 잰다.
 *
 * 매니페스트가 **있으면** 모드와 무관하게 형상을 본다 — 있는데 틀린 것은 어느 경로에서든 결함이다.
 *
 * 사용:
 *   node scripts/verify-zip.mjs <납품.zip> [--keep] [--pack]
 *
 * 종료코드: 0=통과 · 1=반려(검사 실패) · 2=실행 불가(인자·환경 문제)
 */
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from "node:fs";
import {basename, join, relative, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const VALIDATOR = join(HERE, "validate-storefront.mjs");

const args = process.argv.slice(2);
const zipPath = args.find((a) => !a.startsWith("--"));
const keep = args.includes("--keep");
/** 이 zip 이 본사 카탈로그(theme_artifact)에 올라간다는 선언 — 머리말 `--pack` 참조. */
const packMode = args.includes("--pack");

if (!zipPath) {
    console.error("사용: node scripts/verify-zip.mjs <납품.zip> [--keep] [--pack]");
    process.exit(2);
}
if (!existsSync(zipPath)) {
    console.error(`파일이 없습니다: ${zipPath}`);
    process.exit(2);
}

/**
 * 빌드 env — **`.github/workflows/ci.yml` 과 패리티**여야 한다(백엔드 `SandboxBuildGate.CI_ENV` 도 같은 상수).
 *
 * 이유가 각각 다르다:
 *  · `ZALKERA_TENANT` — 코드가 **폴백 없이 require** 한다(`src/lib/env.ts` 가 없으면 던진다). 이 값을
 *    안 주면 멀쩡한 납품물이 빌드 실패로 **거짓 반려**된다(이 러너를 처음 돌렸을 때 실제로 그랬다).
 *  · `ZALKERA_API_BASE` — 코드에 폴백이 있어 없어도 빌드는 된다. 그래도 CI·서빙과 같은 값을 준다(패리티).
 *  · `ZALKERA_OFFLINE_BUILD` — "여긴 백엔드가 없다"는 **선언**이다. ⚠ **지금 아무것도 바꾸지 않는다** —
 *    읽는 코드에 호출자가 0개다(실측). 패리티로 그대로 두되, 이걸 줘야 거짓 반려를 막는다고 읽지 마라.
 * 이름이 구 `ONEQUE_*` 면 폴백 제거 후 env 파서가 던진다(memo101 컷오버 실사고).
 */
const BUILD_ENV = {
    ZALKERA_API_BASE: "http://localhost:8100",
    ZALKERA_TENANT: "ci-placeholder",
    ZALKERA_OFFLINE_BUILD: "1",
};

/** 검사 결과 한 줄을 찍고 통과 여부를 돌려준다 — 호출부가 `failed` 를 세운다. */
const record = (name, ok, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
    return ok;
};

/**
 * 시크릿 스캔 — 소스가 **고객에게 전달**되므로(소스 소유 원칙) 실제 환경파일이 섞이면 안 된다.
 * git 이력은 되돌릴 수 없어서 사후 수습이 불가능하다. `.env.example` 류는 값이 없어 허용.
 */
const ENV_KEEP = /\.(example|sample|template)$/;

/**
 * 못 읽은 자리. 납품 zip 안에 권한 없는 디렉터리나 깨진 항목이 있으면 여기 쌓인다.
 *
 * ⚠ **비면 안 되는 이유.** 종전엔 `readdirSync` 가 무방비라 그런 zip 하나에 스크립트가 스택트레이스로
 * 죽었고, 납품사가 받는 반려 사유가 `Error: EACCES … at walk (verify-zip.mjs:105)` 였다. 무엇을
 * 고치라는 것인지 알 수 없다. 반대로 조용히 건너뛰면 **시크릿 스캔이 0줄 돌고도 "동봉 시크릿 없음"**
 * 으로 읽힌다 — 검사기 본체에서 같은 결함을 rc 7 로 갈라낸 것과 같은 자리다.
 */
const unread = [];
function readDirSafe(d, what) {
    try {
        return readdirSync(d, {withFileTypes: true});
    } catch (e) {
        // ⚠ **임시 추출 경로가 아니라 zip 안 경로로 적는다.** 납품사가 손댈 수 있는 것은 zip 안이고,
        // `/tmp/zalkera-verify-XsUkLl/src/...` 를 주면 지시("권한을 정상화하라")와 좌표가 어긋난다.
        unread.push(`${relative(work, d) || "."} — ${what} 실패 [${e.code ?? "UNKNOWN"}]`);
        return [];
    }
}

function scanSecrets(dir) {
    const hits = [];
    const walk = (d, rel = "") => {
        for (const e of readDirSafe(d, "시크릿 스캔")) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue;
            if (e.isDirectory()) {
                walk(join(d, e.name), r);
                continue;
            }
            if (/(^|\/)\.env(\.|$)/.test(`/${r}`) && !ENV_KEEP.test(e.name)) hits.push(r);
            if (/\.(pem|key|p12|pfx)$/.test(e.name)) hits.push(r);
        }
    };
    walk(dir);
    return hits;
}

/** 동봉 이미지 수 — 매니페스트 요구의 전제(이미지가 없으면 출처를 적을 것도 없다). */
function countImages(dir) {
    let n = 0;
    const walk = (d) => {
        for (const e of readDirSafe(d, "이미지 수 세기")) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue;
            if (e.isDirectory()) walk(join(d, e.name));
            else if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(e.name)) n++;
        }
    };
    walk(dir);
    return n;
}

/** 언팩 트리에서 실효 루트를 찾는다 — zip 이 프로젝트를 한 폴더로 감싸는 관례(Mac·사이트빌더)를 편다. */
function effectiveRoot(dir) {
    let cur = dir;
    for (let i = 0; i < 8; i++) {
        const children = readDirSafe(cur, "실효 루트 탐색").filter((e) => e.name !== "__MACOSX");
        if (children.length !== 1 || !children[0].isDirectory()) return cur;
        cur = join(cur, children[0].name);
    }
    return cur;
}

/**
 * 팩 신원 매니페스트 계약(memo150 §3.1) — **백엔드 `PackManifestReader` 의 거울**이다.
 *
 * 여기 규칙이 서버와 갈리면 이 러너가 ✅ 를 준 zip 이 적재에서 400 으로 죽는다(`SiteTypeDetector.LOCKFILES`
 * 거울과 같은 자리). 그래서 서버가 거부하는 것을 **여기서 같은 사유로** 먼저 말한다 — 판정의 정본은 서버이고
 * 이것은 싼 조기 경보다.
 *
 * ⚠ **이 파일은 외주에게 단일 파일로 건네지므로**(`backend/doc/vendor/verify-zip.mjs` 바이트 사본) 공용
 *   모듈을 import 하지 않는다. 사본이 아니라 거울인 이유를 주석이 지고, 갈림은 서버 400 이 잡는다.
 */
const PACK_MANIFEST_PATH = ".zalkera/pack.json";
const PACK_MANIFEST_REV = 1;
const PACK_MANIFEST_MAX_BYTES = 4 * 1024;
const PACK_CODE_REGEX = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PACK_VERSION_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const PACK_VERSION_MAX_LENGTH = 40;

/**
 * `.zalkera/pack.json` 판독. 던지지 않고 판정 재료만 돌려준다(백엔드 판독기와 같은 규율):
 * `{state: "absent"}` · `{state: "ok", manifest}` · `{state: "invalid", reason}`.
 *
 * **부재와 위반을 가르는 것이 요점**이다 — 조치가 다르다(팩 도구로 다시 팩 / 매니페스트 수리).
 */
function readPackManifest(root) {
    const file = join(root, PACK_MANIFEST_PATH);
    if (!existsSync(file) || !statSync(file).isFile()) return {state: "absent"};

    // 캡은 **파싱 전에** 잰다 — 매니페스트는 신원 선언이지 데이터 운반체가 아니다.
    const bytes = readFileSync(file);
    if (bytes.length > PACK_MANIFEST_MAX_BYTES) {
        return {state: "invalid", reason: `크기 초과 — ${bytes.length}B > ${PACK_MANIFEST_MAX_BYTES}B`};
    }
    let raw;
    try {
        raw = JSON.parse(bytes.toString("utf8"));
    } catch (e) {
        return {state: "invalid", reason: `JSON 파싱 실패 — ${e.message}`};
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {state: "invalid", reason: "최상위가 객체여야 합니다"};
    }
    // **strict** — 서버가 미지 키로 거부한다. 오타 키(`verison`)를 조용히 무시하면 그 파일은 "필수 키 부재"로
    // 미끄러지고, 사람은 무엇을 고쳐야 하는지 모른 채 400 을 본다.
    const unknown = Object.keys(raw).filter((k) => !["rev", "code", "version"].includes(k));
    if (unknown.length) {
        return {state: "invalid", reason: `미지 키 ${unknown.join(", ")} — 이 계약(rev ${PACK_MANIFEST_REV})의 키는 rev·code·version 뿐입니다`};
    }
    // rev 를 **가장 먼저** 본다 — 모르는 계약으로 쓰인 파일을 우리 rev 1 의 잣대로 재는 것 자체가 틀린 판정이다.
    if (raw.rev === undefined) return {state: "invalid", reason: "rev 없음(필수)"};
    if (!Number.isInteger(raw.rev)) return {state: "invalid", reason: `rev 는 정수여야 합니다 — ${JSON.stringify(raw.rev)}`};
    if (raw.rev !== PACK_MANIFEST_REV) {
        return {state: "invalid", reason: `모르는 rev ${raw.rev} — 이 도구가 아는 계약은 rev ${PACK_MANIFEST_REV} 뿐입니다(fail-closed)`};
    }
    if (typeof raw.code !== "string") return {state: "invalid", reason: "code 없음(필수·문자열)"};
    if (!PACK_CODE_REGEX.test(raw.code)) {
        return {state: "invalid", reason: `code 형식 — "${raw.code}" 는 ${PACK_CODE_REGEX.source} 에 맞지 않습니다`};
    }
    if (typeof raw.version !== "string") return {state: "invalid", reason: "version 없음(필수·문자열)"};
    if (!PACK_VERSION_REGEX.test(raw.version)) {
        return {state: "invalid", reason: `version 형식 — "${raw.version}" 은 semver core(x.y.z)가 아닙니다`};
    }
    if (raw.version.length > PACK_VERSION_MAX_LENGTH) {
        return {state: "invalid", reason: `version 길이 — ${raw.version.length}자 > ${PACK_VERSION_MAX_LENGTH}자`};
    }
    return {state: "ok", manifest: {rev: raw.rev, code: raw.code, version: raw.version}};
}

/**
 * 파일명에서 신원을 읽는다(`{code}-{version}.zip`). **매니페스트와 대조할 두 번째 진술**이라 의미가 있다 —
 * 둘이 갈리면 그 zip 은 이름과 내용이 다른 물건이고, 사람은 이름을 보고 올린다(S3 키·원장은 내용을 따른다).
 * 코드에 하이픈이 있으므로(`beauty-nail`) 뒤에서부터 잘라야 옳게 갈린다.
 */
function identityFromFilename(path) {
    const m = /^(.+)-([0-9]+\.[0-9]+\.[0-9]+)\.zip$/.exec(basename(path));
    if (!m || !PACK_CODE_REGEX.test(m[1])) return null;
    return {code: m[1], version: m[2]};
}

/**
 * 작업 트리는 **임시 디렉터리 안**에서 만들고, 거기서 `npm ci` 와 `next build` 까지 돈다.
 * 즉 이 러너는 임시 공간을 수백 MB 쓴다.
 *
 * ⚠ **`/tmp` 가 tmpfs(RAM) 인 기계·컨테이너에서는 그 공간이 금방 마른다.** 그러면 이 러너가
 * `Unknown system error -122`(EDQUOT) 같은 문면으로 반려하는데, **멀쩡한 zip 이 그렇게 반려된다**
 * (심의 실측 — 검수자가 원인을 알 수 없는 사유였다). 그래서 실패할 때 그 가능성을 말해 준다.
 * 미리 공간을 재서 막지는 않는다 — 임계값은 빌드 크기에 달렸고, 짐작한 숫자로 멀쩡한 검수를
 * 거절하는 쪽이 더 나쁘다.
 *
 * 다른 자리에서 돌리려면 `TMPDIR` 을 디스크 경로로 주면 된다(`os.tmpdir()` 이 그 값을 읽는다).
 */
const work = mkdtempSync(join(tmpdir(), "zalkera-verify-"));

/** 실패 문면이 "임시 공간 부족"으로 읽히면 조치를 한 줄 덧붙인다. 아니면 조용히 지나간다. */
function hintTmpSpace(text) {
    // ⚠ 숫자 코드를 맨몸으로 두면 평범한 빌드 출력에 오발화한다 — 청크명(`vendors-28.js`)·소스 위치
    // (`page.tsx:4-28`)·빌드 id(`7f3a-122`)·경로명(`promo-28`)이 전부 걸렸다(심의가 실제 배송 도구로
    // 재현). 이름 넷은 오발화 0건이었으므로 그것을 본체로 두고 숫자는 errno 문맥에 앵커한다.
    const SPACE_ERROR = /ENOSPC|EDQUOT|no space left|disk quota|(?:errno|error|code)\s*:?\s*-(?:122|28)\b/i;
    if (!SPACE_ERROR.test(String(text ?? ""))) return;
    console.error(`   ⓘ 임시 디렉터리 공간이 부족한 것으로 보입니다(현재: ${tmpdir()}).`);
    console.error(`     이 검수는 zip 을 풀고 npm ci·빌드까지 돌리므로 수백 MB 가 필요합니다.`);
    console.error(`     디스크 경로를 주고 다시 돌리십시오:  TMPDIR=/큰/디스크/경로 node scripts/verify-zip.mjs <zip>`);
}
let failed = false;

try {
    console.log(`\n납품 검수 — ${zipPath}\n${"─".repeat(60)}`);

    // ① 언팩. unzip 이 없으면 실행 불가(환경 문제)로 2번 종료 — 반려가 아니다.
    const unzip = spawnSync("unzip", ["-q", "-o", resolve(zipPath), "-d", work], {encoding: "utf8"});
    if (unzip.error?.code === "ENOENT") {
        console.error("unzip 이 필요합니다 (apt install unzip).");
        process.exit(2);
    }
    if (unzip.status !== 0) {
        record("언팩", false, "zip 이 손상됐거나 형식이 아닙니다");
        hintTmpSpace((unzip.stderr ?? "") + (unzip.stdout ?? "") + (unzip.error?.message ?? ""));
        failed = true;
    } else {
        const root = effectiveRoot(work);

        // ② 형상 — package.json + lockfile, 산출물 미포함.
        const hasPkg = existsSync(join(root, "package.json"));
        // **npm 계열만** — 빌드 샌드박스가 `npm ci` 로 돌아 yarn·pnpm lockfile 을 소비할 수 없다.
        // 백엔드 `SiteTypeDetector.LOCKFILES` 의 거울이다. 여기서 넓게 받으면 "검사기는 통과했는데
        // 업로드가 거절"이라는, 이 검사기가 막으려는 바로 그 형상이 만들어진다.
        const lock = ["package-lock.json", "npm-shrinkwrap.json"].find((f) => existsSync(join(root, f)));
        const lockNote = hasPkg
            ? (lock ?? "npm lockfile 없음 — yarn·pnpm 프로젝트면 `npm install` 로 package-lock.json 을 만들어 포함하세요")
            : "package.json 없음";
        if (!record("프로젝트 형상", hasPkg && Boolean(lock), lockNote)) {
            failed = true;
        }
        for (const junk of ["node_modules", ".next"]) {
            if (existsSync(join(root, junk))) {
                record(`${junk} 미포함`, false, "zip 에서 빼 주십시오");
                failed = true;
            }
        }

        // ③ 시크릿 0 — 반려 사유 중 되돌릴 수 없는 유일한 항목이라 먼저 본다.
        //
        // ⚠ **못 읽은 자리가 있으면 "시크릿 0" 은 참이 아니라 미측정이다.** 안 가른 판이 위험한 이유:
        // 나중에 "읽지 못한 자리" 목록이 반려로 붙어도, 사람은 위에서 본 `✅ 시크릿 0` 을 기억한다.
        // 잰 것과 못 잰 것을 한 줄에 섞지 않는다.
        const beforeSecrets = unread.length;
        const secrets = scanSecrets(root);
        const secretsComplete = unread.length === beforeSecrets;
        if (secrets.length || !secretsComplete) {
            record(
                secretsComplete ? "시크릿 0" : "시크릿 스캔(불완전)",
                false,
                secrets.length
                    ? secrets.slice(0, 5).join(", ")
                    : "읽지 못한 자리가 있어 **끝까지 훑지 못했습니다** — 0 건이 아니라 미측정입니다",
            );
            failed = true;
        } else {
            record("시크릿 0", true);
        }

        // ④ 에셋 라이선스 매니페스트(발주 스펙 §1-5 필수) — **존재만** 기계가 보고 내용 대조는 사람이 한다.
        //    동봉 이미지가 하나도 없으면 요구 자체가 무의미하므로 그때만 면제한다.
        //    ⚠ 여기도 같은 함정이 있다 — 못 읽은 자리가 있으면 "이미지 0" 이 면제 사유가 되어선 안 된다.
        const beforeImages = unread.length;
        const images = countImages(root);
        const imagesComplete = unread.length === beforeImages;
        const manifest = join(root, ".zalkera", "ASSETS-LICENSE.md");
        if (images === 0 && !imagesComplete) {
            // 이미지 0 이 **면제 사유**로 쓰이는 자리라, 못 세었으면 면제해선 안 된다.
            record("에셋 라이선스 매니페스트", false, "이미지 수를 끝까지 세지 못해 면제 판단을 할 수 없습니다");
            failed = true;
        } else if (images === 0) {
            record("에셋 라이선스 매니페스트", true, "동봉 이미지 없음 — 해당 없음");
        } else if (!record("에셋 라이선스 매니페스트", existsSync(manifest), existsSync(manifest) ? `이미지 ${images}개 — 내용 대조는 사람이` : `이미지 ${images}개인데 .zalkera/ASSETS-LICENSE.md 가 없습니다`)) {
            failed = true;
        }

        // ⑩ **배송 문서의 좌표가 zip 안에서 실재하는가** — 카탈로그 팩 전용.
        //
        // ⚠ 왜 여기인가. 검사기의 D1 은 `AGENTS.md` 만, D2 는 `llms.txt` 만 본다 — `CUSTOMIZE.md`·
        //   `README.md` 는 **어떤 기계도 안 본다.** 2026-08-15 팩 심의에서 다섯 판이 반려됐는데 그중
        //   하나가 정확히 그 사각이었다(`CUSTOMIZE.md` 가 그 프리셋에 없는 `public/images/` 를 "열어
        //   보십시오"라고 지목). 그리고 실제로 `README.md` 가 죽은 좌표 2건(`lib/session.ts`·
        //   `lib/theme.ts` — 실물은 `src/lib/…`)을 4벌에 배송하고 있었다.
        //
        // ⚠ **왜 고객 CI(D1 확장)가 아니라 팩 시점인가.** D1 은 고객 트리에서 돈다. 확장하면 우리가
        //   잘못 배송한 문서 때문에 **테넌트 CI 가 빨개지고** BuildGate 가 그 사이트 배포를 막는다 —
        //   `ci.yml` 이 이미 경고하는 비대칭이다. 배송 전에 우리가 잡는 것이 맞다.
        //
        // ⚠ **`--pack` 모드에서만 잰다.** 납품 zip 은 한 테넌트로 가고 그 문서는 납품사 것이다.
        //   발주 스펙이 약속한 것은 규약 검사이지 문서 위생이 아니다(전제 A).
        if (packMode) {
            const DOC_TARGETS = ["CUSTOMIZE.md", "README.md", "AGENTS.md"];
            // ⚠ **잣대는 검사기 D1 의 거울이다** — 새로 지어내지 않는다.
            //   `@zalkera/client` 의 `bin/validate-storefront.mjs` 가 쓰는 `DOC_PATH_TOKEN`·
            //   `DOC_PATH_SKIP_PREFIX` 와 같은 값이고, 그 규칙은 17라운드 심의를 통과한 것이다.
            //   내가 처음에 "슬래시가 있으면 좌표"라는 자작 규칙을 썼다가 **후보 45건**이 나왔다 —
            //   URL 라우트(`/products`·`/blog/[slug]`)와 예시 파일명(`content/pages/회사연혁.json`)이
            //   전부 걸렸다(실측). 확장자 요구 + 접두 제외가 그것을 정확히 거른다.
            //
            //   이 파일은 외주에게 **단일 파일로** 건네지므로 공용 모듈을 import 하지 않는다(머리말).
            //   그래서 사본이 아니라 **거울**이고, 갈리면 이 검사가 헛돈다 — 옮길 일이 있으면 두 곳을
            //   같은 트랜치에서 고쳐라.
            //   ⚠ 한 곳만 **일부러 넓혔다**: 에셋 확장자. D1 목록은 소스 파일뿐이라 3.0.15 를 반려시킨
            //   바로 그 좌표(`public/images/…`)를 못 잡는다 — 그 판의 차단이 이미지 지목이었다.
            //   넓힌 대가를 재 봤더니 **오탐 0 · 진짜 1건**이었다(3.0.19 배송물 실측).
            const DOC_PATH_TOKEN =
                /^[A-Za-z0-9_.\-/[\]]+\.(?:tsx?|jsx?|mjs|cjs|json|css|md|png|jpe?g|webp|avif|gif|svg|ico)$/;
            const DOC_PATH_SKIP_PREFIX = ["doc/", "node_modules/", ".zalkera/", "@", "/", "http"];
            const dead = [];
            for (const doc of DOC_TARGETS) {
                let text;
                try {
                    text = readFileSync(join(root, doc), "utf8");
                } catch (e) {
                    // 없는 문서는 사실이 아니다(프리셋마다 문서 구성이 다를 수 있다). 있는데 못 읽는
                    // 것은 `unread` 에 적어 판정에 물린다 — 조용히 건너뛰면 "검사했다"로 읽힌다.
                    if (e.code !== "ENOENT") unread.push(`${relative(work, join(root, doc))} — 배송 문서 좌표 검사 실패 [${e.code ?? "UNKNOWN"}]`);
                    continue;
                }
                const seen = new Set();
                for (const m of text.matchAll(/`([^`\n]+)`/g)) {
                    const tok = m[1];
                    if (!tok.includes("/") || seen.has(tok)) continue;
                    if (!DOC_PATH_TOKEN.test(tok)) continue;
                    if (DOC_PATH_SKIP_PREFIX.some((x) => tok.startsWith(x))) continue;
                    seen.add(tok);
                    if (!existsSync(join(root, tok))) dead.push(`${doc}: ${tok}`);
                }
            }
            if (dead.length) {
                record("배송 문서 좌표", false, `\n   zip 안에 없는 것을 가리킵니다(${dead.length}건):\n   · ${dead.join("\n   · ")}`);
                console.error(`   죽은 좌표는 문서 위생이 아니라 **토큰 원가**입니다 — 고객 AI 가 이 문서를 먼저 읽고`);
                console.error(`   없는 파일을 찾다가 제 좌표를 짜냅니다. 실물 경로로 고치거나 표기를 지우십시오.`);
                failed = true;
            } else {
                record("배송 문서 좌표", true, `${DOC_TARGETS.join("·")} — 죽은 좌표 없음`);
            }
        }

        // ⑨ 팩 신원 매니페스트(memo150 §3·§8.2). **번호는 도입 순서이고 실행 순서가 아니다**(⑦⑧이 ⑥ 안에
        //    있는 것과 같다) — 신원은 싸게 읽히므로 몇 분짜리 설치·빌드 앞에 둔다.
        //
        //    두 모드가 재는 것이 다르다:
        //     · 기본(납품 검수) — 매니페스트는 **의무가 아니다**. 외주 zip 은 테넌트 사이트로 가고 카탈로그
        //       입장 판정은 서버가 한다(§8.4 — 고객 소스에 우리 형식을 강제하지 않는다). 다만 **있으면**
        //       형상이 옳아야 한다: 있는데 틀린 것은 어느 경로에서든 결함이다.
        //     · `--pack`(카탈로그 팩) — **없으면 반려**. 서버가 어차피 `THEME_PACK_MANIFEST_MISSING` 으로
        //       거부하므로 여기서 잡는 것이 싸고, `pack-preset` 이 자기 산출물을 이 모드로 재므로 팩 도구
        //       자신의 매니페스트 회귀가 우리 터미널에서 잡힌다.
        const packRead = readPackManifest(root);
        const fromName = identityFromFilename(zipPath);
        if (packRead.state === "invalid") {
            record("팩 신원(.zalkera/pack.json)", false, `${packRead.reason}\n   → 서버도 같은 사유로 적재를 거부합니다(memo150 §3.1 · rev·code·version 세 키뿐).`);
            failed = true;
        } else if (packRead.state === "absent") {
            if (packMode) {
                record(
                    "팩 신원(.zalkera/pack.json)",
                    false,
                    "카탈로그 팩에는 필수입니다 — 서버가 THEME_PACK_MANIFEST_MISSING 으로 거부합니다.\n" +
                        '   → 형식: {"rev": 1, "code": "<팩코드>", "version": "<x.y.z>"} (팩 도구가 자동으로 씁니다)',
                );
                failed = true;
            } else {
                record("팩 신원(.zalkera/pack.json)", true, "없음 — 납품 zip 은 의무가 아닙니다(카탈로그 팩만 필수)");
            }
        } else {
            const {code, version} = packRead.manifest;
            // 파일명 대조. 매니페스트가 있는데 이름이 그 형식이 아니면 **팩 모드에서만** 반려한다 —
            // 외주가 자기 관례로 이름을 붙이는 것은 자유이고, 그 zip 의 신원 판정은 서버가 내용으로 한다.
            if (!fromName) {
                if (packMode) {
                    record("팩 신원(.zalkera/pack.json)", false, `${code}@${version} 인데 파일명이 {code}-{version}.zip 형식이 아닙니다 — ${basename(zipPath)}`);
                    failed = true;
                } else {
                    record("팩 신원(.zalkera/pack.json)", true, `${code}@${version} (rev ${packRead.manifest.rev}) · 파일명 대조 생략`);
                }
            } else if (fromName.code !== code || fromName.version !== version) {
                record(
                    "팩 신원(.zalkera/pack.json)",
                    false,
                    `이름과 내용이 다릅니다 — 파일명은 ${fromName.code}@${fromName.version} 인데 매니페스트는 ${code}@${version} 입니다.\n` +
                        "   → 원장·S3 키는 **내용**을 따르고 사람은 **이름**을 보고 올립니다. 이름을 고치거나 다시 팩하십시오.",
                );
                failed = true;
            } else {
                record("팩 신원(.zalkera/pack.json)", true, `${code}@${version} (rev ${packRead.manifest.rev}) · 파일명 일치`);
            }
        }

        // ⑤ 규약 검사 — **정본 참조 실행**(사본 0).
        //
        //    두 축이 다르게 걸린다:
        //     · **스타일·콘텐츠 규약(S·N)** — `package.json` 의 `zalkera.*` 를 **선언한 레포에서만** error.
        //       선언은 자발이고, 안 하면 경고이거나 스킵이다(요건 1 — 어휘를 강제할 수 없다).
        //     · **서빙 책임 축(X·C·E)** — 선언과 **무관하게** 여기서는 error. `--gate` 가 그 뜻이다.
        //       근거는 선언이 아니라 **누가 서빙하는가**다: 이 도구는 우리가 서빙할 납품물을 재는 자리다.
        //
        //    ⚠ 종전 주석은 "선언이 없으면 validator 가 스스로 스킵한다"였는데 **X·C·E 에는 거짓**이었다
        //    (선언을 지워도 error 로 남았다 — 실측). 스펙 문면과도 갈라져 있었고, 이제 셋을 하나로 맞춘다.
        //
        //    소스 루트는 고정이 아니다: Next.js 는 `src/app` 과 루트 `app` 을 **둘 다** 허용하고,
        //    실제 납품물(credium)이 후자였다. `src` 를 못 찾으면 루트를 넘긴다 —
        //    validator 는 node_modules·.next 를 스스로 건너뛴다(실측).
        //    설치보다 **앞**에 둔다: 규약 위반은 몇 분짜리 npm ci 를 돌리기 전에 알려주는 게 맞다.
        const srcDir = existsSync(join(root, "src")) ? join(root, "src") : root;
        // `--gate` — **우리가 서빙 책임을 지는 자리**라 서빙 축(X·C·E)을 error 로 올린다.
        // 개발자가 손으로 부르는 `npm run validate` 는 같은 규칙을 경고로만 낸다(권고). 기준은
        // "선언했는가"가 아니라 **누가 서빙하는가** 다 — 검사기 머리말의 GATE_MODE 참조.
        const v = spawnSync("node", [VALIDATOR, srcDir, "--gate"], {cwd: root, encoding: "utf8"});
        // validator 는 위반을 **stderr** 로 낸다 — stdout 만 잡으면 반려 사유가 빈칸으로 나온다
        // (실제 납품물에 처음 돌렸을 때 그랬다. 왜 반려됐는지 못 알려주는 검수는 쓸모없다).
        //    채널이 갈리므로(요약은 stdout, 위반은 stderr) 합친 뒤 **내용으로** 골라낸다 —
        //    "마지막 줄"로 잡으면 요약 대신 경고 한 줄이 표시된다(그렇게 잡았다가 헷갈렸다).
        const vLines = [v.stdout, v.stderr].filter(Boolean).join("\n").trim().split("\n").filter(Boolean);
        const mode = vLines.find((l) => l.startsWith("스타일 규약 모드")) ?? "";
        const summary = [...vLines].reverse().find((l) => /^(✅|❌)/.test(l)) ?? "";
        const warnings = vLines.filter((l) => l.startsWith("⚠️"));
        // 종료코드를 한 칸으로 접으면 납품사가 **"규약을 어겼다"와 "검사를 못 했다"를 구분할 수 없다.**
        // 둘은 고치는 사람도 고치는 법도 다르다 — 앞은 납품사가 코드를 고치고, 뒤는 zip 안의
        // 파일 상태(권한·끊어진 심링크)를 고친다. 셋 다 반려지만 사유를 갈라 적는다.
        //
        //   0  통과 · 1 규약 위반 · 2 검사기 자체 오류 · 7 검사 불능(못 읽은 자리가 있음)
        //
        // ⚠ `status` 는 시그널로 죽으면 **null** 이다. `!== 0` 은 그걸 잡지만 `=== 1` 은 못 잡는다.
        // ⚠ **위반 줄이 먼저다.** 종전엔 그냥 마지막 12줄을 잘랐는데, 못 읽은 자리 목록이 길면
        // 그것이 창을 다 채워 `❌ [E1]`·`❌ [E3]` 가 **검수자에게 한 글자도 안 갔다**(심의 실측:
        // 시크릿이 박힌 zip 에서 위반 grep 0건, 검수자가 받는 안내는 "권한을 고치라"뿐).
        // 규약 위반은 절대 잘리지 않게 앞에 붙이고, 남는 자리를 나머지로 채운다.
        const detailLines = vLines.filter((l) => !l.startsWith("⚠️"));
        const violations = detailLines.filter((l) => /^❌ \[/.test(l));
        const rest = detailLines.filter((l) => !/^❌ \[/.test(l));
        const picked = [...violations.slice(0, 12), ...rest.slice(-Math.max(0, 12 - violations.length))];
        const dropped = detailLines.length - picked.length;
        const detail =
            `\n   ${picked.join("\n   ")}` +
            (dropped > 0 ? `\n   … 외 ${dropped}줄(전체는 위 출력 참조 — 여기서 자른 것은 위반이 아닙니다)` : "");
        if (v.status === 0) {
            record("규약 검사", true, [mode, summary].filter(Boolean).join(" · "));
        } else if (v.status === 7) {
            record("규약 검사(불능)", false, `\n   zip 안에 **읽지 못한 자리**가 있어 검사가 끝나지 않았습니다 — 통과가 아닙니다.${detail}`);
            failed = true;
        } else if (v.status === 1) {
            record("규약 검사", false, detail);
            failed = true;
        } else {
            record(
                "규약 검사(실행 실패)",
                false,
                `\n   검사기가 종료코드 ${v.status ?? `시그널 ${v.signal}`} 로 멈췄습니다 — 규약 검사가 0줄 돌았습니다.${detail}`,
            );
            failed = true;
        }
        // 경고는 반려 사유가 아니지만(inferred 모드) 재납품 요청에 그대로 붙일 재료다 — 삼키지 않는다.
        if (warnings.length) {
            console.log(`   경고 ${warnings.length}건:`);
            for (const w of warnings.slice(0, 10)) console.log(`   ${w}`);
            if (warnings.length > 10) console.log(`   … 외 ${warnings.length - 10}건`);
        }

        // lockfile 이 없으면 설치를 시도하지 않는다 — `npm ci` 가 usage 덤프를 뱉어,
        // 이미 형상 단계에서 잡은 사실을 읽기 어려운 형태로 한 번 더 말할 뿐이다.
        if (hasPkg && lock) {
            // ⑥ 의존 설치 + 빌드 — 재현 가능한 빌드인지. 오래 걸려서 맨 뒤에 둔다.
            const run = (label, cmd, cmdArgs) => {
                const r = spawnSync(cmd, cmdArgs, {
                    cwd: root,
                    encoding: "utf8",
                    timeout: 15 * 60 * 1000,
                    env: {...process.env, ...BUILD_ENV},
                });
                const ok = r.status === 0;
                if (!ok) {
                    const tail = (r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n   ");
                    record(label, false, `\n   ${tail}`);
                    // 설치·빌드가 임시 공간을 가장 많이 쓴다 — 심의가 실제로 여기서 EDQUOT 를 밟았다.
                    hintTmpSpace((r.stderr ?? "") + (r.stdout ?? "") + (r.error?.message ?? ""));
                } else {
                    record(label, true);
                }
                return ok;
            };

            // ⚠ 플래그는 샌드박스 `build.sh` 와 **같아야 한다**(머리말 "검수 빌드는 서빙 빌드를 닮는다").
            //   `--ignore-scripts` 를 빼면 postinstall 산출에 기대는 소스가 여기서만 통과한다.
            if (!run("npm ci", "npm", ["ci", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"])) failed = true;
            else {
                // ⑦ 산출물 검사기가 **이 zip 안에서 살아서 뜨는가**(memo122 §1.3-3 · §8-ⓒ).
                //
                //    왜 게이트인가: `CUSTOMIZE.md` 는 "그 검사기도 이 zip 에 들어 있습니다"라고 약속하는데,
                //    잣대(보장표) 해석이 형제 백엔드 체크아웃을 가정한 탓에 고객 기계에서는 exit 2 로
                //    **조용히 죽어 있었다**(2026-07-29 실측). 파일이 zip 에 있는지는 눈으로 보이지만
                //    "돌긴 도는지"는 안 보인다 — 그 회귀를 사람이 아니라 여기서 잡는다.
                //
                //    `--print-guarantees` 는 잣대 해석만 하고 끝내는 모드다: 크롤이 없어 네트워크·기동
                //    없이 돌고, 판정하지 않으므로 **납품물의 AEO 성적을 반려 사유로 삼지 않는다**
                //    (재는 것은 오직 "검사기가 실행 가능한가").
                //
                //    검사기가 없는 zip 은 해당 없음이다 — 외주가 자기 스택으로 짜 왔다면 우리 검사기를
                //    실을 의무가 없다(전제 A). 실었는데 안 도는 것만 반려다.
                const pkgScripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
                if (!pkgScripts["check:aeo"]) {
                    record("산출물 검사기 실행성", true, "check:aeo 스크립트 없음 — 해당 없음");
                } else {
                    const a = spawnSync("npm", ["run", "check:aeo", "--", "--print-guarantees"], {
                        cwd: root,
                        encoding: "utf8",
                        timeout: 2 * 60 * 1000,
                    });
                    const aLines = [a.stdout, a.stderr].filter(Boolean).join("\n").trim().split("\n").filter(Boolean);
                    if (a.status === 0) {
                        record("산출물 검사기 실행성", true, aLines.find((l) => l.includes("잣대 출처")) ?? "");
                    } else {
                        record("산출물 검사기 실행성", false, `\n   ${aLines.slice(-6).join("\n   ")}`);
                        failed = true;
                    }
                }

                if (!run("npm run build", "npm", ["run", "build"])) {
                    failed = true;
                } else {
                    // ⑧ **서빙 산출물 계약**(memo145 §2-4-⑴ — 이 러너의 주 관문).
                    //
                    //    재는 것은 `next.config` 에 무엇이 적혀 있는가가 **아니다**. 설정 문자열은 양쪽으로
                    //    거짓말한다 — 조건부 조립이면 `output:"standalone"` 이 있어도 산출이 안 나오고,
                    //    없어도 외부 조립·재export 로 나올 수 있다(memo140 §6.5 X1 과 같은 함정).
                    //    빌드 산출물은 정의상 사실이고, 그 빌드는 **바로 위에서 이미 돌았다**(추가 비용 0).
                    //
                    //    이 파일이 없으면 잘커라 서빙 박스가 `node server.js` 로 띄울 것이 없어 exit 4 로
                    //    반려한다. 즉 여기서 ✅ 를 주면 그건 거짓 통과다 — 실제로 저지른 사고다.
                    const standalone = existsSync(join(root, ".next", "standalone", "server.js"));
                    if (
                        !record(
                            "서빙 산출물(.next/standalone/server.js)",
                            standalone,
                            standalone
                                ? ""
                                : "빌드는 성공했지만 자기완결 산출물이 없습니다 — 이 소스는 잘커라 호스팅에서 서빙되지 않습니다.\n" +
                                  "   → next.config 에 output: 'standalone' 을 추가하고 다시 빌드해 주세요\n" +
                                  "     (잘커라는 빌드 산출물 .next/standalone/server.js 를 실행합니다.\n" +
                                  "      output: 'export'·distDir 변경 상태로는 서빙할 수 없습니다).\n" +
                                  "   자체 호스팅(BYO)이면 이 요건은 해당 없습니다 — 이 검수는 우리가 서빙할 납품물을 재는 자리입니다.",
                        )
                    ) {
                        failed = true;
                    }
                }
            }
        }
    }
} finally {
    if (keep) {
        console.log(`\n작업 트리 보존: ${work}`);
    } else {
        try {
            rmSync(work, {recursive: true, force: true});
        } catch {
            // `force` 는 ENOENT 만 삼킨다 — 권한 000 디렉터리가 섞인 zip 이면 EACCES 로 던지고,
            // 그 예외가 finally 안에서 나가면 **판정 자체를 덮어쓴다**(반려/통과가 정리 실패로 뒤바뀐다).
            // 정리 실패는 판정이 아니다. 자리만 알려 주고 판정은 아래에서 그대로 낸다.
            spawnSync("chmod", ["-R", "u+rwX", work]);
            try {
                rmSync(work, {recursive: true, force: true});
            } catch (e) {
                console.warn(`\n⚠️  작업 트리를 지우지 못했습니다: ${work} [${e.code ?? "UNKNOWN"}] — 손으로 지우십시오.`);
            }
        }
    }
}

// 못 읽은 자리는 **반려**다. 조용히 건너뛰면 시크릿 스캔이 0줄 돌고도 "동봉 시크릿 없음"으로 읽힌다 —
// 검사기 본체가 rc 7 로 가른 것과 같은 자리이고, 여기 zip 은 우리가 서빙을 책임질 물건이다.
if (unread.length) {
    console.error(`\n❌ 읽지 못한 자리 ${unread.length}곳 — 이 자리들은 **검사하지 않았습니다(통과가 아닙니다).**`);
    for (const u of unread) console.error(`   · ${u}`);
    console.error("   zip 안 파일 권한을 정상화(디렉터리 755·파일 644)해 다시 압축한 뒤 재납품 요청하십시오.");
    failed = true;
}

console.log("─".repeat(60));
if (failed) {
    console.error("\n반려 — 위 ❌ 항목을 고쳐 재납품 요청하십시오.");
    console.error("사람이 추가로 볼 것: 에셋 출처 실제 대조 · 링크 소독(safeUrl) 여부 · 개시 후 화면·색 반영.");
    process.exit(1);
}
console.log("\n기계 검사 통과. **아직 인수 확정이 아닙니다** — 다음은 사람 몫입니다:");
console.log("  · 에셋 매니페스트와 실제 이미지 대조(출처·라이선스)");
console.log("  · href 가 소독을 타는지(오픈 리다이렉트 — 기계가 못 잡는 자리)");
console.log("  · 실제 개시 후 화면 확인 + 콘솔에서 색 1회 바꿔 반영 확인");
