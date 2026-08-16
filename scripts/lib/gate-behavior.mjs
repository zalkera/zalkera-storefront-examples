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
 * **존재하지 않는 경로**에 쓰기를 던진다. 그 경로에는 라우트 핸들러가 없으므로 403 을 낼 주체가
 * 관문 말고 없다 — 라우트 가드가 알리바이가 되지 못한다. 응답 `code` 가 `PREVIEW_READ_ONLY` 여야 한다.
 *
 * **점 있는 경로**를 같이 태운다. matcher 를 확장자로 가르면 동적 세그먼트에 점이 든 쓰기 경로가
 * 통째로 관문 밖이 되는데, 그 형상은 등재 검사가 못 본다(프로브 목록이 같은 전제 위에 서기 때문).
 *
 * **음성 통제군**: 프리뷰가 아닌 빌드에서는 같은 요청이 403 이면 **안 된다**. 이것이 없으면
 * "무조건 403 을 내는 서버"도 통과한다.
 *
 * 사용: `node scripts/lib/gate-behavior.mjs <프로젝트 루트>`   (rc 0 통과 · 1 위반 · 2 실행 불능)
 *   그 루트에서 프리뷰 빌드를 한 번, 비프리뷰 빌드를 한 번 굽고 각각 standalone 을 띄운다.
 */
import {spawnSync, spawn} from "node:child_process";
import {existsSync, cpSync} from "node:fs";
import {join} from "node:path";

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

async function serve(port, fn) {
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
    const srv = spawn(process.execPath, ["server.js"], {
        cwd: sa,
        env: {...process.env, PORT: String(port), HOSTNAME: "127.0.0.1"},
        stdio: "ignore",
    });
    try {
        const base = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 60; i++) {
            try {
                await fetch(base, {signal: AbortSignal.timeout(500)});
                break;
            } catch {
                await new Promise((r) => setTimeout(r, 250));
            }
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
    return out;
}

build(true);
const on = await serve(41871, probe);
build(false);
const off = await serve(41872, probe);

const bad = on.filter((r) => r.code !== "PREVIEW_READ_ONLY");
const falsePositive = off.filter((r) => r.code === "PREVIEW_READ_ONLY");

if (bad.length) {
    console.error("[gate-behavior] **프리뷰에서 쓰기가 안 막힙니다** — 관문이 그 경로에 안 걸립니다:");
    for (const r of bad) console.error(`  ${r.path}  → ${r.status} ${r.code || "(code 없음)"}`);
    console.error("  matcher 가 그 형태를 빼고 있거나, 관문 판정이 무력화됐습니다.");
    process.exit(1);
}
if (falsePositive.length) {
    console.error("[gate-behavior] 프리뷰가 아닌데 차단됩니다 — 운영 서빙이 막힙니다:");
    for (const r of falsePositive) console.error(`  ${r.path}  → ${r.status} ${r.code}`);
    process.exit(1);
}
console.log(`관문 행위 검사 통과 — 프리뷰에서 ${on.length}개 경로 전부 403 PREVIEW_READ_ONLY · 비프리뷰에서 0개 차단`);
