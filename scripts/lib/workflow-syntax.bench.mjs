#!/usr/bin/env node
/**
 * `runInjections` 의 **입력 크기 대비 비용**을 잰다.
 *
 * 이 검사기는 팩에 실려 **고객 트리에서도 돈다.** 판정이 제곱이면 고객이 만든 큰 워크플로 하나가
 * 그 CI 를 붙잡는다. 최악 형상은 **열 0 의 `env:` 가 이어지는 파일**이다 — 그때 위로도 아래로도
 * 「더 얕은 줄」이 없어 훑기가 매번 파일 전체를 지난다.
 *
 * 사용: `node scripts/lib/workflow-syntax.bench.mjs`
 */
import {runInjections} from "./workflow-syntax.mjs";

const TAIL = "jobs:\n  a:\n    steps:\n      - run: echo ${{ github.event.x }}\n";
console.log("열 0 `env:` 가 이어지는 파일 — 줄 수 대비 시간");
for (const n of [2_000, 20_000, 60_000, 200_000]) {
    const src = "env:\n".repeat(n) + TAIL;
    const started = Date.now();
    const found = runInjections(src);
    console.log(`  ${String(n).padStart(7)}줄 → ${String(Date.now() - started).padStart(5)}ms · 발견 ${found.length}건`);
}
