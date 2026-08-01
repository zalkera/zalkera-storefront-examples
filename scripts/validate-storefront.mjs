#!/usr/bin/env node
/**
 * 소스 규약 검사 — **정본은 `@zalkera/client` 가 배송하는 `zalkera-validate` 다.** 이 파일은 그 bin 을
 * 부르는 wrapper 이고, 규칙을 여기서 새로 만들지 않는다.
 *
 * 왜 옮겼나(2026-08-01): 서빙 빌드가 이 검사기를 돌려야 하는 자리가 생겼고(memo140 §6.5), 서빙
 * 이미지에 사본을 구우면 **정본이 둘**이 된다. 그 병은 이 레포가 하루에도 몇 번씩 겪는 것이다 —
 * 계약 rev 가 올랐는데 검사기가 옛 키를 보던 일(N5), 같은 관례를 두 곳이 다르게 구현하던 일(S2·C1).
 * `check-aeo-surfaces` 가 이미 같은 형태이므로(memo123 §6.1) 소스 검사기도 그 옆에 둔다.
 *
 * 고객도 같은 검사기를 직접 부를 수 있다: `npx zalkera-validate ./src`.
 */
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";

const CHECKER_SUBPATH = "@zalkera/client/bin/validate-storefront.mjs";

let checker;
try {
    checker = createRequire(import.meta.url).resolve(CHECKER_SUBPATH);
} catch {
    // 죽는 경우는 둘뿐이고 고치는 방법이 다르므로 뭉뚱그리지 않는다.
    let installed = true;
    try {
        createRequire(import.meta.url).resolve("@zalkera/client");
    } catch {
        installed = false;
    }
    console.error(
        "소스 검사기를 못 찾았습니다 — 아무 판정도 하지 않습니다.\n" +
            (installed
                ? "  @zalkera/client 는 설치돼 있는데 검사기를 싣지 않는 버전입니다. 0.17.0 이상으로 올리십시오."
                : "  @zalkera/client 가 설치돼 있지 않습니다. `npm ci` 후 다시 시도하십시오."),
    );
    process.exit(2);
}

const r = spawnSync(process.execPath, [checker, ...process.argv.slice(2)], {stdio: "inherit"});
process.exit(r.status ?? 2);
