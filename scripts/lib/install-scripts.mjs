/**
 * 설치된 의존 중 **설치 스크립트를 가진 것**을 센다.
 *
 * `client-upgrade.yml` 이 `npm install --ignore-scripts` 를 쓰는 근거가 「이 트리에는 그런 의존이
 * 없다」인데, 근거는 셀 수 있어야 한다. 나중에 그런 의존이 생기면 이 수가 0 이 아니게 되고,
 * 그때는 워크플로가 크게 실패하는 편이 조용히 도는 것보다 낫다.
 *
 * 사용: `node scripts/lib/install-scripts.mjs`
 */
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS = ["preinstall", "install", "postinstall"];

/**
 * ⚠ **중첩 `node_modules` 까지 훑는다.** 최상위만 보면 `a/node_modules/b` 에 심긴 스크립트를
 *   못 본다 — 오늘 트리에 중첩이 0개라 눈에 안 띄었을 뿐, 하나 생기는 순간 근거가 거짓이 된다.
 *
 * ⚠ **패키지 수를 센다.** 훅을 세면 한 패키지가 `preinstall`·`postinstall` 을 다 가질 때 2로
 *   보고돼, 「N개」가 무엇의 수인지 흐려진다.
 */
function scan(dir, found, depth = 0) {
    if (depth > 6) return; // 병적으로 깊은 트리에서 매달리지 않는다.
    let names;
    try {
        names = readdirSync(dir);
    } catch {
        return;
    }
    for (const name of names) {
        if (name.startsWith(".")) continue;
        const at = join(dir, name);
        if (name.startsWith("@")) {
            scan(at, found, depth);
            continue;
        }
        const manifest = join(at, "package.json");
        if (existsSync(manifest)) {
            try {
                const scripts = JSON.parse(readFileSync(manifest, "utf8")).scripts ?? {};
                const hooks = HOOKS.filter((h) => scripts[h]);
                if (hooks.length > 0) found.set(at, hooks);
            } catch {
                // 읽을 수 없는 매니페스트는 셀 수 없다 — 세는 척하지 않는다.
            }
        }
        // 중첩 의존.
        scan(join(at, "node_modules"), found, depth + 1);
    }
}

const found = new Map();
scan(join(ROOT, "node_modules"), found);
console.log(`설치 스크립트를 가진 의존: ${found.size}개`);
for (const [at, hooks] of found) console.log(`  ${at.slice(ROOT.length + 1)}: ${hooks.join(", ")}`);
