#!/usr/bin/env node
/**
 * 프리뷰 관문이 **실제로 막는가** — 문면도 매니페스트도 아니고 **띄워서** 잰다.
 *
 * 등재 검사(`gate-probe.mjs`)는 "관문이 실렸는가·무엇을 덮는가"만 본다. 그것으로는
 * ⑴ 판정을 무력화한 관문(`if (true) return next()`)과 ⑵ 라우트 가드까지 함께 제거된 소스를
 * 못 가른다. 그 둘이 겹치면 프리뷰 쓰기 보호가 0 인데 전 검사가 초록이 된다.
 *
 * 그래서 프리뷰 빌드를 기동해 실 HTTP 로 묻는다.
 *
 * ## 오라클
 *
 * **API 프로브는 존재하지 않는 경로**다. 라우트 핸들러가 없으므로 403 을 낼 주체가 관문 말고
 * 없다 — 라우트 가드가 알리바이가 되지 못한다. 응답 `code` 가 `PREVIEW_READ_ONLY` 여야 한다.
 * (페이지 프로브는 `[slug]/page.tsx` 가 받는다. 페이지는 이 코드를 못 내므로 오라클은 선다.)
 *
 * **점 있는 경로**를 같이 태운다. matcher 를 확장자로 가르면 동적 세그먼트에 점이 든 쓰기 경로가
 * 통째로 관문 밖이 되는데, 그 형상은 등재 검사가 못 본다(프로브 목록이 같은 전제 위에 서기 때문).
 *
 * **음성 통제군**: 프리뷰가 아닌 빌드에서 같은 요청이 **4xx·5xx 면 안 된다.** 코드만 봐서는
 * "코드를 바꿔 단 채 전부 죽이는 서버"가 통과한다. 읽기 한 건(`GET /` 200)도 같이 요구해,
 * 비프리뷰 서버가 통째로 500 인 상태를 초록으로 읽지 않게 한다.
 *
 * ## 포트는 잡아서 쓴다
 *
 * 고정 포트를 쓰면 그 포트를 남이 잡고 있을 때 **원인을 한 글자도 말하지 않고 타임아웃**한다.
 * 빈 포트를 직접 잡아 쓰고, 그래도 서버가 일찍 죽으면 그 출력을 그대로 보여 준다.
 * (`PORT=0` 은 안 통한다 — Next 가 3000 으로 되돌린다.)
 *
 * 사용: `node scripts/lib/gate-behavior.mjs <프로젝트 루트>`   (rc 0 통과 · 1 위반 · 2 실행 불능)
 *   그 루트에서 프리뷰 빌드를 한 번, 비프리뷰 빌드를 한 번 굽고 각각 standalone 을 띄운다.
 */
import {spawnSync, spawn} from "node:child_process";
import {existsSync, cpSync} from "node:fs";
import {join} from "node:path";
import {createServer} from "node:net";

const root = process.argv[2] ?? ".";
const PROBES = [
    "/api/__gate_probe_nonexistent__",
    "/api/__gate_probe__/7.0",
    "/api/__gate_probe__/logo.png",
    "/__gate_probe_page__.item",
];

function build(preview) {
    const env = {
        ...process.env,
        ZALKERA_API_BASE: process.env.ZALKERA_API_BASE ?? "http://127.0.0.1:8100",
        ZALKERA_TENANT: process.env.ZALKERA_TENANT ?? "gate-probe",
        ZALKERA_OFFLINE_BUILD: "1",
    };
    if (preview) env.NEXT_PUBLIC_ZALKERA_PREVIEW = "1";
    else delete env.NEXT_PUBLIC_ZALKERA_PREVIEW;
    const r = spawnSync("npm", ["run", "build"], {cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    if (r.status !== 0) {
        console.error(`[gate-behavior] ${preview ? "프리뷰" : "비프리뷰"} 빌드 실패 — 판정할 수 없습니다.`);
        console.error((r.stdout ?? "").split("\n").slice(-12).join("\n"));
        process.exit(2);
    }
}

/** 빈 포트를 하나 잡아 번호만 돌려준다. */
function freePort() {
    return new Promise((ok, no) => {
        const s = createServer();
        s.on("error", no);
        s.listen(0, "127.0.0.1", () => {
            const {port} = s.address();
            s.close(() => ok(port));
        });
    });
}

async function serve(fn) {
    const sa = join(root, ".next", "standalone");
    if (!existsSync(join(sa, "server.js"))) {
        console.error("[gate-behavior] standalone 산출물이 없습니다 — 판정할 수 없습니다.");
        process.exit(2);
    }
    for (const [from, to] of [
        [join(root, "public"), join(sa, "public")],
        [join(root, ".next", "static"), join(sa, ".next", "static")],
    ]) {
        if (existsSync(from)) cpSync(from, to, {recursive: true, force: true});
    }
    const port = await freePort();
    const srv = spawn(process.execPath, ["server.js"], {
        cwd: sa,
        env: {...process.env, PORT: String(port), HOSTNAME: "127.0.0.1"},
        stdio: ["ignore", "pipe", "pipe"],
    });
    // 서버가 일찍 죽으면 그 사실과 이유를 말한다 — 안 그러면 타임아웃만 남고 원인이 사라진다.
    let log = "";
    let dead = null;
    srv.stdout.on("data", (d) => (log += d));
    srv.stderr.on("data", (d) => (log += d));
    srv.on("exit", (code) => (dead = code));
    try {
        const base = `http://127.0.0.1:${port}`;
        let up = false;
        for (let i = 0; i < 60; i++) {
            if (dead !== null) {
                console.error(`[gate-behavior] 서버가 기동 중 종료했습니다(exit ${dead}) — 판정할 수 없습니다.`);
                console.error(log.trim().split("\n").slice(-8).join("\n"));
                process.exit(2);
            }
            try {
                await fetch(base, {signal: AbortSignal.timeout(500)});
                up = true;
                break;
            } catch {
                await new Promise((r) => setTimeout(r, 250));
            }
        }
        if (!up) {
            console.error(`[gate-behavior] ${base} 가 안 떴습니다 — 판정할 수 없습니다.`);
            console.error(log.trim().split("\n").slice(-8).join("\n") || "  (서버가 아무것도 출력하지 않았습니다)");
            process.exit(2);
        }
        return await fn(base);
    } finally {
        srv.kill("SIGKILL");
    }
}

async function probe(base) {
    const out = [];
    for (const p of PROBES) {
        let status = 0;
        let code = "";
        try {
            const res = await fetch(base + p, {
                method: "DELETE",
                headers: {origin: base, "content-type": "application/json"},
                signal: AbortSignal.timeout(5000),
            });
            status = res.status;
            code = (await res.json().catch(() => ({}))).code ?? "";
        } catch (e) {
            console.error(`[gate-behavior] ${p} 요청 실패 [${e.name}] — 판정할 수 없습니다.`);
            process.exit(2);
        }
        out.push({path: p, status, code});
    }
    // 읽기 통제군. 비프리뷰가 통째로 죽은 상태를 "0개 차단"으로 읽지 않기 위한 자리다.
    let home = 0;
    try {
        home = (await fetch(base + "/", {signal: AbortSignal.timeout(5000)})).status;
    } catch (e) {
        console.error(`[gate-behavior] GET / 실패 [${e.name}] — 판정할 수 없습니다.`);
        process.exit(2);
    }
    return {out, home};
}

build(true);
const on = await serve(probe);
build(false);
const off = await serve(probe);

const bad = on.out.filter((r) => r.code !== "PREVIEW_READ_ONLY");
// 음성 통제군은 **코드가 아니라 상태**로 판정한다 — 코드만 보면 503 로 갈아 단 차단이 통과한다.
const falsePositive = off.out.filter((r) => r.status >= 400);

if (bad.length) {
    console.error("[gate-behavior] **프리뷰에서 쓰기가 안 막힙니다** — 관문이 그 경로에 안 걸립니다:");
    for (const r of bad) console.error(`  ${r.path}  → ${r.status} ${r.code || "(code 없음)"}`);
    console.error("  matcher 가 그 형태를 빼고 있거나, 관문 판정이 무력화됐습니다.");
    process.exit(1);
}
if (on.home >= 400) {
    console.error(`[gate-behavior] 프리뷰에서 읽기까지 막힙니다 — GET / → ${on.home}. 관문이 읽기를 먹고 있습니다.`);
    process.exit(1);
}
if (falsePositive.length || off.home >= 400) {
    console.error("[gate-behavior] 프리뷰가 아닌데 막힙니다 — 운영 서빙이 막힙니다:");
    for (const r of falsePositive) console.error(`  ${r.path}  → ${r.status} ${r.code || "(code 없음)"}`);
    if (off.home >= 400) console.error(`  GET /  → ${off.home}`);
    process.exit(1);
}
console.log(
    `관문 행위 검사 통과 — 프리뷰에서 ${on.out.length}개 경로 전부 403 PREVIEW_READ_ONLY(읽기 ${on.home}) · 비프리뷰에서 0개 차단(읽기 ${off.home})`,
);
