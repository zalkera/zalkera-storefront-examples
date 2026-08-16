#!/usr/bin/env node
/**
 * 빌드 산출물의 프리뷰 관문 matcher 가 **쓰기가 닿는 경로를 덮는가**.
 *
 * 리터럴(`^/.*$`)을 요구하면 정적 파일을 빼는 정당한 완화도, 다른 규약(`proxy`)으로의 이행도 막힌다.
 * 그래서 **성질**을 잰다 — 아래 프로브가 전부 관문을 통과해야 하고, 정적 프로브는 빠져도 된다.
 *
 * 관문이 아예 안 실리면(파일 위치 오류·규약 폐지) 항목이 0 이 되어 여기서 막힌다.
 *
 * 사용: `node scripts/lib/gate-probe.mjs [.next 경로]`   (rc 0 통과 · 1 위반 · 2 실행 불능)
 */
import {readFileSync} from "node:fs";
import {join} from "node:path";

/** 쓰기가 닿을 수 있는 자리 — 전부 덮여야 한다. */
const MUST = ["/api/cart", "/api/cart/items/7", "/api/whatever-new-route", "/", "/checkout", "/some/page"];
/** 정적 파일 — 빠져도 된다(빠지는 것이 낫다). */
const MAY_SKIP = ["/_next/static/chunk.js", "/images/hero.png", "/favicon.ico", "/robots.txt"];

const root = process.argv[2] ?? ".next";
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
    console.error(`[gate-probe] 쓰기가 닿는 경로가 관문 밖입니다 — 그 자리는 조용히 무방비가 됩니다:`);
    for (const p of missed) console.error(`  ${p}`);
    console.error(`  현재 matcher: ${JSON.stringify(entries.flatMap((e) => (e.matchers ?? []).map((m) => m.originalSource)))}`);
    process.exit(1);
}
const skipped = MAY_SKIP.filter((p) => !res.some((r) => r.test(p)));
console.log(`관문 프로브 통과 — 쓰기 경로 ${MUST.length}개 전부 덮임 · 정적 ${skipped.length}/${MAY_SKIP.length}개 제외됨`);
