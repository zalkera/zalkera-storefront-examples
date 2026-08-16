#!/usr/bin/env node
/**
 * **배송물 주장 검사기 — 이 파일이 곧 문서 설계 기준이다.**
 *
 * ## 왜 별도 기준 문서를 안 썼나
 *
 * 12판 동안 배송 문서가 반복해서 반려 사유가 됐다. 그 문제를 **또 하나의 문서**로 풀면 그 문서도
 * 같은 이유로 낡는다 — 아무도 안 읽고, 읽어도 지켰는지 아무도 안 잰다. 그래서 규칙을 문장이 아니라
 * **기계**로 둔다. 이 파일의 판정이 곧 규칙이고, 규칙을 바꾸려면 이 코드를 고쳐야 한다.
 *
 * ## 12판의 문서발 반려를 유형으로 묶으면
 *
 *  ⒜ **최상급·절대문** — "가장 흔한"·"유일한 정본"·"전부"·"비용이 사실상 0". 명령 한 줄로 반증된다.
 *  ⒝ **낡은 고정 수치** — `17/17`·`27/27`·`18·9·3·6`·`267→910ms`. 대상이 바뀌면 문장이 거짓이 된다.
 *  ⒞ **재현 수단 없는 "(실측)" 라벨** — 권위 있게 들리는데 아무도 다시 안 잰다.
 *  ⒟ **교차표면 모순** — 같은 사실을 문서 넷이 다르게 말한다(X1 이 error 인가 warning 인가).
 *  ⒠ **상류 정정 미전파** — `@zalkera/client` KDoc 은 고쳤는데 팩 문서는 그대로.
 *  ⒡ **자기확증 검증 명령** — 이미 참인 것에 물어 승인만 하는 오라클.
 *  ⒢ **실행하면 깨지는 절차** — 문서가 시키는 대로 하면 빌드가 죽는다.
 *
 * ## 무엇을 기계가 잡고 무엇을 사람이 잡나 — **실측으로 갈랐다**
 *
 * ⒜ 를 금지어 grep 으로 잡아 보니 배송셋에서 **43건**이 걸렸고 표본이 전부 정상 한국어였다
 * (재현: `grep -cE '가장 |유일(한|하게)|전부|항상|절대' AGENTS.md README.md CUSTOMIZE.md`)
 * ("항상 필요"·"전부 동작한다"·"도메인 데이터는 전부 client 로"). 최상급인지 아닌지는 **문장이
 * 무엇을 주장하는가**에 달렸고, 그건 낱말로 안 갈린다. **⒜⒟⒠⒡⒢ 는 사람 몫이다.**
 *
 * ⒞ 는 갈린다. "실측"이라 적어 놓고 **근처에 재현 명령이 없으면** 그 문장은 구조적으로 다시 안
 * 재진다. 낱말이 아니라 **형태**라서 기계가 판정할 수 있다. 도입 시점 재고는 **80건**이었다
 * (재현: 이 파일을 그냥 돌려라 — `node scripts/lib/doc-claims.mjs` 가 현재치를 찍는다).
 * ⒝ 도 같은 이유로 잡힌다 — 수치에 재현 수단이 없으면 낡는 순간 아무도 모른다.
 *
 * 그래서 이 검사기는 **⒞ 하나만** 잰다. 넓히지 마라 — ⒜ 를 넣으면 오탐 43건으로 시작하고,
 * 오탐이 많은 검사기는 꺼진다.
 *
 * ## 규칙
 *
 * "실측"·"측정"·"재 봤" 같은 **측정 주장 라벨**이 있으면, 같은 줄 또는 **앞뒤 3줄 안**에
 * 백틱으로 감싼 **재현 명령**이 있어야 한다. 없으면 둘 중 하나를 하라:
 *
 *   · 명령을 옆에 적는다 — 다음 사람이 그 값을 다시 잴 수 있게.
 *   · **라벨을 지운다** — 재현할 수 없는 권위는 없는 편이 낫다. 주장 자체를 지워도 된다.
 *
 * 세 번째 길("나중에 적는다")은 없다. 그게 아래 BASELINE 만큼이 쌓인 경로다.
 *
 * ## 정본 전용이다
 *
 * `ci.yml` 의 다른 정본 전용 검사와 같은 판별자 뒤에서 돈다. 고객 레포의 문장을 우리가 벌하지
 * 않는다 — 이건 **우리가 배송하는 것**에 대한 규율이다.
 *
 * 사용: `node scripts/lib/doc-claims.mjs`   (rc 0 통과 · 1 위반 · 2 실행 불능)
 */
import {readFileSync, readdirSync, statSync} from "node:fs";
import {join} from "node:path";

/** 측정 주장을 선언하는 낱말. 넓히기 전에 오탐률을 재라. */
const CLAIM = /실측|재 ?봤|재 ?보니|측정했|세어 ?보니/;

/**
 * 재현 명령으로 인정하는 형태 — 백틱 안에 실행 가능한 명령이 있는 것.
 * `$ ` 로 시작하는 셸 프롬프트 줄과 코드펜스도 인정한다.
 */
const CMD = /`[^`\n]*(npm |npx |node |grep |sed |awk |curl |find |unzip |sha256sum |diff |cmp |ls |cat |python3 )[^`\n]*`|^\s*\$ |^\s*```/;

/** 이 검사가 보는 자리 — 배송되는 문서와 소스 주석. */
const ROOTS = ["src", "scripts", ".github"];
const FILES = ["AGENTS.md", "README.md", "CUSTOMIZE.md", ".prettierignore", ".env.example"];
const EXT = /\.(md|ts|tsx|mjs|cjs|js|yml|yaml|css|example)$|prettierignore$/;
const SKIP = /(node_modules|\.next|\.git|dist-presets|dist-preview|presets)$/;

/**
 * **파일별 부채 상한(래칫).** 도입 시점 재고이고, **줄일 수는 있어도 늘릴 수 없다.**
 *
 * ⚠ 여기 숫자를 올려서 검사를 통과시키지 마라. 그건 규칙을 끄는 것과 같다 — 올리려면 왜 그 주장이
 *   재현 불가여야 하는지를 커밋 메시지에 적어라. 그 diff 는 심의에 보인다.
 *
 * 갚는 법: 해당 파일에서 "실측" 옆에 명령을 달거나 라벨을 지운 뒤 이 숫자를 내린다.
 * 파일이 목록에 없으면 상한은 0 이다 — **새 파일에는 부채를 허용하지 않는다.**
 */
const BASELINE = {
    ".env.example": 1,
    ".github/workflows/ci.yml": 3,
    ".github/workflows/deps-payload.yml": 2,
    ".prettierignore": 8,
    "AGENTS.md": 1,
    "scripts/gen-preset-assets.mjs": 1,
    "scripts/lib/doc-claims.mjs": 4,
    "scripts/lib/visitor-ip-parity.mjs": 6,
    "scripts/lib/wiring-parity.mjs": 2,
    "scripts/pack-preset.mjs": 13,
    "scripts/snapshot-preview.mjs": 4,
    "scripts/verify-zip.mjs": 14,
    "src/app/layout.tsx": 1,
    "src/app/media/[id]/route.ts": 1,
    "src/app/payment/complete/page.tsx": 1,
    "src/lib/crossOrigin.ts": 1,
    "src/lib/http.ts": 1,
    "src/lib/metadata.ts": 1,
    "src/lib/oauth.ts": 1,
    "src/lib/oauthState.test.ts": 1,
    "src/lib/oauthState.ts": 1,
    "src/lib/preview.ts": 1,
    "src/lib/previewGuard.test.ts": 1,
    "src/lib/previewGuard.ts": 1,
    "src/lib/safeUrl.test.ts": 1,
    "src/lib/safeUrl.ts": 6,
    "src/lib/session.ts": 1,
};

/** 근처 몇 줄까지 명령을 찾아 줄 것인가. 넓히면 무관한 명령이 알리바이가 된다. */
const NEAR = 3;

function walk(dir) {
    let out = [];
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return out;
    }
    for (const e of entries) {
        if (SKIP.test(e.name)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(full));
        else if (EXT.test(e.name)) out.push(full);
    }
    return out;
}

function main() {
    const files = [...ROOTS.flatMap(walk), ...FILES.filter((f) => existsSafe(f))];
    if (files.length < 20) {
        console.error(`[doc-claims] 대상 파일이 ${files.length}개뿐입니다 — 걷기가 깨졌습니다(하한 20).`);
        process.exit(2);
    }
    const bad = [];
    let claims = 0;
    for (const f of files) {
        let lines;
        try {
            lines = readFileSync(f, "utf8").split("\n");
        } catch (e) {
            console.error(`[doc-claims] ${f} 를 못 읽었습니다 [${e.code}] — 못 잰 것은 통과가 아닙니다.`);
            process.exit(2);
        }
        for (const [i, line] of lines.entries()) {
            if (!CLAIM.test(line)) continue;
            claims++;
            const near = lines.slice(Math.max(0, i - NEAR), i + NEAR + 1);
            if (near.some((l) => CMD.test(l))) continue;
            bad.push({file: f, line: i + 1, text: line.trim().slice(0, 96)});
        }
    }
    if (claims === 0) {
        console.error("[doc-claims] 측정 주장을 하나도 못 찾았습니다 — 판별자가 깨졌습니다(통과가 아닙니다).");
        process.exit(2);
    }
    // ── 래칫. 도입 시점 부채가 80건이라 전부를 한 판에 지우는 것이 오히려 위험하다(80곳을 손대면
    //    그 자체가 새 결함 표면이다). 그래서 **파일별 상한**을 얼려 두고 **늘어나는 것만** 막는다.
    //    상한은 줄일 수는 있어도 늘릴 수 없다 — 늘리려면 이 파일의 BASELINE 을 의식적으로 고쳐야 하고,
    //    그 diff 가 심의에 보인다. 줄 번호가 아니라 **개수**로 얼리는 이유는 줄이 밀려도 안 깨지게.
    const byFile = {};
    for (const b of bad) byFile[b.file] = (byFile[b.file] ?? 0) + 1;
    const grown = Object.entries(byFile).filter(([f, n]) => n > (BASELINE[f] ?? 0));
    const paid = Object.entries(BASELINE).filter(([f, n]) => (byFile[f] ?? 0) < n);
    const total = bad.length;
    const budget = Object.values(BASELINE).reduce((a, b) => a + b, 0);

    if (grown.length) {
        console.error(`[doc-claims] **재현 명령 없는 측정 주장이 늘었습니다.** 새 주장에는 명령을 다십시오.\n`);
        for (const [f, n] of grown) {
            console.error(`  ${f}  ${BASELINE[f] ?? 0} → ${n}`);
            for (const b of bad.filter((x) => x.file === f)) console.error(`    :${b.line}  ${b.text}`);
        }
        console.error(`\n  고치는 법은 둘 중 하나입니다 — 옆에 재현 명령을 적거나, 라벨(과 주장)을 지우십시오.`);
        console.error(`  "나중에 적는다"는 길은 없습니다. 그게 이 검사가 생기기 전 ${budget}건이 쌓인 경로입니다.`);
        process.exit(1);
    }
    console.log(
        `측정 주장 검사 통과 — 주장 ${claims}건 중 재현 명령 없는 것 ${total}건(상한 ${budget}) · 파일 ${files.length}개` +
            (paid.length ? `\n  갚은 자리: ${paid.map(([f, n]) => `${f} ${n}→${byFile[f] ?? 0}`).join(" · ")}` : ""),
    );
}

function existsSafe(p) {
    try {
        statSync(p);
        return true;
    } catch {
        return false;
    }
}

main();
