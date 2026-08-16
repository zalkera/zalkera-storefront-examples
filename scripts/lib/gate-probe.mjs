#!/usr/bin/env node
/**
 * 빌드 산출물의 프리뷰 관문 matcher 가 **이 트리의 라우트를 전부 덮는가**.
 *
 * 리터럴(`^/.*$`)을 요구하면 정적 파일을 빼는 정당한 완화도, 다른 규약(`proxy`)으로의 이행도 막힌다.
 * 그래서 **성질**을 잰다 — 아래 프로브가 전부 관문을 통과해야 하고, 정적 프로브는 빠져도 된다.
 *
 * ## 프로브는 **트리에서 도출한다** — 고정 목록이 아니다
 *
 * 프로브를 손으로 적으면 그 목록에 없는 접두를 matcher 에서 빼는 순간 **영원히 안 잡힌다.**
 * `src/app` 을 걸어 나온 실제 `route.ts`·`page.tsx` 를 전부 프로브로 쓰면, 어떤 라우트의 접두를
 * 빼든 그 라우트가 바로 프로브라서 즉시 잡힌다. 고객이 라우트를 더해도 자동으로 따라온다.
 *
 * 동적 세그먼트에는 **점이 든 값**을 대입한다(`[id]` → `7.0`). 확장자로 가르는 matcher 는
 * 그 형태에서만 새고, 점 없는 값으로는 그 구멍이 안 보인다.
 *
 * 아직 없는 라우트도 하나 섞는다 — "새로 만든 라우트는 아무것도 안 해도 덮인다"는 성질은
 * 트리에 없는 경로로만 잴 수 있다.
 *
 * 관문이 아예 안 실리면(파일 위치 오류·규약 폐지) 항목이 0 이 되어 여기서 막힌다.
 *
 * 사용: `node scripts/lib/gate-probe.mjs [.next 경로] [소스 루트]`   (rc 0 통과 · 1 위반 · 2 실행 불능)
 */
import {readFileSync, readdirSync, existsSync} from "node:fs";
import {join} from "node:path";

const root = process.argv[2] ?? ".next";
const srcRoot = process.argv[3] ?? ".";
const appDir = join(srcRoot, "src", "app");

/**
 * 동적 세그먼트에 넣을 대표값. **점을 넣는다** — 확장자 배제 규칙의 구멍은 그 형태에서만 드러난다.
 * 재현: `node -e 'console.log(/^\/((?!_next\/static|.*\.[A-Za-z0-9]+$).*)$/.test("/api/cart/items/7.0"))'`
 */
const DYN = "7.0";
const CATCH_ALL = ["a.b", "c.d"];

/** 트리에 **없는** 경로. 새 라우트가 아무것도 안 하고 덮이는가를 이것으로만 잴 수 있다. */
const SYNTHETIC = ["/api/__gate_probe_new__/1.0", "/__gate_probe_new_page__.item"];

/** 정적 파일 — 빠져도 된다(빠지는 것이 낫다). */
const MAY_SKIP = ["/_next/static/chunk.js", "/images/hero.png", "/favicon.ico"];

/** `src/app` 한 세그먼트를 URL 조각으로. `null` 이면 그 세그먼트를 버리고, `false` 면 라우트째 버린다. */
function segment(name) {
    if (name.startsWith("(") && name.endsWith(")")) return null; // 라우트 그룹 — URL 에 안 나온다
    if (name.startsWith("@")) return false; // 병렬 라우트 — 독립 주소가 아니다
    if (name.startsWith("_")) return false; // 사설 폴더 — 라우팅 대상이 아니다
    if (name.startsWith("[[...") && name.endsWith("]]")) return CATCH_ALL.join("/");
    if (name.startsWith("[...") && name.endsWith("]")) return CATCH_ALL.join("/");
    if (name.startsWith("[") && name.endsWith("]")) return DYN;
    return name;
}

/** `src/app` 을 걸어 라우팅되는 경로를 모은다. */
function derive(dir, parts = []) {
    let out = [];
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch (e) {
        console.error(`[gate-probe] ${dir} 를 못 읽었습니다 [${e.code ?? "UNKNOWN"}] — 못 잰 것은 통과가 아닙니다.`);
        process.exit(2);
    }
    const hasHandler = entries.some((e) => e.isFile() && /^(route|page)\.(t|j)sx?$/.test(e.name));
    if (hasHandler) out.push("/" + parts.filter(Boolean).join("/"));
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const seg = segment(e.name);
        if (seg === false) continue;
        out = out.concat(derive(join(dir, e.name), seg === null ? parts : [...parts, seg]));
    }
    return out;
}

if (!existsSync(appDir)) {
    console.error(`[gate-probe] ${appDir} 가 없습니다 — 프로브를 도출할 수 없습니다(통과가 아닙니다).`);
    console.error("  소스 루트가 다르면 두 번째 인자로 주십시오: node scripts/lib/gate-probe.mjs .next <소스루트>");
    process.exit(2);
}
const derived = [...new Set(derive(appDir))];
if (derived.length === 0) {
    // 트리는 있는데 라우트가 0 이면 **걷기가 깨진 것**이다. 프로브 0개로 초록을 내면 안 된다.
    console.error(`[gate-probe] ${appDir} 에서 라우트를 하나도 못 찾았습니다 — 걷기가 깨졌습니다(통과가 아닙니다).`);
    process.exit(2);
}
const MUST = [...derived, ...SYNTHETIC];

let entries;
try {
    entries = Object.values(JSON.parse(readFileSync(join(root, "server", "middleware-manifest.json"), "utf8")).middleware ?? {});
} catch (e) {
    console.error(`[gate-probe] 매니페스트를 못 읽었습니다 [${e.code ?? "UNKNOWN"}] — 빌드를 먼저 하십시오.`);
    process.exit(2);
}
if (entries.length === 0) {
    console.error("[gate-probe] 프리뷰 관문이 빌드에 안 실렸습니다 — 쓰기 차단이 통째로 꺼집니다.");
    console.error("  src/middleware.ts 의 위치·이름·export 를 보십시오. Next 판을 올렸다면 규약 이행이 필요할 수 있습니다.");
    process.exit(1);
}
const res = entries.flatMap((e) => (e.matchers ?? []).map((m) => new RegExp(m.regexp)));
if (res.length === 0) {
    console.error("[gate-probe] matcher 가 하나도 없습니다 — 무엇을 덮는지 알 수 없습니다.");
    process.exit(1);
}
const missed = MUST.filter((p) => !res.some((r) => r.test(p)));
if (missed.length) {
    console.error(`[gate-probe] 이 트리의 라우트가 관문 밖입니다 — 그 자리는 조용히 무방비가 됩니다:`);
    for (const p of missed) console.error(`  ${p}`);
    console.error(`  현재 matcher: ${JSON.stringify(entries.flatMap((e) => (e.matchers ?? []).map((m) => m.originalSource)))}`);
    console.error(`  matcher 에서 경로 접두를 빼면 그 아래 전부가 여기로 옵니다. 빼려면 정적 산출만 빼십시오.`);
    process.exit(1);
}
const skipped = MAY_SKIP.filter((p) => !res.some((r) => r.test(p)));
console.log(
    `관문 프로브 통과 — ${appDir} 에서 도출한 ${derived.length}개 + 미존재 ${SYNTHETIC.length}개 전부 덮임 · 정적 ${skipped.length}/${MAY_SKIP.length}개 제외됨`,
);
