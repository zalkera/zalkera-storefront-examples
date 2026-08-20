/**
 * **끊었을 때 작업 트리가 남는가.**
 *
 * ■ 왜 생겼나
 *   `verify-zip` 은 zip 을 풀고 그 트리를 빌드한다. 정리는 `process.on("exit")` 에 걸려 있었는데
 *   **신호는 그 훅을 안 태운다** — Ctrl-C 한 번이면 수백 MB 가 `TMPDIR` 에 남는다. 그리고 빌드가
 *   몇 분이라 기다리다 그만두는 것은 예외가 아니라 **정상적인 사용**이다.
 *
 * ■ 왜 실제로 띄워서 재나
 *   「훅을 걸었다」는 문면으로도 확인되지만, 그 훅이 정리까지 마치고 끝내는지는 띄워 봐야 안다.
 *   `process.exit` 을 신호 훅 안에서 부르지 않으면 프로세스가 그대로 사는 형상도 있다.
 *
 * 사용: `node --test scripts/lib/verifyZipSignal.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync, mkdtempSync, readdirSync, rmSync} from "node:fs";
import {dirname, join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "verify-zip.mjs");
const ROOT = join(HERE, "..", "..");

/** 이 레포의 아무 팩 하나. 없으면 시험이 잴 것이 없다 — 그때는 대놓고 건너뛴다. */
function anyPack() {
    const dir = join(ROOT, "dist-presets");
    if (!existsSync(dir)) return null;
    const zip = readdirSync(dir).filter((f) => f.endsWith(".zip")).sort()[0];
    return zip ? join(dir, zip) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `TMPDIR` 아래의 작업 트리들. */
const workDirs = (box) => readdirSync(box).filter((n) => n.startsWith("zalkera-verify-"));

test("신호로 끊으면 작업 트리를 남기지 않는다", async (t) => {
    const pack = anyPack();
    if (!pack) {
        t.skip("dist-presets 에 zip 이 없다 — 잴 대상이 없다");
        return;
    }
    const box = mkdtempSync(join(tmpdir(), "zalkera-sigbox-"));
    let child = null;
    try {
        child = spawn(process.execPath, [RUNNER, pack], {
            cwd: ROOT,
            env: {...process.env, TMPDIR: box},
            stdio: "ignore",
        });
        // 작업 트리가 생길 때까지 기다린다 — 생기기 전에 끊으면 아무것도 안 재는 시험이 된다.
        let appeared = false;
        for (let i = 0; i < 100 && !appeared; i++) {
            await sleep(50);
            appeared = workDirs(box).length > 0;
        }
        assert.ok(appeared, "작업 트리가 안 생겼다 — 이 시험이 아무것도 안 재고 있다");

        assert.equal(child.exitCode, null, "끊기 전에 스스로 끝났다 — 이 시험이 아무것도 안 쟀다");

        const ended = await new Promise((resolve) => {
            child.once("exit", (c, sig) => resolve({code: c, signal: sig}));
            child.kill("SIGINT");
        });
        child = null;

        // **보장되는 것은 이것 하나다.** 종료 코드는 신호가 `spawnSync` 안에서 도착했는지에 달렸다
        // — 그때는 본류가 먼저 자기 코드로 끝낸다. 남기지 않는 것만 못 박는다.
        assert.deepEqual(workDirs(box), [], "끊었는데 작업 트리가 남았다");
        assert.notEqual(ended.code, 0, `끊었는데 성공으로 끝났다: ${JSON.stringify(ended)}`);
    } finally {
        if (child) child.kill("SIGKILL");
        rmSync(box, {recursive: true, force: true});
    }
});
