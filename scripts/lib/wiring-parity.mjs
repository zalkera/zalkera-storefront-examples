#!/usr/bin/env node
/**
 * **배선 동일성** — 팩 4벌이 소스를 따로 갖는 대신, *틀리면 사고가 나는* 파일만 바이트로 잠근다.
 *
 * ## 왜 생겼나 (오너 확정 2026-08-01)
 *
 * 팩은 이제 **각자 온전한 소스**를 갖는다(`presets/<code>/src/**` 가 그 팩의 전부). 종전의 "정본 한 벌 +
 * 파일 단위 오버레이"는 개념째 없어졌다 — 수많은 개발자·사용자가 LLM 으로 **자기 얼굴 프론트엔드**를
 * 갖게 될 것이라, 우리 소스는 최초 기준일 뿐이고 팩끼리 갈리는 것이 정상이다.
 *
 * 그 대가로 **정본이 넷**이 된다. 오너는 그 비용을 받아들였다("어쩔 수 없는 것으로 받아들여야지 —
 * 최초 오픈 전에 파괴적 변경을 몰아 끝내고, 그다음은 기능 추가 중심"). 그래서 여기 세우는 방어는
 * **딱 한 축**이다. 전면 드리프트 계수도, 팩마다 관문 강제도 하지 않는다 — 얼굴이 갈리는 것은 **의도**다.
 *
 * ## 무엇을 잠그나 — 판정 기준
 *
 * > **갈리면 안 됨** = 전송·인증·시크릿·리다이렉트 안전처럼 **틀리면 사고가 나는** 배선.
 * > **갈려도 됨** = 홈·헤더·섹션 렌더·카피·색처럼 **얼굴**.
 *
 * ⚠ 이 목록은 오버레이 시절 `PROTECTED_WIRING`("가리면 안 되는 것")을 **베낀 것이 아니라 다시 판정한
 * 것**이다. 뜻이 다르다 — 그때는 *한 팩이 정본을 가려 가드를 무력화*하는 것을 막았고, 지금은 *넷이
 * 서로 갈려 한 벌만 조용히 낡는* 것을 막는다. 그래서 둘로 갈렸다:
 *
 *  · `content.ts` 는 **들어와 있다.** 얼굴 로더로 보이지만 네 팩의 실물이 바이트 동일이고, 이 파일이
 *    예약 세그먼트·소유 판정으로 들어가는 입구라 한 벌만 느슨해지면 그 팩에서만 판정이 갈린다.
 *  · `src/app/api/**` 는 **통째로 들어왔다.** 오버레이 시절엔 `revalidate`·`media` 둘만 잠갔는데,
 *    실측하면 BFF 라우트 전부가 `assertSameOrigin` 으로 서 있는 **전송층**이고 디자인이 한 줄도 없다.
 *    한 팩에서 그 한 줄이 빠지면 그 사이트만 교차사이트 위조에 열린다(오버레이 심의 때 재현된 결함).
 *
 * ## 규칙 둘
 *
 *  ⑴ **파일 목록**(`WIRING_FILES`) — 전 팩에 **있어야 하고** sha 가 같아야 한다. 없으면 그것도 위반이다
 *     (가드를 지우는 것이 가드를 고치는 것보다 쉬우면 안 된다).
 *  ⑵ **디렉터리 목록**(`WIRING_DIRS`) — 그 아래 같은 경로가 **둘 이상**의 팩에 있으면 바이트 동일해야
 *     한다. 한 팩에만 있는 파일은 통과다 — 그것은 드리프트가 아니라 **그 팩의 새 능력**이다.
 *
 * 기준선은 레포 루트의 `src/`(새 팩이 복사해 가는 원본)이다. 있으면 대조에 함께 넣는다.
 *
 * 사용: `npm run check:wiring` (또는 `node scripts/lib/wiring-parity.mjs`). 팩 스크립트도 같은 함수를
 * 부르므로 판정이 두 벌이 되지 않는다.
 */
import {createHash} from "node:crypto";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** 전 팩에 있어야 하고 바이트가 같아야 하는 파일. 경로는 `src/` 기준. */
export const WIRING_FILES = [
    "src/lib/crossOrigin.ts", // memo118 교차사이트 위조 **판정**
    "src/lib/http.ts", // 그 판정을 실제 403 으로 만드는 **전송층** + 시크릿 헤더
    "src/lib/session.ts", // 쿠키 httpOnly·secure, state 소각
    "src/lib/oauth.ts", // safeNextPath — 오픈 리다이렉트 판정
    "src/lib/safeUrl.ts", // 링크 소독(저장형 XSS)
    "src/lib/oauthState.ts", // OAuth state 대조(fail-closed)
    "src/lib/env.ts", // 서버 전용 env·테넌트 코드(폴백 없음이 의도)
    "src/lib/buildEnv.ts", // 오프라인 빌드 강하 — 서빙 빌드에 켜지면 콘텐츠 빈 아티팩트가 나간다
    "src/lib/zalkera.ts", // 클라이언트 싱글턴(baseUrl·X-Tenant·스토어프론트 키 주입 지점)
    "src/lib/preview.ts", // 미리보기 판별
    "src/lib/preview.test.ts", // 그 판별이 받는 **두 이름** — 하나를 지우면 그 배포의 쓰기 차단이 조용히 꺼진다
    // ⚠ 미리보기 쓰기 차단의 **집행 지점**이다. 한 벌에서 빠지면 그 팩만 조용히 샌다 —
    //   `WIRING_MISSING` 이 부재도 위반으로 잡는 이유가 이것이다.
    "src/middleware.ts",
    "src/lib/previewGuard.ts",
    "src/app/robots.ts",
    "src/app/sitemap.ts",
    // 잠근 판정의 **뜻**을 잠그는 회귀 픽스처. 규칙은 한 줄만 흔들려도 조용히 열리고,
    // `npm test` 는 레포 루트에서만 도니까 사본이 갈리면 아무도 모른다.
    "src/lib/crossOrigin.test.ts",
    "src/lib/oauthState.test.ts",
    "src/lib/safeUrl.test.ts", // 오픈 리다이렉트 — 잠금이 0건이던 자리라 세 번째 결함이 배송됐다
    "src/lib/oauthPath.test.ts", // safeNextPath — 로그인 능력에 딸린 소독기(갈라 낸 자리)
    "src/lib/urlEscapes.fixture.ts", // 위 둘이 나눠 쓰는 입력 목록 — 베끼면 한쪽만 늘어난다
    "src/lib/safeUrlDrift.test.ts", // 팩 로컬 소독기와 @zalkera/client 사본의 안전성 판정이 갈리는지
    "src/lib/previewGuard.test.ts",
    // ⚠ 콘텐츠 조회 3종. `content.ts` 가 `pages[slug]` 로 바로 읽으면 `__proto__` 가
    //   `Object.prototype` 을 돌려주고 그것이 객체라 가드를 통과한다 — `/__proto__` 가 404 대신
    //   빈 페이지로 선다. 루트만 고치고 프리셋을 안 고치면 **고객에게는 한 명도 안 나간다**
    //   (zip 은 `presets/<code>/src` 를 싣는다). 하한표가 요구하는 시험이 빠지면 팩이 자기 검수에
    //   걸려 아예 안 구워진다.
    "src/lib/content.ts",
    "src/lib/ownPage.ts",
    "src/lib/content.test.ts",
    "src/lib/reservedSegments.ts",
    "src/lib/reservedSegments.test.ts",
    "src/lib/routeParam.ts",
    "src/lib/routeParam.test.ts",
    // 미디어 302 의 캐시 상한 판정. 한 벌만 넓어지면 그 팩만 만료된 서명을 재사용해 이미지가 깨진다.
    "src/lib/mediaCache.ts",
    "src/lib/mediaCache.test.ts",
];

/** 이 아래는 **전송층**이다(디자인 0). 같은 경로가 둘 이상의 팩에 있으면 바이트 동일해야 한다. */
export const WIRING_DIRS = [
    "src/app/api/", // BFF 전량 — 변이 라우트의 assertSameOrigin 이 여기 산다
    "src/app/media/", // 미디어 프록시
    "src/app/auth/", // 소셜 콜백(state 대조가 실제로 서는 자리)
];

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

function walk(dir, base = "") {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return [];
    }
    return entries.flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`],
    );
}

/** 소스 트리 하나 = `{name, dir}`. 팩은 `presets/<code>/src`, 원본은 루트 `src`. */
function sourceTrees(root) {
    const trees = [];
    const rootSrc = join(root, "src");
    if (existsSync(rootSrc)) trees.push({name: "(원본) src", dir: rootSrc});
    const presets = join(root, "presets");
    // 고객 zip 에는 `presets/` 가 없다(이 파일도 안 실린다). 그래도 어쩌다 불리면 조용히 통과시킨다 —
    // 잴 대상이 없는 것과 위반은 다르다.
    if (!existsSync(presets)) return trees;
    for (const entry of readdirSync(presets, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;
        const dir = join(presets, entry.name, "src");
        if (existsSync(dir)) trees.push({name: `presets/${entry.name}`, dir});
    }
    return trees;
}

/**
 * 판정. 문제 문자열 배열을 돌려준다(빈 배열 = 통과) — 팩 스크립트가 자기 `problems` 에 합류시킨다.
 */
export function checkWiringParity(root = ROOT) {
    const problems = [];
    const trees = sourceTrees(root);
    if (trees.length < 2) return problems; // 잴 대상이 없다

    // ⑴ 파일 목록 — 전원 존재 + 동일.
    for (const rel of WIRING_FILES) {
        const inner = rel.slice("src/".length);
        const seen = new Map(); // sha → [tree 이름]
        for (const tree of trees) {
            const path = join(tree.dir, inner);
            if (!existsSync(path)) {
                problems.push(
                    `[WIRING_MISSING] ${tree.name}: ${rel} 이 없습니다 — 배선 파일은 전 팩에 있어야 합니다` +
                        "(가드를 지우는 것이 고치는 것보다 쉬우면 안 됩니다).",
                );
                continue;
            }
            const key = sha(readFileSync(path));
            seen.set(key, [...(seen.get(key) ?? []), tree.name]);
        }
        if (seen.size > 1) problems.push(driftMessage(rel, seen));
    }

    // ⑵ 디렉터리 — 둘 이상이 가진 같은 경로만 본다(한 팩 고유 파일 = 새 능력, 위반 아님).
    for (const prefix of WIRING_DIRS) {
        const inner = prefix.slice("src/".length);
        const byPath = new Map(); // 상대경로 → Map(sha → [tree])
        for (const tree of trees) {
            for (const file of walk(join(tree.dir, inner))) {
                const rel = `${prefix}${file}`;
                const key = sha(readFileSync(join(tree.dir, inner, file)));
                const seen = byPath.get(rel) ?? new Map();
                seen.set(key, [...(seen.get(key) ?? []), tree.name]);
                byPath.set(rel, seen);
            }
        }
        for (const [rel, seen] of [...byPath].sort()) {
            if (seen.size > 1) problems.push(driftMessage(rel, seen));
            // ⚠ **삭제도 드리프트다**(깨뜨려 확인에서 잡힌 구멍). "한 팩에만 있으면 새 능력"의 뒤집힌
            //    쪽 — 여러 벌이 가진 파일이 한 벌에서만 사라졌으면 그것은 능력 추가가 아니라 **가드
            //    제거**다. 실측: `app/media/[id]/route.ts` 를 한 팩에서 지웠더니 남은 넷이 동일해서
            //    통과했다. 기준은 위 `WIRING_FILES` 와 같다 — 지우는 것이 고치는 것보다 쉬우면 안 된다.
            const holders = [...seen.values()].flat();
            if (holders.length > 1 && holders.length < trees.length) {
                const missing = trees.map((t) => t.name).filter((n) => !holders.includes(n));
                problems.push(
                    `[WIRING_MISSING] ${rel} 이 ${missing.join(", ")} 에만 없습니다 — 다른 ${holders.length}벌은 갖고 ` +
                        "있습니다. 전송·인증 배선을 한 벌에서만 지우는 것은 그 사이트에서만 가드를 끄는 일입니다" +
                        "(정말 그 능력을 통째로 뺀 것이라면 그 계열 전부를 빼고 이 목록을 다시 판정하십시오).",
                );
            }
        }
    }
    return problems;
}

function driftMessage(rel, seen) {
    const groups = [...seen].map(([key, names]) => `      ${key}  ${names.join(", ")}`).join("\n");
    return (
        `[WIRING_DRIFT] ${rel} 이 소스 벌마다 다릅니다 — 이 파일은 얼굴이 아니라 **배선**이라 갈리면 안 됩니다\n` +
        `${groups}\n` +
        "      → 옳은 한 벌을 정해 나머지에 그대로 복사하십시오(부분 수정 금지 — 바이트가 같아야 합니다)."
    );
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const problems = checkWiringParity();
    const trees = sourceTrees(ROOT).map((t) => t.name);
    // ⚠ **정본 레포에서는 «잴 대상이 없음»이 통과가 아니다.** `checkWiringParity` 는 소스가 한 벌이면
    //   조용히 통과한다 — 고객 zip 은 실제로 한 벌이라 그 관대함이 맞다. 그런데 정본에서는
    //   `presets/` 를 지우는 것만으로 이 검사가 초록이 된다. 팩 도구가 있으면 정본이다(그 파일은
    //   zip 에 안 실린다). 재현: `mv presets /tmp/x && node scripts/lib/wiring-parity.mjs; echo rc=$?`
    if (existsSync(join(ROOT, "scripts", "pack-preset.mjs")) && trees.length < 2) {
        console.error(`배선 동일성 — 대조할 소스가 ${trees.length}벌뿐입니다(통과가 아닙니다).`);
        console.error("  정본 레포에는 루트 `src/` 와 `presets/*/src` 가 함께 있어야 합니다.");
        process.exit(2);
    }
    if (problems.length === 0) {
        console.log(`배선 동일성 통과 — 소스 ${trees.length}벌(${trees.join(" · ")})`);
        console.log(`  파일 ${WIRING_FILES.length}개 + 디렉터리 ${WIRING_DIRS.join(" · ")}`);
        process.exit(0);
    }
    console.error("배선 동일성 실패:");
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
}
