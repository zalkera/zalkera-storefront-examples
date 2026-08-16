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
 * **API 프로브는 배송 트리에 없는 경로**다. 그 자리에 핸들러가 없으면 403 을 낼 주체가 관문 말고
 * 없고, 라우트 가드가 알리바이가 되지 못한다. 응답 `code` 가 `PREVIEW_READ_ONLY` 여야 한다.
 *
 * ⚠ **이 오라클은 절대적이지 않다.** 캐치올 라우트(`src/app/api/[...x]/route.ts`)를 만들면 그 자리가
 *   "존재하는 경로"가 되고, 그 핸들러가 프리뷰에서 같은 403·코드를 내면 관문이 없어도 통과한다.
 *   `[slug]/page.tsx` 를 `[slug]/route.ts` 로 바꾸면 페이지 프로브도 같다.
 *   재현: 관문을 무력화하고 `src/app/api/[...gate]/route.ts` 에 프리뷰일 때만 403 을 내는 핸들러를 두면 rc 0.
 *   즉 이 검사는 **관문을 지우는 실수**는 잡지만 **관문을 사칭하는 의도**는 못 잡는다. 후자는
 *   `gate-probe.mjs` 의 트리 도출(캐치올이 프로브 경로를 삼키는지)과 사람 검수가 본다.
 *
 * **점 있는 경로**를 같이 태운다. matcher 를 확장자로 가르면 동적 세그먼트에 점이 든 쓰기 경로가
 * 통째로 관문 밖이 되는데, 그 형상은 등재 검사가 못 본다(프로브 목록이 같은 전제 위에 서기 때문).
 *
 * 프리뷰 쪽은 **상태와 코드를 둘 다** 요구한다(`403` + `PREVIEW_READ_ONLY`). 코드만 보면
 * `200 {"code":"PREVIEW_READ_ONLY"}` 만 내는 사칭 서버가 통과한다.
 *
 * **음성 통제군**: 프리뷰가 아닌 빌드에서 **관문이 돈 흔적이 없어야** 한다. 프로브의 4xx·5xx 는
 * 정상이다 — 그 경로는 존재하지 않으므로 404 가 맞고, `[slug]` 가 받는 페이지 프로브는 콘텐츠가
 * 없어 500 이 난다. "서버가 통째로 죽었는가"는 읽기 한 건(`GET /` 200)이 따로 진다.
 *
 * 프리뷰 여부는 **빌드와 런타임 양쪽**에 같게 준다. 판별자가 받는 이름이 둘이라(`PREVIEW_ENV_NAMES`)
 * 한쪽만 지우면 비프리뷰 빌드가 실행 시점에 프리뷰로 돌아 통제군이 전부 걸린다.
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

/**
 * 프리뷰 판별자가 받는 이름 **전부**. `src/lib/preview.ts` 와 같이 움직여야 한다 —
 * 여기 하나를 빠뜨리면 비프리뷰 빌드가 프리뷰가 되어 거짓 반려가 난다.
 * 첫 번째가 정본 이름이다(프리뷰 빌드에 그것을 준다).
 */
const PREVIEW_ENV_NAMES = ["NEXT_PUBLIC_ZALKERA_PREVIEW", "NEXT_PUBLIC_ONEQUE_PREVIEW"];

/**
 * 띄운 자식 전부. `process.exit` 은 `try/finally` 의 `finally` 를 **건너뛴다**(실측:
 * `node -e 'try{process.exit(3)}finally{console.log("x")}'` → 아무것도 안 찍힌다).
 * 그래서 정리를 `finally` 에만 두면 프로브 실패 한 번에 서버가 고아로 남아 RSS 를 무기한 붙든다.
 * 어느 경로로 끝나든 죽도록 `exit` 훅에 건다.
 */
const children = new Set();
process.on("exit", () => {
    for (const c of children) {
        try {
            c.kill("SIGKILL");
        } catch {}
    }
});

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
    // ⚠ **판별자가 받는 이름을 전부** 지운다. `src/lib/preview.ts` 는 구 이름(`NEXT_PUBLIC_ONEQUE_PREVIEW`)
    //   도 수용한다 — 하나만 지우면 환경에 구 이름이 있을 때 "비프리뷰" 빌드가 실제로는 프리뷰가 되고,
    //   음성 통제군이 전부 걸려 **정상 팩을 거짓 반려**한다.
    //   재현: `NEXT_PUBLIC_ONEQUE_PREVIEW=1 node scripts/lib/gate-behavior.mjs .`
    for (const k of PREVIEW_ENV_NAMES) delete env[k];
    if (preview) env[PREVIEW_ENV_NAMES[0]] = "1";
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

async function serve(preview, fn) {
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
    // ⚠ 런타임 환경도 빌드와 **같은 선언**이어야 한다. 판별자는 서버에서 다시 읽히므로, 여기에
    //   구 이름이 남아 있으면 비프리뷰 빌드가 실행 시점에 프리뷰로 돌아 음성 통제군이 전부 걸린다.
    const env = {...process.env, PORT: String(port), HOSTNAME: "127.0.0.1"};
    for (const k of PREVIEW_ENV_NAMES) delete env[k];
    if (preview) env[PREVIEW_ENV_NAMES[0]] = "1";
    const srv = spawn(process.execPath, ["server.js"], {
        cwd: sa,
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(srv);
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
        children.delete(srv);
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
const on = await serve(true, probe);
build(false);
const off = await serve(false, probe);

// **상태와 코드를 둘 다** 본다. 코드만 보면 `200 {"code":"PREVIEW_READ_ONLY"}` 만 내는 사칭
// 서버가 통과한다 — 관문은 403 을 내므로 상태까지 요구하는 것이 정확한 판정이다.
const bad = on.out.filter((r) => r.status !== 403 || r.code !== "PREVIEW_READ_ONLY");
// 음성 통제군에서 **프로브의 4xx·5xx 는 정상이다** — 그 경로는 존재하지 않으므로 404 가 맞고,
// `[slug]` 가 받는 페이지 프로브는 콘텐츠가 없어 500 이 난다. 여기서 위반은 **관문이 돈 흔적**
// 하나뿐이다. 상태 전체를 위반으로 치면 정상 팩이 거짓 반려된다 — 비프리뷰 서버에 물어 보면
// 404·404·404·500 이 나온다. 재현: `node scripts/lib/gate-behavior.mjs .` (통과 줄의 괄호 안 값)
// "서버가 통째로 죽었는가"는 아래 `off.home` 이 진다 — 그것이 이 통제군의 몫이다.
const falsePositive = off.out.filter((r) => r.status === 403 || r.code === "PREVIEW_READ_ONLY");

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
