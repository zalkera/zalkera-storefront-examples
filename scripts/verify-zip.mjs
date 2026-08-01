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
 * 그래서 러너가 template 에 사는 것은 결합의 재생산이 아니라 **정본이 아직 여기 살기 때문**이고,
 * validator 가 client 의 bin 으로 승격되면(memo108 2단) 이 참조도 함께 이주한다.
 *
 * 사용:
 *   node scripts/verify-zip.mjs <납품.zip> [--keep]
 *
 * 종료코드: 0=통과 · 1=반려(검사 실패) · 2=실행 불가(인자·환경 문제)
 */
import {spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const VALIDATOR = join(HERE, "validate-storefront.mjs");

const args = process.argv.slice(2);
const zipPath = args.find((a) => !a.startsWith("--"));
const keep = args.includes("--keep");

if (!zipPath) {
    console.error("사용: node scripts/verify-zip.mjs <납품.zip> [--keep]");
    process.exit(2);
}
if (!existsSync(zipPath)) {
    console.error(`파일이 없습니다: ${zipPath}`);
    process.exit(2);
}

/**
 * 빌드 env — **`.github/workflows/ci.yml` 과 패리티**여야 한다(백엔드 `SandboxBuildGate.CI_ENV` 도 같은 상수).
 *
 * 이유가 각각 있다: 러너에 백엔드가 없으므로 `ZALKERA_API_BASE`·`ZALKERA_TENANT` 는 값만 있으면 되고
 * (코드가 폴백 없이 require 한다), `ZALKERA_OFFLINE_BUILD` 는 "여긴 백엔드가 없다"는 **선언**이라
 * 홈이 시드 페이지를 집어 오는 경로가 불통을 던지지 않게 한다(memo109 계열 — 서빙 빌드는 던져야 맞다).
 *
 * 이 값을 안 주면 멀쩡한 납품물이 빌드 실패로 **거짓 반려**된다(이 러너를 처음 돌렸을 때 실제로 그랬다).
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
function scanSecrets(dir) {
    const hits = [];
    const walk = (d, rel = "") => {
        for (const e of readdirSync(d, {withFileTypes: true})) {
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
        for (const e of readdirSync(d, {withFileTypes: true})) {
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
        const children = readdirSync(cur, {withFileTypes: true}).filter((e) => e.name !== "__MACOSX");
        if (children.length !== 1 || !children[0].isDirectory()) return cur;
        cur = join(cur, children[0].name);
    }
    return cur;
}

const work = mkdtempSync(join(tmpdir(), "zalkera-verify-"));
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
        failed = true;
    } else {
        const root = effectiveRoot(work);

        // ② 형상 — package.json + lockfile, 산출물 미포함.
        const hasPkg = existsSync(join(root, "package.json"));
        const lock = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"].find((f) => existsSync(join(root, f)));
        if (!record("프로젝트 형상", hasPkg && Boolean(lock), hasPkg ? (lock ?? "lockfile 없음") : "package.json 없음")) {
            failed = true;
        }
        for (const junk of ["node_modules", ".next"]) {
            if (existsSync(join(root, junk))) {
                record(`${junk} 미포함`, false, "zip 에서 빼 주십시오");
                failed = true;
            }
        }

        // ③ 시크릿 0 — 반려 사유 중 되돌릴 수 없는 유일한 항목이라 먼저 본다.
        const secrets = scanSecrets(root);
        if (!record("시크릿 0", secrets.length === 0, secrets.length ? secrets.slice(0, 5).join(", ") : "")) {
            failed = true;
        }

        // ④ 에셋 라이선스 매니페스트(발주 스펙 §1-5 필수) — **존재만** 기계가 보고 내용 대조는 사람이 한다.
        //    동봉 이미지가 하나도 없으면 요구 자체가 무의미하므로 그때만 면제한다.
        const images = countImages(root);
        const manifest = join(root, ".zalkera", "ASSETS-LICENSE.md");
        if (images === 0) {
            record("에셋 라이선스 매니페스트", true, "동봉 이미지 없음 — 해당 없음");
        } else if (!record("에셋 라이선스 매니페스트", existsSync(manifest), existsSync(manifest) ? `이미지 ${images}개 — 내용 대조는 사람이` : `이미지 ${images}개인데 .zalkera/ASSETS-LICENSE.md 가 없습니다`)) {
            failed = true;
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
        if (v.status !== 0) {
            record("규약 검사", false, `\n   ${vLines.filter((l) => !l.startsWith("⚠️")).slice(-12).join("\n   ")}`);
            failed = true;
        } else {
            record("규약 검사", true, [mode, summary].filter(Boolean).join(" · "));
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
                } else {
                    record(label, true);
                }
                return ok;
            };

            if (!run("npm ci", "npm", ["ci", "--no-audit", "--no-fund"])) failed = true;
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

                if (!run("npm run build", "npm", ["run", "build"])) failed = true;
            }
        }
    }
} finally {
    if (keep) {
        console.log(`\n작업 트리 보존: ${work}`);
    } else {
        rmSync(work, {recursive: true, force: true});
    }
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
