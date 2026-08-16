#!/usr/bin/env node
/**
 * 납품 zip 검수 러너.
 *
 * 외주가 보낸 zip 하나를 받아 **받아도 되는 물건인지** 기계로 판정한다. 발주 스펙
 * (`backend/doc/vendor/site-build-spec.md`) §4 가 "검사기를 드립니다"라고 약속한 그 물건이고,
 * 체크리스트의 ①②③⑥을 기계화한다(④ 라이선스·⑦ 행위 안전은 여전히 사람 몫).
 *
 * **정본을 복사하지 않는다.** 규약 검사는 이 레포의 `validate-storefront.mjs` 를 **srcDir 인자로 참조 실행**
 * 한다 — 사본을 뜨면 그 순간 드리프트가 시작되고, 그게 이 프로젝트가 내내 싸우는 병이다(471946c).
 * 그 파일은 이제 `@zalkera/client` 의 `zalkera-validate` 를 부르는 wrapper 라(2026-08-01 이관), 이 러너가
 * 참조 실행하는 순간 판정은 **설치본 정본 한 벌**에서 나온다.
 *
 * ── 이 러너의 정본 위치 ────────────────────────────────────────
 * **정본은 이 파일이다**(`zalkera-storefront-examples/scripts/verify-zip.mjs`). `backend/doc/vendor/verify-zip.mjs`
 * 는 발주처에 건네는 **바이트 사본**이고, 고칠 곳은 언제나 여기다. 2026-08-01 에 그 둘이 **역방향으로**
 * 갈라진 채 발견됐다(사본만 lockfile 축을 고쳤고, 정본만 `--gate` 를 가졌다) — 사본을 손으로 고치면
 * 정확히 그 상태가 재생산된다. 합류시킨 뒤 사본은 `cp` 로 재고정했다.
 *
 * ── 이 러너가 왜 빌드까지 도는가 ───────────────────────────────────────
 * **빌드 성공과 서빙 요건은 서로 다른 것을 잰다.** 2026-08-01 에 우리 팩 zip 이 `npm run build` 를
 * 통과하고도 서빙 박스에서 반려됐다(exit 4) — `.next/standalone/server.js` 가 안 나왔기 때문이다.
 * 이 러너는 exit 0 만 보고 ✅ 를 찍고 있었다. 그 간극을 ⑧ 산출물 검사가 닫는다: **이미 지불한 빌드에서
 * 옳은 것을 읽는다**(추가 비용 0). "검사 통과"가 "서빙된다"를 뜻하지 않던 것이 그 사건의 본질이다.
 *
 * ── 검수 빌드는 **서빙 빌드의 조건을 닮아야 한다** ──────────────────────────────
 * 그래서 설치를 `npm ci --ignore-scripts --include=dev` 로 돈다(샌드박스 `build.sh` 와 같은 플래그).
 * 근거: 서빙 박스는 공급망 RCE 를 막으려 postinstall 을 **실행하지 않는다**. 검수만 실행하면
 * postinstall 산출에 기대는 소스가 여기서 ✅ 를 받고 서빙에서 죽는다 — ⑧이 막으려는 것과 같은
 * 종류의 거짓이다.
 *
 * ⚠ **`--ignore-scripts` 를 격리 수단으로 읽지 마라.** 이 러너는 그 뒤에 `npm run build`·`npm test`·
 *   `npm run check:aeo` 를 돌리고 `--pack` 에서는 빌드를 두 번 더 굽는다 — 즉 **zip 의 스크립트를
 *   검수자 기계에서 실행한다.** 빌드 없이 서빙 요건을 잴 방법이 없어 그렇게 설계했다.
 *   신뢰할 수 없는 zip 을 검수한다면 **일회용 컨테이너나 VM 에서 돌려라.** 이 러너는 격리하지 않는다.
 *   `--include=dev` 는 이 러너에서는 기본 동작이지만, NODE_ENV=production 인 CI 러너에서
 * 돌 때 devDeps 가 빠져 멀쩡한 납품물이 거짓 반려되는 것을 막는다(샌드박스가 같은 이유로 붙였다).
 * 반대로 **일부러 다르게 두는 축**도 있다: `ZALKERA_OFFLINE_BUILD=1` — 러너에 백엔드가 없다는 선언이다
 * (아래 `BUILD_ENV` 주석 참조 — 이 플래그는 지금 동작을 바꾸지 않는다).
 *
 * lockfile 축도 같은 원리다 — 서빙 박스는 `npm ci` 뿐이라 yarn·pnpm lock 을 소비하지 못한다.
 * 넓게 받으면 "검사기는 통과했는데 업로드가 거절"이 만들어진다(서버 판정과 같은 목록).
 *
 * ── `--pack` — 카탈로그 팩 모드 ────────────────────────────────────
 * 기본은 **납품 검수기**다: 외주 zip 은 테넌트 사이트로 가므로 팩 신원 매니페스트(`.zalkera/pack.json`)를
 * 낼 의무가 없고, 카탈로그 입장 판정은
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
import {existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from "node:fs";
import {basename, join, relative, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {judgeFloors, REQUIRED_FLOORS} from "./lib/floors.mjs";
import {junkTopLevel} from "./lib/junkEntries.mjs";
import {derivedRoutes, appDirOf, SYNTHETIC} from "./lib/routes.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const VALIDATOR = join(HERE, "validate-storefront.mjs");
/**
 * 행위 검사기 — **이 러너 옆의 사본**이다. zip 안의 것을 부르면 그것을 `exit 0` 으로 갈아 끼우는
 * 것만으로 오라클이 꺼진다(신뢰 밖 zip 이 자기를 검사할 도구를 고르게 두는 셈이다).
 */
const GATE_BEHAVIOR = join(HERE, "lib", "gate-behavior.mjs");

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
 * 빌드 env — **`.github/workflows/ci.yml` 과 패리티**여야 한다(서빙 인프라도 같은 값을 준다).
 *
 * 이유가 각각 다르다:
 *  · `ZALKERA_TENANT` — 코드가 **폴백 없이 require** 한다(`src/lib/env.ts` 가 없으면 던진다). 이 값을
 *    안 주면 멀쩡한 납품물이 빌드 실패로 **거짓 반려**된다(이 러너를 처음 돌렸을 때 실제로 그랬다).
 *  · `ZALKERA_API_BASE` — 코드에 폴백이 있어 없어도 빌드는 된다. 그래도 CI·서빙과 같은 값을 준다(패리티).
 *  · `ZALKERA_OFFLINE_BUILD` — "여긴 백엔드가 없다"는 **선언**이다. ⚠ **지금 아무것도 바꾸지 않는다** —
 *    읽는 코드에 호출자가 0개다(실측). 패리티로 그대로 두되, 이걸 줘야 거짓 반려를 막는다고 읽지 마라.
 * 이름이 구 `ONEQUE_*` 면 폴백 제거 후 env 파서가 던진다.
 */
const BUILD_ENV = {
    ZALKERA_API_BASE: "http://localhost:8100",
    ZALKERA_TENANT: "ci-placeholder",
    ZALKERA_OFFLINE_BUILD: "1",
};

/**
 * 자식의 판정을 바꾸는 **상속 변수**. 측정 자식을 띄우기 전에 지운다.
 *
 * 이 러너가 어떤 환경에서 불릴지 우리가 정하지 못한다 — 이것들이 남아 있으면 자식이 다른 모드로
 * 돌고, 그 결과를 우리가 판정으로 읽는다. 값이 아니라 **의미**가 바뀌는 자리다.
 *
 * `NODE_TEST_CONTEXT` — node 러너가 자식 모드로 돌아 `# pass N` 요약 줄을 안 낸다. 그러면
 *   하한 파싱이 `-1` 이 되어 **멀쩡한 팩이 전 스위트 0/하한으로 거짓 반려**된다.
 *   재현: `NODE_TEST_CONTEXT=child-v8 node --experimental-strip-types --test <시험파일> | grep '^# pass'` → 무출력
 * `NODE_OPTIONS` — 자식 node 에 임의 플래그를 주입한다.
 * `NEXT_PUBLIC_*_PREVIEW` — 프리뷰 판별자가 이것을 읽어 빌드의 뜻이 바뀐다.
 */
const INHERITED_NOISE = ["NODE_TEST_CONTEXT", "NODE_OPTIONS", "NEXT_PUBLIC_ZALKERA_PREVIEW", "NEXT_PUBLIC_ONEQUE_PREVIEW"];

/** 측정 자식에게 줄 환경. 상속 잡음을 지우고 선언한 값만 얹는다. */
function childEnv(extra = {}) {
    const env = {...process.env, ...extra};
    for (const k of INHERITED_NOISE) delete env[k];
    return env;
}

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
 * **내용 축.** 이름만 보면 평범한 `src/lib/cfg.ts` 에 박힌 라이브 키를 이름 검사로는 못 잡는다 — AWS 키·
 * 결제 라이브 시크릿·RSA 개인키를 그렇게 심고 `rc 0 · ✅ 시크릿 0` 으로 통과시켰다. 라벨이 잰 것보다
 * 넓게 말하던 자리다(실제로 잰 것은 "환경파일 이름이 없다"였다).
 *
 * ⚠ **패턴을 문자클래스로 쓴다.** 이 파일 자신이 zip 에 실려 스캔 대상이 되므로, 리터럴로 적으면
 *   스캐너가 자기를 잡는다. 바꿀 때는 4벌에 돌려 오탐 0 을 확인하라.
 *
 * ⚠ 이것은 **완전하지 않다.** 고엔트로피 문자열 일반은 안 본다 — 그래서 라벨이 "이름·내용 패턴"이다.
 *   범위를 넓혀 말하지 마라. 그 과장이 이 결함의 본체였다.
 */
const SECRET_CONTENT = [
    ["AWS 액세스키", /\bAKIA[0-9A-Z]{16}\b/],
    ["개인키 블록", /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----/],
    ["결제 라이브 시크릿", /\b(?:sk_live_|live_sk_)[0-9A-Za-z]{8,}/],
    ["GitHub 토큰", /\b(?:gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,})\b/],
    ["Slack 토큰", /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/],
    ["Google API 키", /\bAIza[0-9A-Za-z_\-]{35}\b/],
    ["npm 토큰", /\bnpm_[0-9A-Za-z]{36}\b/],
    // 우리 고유 형식. 검사기 `[E3]` 도 이걸 알지만 그쪽은 `src/` 만 훑는다 — `public/` 은 Next 가
    // 그대로 공개 서빙하는 자리라 여기서 봐야 한다 (`public/config.js` 의 키가 무검출이었다).
    ["잘커라 스토어프론트 키", /\boqsk_[0-9A-Za-z_-]{8,}/],
    ["URL 내장 자격증명", /\b[a-z][a-z0-9+.\-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/],
];
const SECRET_TEXTUAL = /\.(m?[jt]sx?|cjs|json|md|txt|ya?ml|sh|html?|css|toml|ini|conf|env)$/i;
/** 확장자가 없는데 자격증명이 앉는 이름들. `.git/config` 이 이 그물 밖이라 통과한 전례가 있다. */
const SECRET_EXTENSIONLESS =
    /^(config|credentials|\.git-credentials|\.netrc|_netrc|\.npmrc|\.pgpass|authorized_keys|known_hosts|id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i;
const SECRET_CONTENT_MAX = 2 * 1024 * 1024;

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
            // ⚠ `.git` 은 **건너뛰지 않는다.** 이 함수 머리말이 "git 이력은 되돌릴 수 없어 사후 수습이
            //   불가능하다"고 적어 둔 바로 그 자리인데, 종전엔 스캔에서 빼 놓고 `✅ 시크릿 0` 을 찍었다 —
            //   시크릿을 `.git/config` 에만 넣은 zip 이 통과한다. 카탈로그 팩은 `pack-preset`
            //   이 `.git` 을 구조적으로 배제하지만, **업로드 태생 테넌트**는 작업트리를 통째로 zip 하고
            //   이 러너가 그들의 유일한 관문이다.
            if (e.name === "node_modules" || e.name === ".next") continue;
            if (e.isDirectory()) {
                walk(join(d, e.name), r);
                continue;
            }
            if (/(^|\/)\.env(\.|$)/.test(`/${r}`) && !ENV_KEEP.test(e.name)) hits.push(r);
            if (/\.(pem|key|p12|pfx)$/.test(e.name)) hits.push(r);
            // 확장자 없는 자격증명 파일(`.git/config`·`.git/credentials`·`.netrc` 등)도 본다 —
            // 위 정크 반려가 1차 방어이고 이것이 2차다.
            if (!SECRET_TEXTUAL.test(e.name) && !SECRET_EXTENSIONLESS.test(e.name)) continue;
            // ⚠ **심링크는 따라가지 않는다.** 신뢰 밖 zip 이라 `docs/harmless.md → /검수자/사설파일`
            //   하나로 검수자 파일을 읽고 그 내용이 반려문에 실린다. 못 읽은 것으로 적어
            //   "시크릿 0" 이 미측정을 덮지 않게 한다.
            if (e.isSymbolicLink()) {
                unread.push(`${r} — 심링크라 내용을 읽지 않았습니다(zip 안 실파일로 바꿔 재납품하십시오)`);
                continue;
            }
            let text;
            try {
                const full = join(d, e.name);
                if (statSync(full).size > SECRET_CONTENT_MAX) continue;
                text = readFileSync(full, "utf8");
            } catch (err) {
                // 못 읽은 것은 적는다 — 조용히 넘기면 "0건"이 미측정을 덮는다.
                unread.push(`${r} — 시크릿 내용 스캔 실패 [${err.code ?? "UNKNOWN"}]`);
                continue;
            }
            for (const [label, re] of SECRET_CONTENT) if (re.test(text)) hits.push(`${r} (${label})`);
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
 * 팩 신원 매니페스트 계약 — **서버가 적재 때 읽는 것과 같은 규칙**이다.
 *
 * 여기 규칙이 서버와 갈리면 이 러너가 ✅ 를 준 zip 이 적재에서 400 으로 죽는다(락파일 판정도
 * 거울과 같은 자리). 그래서 서버가 거부하는 것을 **여기서 같은 사유로** 먼저 말한다 — 판정의 정본은 서버이고
 * 이것은 싼 조기 경보다.
 *
 ⚠ 이 규칙은 서버 판정의 **거울**이지 사본이 아니다 — 갈리면 서버가 400 으로 잡는다.
 *
 * ⚠ 이 러너는 `backend/doc/vendor/` 로 나간다. 단일 파일이 아니라 `verify-zip.mjs` + `lib/` 를
 *   **같이** 건네야 한다(`lib/floors.mjs`·`lib/junkEntries.mjs`·`lib/routes.mjs`). 하나만 갱신하면
 *   `ERR_MODULE_NOT_FOUND` 로 죽는다.
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
    if (!existsSync(file)) return {state: "absent"};
    // 심링크를 따라가면 zip 이 이 러너로 **검수자 파일시스템을 읽는다** — 그 내용·키·크기가
    // 반려문에 실린다. 시크릿 스캔·문서 좌표 검사가 쓰는 것과 같은 규율로 막는다.
    if (lstatSync(file).isSymbolicLink()) return {state: "invalid", reason: "심링크입니다 — 읽지 않았습니다"};
    if (!statSync(file).isFile()) return {state: "absent"};

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
 * — 원인을 알 수 없는 사유로 보인다. 그래서 실패할 때 그 가능성을 말해 준다.
 * 미리 공간을 재서 막지는 않는다 — 임계값은 빌드 크기에 달렸고, 짐작한 숫자로 멀쩡한 검수를
 * 거절하는 쪽이 더 나쁘다.
 *
 * 다른 자리에서 돌리려면 `TMPDIR` 을 디스크 경로로 주면 된다(`os.tmpdir()` 이 그 값을 읽는다).
 */
const work = mkdtempSync(join(tmpdir(), "zalkera-verify-"));

/**
 * 작업 트리를 지운다. `process.exit` 은 `try/finally` 의 `finally` 를 건너뛰므로 — 조기 반려가
 * 그 경로다 — `exit` 훅에도 건다. 어느 경로로 끝나든 남지 않게 한다.
 *
 * 정리 실패는 판정이 아니다. `force` 는 ENOENT 만 삼키므로 권한 000 디렉터리가 섞인 zip 은
 * EACCES 로 던지는데, 그 예외가 판정을 덮어쓰면 반려·통과가 정리 실패로 뒤바뀐다.
 */
let workRemoved = false;
function removeWork() {
    if (workRemoved || keep) return;
    workRemoved = true;
    try {
        rmSync(work, {recursive: true, force: true});
    } catch {
        spawnSync("chmod", ["-R", "u+rwX", work]);
        try {
            rmSync(work, {recursive: true, force: true});
        } catch (e) {
            console.warn(`\n⚠️  작업 트리를 지우지 못했습니다: ${work} [${e.code ?? "UNKNOWN"}] — 손으로 지우십시오.`);
        }
    }
}
process.on("exit", removeWork);

/** 실패 문면이 "임시 공간 부족"으로 읽히면 조치를 한 줄 덧붙인다. 아니면 조용히 지나간다. */
function hintTmpSpace(text) {
    // ⚠ 숫자 코드를 맨몸으로 두면 평범한 빌드 출력에 오발화한다 — 청크명(`vendors-28.js`)·소스 위치
    // (`page.tsx:4-28`)·빌드 id(`7f3a-122`)·경로명(`promo-28`)이 전부 걸린다(실제 배송 도구로
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

    // ①-a **풀기 전에 엔트리 목록으로 거른다.** 산출물·의존성을 통째로 담은 zip 은 어차피 반려인데,
    //     먼저 풀면 그 크기만큼 임시공간을 쓰고 나서 반려한다. `unzip -Z1` 은 압축을 안 풀어 싸다.
    //     이 판정의 계약은 `scripts/lib/junkEntries.test.mjs` 가 진다.
    {
        const pre = spawnSync("unzip", ["-Z1", resolve(zipPath)], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
        if (pre.error?.code === "ENOENT") {
            console.error("unzip 이 필요합니다 (apt install unzip).");
            process.exit(2);
        }
        if (pre.status === 0) {
            const junk = junkTopLevel((pre.stdout ?? "").split("\n"));
            if (junk.length) {
                record("정리(산출물·의존성 미포함)", false, `${junk.join(" · ")} 미포함 — zip 에서 빼 주십시오`);
                console.error(`   푸는 데 임시공간을 쓰기 전에 엔트리 목록만 보고 판정했습니다.`);
                console.error(`
반려 — 위 ❌ 항목을 고쳐 재납품 요청하십시오.`);
                process.exit(1);
            }
        }
        // 목록을 못 읽었으면 여기서 반려하지 않는다 — 아래 언팩이 같은 것을 다시 본다.
    }

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
        // 서버의 락파일 판정과 같은 목록이다. 여기서 넓게 받으면 "검사기는 통과했는데
        // 업로드가 거절"이라는, 이 검사기가 막으려는 바로 그 형상이 만들어진다.
        const lock = ["package-lock.json", "npm-shrinkwrap.json"].find((f) => existsSync(join(root, f)));
        const lockNote = hasPkg
            ? (lock ?? "npm lockfile 없음 — yarn·pnpm 프로젝트면 `npm install` 로 package-lock.json 을 만들어 포함하세요")
            : "package.json 없음";
        if (!record("프로젝트 형상", hasPkg && Boolean(lock), lockNote)) {
            failed = true;
        }
        // ⚠ `.git` 이 여기 있는 이유는 용량이 아니라 **시크릿**이다. 아래 시크릿 스캔은 확장자로
        //   텍스트 파일을 고르는데 `.git/config`·`.git/credentials` 는 **확장자가 없어** 그 그물에
        //   안 걸린다(실측: `.git/config` 에만 자격증명을 넣은 zip 이 `✅ 시크릿 0` 으로 통과했다).
        //   스캔을 넓히는 것보다 **아예 안 받는 것**이 확실하다 — 이력은 되돌릴 수 없고, 고객 소스에
        //   git 이력이 우리 쪽으로 올 이유도 없다.
        for (const junk of ["node_modules", ".next", ".git"]) {
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
                secretsComplete ? "시크릿 0(이름·내용 패턴)" : "시크릿 스캔(불완전)",
                false,
                secrets.length
                    ? secrets.slice(0, 5).join(", ")
                    : "읽지 못한 자리가 있어 **끝까지 훑지 못했습니다** — 0 건이 아니라 미측정입니다",
            );
            failed = true;
        } else {
            record("시크릿 0(이름·내용 패턴)", true);
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
        //   `README.md` 는 **어떤 기계도 안 본다.** 2026-08-15 팩 다섯 판이 반려됐는데 그중
        //   하나가 정확히 그 사각이었다(`CUSTOMIZE.md` 가 그 프리셋에 없는 `public/images/` 를 "열어
        //   보십시오"라고 지목). 그리고 실제로 `README.md` 가 죽은 좌표 2건(`lib/session.ts`·
        //   `lib/theme.ts` — 실물은 `src/lib/…`)을 4벌에 배송하고 있었다.
        //
        // ⚠ **왜 고객 CI(D1 확장)가 아니라 팩 시점인가.** D1 은 고객 트리에서 돈다. 확장하면 우리가
        //   잘못 배송한 문서 때문에 **테넌트 CI 가 빨개지고** 배포 게이트가 그 사이트 배포를 막는다 —
        //   `ci.yml` 이 이미 경고하는 비대칭이다. 배송 전에 우리가 잡는 것이 맞다.
        //
        // ⚠ **`--pack` 모드에서만 잰다.** 납품 zip 은 한 테넌트로 가고 그 문서는 납품사 것이다.
        //   발주 스펙이 약속한 것은 규약 검사이지 문서 위생이 아니다(전제 A).
        if (packMode) {
            // `.zalkera/ASSETS-LICENSE.md` 도 본다 — 에셋 출처의 **비고 칸**이 정본 도구 경로를 인용해
            // zip 에 없는 좌표를 남긴다. 첫 칸의 맨 파일명(`hero.png`)은 아래 루프의 `includes("/")`
            // 요구가 이미 거른다.
            // 재현: `unzip -p <zip> .zalkera/ASSETS-LICENSE.md | grep -oE '\`[^\`]+/[^\`]+\`'`
            const DOC_TARGETS = ["CUSTOMIZE.md", "README.md", "AGENTS.md", ".zalkera/ASSETS-LICENSE.md"];
            // 잣대는 검사기 D1(`@zalkera/client` 의 `DOC_PATH_TOKEN`·`DOC_PATH_SKIP_PREFIX`)에서
            // 왔다. 자작 규칙을 쓰면 URL 라우트·예시 파일명이 쏟아진다. 이 파일은 외주에게 단일
            // 파일로 건네지므로 공용 모듈을 import 하지 않는다(머리말).
            //
            // ⚠ **거울이 아니다 — 두 군데 일부러 다르다. 재동기화할 때 지우지 마라.**
            //   ⑴ **에셋 확장자 7종**(png·jpe?g·webp·avif·gif·svg·ico)을 더 본다. D1 목록은 소스
            //      파일뿐이라 3.0.15 를 반려시킨 바로 그 좌표(`public/images/…`)를 못 잡는다.
            //   ⑵ 판정을 **파일시스템이 아니라 zip 엔트리 집합**으로 한다(아래). 여기 트리는 신뢰 밖
            //      zip 이라 문서가 준 문자열을 `existsSync` 에 대면 검수자 파일시스템에 대한 존재
            //      오라클이 된다 — 실제로 그랬고, `..` 접두 필터로 막으려다 `a/../../x` 에 뚫렸다.
            //   이 차이 때문에 갈림은 **더 잡는 쪽**이다. "덜 잡는 쪽으로 죽는다"고 적었던 판이
            //   있는데 거짓이었다.
            //
            // ⚠ **못 잡는 것 둘.** ⑴ 디렉터리형 지목(`public/images/`) — 확장자를 요구하므로 안 걸린다
            //   (끝슬래시 토큰으로 넓히면 후보가 늘지만 전부 정당한 부재 서술이라 안 넓혔다).
            //   ⑵ 없는 파일을 **예시로** 든 튜토리얼 문장. 이 둘은 사람이 본다.
            const DOC_PATH_TOKEN =
                /^[A-Za-z0-9_.\-/[\]]+\.(?:tsx?|jsx?|mjs|cjs|json|css|md|png|jpe?g|webp|avif|gif|svg|ico)$/;
            // 순수 어휘 필터 — URL·패키지 지정자를 거른다. 경로 이탈은 여기가 아니라 `insideZip` 이 진다.
            const DOC_PATH_SKIP_PREFIX = ["doc/", "node_modules/", ".zalkera/", "@", "/", "http"];

            /**
             * 토큰을 **문자열만으로** zip 내부 경로로 정규화한다. 파일시스템을 만지지 않는 것이 요점이다.
             * 루트 위로 올라가면 `null` — zip 밖은 애초에 이 검사의 좌표계가 아니다.
             */
            const insideZip = (t) => {
                const out = [];
                for (const part of t.split("/")) {
                    if (part === "" || part === ".") continue;
                    if (part === "..") {
                        if (out.length === 0) return null;
                        out.pop();
                        continue;
                    }
                    out.push(part);
                }
                return out.length ? out.join("/") : null;
            };

            // zip 이 **실제로 담고 있는 것**의 목록. 아카이브 메타데이터에서 읽는다 — 풀어 놓은 트리를
            // 걸으면 zip 안 심링크를 따라가 같은 오라클로 돌아간다.
            const listing = spawnSync("unzip", ["-Z1", resolve(zipPath)], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
            const zipEntries = new Set();
            if (listing.status === 0) {
                const prefix = relative(work, root);
                for (const line of (listing.stdout ?? "").split("\n")) {
                    let name = line.trim().replace(/\/+$/, "");
                    if (!name) continue;
                    if (prefix) {
                        if (name !== prefix && !name.startsWith(`${prefix}/`)) continue; // 실효 루트 밖
                        name = name.slice(prefix.length + 1);
                    }
                    // ⚠ 엔트리도 **토큰과 같은 함수**를 태운다. 한쪽만 정규화하면 `./src/x.ts` 같은
                    //   정상 엔트리가 토큰과 안 맞아 **멀쩡한 납품물을 거짓 반려**한다.
                    const norm = insideZip(name);
                    if (norm) zipEntries.add(norm);
                }
            }

            // ⚠ **문서의 부재를 통과로 읽지 않는다.** 좌표 검사는 "있는 문서에 죽은 좌표가 없는가"만
            //   보므로, 문서를 전부 지우면 `대상 문서 없음 — 죽은 좌표 없음` 으로 초록이 난다.
            //   이 팩의 1차 소비자는 코딩 에이전트이고 `AGENTS.md` 가 그 입구다 — 없으면 팩이 아니다.
            //   `--pack` 에서만 요구한다(고객 zip 은 자기 문서 구성을 자기가 정한다).
            //   재현: `unzip <zip> -d /tmp/t && rm /tmp/t/{AGENTS,CUSTOMIZE,README}.md` 후 재압축해 `--pack`
            if (packMode) {
                const missingDocs = ["AGENTS.md", "CUSTOMIZE.md", "README.md"].filter((d) => !existsSync(join(root, d)));
                if (missingDocs.length) {
                    record("배송 문서 존재", false, `카탈로그 팩에 없습니다 — ${missingDocs.join(" · ")}`);
                    failed = true;
                } else {
                    record("배송 문서 존재", true, "AGENTS.md · CUSTOMIZE.md · README.md");
                }
            }

            const dead = [];
            const readDocs = [];
            for (const doc of DOC_TARGETS) {
                let text;
                try {
                    // 심링크 문서도 따라가지 않는다 — 위 시크릿 스캔과 같은 사유.
                    if (lstatSync(join(root, doc)).isSymbolicLink()) {
                        unread.push(`${doc} — 심링크라 좌표를 읽지 않았습니다`);
                        continue;
                    }
                    text = readFileSync(join(root, doc), "utf8");
                } catch (e) {
                    // 없는 문서는 사실이 아니다(프리셋마다 문서 구성이 다를 수 있다). 있는데 못 읽는
                    // 것은 `unread` 에 적어 판정에 물린다 — 조용히 건너뛰면 "검사했다"로 읽힌다.
                    if (e.code !== "ENOENT") unread.push(`${relative(work, join(root, doc))} — 배송 문서 좌표 검사 실패 [${e.code ?? "UNKNOWN"}]`);
                    continue;
                }
                readDocs.push(doc);
                const seen = new Set();
                for (const m of text.matchAll(/`([^`\n]+)`/g)) {
                    const tok = m[1];
                    if (!tok.includes("/") || seen.has(tok)) continue;
                    if (!DOC_PATH_TOKEN.test(tok)) continue;
                    if (DOC_PATH_SKIP_PREFIX.some((x) => tok.startsWith(x))) continue;
                    seen.add(tok);
                    const inside = insideZip(tok);
                    if (inside === null) continue; // zip 밖을 가리키는 문자열 — 탐침하지 않는다
                    if (!zipEntries.has(inside)) dead.push(`${doc}: ${tok}`);
                }
            }
            if (listing.status !== 0) {
                // 엔트리 목록이 없으면 **전부 죽은 좌표로 보인다.** 잴 수 없는 것을 위반으로 내지 않는다.
                unread.push(`${basename(zipPath)} — 배송 문서 좌표: zip 엔트리 목록을 못 읽었습니다 [unzip -Z1 rc=${listing.status ?? "ENOENT"}]`);
            } else if (dead.length) {
                record("배송 문서 좌표", false, `\n   zip 안에 없는 것을 가리킵니다(${dead.length}건):\n   · ${dead.join("\n   · ")}`);
                console.error(`   죽은 좌표는 문서 위생이 아니라 **토큰 원가**입니다 — 고객 AI 가 이 문서를 먼저 읽고`);
                console.error(`   없는 파일을 찾다가 제 좌표를 짜냅니다. 실물 경로로 고치거나 표기를 지우십시오.`);
                failed = true;
            } else {
                // ⚠ **읽은 것만 이름을 댄다.** 목록을 그대로 찍으면 못 읽은 문서까지 "검사했다"로
                //   읽힌다 — 판정이 옳아도 ✅ 줄이 안 읽은 문서까지 대면 그 줄이 거짓이 된다.
                record("배송 문서 좌표", true, `${readDocs.join("·") || "대상 문서 없음"} — 죽은 좌표 없음`);
            }
        }

        // ⑨ 팩 신원 매니페스트. **번호는 도입 순서이고 실행 순서가 아니다**(⑦⑧이 ⑥ 안에
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
            record("팩 신원(.zalkera/pack.json)", false, `${packRead.reason}\n   → 서버도 같은 사유로 적재를 거부합니다(rev·code·version 세 키뿐).`);
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
        //    세 축이 다르게 걸린다:
        //     · **스타일·콘텐츠 규약(S·N)** — `package.json` 의 `zalkera.*` 를 **선언한 레포에서만** error.
        //       선언은 자발이고, 안 하면 경고이거나 스킵이다(어휘를 강제할 수 없다).
        //     · **C·E** — 선언과 무관하게 `--gate` 에서 error. 근거는 선언이 아니라 **누가 서빙하는가**다.
        //     · **X1~X3(교차사이트 위조 가드)** — **어느 모드에서도 경고**다. `--gate` 가 이 축은 안 올린다.
        //       즉 이 러너는 변이 라우트에 가드가 하나도 없는 zip 에도 ✅ 를 준다. 그 축은 사람이 본다 —
        //       `README.md`·`CUSTOMIZE.md` 가 고객에게 같은 말을 한다.
        //       재현: 라우트에서 `assertSameOrigin` 을 지우고
        //             `node scripts/validate-storefront.mjs ./src --gate; echo rc=$?` → `⚠️ [X1]` · rc=0
        //
        //    소스 루트는 고정이 아니다: Next.js 는 `src/app` 과 루트 `app` 을 **둘 다** 허용하고,
        //    실제 납품물(credium)이 후자였다. `src` 를 못 찾으면 루트를 넘긴다 —
        //    validator 는 node_modules·.next 를 스스로 건너뛴다(실측).
        //    설치보다 **앞**에 둔다: 규약 위반은 몇 분짜리 npm ci 를 돌리기 전에 알려주는 게 맞다.
        const srcDir = existsSync(join(root, "src")) ? join(root, "src") : root;
        // `--gate` — **우리가 서빙 책임을 지는 자리**라 C·E 를 error 로 올린다(X 는 위 참조).
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
        // 그것이 창을 다 채워 `❌ [E1]`·`❌ [E3]` 가 **검수자에게 한 글자도 안 갔다** (
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
        // ⚠ **이미 반려가 서면 설치·빌드를 돌리지 않는다.** 정크·시크릿 같은 되돌릴 수 없는 사유는
        //   어차피 재포장이 필요하므로 뒤 항목을 더 알려 줘도 쓸모가 없는데, 그대로 두면 10초 넘게
        //   임시 600MB·RSS 1.9GB 를 더 쓴다.
        //   (재현: `.git` 을 넣은 zip 으로 `node scripts/verify-zip.mjs <zip>` 벽시계를 재 보라.)
        if (hasPkg && lock && !failed) {
            // ⑥ 의존 설치 + 빌드 — 재현 가능한 빌드인지. 오래 걸려서 맨 뒤에 둔다.
            const run = (label, cmd, cmdArgs) => {
                const r = spawnSync(cmd, cmdArgs, {
                    cwd: root,
                    encoding: "utf8",
                    timeout: 15 * 60 * 1000,
                    env: childEnv(BUILD_ENV),
                });
                const ok = r.status === 0;
                if (!ok) {
                    const tail = (r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n   ");
                    record(label, false, `\n   ${tail}`);
                    // 설치·빌드가 임시 공간을 가장 많이 쓴다 — 여기서 EDQUOT 가 난다.
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
                // ⑦ 산출물 검사기가 **이 zip 안에서 살아서 뜨는가**.
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

                // ⑦-b **가드 회귀 스위트**. `npm ci` 가 이미 돌았으니 추가 비용이 사실상 없다(~0.24s).
                //
                //    ⚠ 이걸 여기서 안 돌리면 **집행 지점이 `ci.yml` 하나**가 되는데, 그것은 GitHub 레포가
                //    있는 테넌트에서만 돈다. 업로드 태생 테넌트는 CI 가 없어 집행이 **0** 이었고,
                //    `CUSTOMIZE.md` 는 이 명령을 업로드 전 자가 검수로 지목한다 — 즉 고객이 문서대로 다
                //    해도 가드가 깨진 zip 이 ✅ 를 받는다.
                //    스위트가 없으면 node 러너가 `# tests 0` 과 rc 0 을 내므로 **그것도 반려**로 친다.
                {
                    const t = spawnSync("npm", ["test"], {cwd: root, encoding: "utf8", env: childEnv(BUILD_ENV), maxBuffer: 32 * 1024 * 1024});
                    const out = `${t.stdout ?? ""}${t.stderr ?? ""}`;
                    // ⚠ **총합으로 재지 않는다.** `pass >= 1` 이면 스위트를 자명 통과 시험으로 갈아치운
                    //    zip 이 통과한다. 요구치는 이 러너의 `REQUIRED_FLOORS` 가 들고 있고, zip 안
                    //    `scripts/lib/test-floors.json` 은 그것을 **올리거나 늘리는** 자리다.
                    let floors = null;
                    try {
                        floors = JSON.parse(readFileSync(join(root, "scripts", "lib", "test-floors.json"), "utf8"));
                    } catch (e) {
                        unread.push(`scripts/lib/test-floors.json — 못 읽었습니다 [${e.code ?? "UNKNOWN"}]`);
                    }

                    // 판정은 `scripts/lib/floors.mjs` 하나다 — 여기 다시 적으면 사본이 갈린다.
                    // 그 판정의 계약은 `scripts/lib/floors.test.mjs` 가 진다.
                    const {bad, effective} = judgeFloors(floors, (f) => existsSync(join(root, f)));

                    const short = [];
                    if (!bad.length) {
                        for (const [f, min] of Object.entries(effective)) {
                            // ⚠ `--` 로 경로를 **구조적으로** 분리한다. 이것이 없으면 `-` 로 시작하는 키가
                            //   파일이 아니라 node 플래그로 해석돼 그 코드가 이 기계에서 돈다.
                            //   위 키 형태 검사는 심층 방어다 — 열거식이라 넓힐 때마다 침식되므로 유일한 방어로 두지 않는다.
                            //   재현: `node --test --import=./evil.mjs` → 실행됨 · `node --test -- --import=./evil.mjs` → 실행 안 됨
                            const r = spawnSync("node", ["--experimental-strip-types", "--test", "--", f], {
                                cwd: root,
                                encoding: "utf8",
                                env: childEnv(BUILD_ENV),
                                maxBuffer: 32 * 1024 * 1024,
                            });
                            const pass = Number(`${r.stdout ?? ""}`.match(/^# pass (\d+)$/m)?.[1] ?? -1);
                            if (pass < min) short.push(`${f} ${pass < 0 ? 0 : pass}/${min}`);
                        }
                    }
                    if (t.status !== 0 || bad.length || short.length) {
                        const why = bad.length ? bad.join(" · ") : short.length ? short.join(" · ") : `\n   ${out.trim().split("\n").slice(-8).join("\n   ")}`;
                        record("가드 회귀 스위트", false, why);
                        console.error(`   교차사이트·프리뷰·소독기 가드가 옳은지 재는 자리입니다.`);
                        failed = true;
                    } else {
                        record("가드 회귀 스위트", true, `스위트별 하한 통과(${Object.keys(effective).length}개)`);
                    }
                }

                if (!run("npm run build", "npm", ["run", "build"])) {
                    failed = true;
                } else {
                    // ⑧-a **프리뷰 관문이 빌드에 실렸는가.** 재는 것은 소스가 아니라 **Next 가 방금 실은
                    //     산출물**이다. 관문(`src/middleware.ts`)이 등재되지 않으면 프리뷰 쓰기 차단이
                    //     조용히 전부 꺼지는데, 소스를 읽는 검사는 그 형상을 못 본다 — 파일이 멀쩡해도
                    //     위치 오류·matcher 오염·**규약 폐지**(Next 16 이 이미 deprecated 경고를 낸다)로
                    //     안 실릴 수 있다. 위 ⑦-b 스위트의 통제군은 문면 검사라 여기까지는 못 온다.
                    {
                        const mf = join(root, ".next", "server", "middleware-manifest.json");
                        let entries = null;
                        try {
                            entries = Object.values(JSON.parse(readFileSync(mf, "utf8")).middleware ?? {});
                        } catch (e) {
                            unread.push(`.next/server/middleware-manifest.json — 못 읽었습니다 [${e.code ?? "UNKNOWN"}]`);
                        }
                        if (entries !== null) {
                            // 판정은 **성질**이다 — 쓰기가 닿는 경로가 전부 덮이는가.
                            // 리터럴 matcher 를 요구하면 정적 파일을 빼는 정당한 완화가 막힌다.
                            //
                            // ⚠ 프로브는 **이 zip 의 `src/app` 에서 도출**한다. 손으로 적은 목록을 쓰면
                            //   그 목록에 없는 접두를 matcher 에서 빼는 순간 영원히 안 잡힌다.
                            //   판정은 `scripts/lib/routes.mjs` 하나다 — `gate-probe` 도 같은 것을 부른다.
                            //   **zip 안의 검사기를 불러 쓰지 않는다**: 그것을 `exit 0` 으로 갈아 끼우는 것만으로
                            //   이 자리가 꺼진다. 이 러너 옆 사본을 쓴다.
                            const routes = derivedRoutes(appDirOf(root));
                            if (routes === null) {
                                record("프리뷰 관문 등재", false, "src/app 에서 라우트를 도출하지 못했습니다 — 무엇을 덮어야 하는지 알 수 없습니다");
                                failed = true;
                            } else {
                                // 트리에 **없는** 경로를 섞는다 — "새 라우트가 아무것도 안 해도 덮인다"는
                                // 성질은 존재하지 않는 경로로만 잴 수 있다.
                                const MUST = [...routes, ...SYNTHETIC];
                                const res = entries.flatMap((x) => (x.matchers ?? []).map((m) => new RegExp(m.regexp)));
                                const missed = MUST.filter((p) => !res.some((r) => r.test(p)));
                                if (entries.length === 0) {
                                    record("프리뷰 관문 등재", false, "빌드에 안 실렸습니다 — 프리뷰 쓰기 차단이 통째로 꺼집니다");
                                    failed = true;
                                } else if (missed.length) {
                                    record("프리뷰 관문 등재", false, `라우트가 관문 밖입니다 — ${missed.slice(0, 6).join(" · ")}${missed.length > 6 ? ` 외 ${missed.length - 6}개` : ""}`);
                                    failed = true;
                                } else {
                                    record("프리뷰 관문 등재", true, `트리에서 도출한 ${routes.length}개 + 미존재 2개 전부 덮임`);
                                }
                            }
                        }
                    }

                    // ⑧-b **관문이 실제로 막는가.** 등재 검사는 "실렸는가·무엇을 덮는가"만 본다 —
                    //     판정을 무력화한 관문과 라우트 가드까지 제거한 소스를 못 가른다.
                    //     `--pack` 에서만 돈다(프리뷰·비프리뷰 빌드를 각각 한 번 더 굽는다).
                    //
                    //     ⚠ **부재를 건너뛰지 않는다.** 이 파일이 없으면 팩이 세운 유일한 행위 오라클이
                    //       꺼진다 — 파일 하나를 지우고 관문을 무력화한 zip 이 항목 수만 하나 줄어든 채
                    //       초록을 받는다. `--pack` 에서 없으면 **반려**다.
                    //
                    //     ⚠ **부르는 것은 이 러너 옆의 사본이다**(`HERE/lib/gate-behavior.mjs`). zip 안의
                    //       것을 부르면 그것을 `exit 0` 으로 갈아 끼우는 것만으로 이 자리가 꺼진다 —
                    //       위 ⑧-a 가 등재 검사를 인라인한 것과 같은 사유다. `VALIDATOR` 도 같은 규율이다.
                    //       재현: zip 안 `scripts/lib/gate-behavior.mjs` 를 `process.exit(0)` 으로 바꾸고
                    //             관문을 무력화한 뒤 `node scripts/verify-zip.mjs <zip> --pack`
                    if (packMode && !existsSync(GATE_BEHAVIOR)) {
                        record("프리뷰 관문 행위", false, `${GATE_BEHAVIOR} 가 없습니다 — 관문이 실제로 막는지 잴 수단이 사라집니다`);
                        failed = true;
                    } else if (packMode && !existsSync(join(root, "scripts", "lib", "gate-behavior.mjs"))) {
                        record("프리뷰 관문 행위", false, "zip 에 scripts/lib/gate-behavior.mjs 가 없습니다 — 고객이 그 검사를 돌릴 수 없습니다");
                        failed = true;
                    } else if (packMode) {
                        const g = spawnSync("node", [GATE_BEHAVIOR, "."], {
                            cwd: root,
                            encoding: "utf8",
                            env: childEnv(BUILD_ENV),
                            maxBuffer: 32 * 1024 * 1024,
                        });
                        const gout = `${g.stdout ?? ""}${g.stderr ?? ""}`.trim();
                        if (g.status !== 0) {
                            record("프리뷰 관문 행위", false, `\n   ${gout.split("\n").slice(-6).join("\n   ")}`);
                            failed = true;
                        } else {
                            record("프리뷰 관문 행위", true, gout.split("\n").pop());
                        }
                    }

                    // ⑧ **서빙 산출물 계약**.
                    //
                    //    재는 것은 `next.config` 에 무엇이 적혀 있는가가 **아니다**. 설정 문자열은 양쪽으로
                    //    거짓말한다 — 조건부 조립이면 `output:"standalone"` 이 있어도 산출이 안 나오고,
                    //    없어도 외부 조립·재export 로 나올 수 있다.
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
    if (keep) console.log(`\n작업 트리 보존: ${work}`);
    removeWork();
}

// 못 읽은 자리는 **반려**다. 조용히 건너뛰면 시크릿 스캔이 0줄 돌고도 "동봉 시크릿 없음"으로 읽힌다 —
// 검사기 본체가 rc 7 로 가른 것과 같은 자리이고, 여기 zip 은 우리가 서빙을 책임질 물건이다.
if (unread.length) {
    console.error(`\n❌ 읽지 못한 자리 ${unread.length}곳 — 이 자리들은 **검사하지 않았습니다(통과가 아닙니다).**`);
    for (const u of unread) console.error(`   · ${u}`);
    // 사유별로 조치가 다르다 — 권한이 아닌 실패(거대 파일·손상)에 "권한을 고치라"고 하면 오도한다.
    if (unread.some((u) => /EACCES|EPERM/.test(u))) {
        console.error("   권한 문제로 보이는 자리가 있습니다 — zip 안 폴더는 755, 파일은 644 로 두고 다시 압축하십시오.");
    }
    console.error("   그 밖의 사유는 위 대괄호 안 코드가 가리킵니다(예: 파일이 너무 커서 읽지 못함).");
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
console.log("  · ⚠️ [X1~X3] 교차사이트 위조 가드 경고 — **어느 모드에서도 경고**라 이 러너가 안 막는다");
console.log("  · 실제 개시 후 화면 확인 + 콘솔에서 색 1회 바꿔 반영 확인");
