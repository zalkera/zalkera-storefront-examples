#!/usr/bin/env node
/**
 * **배송물 주장 검사기 — 이 파일이 곧 문서 설계 기준이다.**
 *
 * ## 왜 별도 기준 문서를 안 썼나
 *
 * 배송 문서가 반복해서 반려 사유가 됐다. 그 문제를 **또 하나의 문서**로 풀면 그 문서도
 * 같은 이유로 낡는다 — 아무도 안 읽고, 읽어도 지켰는지 아무도 안 잰다. 그래서 규칙을 문장이 아니라
 * **기계**로 둔다. 이 파일의 판정이 곧 규칙이고, 규칙을 바꾸려면 이 코드를 고쳐야 한다.
 *
 * ## 문서발 반려를 유형으로 묶으면
 *
 *  ⒜ **최상급·절대문** — "가장 흔한"·"유일한 정본"·"전부"·"비용이 사실상 0". 명령 한 줄로 반증된다.
 *  ⒝ **낡은 고정 수치** — `17/17`·`27/27`·`18·9·3·6`·`267→910ms`. 대상이 바뀌면 문장이 거짓이 된다.
 *  ⒞ **재현 수단 없는 "(실측)" 라벨** — 권위 있게 들리는데 아무도 다시 안 잰다.
 *  ⒣ **돌려보지 않고 쓴 집행 주장** — "이건 이제 `gate-probe` 가 잡는다". 가장 자주 반복됐다.
 *  ⒤ **이력 서술** — 읽는 쪽이 과거 규칙과 현재 규칙을 가르는 데 토큰을 쓴다.
 *  ⒟ **교차표면 모순** — 같은 사실을 문서 넷이 다르게 말한다(X1 이 error 인가 warning 인가).
 *  ⒠ **상류 정정 미전파** — `@zalkera/client` KDoc 은 고쳤는데 팩 문서는 그대로.
 *  ⒡ **자기확증 검증 명령** — 이미 참인 것에 물어 승인만 하는 오라클.
 *  ⒢ **실행하면 깨지는 절차** — 문서가 시키는 대로 하면 빌드가 죽는다.
 *
 * ## 무엇을 기계가 잡고 무엇을 사람이 잡나 — **실측으로 갈랐다**
 *
 * ⒜ 를 금지어 grep 으로 잡아 보니 배송셋에서 수십 건이 걸렸고 표본이 전부 정상 한국어였다
 * (재현: `grep -cE '가장 |유일(한|하게)|전부|항상|절대' AGENTS.md README.md CUSTOMIZE.md`)
 * ("항상 필요"·"전부 동작한다"·"도메인 데이터는 전부 client 로"). 최상급인지 아닌지는 **문장이
 * 무엇을 주장하는가**에 달렸고, 그건 낱말로 안 갈린다. **⒜⒟⒠⒡⒢ 는 사람 몫이다.**
 *
 * ⒞ 는 갈린다. "실측"이라 적어 놓고 **근처에 재현 명령이 없으면** 그 문장은 구조적으로 다시 안
 * 재진다. 낱말이 아니라 **형태**라서 기계가 판정할 수 있다. 현재 부채는 아래 BASELINE 의 합이고,
 * `node scripts/lib/doc-claims.mjs` 가 돌 때마다 현재치를 찍는다.
 * ⒝ 도 같은 이유로 잡힌다 — 수치에 재현 수단이 없으면 낡는 순간 아무도 모른다.
 *
 * 이 검사기는 **세 규칙**을 잰다. 셋 다 낱말이 아니라 **형태**를 보므로 기계가 판정할 수 있다.
 *
 *   ⓐ **측정 주장**("실측")에 재현 명령이 붙었는가.
 *   ⓑ **집행 주장**("무엇이 잡힌다")에 명령**과 예상 결과**가 붙었는가 — 아래 규칙 ⓑ.
 *   ⓒ **이력 서술**이 배송물에 들어왔는가 — 아래 규칙 ⓒ.
 *
 * ⒜(최상급·절대문)는 넣지 않았다. 금지어 grep 으로 재 보니 표본이 전부 정상 한국어였고,
 * 오탐이 많은 검사기는 꺼진다. ⒟⒠⒡⒢ 와 함께 **사람 몫**이다.
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
import {pathToFileURL} from "node:url";

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
    "scripts/lib/doc-claims.mjs": 8,
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

/**
 * ## 규칙 ⓑ — **집행 주장은 명령과 예상 결과를 같이 적는다**
 *
 * "이 형상은 `gate-probe` 가 잡는다"·"`{}` 로 비워도 여기서 걸린다"·"`verify-zip` 이 그것을 부른다"
 * 처럼 **무엇이 잡히는가**를 말하는 문장이 열여섯 판에 걸쳐 반복해서 거짓이었다. 전부 같은 방식으로
 * 생겼다 — 수리를 하고, 그 옆에 "이건 이제 잡힌다"를 **돌려보지 않고** 적었다.
 *
 * 그래서 이 규칙은 근처에 명령이 있는 것으로 만족하지 않고 **예상 결과**(`rc=`·`→`·`# pass`·`❌`)를
 * 같이 요구한다. 결과는 돌려보지 않으면 쓸 수 없다 — 그것이 이 규칙의 전부다.
 *
 * ⚠ 명령만 있고 결과가 없어 통과하던 문장이 실제로 거짓이었다(`ci.yml`·`verify-zip` 이 부른다 —
 *   `--pack` 에서만 불렀다). 그래서 둘 다 요구한다.
 *
 * 고치는 법은 둘이고, **첫째가 정석**이다.
 *   ⑴ **시험으로 옮긴다.** 시험 이름이 곧 주장이고 `assert` 가 곧 예상 결과이며, `npm test` 가
 *      매번 다시 잰다. 주석 속 재현 명령은 쓸 때 한 번 돌고 그 뒤로는 아무도 안 돌린다 —
 *      그래서 조용히 썩는다.
 *   ⑵ 옆에 명령과 결과를 적는다: 재현: `node scripts/lib/gate-probe.mjs; echo rc=$?` → rc=1
 *
 * 그래서 **시험 파일은 이 규칙에서 뺀다.** 면제가 아니라 더 강한 검증을 인정하는 것이다 —
 * 시험 안의 주장은 실행되고, 거짓이 되면 CI 가 죽는다.
 */
export const ENFORCE_CLAIM = /잡[는힌]다|잡[습힙]니다|막[는힌]다|막[습힙]니다|반려한다|반려합니다|덮인다|덮입니다|걸린다|걸립니다|부른다|부릅니다|본다\b|봅니다/;
/** 그 주장의 주어가 기계이거나 이 파일 자신인 것. 사람·업무 서술은 여기 안 걸린다. */
export const ENFORCE_AGENT = /gate-probe|gate-behavior|verify-zip|doc-claims|wiring-parity|validate-storefront|ci\.yml|middleware|previewGuard|관문|검사기|러너|여기서|이 검사|라우트/;
/** **예상 결과** — 돌려보지 않으면 못 쓴다. */
export const EXPECTED = /rc\s*=|rc\s*[0-9]|→|# pass|# fail|exit\s*[0-9]|❌|✅/;

/**
 * ## 규칙 ⓒ — **배송물에 이력을 쓰지 않는다**
 *
 * "종전 판본은 ~라고 적었다"·"세 판 연속"·"3.0.28 에서"·"내 실수"·"심의 실측". 읽는 쪽은 현재
 * 기준을 뽑아내려고 과거 규칙과 현재 규칙을 구분하는 데 시간을 쓴다. 이 배송물의 1차 소비자는
 * 코딩 에이전트이고, 온라인 레인에서 그 토큰은 **고객 청구서**다.
 *
 * 이력이 갈 곳: 커밋 메시지 · `dist-presets/_superseded/README-*.md` · 심의 보고서.
 * 규칙이 그 형태인 **이유(제약)** 는 남긴다 — 그건 현재 사실이다.
 */
export const HISTORY = /종전 ?판|이전 ?판|옛 ?판|[0-9]+판째|판 연속|직전 ?판|내 실수|심의 실측|심의가 잡|20[0-9]{2}-[01][0-9]-[0-3][0-9]|3\.0\.[0-9]+/;

/** 규칙 ⓑ 의 파일별 부채 상한(래칫). 줄일 수는 있어도 늘릴 수 없다. */
const ENFORCE_BASELINE = {
    ".github/workflows/ci.yml": 1,
    "scripts/lib/doc-claims.mjs": 3,
    ".github/workflows/deps-payload.yml": 1,
    "AGENTS.md": 4,
    "CUSTOMIZE.md": 2,
    "scripts/lib/gate-behavior.mjs": 5,
    "scripts/lib/gate-probe.mjs": 2,
    "scripts/lib/visitor-ip-parity.test.mjs": 1,
    "scripts/pack-preset.mjs": 5,
    "scripts/verify-zip.mjs": 7,
    "src/app/api/booking/availability/route.ts": 2,
    "src/app/api/cart/items/[variantId]/route.ts": 1,
    "src/app/api/consents/route.ts": 1,
    "src/app/products/[slug]/BookingPanel.tsx": 1,
    "src/lib/crossOrigin.test.ts": 1,
    "src/lib/preview.ts": 1,
    "src/lib/previewGuard.test.ts": 2,
    "src/lib/previewGuard.ts": 4,
    "src/middleware.ts": 5,
};

/** 규칙 ⓒ 의 파일별 부채 상한(래칫). 줄일 수는 있어도 늘릴 수 없다. */
const HISTORY_BASELINE = {
    ".github/workflows/ci.yml": 3,
    "scripts/lib/doc-claims.mjs": 2,
    ".github/workflows/deps-payload.yml": 2,
    ".prettierignore": 5,
    "AGENTS.md": 3,
    "CUSTOMIZE.md": 3,
    "README.md": 2,
    "scripts/lib/visitor-ip-parity.mjs": 6,
    "scripts/lib/wiring-parity.mjs": 1,
    "scripts/pack-preset.mjs": 15,
    "scripts/snapshot-preview.mjs": 2,
    "scripts/validate-storefront.mjs": 1,
    "scripts/verify-zip.mjs": 14,
    "src/components/ProductRail.tsx": 1,
    "src/lib/env.ts": 1,
    "src/lib/preview.ts": 2,
    "src/lib/safeUrl.test.ts": 1,
    "src/lib/safeUrl.ts": 4,
};

/**
 * ## 규칙 ⓓ — **치환이 깨뜨린 문장을 잡는다**
 *
 * 배송 주석을 기계 치환으로 정리하면 두 형상이 남는다. 둘 다 뜻이 사라지고 아무 검사도 안 잡는다.
 *
 *   ⑴ **빈 괄호·앞말 잘린 괄호** — `…통과했다 ().` · `…있었다(—`
 *      괄호 안 내용만 지우고 괄호를 안 지운 자국이다.
 *   ⑵ **조사 분리** — `배포 게이트 가` · `이 오해는 가 DON'T-BUILD 로`
 *      영문 식별자 뒤 띄어쓰기 규약을 한글 명사로 치환하면 조사가 떨어져 나가고, 주어가 통째로
 *      사라지기도 한다.
 *
 * **부채 0 으로 건다** — 도입 시점 재고가 0 이라 유예할 이유가 없다.
 *
 * 재현: `node scripts/lib/doc-claims.mjs; echo rc=$?` → rc=0
 */
export const BROKEN_SENTENCE = [
    // 한글·강조·백틱·닫는괄호 뒤의 빈 괄호, 그리고 여는 괄호 직후의 줄표
    /[가-힣*`」]\s?\(\s*\)|\(—/,
    // 한글 명사와 조사 사이가 벌어진 자리(`… 게이트 가`). 관형사 `이`(이 라우트)는 뺀다 —
    // 넣으면 오탐 228건으로 시작하고, 오탐이 많은 검사기는 꺼진다.
    // `가 있다`·`를 없다` 같은 동사 연결도 뺀다.
    /[가-힣] (가|를|은|는|을|의|에|로|도|와|과) (?!있|없)(?=[A-Za-z가-힣`])/,
];

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
    const enforceBad = [];
    const historyBad = [];
    const brokenBad = [];
    let claims = 0;
    let enforce = 0;
    for (const f of files) {
        let lines;
        try {
            lines = readFileSync(f, "utf8").split("\n");
        } catch (e) {
            console.error(`[doc-claims] ${f} 를 못 읽었습니다 [${e.code}] — 못 잰 것은 통과가 아닙니다.`);
            process.exit(2);
        }
        for (const [i, line] of lines.entries()) {
            const near = lines.slice(Math.max(0, i - NEAR), i + NEAR + 1);
            if (CLAIM.test(line)) {
                claims++;
                if (!near.some((l) => CMD.test(l))) bad.push({file: f, line: i + 1, text: line.trim().slice(0, 96)});
            }
            // ⓑ 집행 주장 — 명령**과** 예상 결과를 둘 다 요구한다.
            //    시험 파일은 뺀다: 그 파일의 주장은 `npm test` 가 매번 실행해 확인한다.
            if (!/\.test\.(ts|tsx|mjs|cjs|js)$/.test(f) && ENFORCE_CLAIM.test(line) && ENFORCE_AGENT.test(line)) {
                enforce++;
                if (!(near.some((l) => CMD.test(l)) && near.some((l) => EXPECTED.test(l)))) {
                    enforceBad.push({file: f, line: i + 1, text: line.trim().slice(0, 96)});
                }
            }
            // ⓒ 이력 서술.
            if (HISTORY.test(line)) historyBad.push({file: f, line: i + 1, text: line.trim().slice(0, 96)});
            // ⓓ 치환 파손 — 주석·문서 줄에서만 본다(코드의 `.catch(() => null)` 은 대상이 아니다).
            if (/^\s*(\/\/|\*|\/\*|\{\/\*|#|>)/.test(line) || f.endsWith(".md")) {
                if (BROKEN_SENTENCE.some((rx) => rx.test(line))) {
                    brokenBad.push({file: f, line: i + 1, text: line.trim().slice(0, 96)});
                }
            }
        }
    }
    if (enforce === 0) {
        console.error("[doc-claims] 집행 주장을 하나도 못 찾았습니다 — 판별자가 깨졌습니다(통과가 아닙니다).");
        process.exit(2);
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

    // ── 규칙 ⓑ·ⓒ 도 같은 래칫이다. 파일별 상한을 얼려 두고 **늘어나는 것만** 막는다.
    const ratchet = (items, baseline, title, howto) => {
        const byFile = {};
        for (const b of items) byFile[b.file] = (byFile[b.file] ?? 0) + 1;
        const grew = Object.entries(byFile).filter(([f, n]) => n > (baseline[f] ?? 0));
        if (!grew.length) return {ok: true, total: items.length, budget: Object.values(baseline).reduce((a, b) => a + b, 0)};
        console.error(`[doc-claims] **${title}**\n`);
        for (const [f, n] of grew) {
            console.error(`  ${f}  ${baseline[f] ?? 0} → ${n}`);
            for (const b of items.filter((x) => x.file === f)) console.error(`    :${b.line}  ${b.text}`);
        }
        console.error(`\n  ${howto}`);
        return {ok: false};
    };
    const rb = ratchet(
        enforceBad,
        ENFORCE_BASELINE,
        "집행 주장이 늘었습니다 — 무엇이 잡히는지 말하려면 **명령과 예상 결과**를 같이 적으십시오.",
        "예: 재현: `npm run build && node scripts/lib/gate-probe.mjs; echo rc=$?` → rc=1\n  결과를 쓸 수 없다면 그 주장을 아직 안 돌려본 것입니다. 돌려보거나 주장을 지우십시오.",
    );
    const rc2 = ratchet(
        historyBad,
        HISTORY_BASELINE,
        "배송물에 이력 서술이 늘었습니다 — 지금의 규약만 적으십시오.",
        "이력이 갈 곳: 커밋 메시지 · dist-presets/_superseded/README-*.md · 심의 보고서.\n  규칙이 그 형태인 **이유(제약)** 는 남기십시오 — 그건 현재 사실입니다.",
    );
    const rc3 = ratchet(
        brokenBad,
        // 이 검사기 자신은 규칙 설명에서 나쁜 예를 인용하므로 두 건을 든다(규칙마다 하나).
        {"scripts/lib/doc-claims.mjs": 2},
        "치환이 깨뜨린 문장이 있습니다 — 빈 괄호이거나 조사가 떨어졌습니다.",
        "괄호를 지울 때는 괄호째, 낱말을 바꿀 때는 조사까지 보십시오. 부채 상한은 0 입니다.",
    );
    if (!rb.ok || !rc2.ok || !rc3.ok) process.exit(1);

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
        `문서 규약 검사 통과 — 측정주장 ${claims}건 중 명령없음 ${total}건(상한 ${budget}) · 집행주장 ${enforce}건 중 결과없음 ${rb.total}건(상한 ${rb.budget}) · 이력 ${rc2.total}건(상한 ${rc2.budget}) · 파손 ${rc3.total}건 · 파일 ${files.length}개` +
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
