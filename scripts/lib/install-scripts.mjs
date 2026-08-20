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

function scan(dir, hits) {
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
            scan(at, hits);
            continue;
        }
        const manifest = join(at, "package.json");
        if (!existsSync(manifest)) continue;
        try {
            const scripts = JSON.parse(readFileSync(manifest, "utf8")).scripts ?? {};
            for (const hook of HOOKS) if (scripts[hook]) hits.push(`${name}: ${hook}`);
        } catch {
            // 읽을 수 없는 매니페스트는 셀 수 없다 — 세는 척하지 않는다.
        }
    }
}

const hits = [];
scan(join(ROOT, "node_modules"), hits);
console.log(`설치 스크립트를 가진 의존: ${hits.length}개`);
for (const h of hits) console.log(`  ${h}`);
