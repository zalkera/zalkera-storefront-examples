/**
 * **개발 서버가 뜨고 첫 화면을 컴파일하는가** — 띄워서 잰다.
 *
 * ■ 왜 생겼나
 *   `next build` 는 CSS 파싱 실패를 **경고로 찍고 rc 0 을 낸다.** `next dev` 는 같은 자리를
 *   하드 에러로 내고 그 페이지가 500 이 된다. 종료 코드만 보는 검수는 그 차이를 못 본다 —
 *   그래서 시안 `<style>` 의 `@import` 가 규칙 뒤로 밀린 팩이 **전 항목 초록을 달고** 납품됐고,
 *   받은 쪽이 미리보기를 켜자마자 «Parsing CSS source code failed» 로 멈췄다.
 *
 *   재현: 아무 팩의 `src/app/globals.css` 맨 아래에
 *         `@import url('https://example.com/x.css');` 를 붙이고
 *         `npm run build; echo rc=$?`  → 경고만 찍고 **rc=0**
 *         `npm run dev` 후 `curl -o /dev/null -w '%{http_code}' localhost:<포트>/` → **500**
 *
 * ■ 오라클은 상태 코드 하나다
 *   문면(«Failed to compile» 같은 문자열)으로 재지 않는다. 그 문구는 Next 판이 바뀌면 조용히
 *   달라지고, 그러면 이 검사는 **아무 말 없이 재기를 그만둔다.** 상태 코드는 그 결합이 없다.
 *
 * ■ 못 보는 자리 — 이름보다 좁게 잰다
 *   ⑴ **`/` 한 장만 잰다.** 시안은 페이지마다 오므로 같은 결함이 `/about` 에 있으면 통과한다.
 *      라우트 전량으로 넓히지 않은 것은 **라우트당 dev 컴파일 1회**가 벽시계로 붙기 때문이다.
 *      넓힐 때 쓸 라우트 도출 정본은 이미 있다(`scripts/lib/routes.mjs` 의 `derivedRoutes`).
 *   ⑵ **서버가 낸 상태만 본다.** 클라이언트에서만 터지는 오류는 `200` + 오버레이로 오므로
 *      이 자리가 못 본다 — 실제로 그 형태(주입 스크립트 SyntaxError)를 통과시킨 적이 있다.
 *   ⑶ **백엔드가 없어서 나는 500 과 소스 결함으로 나는 500 을 못 가른다.** 우리 템플릿은 요청
 *      시점 fetch 를 전부 fail-soft 로 감싸(`.catch(() => null)`) 걸리지 않지만, 그 규율이 없는
 *      BYO 소스는 여기서 500 으로 보인다. 반려 문면이 그 사실을 같이 말한다.
 *      가르려면 «dev 5xx 인데 상용 standalone 은 200» 이라는 **차분**을 재야 하는데, 그러면
 *      프로브가 빌드 뒤로 가야 한다(다음 트랜치 후보).
 *
 * ■ 판정과 I/O 를 가른다
 *   판정(`judgeDevScript`)은 순수 함수라 시험이 직접 부른다. 띄우는 쪽(`runDevProbe`)은 시험이
 *   실제 Next 설치를 요구하므로 여기서 재지 않는다 — 대신 **배선**은 합성 zip 으로
 *   `scripts/lib/verifyZipJudgments.test.mjs` 가 문다(가짜 dev 서버 한 줄이면 된다).
 */
import {spawn} from "node:child_process";
import {createServer} from "node:net";

/**
 * 띄운 개발 서버 전부. `process.exit` 은 `try/finally` 를 건너뛰므로 정리를 `finally` 에만 두면
 * 조기 반려 한 번에 서버가 고아로 남는다 — 실제로 그 형태로 `next-server` 40개가 19시간 살아
 * RSS 3GB 를 붙들고 있었다.
 *
 * ⚠ **훅은 첫 기동 때 건다.** 모듈 최상위에 걸면 순수 판정만 쓰려는 소비자(시험 포함)가
 *   import 하는 것만으로 프로세스 훅이 생긴다 — `floors.mjs`(순수) ↔ `floor-gate.mjs`(I/O) 가
 *   파일을 아예 가른 이유와 같다.
 * ⚠ **신호는 `exit` 훅을 안 태운다.** 이 모듈은 그것을 덮지 못한다 — 호출자가 신호 핸들러에서
 *   `process.exit` 을 부를 때만 덮인다(`verify-zip.mjs:625` 가 그렇게 한다).
 *   재현(손자를 `exec sleep 500` 으로 두고 그룹 kill 훅을 `exit` 에만 건 뒤):
 *     `kill -TERM <자식>` → `pgrep -c -x sleep` 이 **1 늘어난 채로 남는다**
 *     `process.exit(0)`   → 같은 수치가 **기준선으로 돌아온다**
 */
const alive = new Set();
let hooked = false;
function ensureHook() {
    if (hooked) return;
    hooked = true;
    process.on("exit", () => {
        for (const pgid of alive) killGroup(pgid);
    });
}

/**
 * **프로세스 그룹째** 죽인다. `npm run dev` 는 `npm → next → next-server` 3대라 맏이만 죽이면
 * 손자가 포트를 문 채 산다(위 40개가 그 경로였다).
 */
function killGroup(pgid) {
    try {
        process.kill(-pgid, "SIGKILL");
    } catch {
        // 이미 죽었거나 그룹이 없다 — 정리 실패는 판정이 아니다.
    }
}

/** 빈 포트를 하나 잡아 번호만 돌려준다. 고정 포트는 남이 잡고 있을 때 이유 없이 타임아웃한다. */
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

/** 실패 사유에 붙일 서버 출력 꼬리. **끝**을 든다 — 오류는 마지막에 있고 배너는 앞에 있다. */
function tailOf(logTail) {
    if (!logTail) return "";
    return `\n   ${String(logTail).trim().split("\n").slice(-6).join("\n   ")}`;
}

/**
 * 관측값 → 판정. **순수 함수다.**
 *
 * @param obs.devScript   `package.json` 의 `scripts.dev` (없으면 `undefined`)
 * @param obs.exitCode    준비 전에 끝났으면 그 코드, 아니면 `null`
 * @param obs.exitSignal  **신호로** 죽었으면 그 이름. 신호 사망은 `exitCode` 가 `null` 이라
 *                        이것을 안 보면 「죽었다」가 「안 답한다」로 눅는다(Node 계약).
 *                        재현: `node -e 'require("node:child_process").spawn("sh",["-c","kill -9 $$"]).on("exit",(c,s)=>console.log(c,s))'` → `null SIGKILL`
 * @param obs.status      `GET /` 의 상태 코드. 못 받았으면 `null`
 * @param obs.offsite     `/` 가 **다른 출처**로 3xx 였다. 이 서버가 그린 화면을 못 본 것이다
 * @param obs.hung        붙었는데 응답이 안 왔다(타임아웃·연결 끊김)
 * @param obs.logTail     실패를 설명할 때 붙일 서버 출력 꼬리
 * @param obs.strict      **완화를 끈다.** 호출자 선언이다(`--byo` 가 아니면 참) — zip 내용이
 *                        아니라 호출자가 정한다. 아티팩트가 스스로 검사를 끄지 못하게 하는 축이다.
 * @returns `{verdict: "pass"|"fail"|"skip", why}`
 */
export function judgeDevScript(obs) {
    const {devScript, exitCode = null, exitSignal = null, status = null, offsite = false, hung = false, logTail = "", strict = false} = obs ?? {};
    const tail = tailOf(logTail);

    // 못 잰 자리. `strict` 면 반려다 — 우리 시작 소스는 `"dev": "next dev"` 를 항상 싣고,
    // 배송 문서가 `npm run dev` 를 업로드 전 미리보기 정본 경로로 지목한다.
    // `--byo` 는 그 요건을 문서로 건 적이 없으므로 거기서만 «미검사»로 남긴다.
    const cannotMeasure = (why, hint) => (strict ? {verdict: "fail", why: `${why}${hint}${tail}`} : {verdict: "skip", why});

    // ⚠ 공백만 든 `"dev": " "` 도 «없음»이다. 문자열이 있다는 것만 보면 빈 스크립트를 넣어
    //   이 검사를 끌 수 있는데, 그것은 표식을 지워 가드를 끄는 것과 같은 형태다.
    if (typeof devScript !== "string" || devScript.trim() === "") {
        return cannotMeasure("dev 스크립트가 없다 — 개발 서버가 정의돼 있지 않다", " · 우리 시작 소스는 `\"dev\": \"next dev\"` 를 싣습니다");
    }
    // ⚠ **종료가 상태·행업보다 먼저다.** 죽으면 상태도 못 받으므로, 순서를 뒤집으면
    //   「죽었다」가 「안 답한다」로 눅어 미검사로 샌다.
    if (exitSignal) {
        return {verdict: "fail", why: `개발 서버가 기동 중 ${exitSignal} 로 죽었습니다${tail}`};
    }
    if (exitCode !== null) {
        return {verdict: "fail", why: `개발 서버가 기동 중 종료했습니다(exit ${exitCode})${tail}`};
    }
    // 붙었는데 응답이 없다 — **완화 대상이 아니다.** 컴파일이 안 끝나는 소스는 미리보기가
    // 안 뜬다는 점에서 500 과 결과가 같다.
    if (hung) {
        return {verdict: "fail", why: `개발 서버가 붙었지만 GET / 에 응답하지 않습니다${tail}`};
    }
    if (offsite) {
        // `fetch` 의 기본값은 `redirect: "follow"` 라 `res.status` 가 **최종** 상태다(사양).
        // 그대로 재면 `/` 를 외부로 302 시키는 개발 서버가 **남의 서버가 낸 200** 으로 통과한다.
        return cannotMeasure("GET / 가 다른 출처로 넘겼다 — 이 서버가 그린 화면을 못 봤다", " · 첫 화면이 이 소스에서 나와야 합니다");
    }
    if (status === null) {
        // 살아는 있는데 준 포트에 안 떴다. `"dev": "next dev -p 3000"` 처럼 포트를 박으면
        // CLI 인자가 `PORT` 를 이겨 여기 걸린다.
        // 재현: `node -e 'const{Command,Option}=require("next/dist/compiled/commander");const p=new Command();p.addOption(new Option("-p, --port <port>").default(3000).env("PORT"));p.parse(["n","x","-p","9999"]);console.log(p.opts().port)'` → PORT=5555 여도 9999
        return cannotMeasure("개발 서버가 준 포트로 안 떴다 — PORT 를 안 읽는 스택일 수 있다", " · dev 스크립트에 포트를 박지 마십시오");
    }
    if (status !== 200) {
        return {
            verdict: "fail",
            why:
                `개발 서버에서 GET / 가 ${status} 입니다 — 첫 화면이 컴파일되지 않습니다${tail}` +
                `\n   ⓘ 백엔드 없이 첫 화면을 못 그리는 소스도 여기서 500 으로 보입니다 —` +
                ` 요청 시점 fetch 가 fail-soft 인지 함께 보십시오.`,
        };
    }
    return {verdict: "pass", why: "GET / 200"};
}

/**
 * 개발 서버를 띄우고 `GET /` 를 한 번 묻는다. 판정은 하지 않는다 — 관측값만 돌려준다.
 *
 * @param opts.env     자식 환경(호출부가 `childEnv` 로 만든 것)
 * @param opts.bindMs  **포트를 물기까지** 기다릴 시간. 기동은 컴파일보다 훨씬 빠르다 —
 *                     이것을 응답 대기와 같이 두면 포트를 박은 팩 하나가 전체 대기를 다 태운다.
 * @param opts.replyMs 붙은 뒤 **응답**을 기다릴 시간(콜드 컴파일이 여기 든다).
 */
export async function runDevProbe(root, {env = process.env, bindMs = 30_000, replyMs = 120_000} = {}) {
    ensureHook();
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn("npm", ["run", "dev"], {
        cwd: root,
        // 자기 프로세스 그룹을 갖게 한다 — 손자까지 한 번에 죽이기 위해서다.
        detached: true,
        // ⚠ `HOSTNAME` 은 **`next dev` 가 안 읽는다** — `-H/--hostname` 에 `.env()` 가 없다.
        //   재현: `grep -c HOSTNAME node_modules/next/dist/cli/next-dev.js` → 0
        //   (읽는 것은 standalone 템플릿뿐: `grep -c process.env.HOSTNAME node_modules/next/dist/build/utils.js` → 1)
        //   다른 스택을 위해 남기지만 **루프백 강제는 못 한다** — 신뢰 밖 zip 의 개발 서버가
        //   잠시 전 인터페이스에 뜰 수 있다는 뜻이다. 스택을 가정하는 `-H` 는 쓰지 않는다.
        env: {...env, PORT: String(port), HOSTNAME: "127.0.0.1"},
        stdio: ["ignore", "pipe", "pipe"],
    });
    alive.add(child.pid);

    let log = "";
    let exitCode = null;
    let exitSignal = null;
    const keep = (d) => {
        log += d;
        // 무한히 자라지 않게 꼬리만 든다 — 개발 서버는 요청마다 줄을 뱉는다.
        if (log.length > 64 * 1024) log = log.slice(-32 * 1024);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    // ⚠ **둘째 인자를 받는다.** 신호 사망은 `code` 가 `null` 이라 첫 인자만 보면 «살아 있음»이 된다.
    child.on("exit", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
    });

    const dead = () => exitCode !== null || exitSignal !== null;
    const out = (extra) => ({exitCode, exitSignal, status: null, offsite: false, hung: false, logTail: log, ...extra});

    try {
        // ⑴ 포트를 물 때까지. **연결 거부만** 재시도한다 — 그 외 오류는 「붙었는데 이상하다」다.
        const bindBy = Date.now() + bindMs;
        for (;;) {
            if (dead()) return out({});
            try {
                await fetch(origin, {method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(1_000)});
                break;
            } catch (e) {
                // ⚠ **연결 거부만 재시도한다.** 타임아웃은 「아무도 안 떴다」가 아니라 «누군가
                //   받았는데 답을 안 준다»다 — 그것을 여기서 재시도로 삼키면 행업이 「포트로 안
                //   떴다」로 분류되어, 완화 모드에서 **반려가 미검사로 눅는다.**
                //   재현: `dev` 가 `node -e 'require("http").createServer(()=>{}).listen(process.env.PORT,"127.0.0.1")'`
                //   인 트리에 `probeDevCompile(root,{strict:false})` → 이 줄이 있으면 `fail`(「붙었지만
                //   응답하지 않습니다」), 없으면 `skip`(「포트로 안 떴다」)이 된다.
                const code = e?.cause?.code ?? e?.code ?? "";
                if (code !== "ECONNREFUSED") break; // 붙긴 했다 — 응답 대기로 넘어간다
                if (Date.now() >= bindBy) return out({}); // 끝내 안 떴다 → status null
                await new Promise((r) => setTimeout(r, 300));
            }
        }

        // ⑵ 붙었으면 `/` 를 묻는다. **리다이렉트를 자동으로 안 따라간다** — 따라가면 남의 서버가
        //    낸 200 을 이 서버의 성적으로 읽는다. 같은 출처면 우리가 손으로 따라간다.
        let url = `${origin}/`;
        for (let hop = 0; hop < 5; hop++) {
            let res;
            try {
                res = await fetch(url, {redirect: "manual", signal: AbortSignal.timeout(replyMs)});
            } catch (e) {
                if (dead()) return out({});
                return out({hung: true, logTail: `${log}\n[probe] ${e?.name ?? "Error"}: ${e?.message ?? ""}`});
            }
            if (res.status < 300 || res.status >= 400) return out({status: res.status});
            const loc = res.headers.get("location");
            if (!loc) return out({status: res.status});
            const next = new URL(loc, url);
            if (next.origin !== origin) return out({offsite: true});
            url = next.href;
        }
        return out({hung: true, logTail: `${log}\n[probe] 같은 출처 리다이렉트가 5회를 넘었습니다.`});
    } finally {
        alive.delete(child.pid);
        killGroup(child.pid);
    }
}

/**
 * 띄우기 + 판정을 한 번에. **CLI 에는 `record`/`recordSkip` 배선만 남긴다** —
 * 「dev 스크립트가 있는가」 술어가 두 벌이 되면 그 사본이 갈린다(`childEnv.mjs` 가 생긴 병).
 *
 * @param pkg  이미 읽어 둔 `package.json` 객체(호출부가 다른 검사에도 쓴다)
 */
export async function probeDevCompile(root, {pkg, env = process.env, strict = false} = {}) {
    const devScript = pkg?.scripts?.dev;
    const runnable = typeof devScript === "string" && devScript.trim() !== "";
    const obs = runnable ? await runDevProbe(root, {env}) : {};
    return judgeDevScript({devScript, strict, ...obs});
}
