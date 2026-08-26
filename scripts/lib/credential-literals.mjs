#!/usr/bin/env node
/**
 * **이 레포에 커밋된 자격증명 리터럴을 막는다.**
 *
 * ■ 왜 여기에 또 있나
 *
 * 형제 백엔드의 `scripts/checks/detect-credential-literals.py` 가 이 레포도 훑는다. 그런데
 * 그것이 도는 자리는 **백엔드 체크아웃이 있는 개발자의 로컬 게이트**뿐이다 — CodeBuild 소스가
 * 백엔드 하나라 CI 에서는 형제 레포를 **0파일** 훑는다. 그동안 이 레포는 **공개**다. 공개 레포에
 * 들어간 열쇠는 회수가 안 된다(푸시 순간 이미 크롤러가 본다). 그래서 이 레포의 CI 가 자기를 본다.
 *
 * ■ 표를 새로 만들지 않는다
 *
 * `lib/secret-content.mjs` 의 [REPO_LITERALS] 를 쓴다 — 그 파일이 [SECRET_CONTENT] 에서
 * 파생한다(레포 자기 검사 축은 **진짜 키 꼴**만 본다. 사유는 그 자리 ⚠). 사본을 두면 사본이 낡고, 낡은 사본은
 * 「팩 게이트는 잡는데 여기는 흘리는」 값을 만든다. **이 파일에 표가 없는 것이 설계다.**
 *
 * ■ 무엇을 못 잡나
 *
 * 고엔트로피 문자열 일반은 안 본다(그 표의 전제와 같다). 이 검사기의 초록은 「알려진 꼴이 없다」
 * 이지 「비밀이 없다」가 아니다.
 *
 * ⚠ **정본 전용이다** — `SOURCE_EXCLUDES` 로 고객 zip 에서 뺀다. 고객 트리에서 돌리면 거짓 양성
 *   하나로 그 사이트의 배포가 통째로 서 버린다(`ci.yml` 이 배포 게이트에 읽힌다).
 *
 * 재현: `node scripts/lib/credential-literals.mjs`
 */
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {REPO_LITERALS} from "./secret-content.mjs";

/** AWS 가 자기 문서에 싣는 자리표시자. 어디서도 인증되지 않는다. */
const AWS_DOC_PLACEHOLDER = /\bAKIA[0-9A-Z]{9}EXAMPLE\b/;
/** 자리표시자가 **아닌** AKIA 토큰. 하나라도 있으면 면제하지 않는다. */
const AWS_LIVE_KEY = /\bAKIA(?![0-9A-Z]{9}EXAMPLE\b)[0-9A-Z]{16}\b/;

/** 바이너리·의존성은 안 본다. 추적되는 텍스트만 훑는다. */
const SKIP = /\.(png|jpe?g|gif|ico|webp|avif|pdf|zip|woff2?|ttf|otf|mp4|webm)$/i;
/** 한 파일 상한 — 번들·스냅샷이 시간을 먹지 않게. */
const MAX_BYTES = 4 * 1024 * 1024;

function tracked() {
    return execFileSync("git", ["ls-files", "-z"], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024})
        .split("\0")
        .filter((p) => p !== "" && !SKIP.test(p));
}

function scan(path) {
    let text;
    try {
        const buf = readFileSync(path);
        if (buf.byteLength > MAX_BYTES) return [];
        text = buf.toString("utf8");
    } catch {
        return []; // 읽을 수 없는 자리(삭제 중·권한)는 건너뛴다.
    }
    const hits = [];
    for (const [what, pattern] of REPO_LITERALS) {
        if (!pattern.test(text)) continue;
        // ⚠ 자리표시자가 「있다」로 면제하면 진짜 키가 그 옆에 앉아 통과한다.
        //   자리표시자가 있고 **동시에 자리표시자 아닌 키가 없을 때만** 면제한다.
        if (what === "AWS 액세스키" && AWS_DOC_PLACEHOLDER.test(text) && !AWS_LIVE_KEY.test(text)) continue;
        const at = text.slice(0, text.search(pattern)).split("\n").length;
        hits.push([what, at]);
    }
    return hits;
}

const violations = [];
let scanned = 0;
for (const path of tracked()) {
    scanned += 1;
    // ⚠ 값을 찍지 않는다 — CI 로그가 새 유출 경로가 된다.
    for (const [what, line] of scan(path)) violations.push(`🔴 ${path}:${line} — ${what}`);
}

if (violations.length > 0) {
    for (const v of violations) console.error(v);
    console.error("");
    console.error("자격증명은 레포에 두지 않는다. 이 레포는 **공개**라 푸시된 순간 회수가 안 된다 —");
    console.error("이미 커밋됐다면 그 키는 폐기·재발급 대상이다.");
    console.error("");
    console.error("⚠ 시험 픽스처라 가짜 키인 경우: 경로를 면제하지 마라(면제는 구멍이다).");
    console.error("  열쇠 꼴 리터럴을 조각으로 나눠 조립하면 런타임 문자열은 그대로이고");
    console.error("  소스에는 완전한 꼴이 안 나타난다. 선례: scripts/lib/verifyZipJudgments.test.mjs");
    process.exit(1);
}
console.log(`✅ 자격증명 리터럴 — 통과 (추적 ${scanned}파일 · 표는 lib/secret-content.mjs REPO_LITERALS ${REPO_LITERALS.length}종)`);
