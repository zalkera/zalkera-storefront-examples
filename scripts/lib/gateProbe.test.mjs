/**
 * 프리뷰 관문 등재 검사의 변이 시험. **실물 스크립트를 합성 트리로 돌린다** — 복사한 판정이
 * 아니라 배송되는 것 자체를 잰다.
 *
 * 각 시험은 matcher 를 좁히는 실제 형태다. 손으로 한 번 확인하고 버리면 다음 판에서 같은 자리가
 * 다시 열리므로 여기 남긴다. 빌드가 필요 없다 — 매니페스트를 직접 쓴다.
 *
 * 사용: `node --test scripts/lib/gateProbe.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync} from "node:fs";
import {join, dirname} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, "gate-probe.mjs");

/** 배송 matcher 를 Next 가 컴파일한 형태. */
const SHIPPED = String.raw`^\/((?!_next\/static|_next\/image|images\/|favicon\.ico$).*)$`;

/** 대표 라우트 — 배송 트리의 형상을 줄여 옮긴 것. */
const ROUTES = [
    "api/cart/route.ts",
    "api/cart/items/route.ts",
    "api/cart/items/[variantId]/route.ts",
    "api/checkout/route.ts",
    "api/orders/[orderNo]/cancel/route.ts",
    "media/[id]/route.ts",
    "blog/[slug]/page.tsx",
    "page.tsx",
];

function fixture({routes = ROUTES, regexp = SHIPPED, appAt = "src/app"} = {}) {
    const dir = mkdtempSync(join(tmpdir(), "gate-probe-"));
    for (const r of routes) {
        const full = join(dir, appAt, r);
        mkdirSync(dirname(full), {recursive: true});
        writeFileSync(full, "export async function POST() {}\n");
    }
    const next = join(dir, ".next", "server");
    mkdirSync(next, {recursive: true});
    writeFileSync(
        join(next, "middleware-manifest.json"),
        JSON.stringify({middleware: {"/": {matchers: regexp === null ? [] : [{regexp, originalSource: regexp}]}}}),
    );
    return dir;
}

function run(dir) {
    const r = spawnSync(process.execPath, [PROBE, join(dir, ".next"), dir], {encoding: "utf8"});
    return {rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`};
}

async function withFixture(opts, fn) {
    const dir = fixture(opts);
    try {
        return await fn(dir);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

test("배송 matcher 는 이 트리를 전부 덮는다 — 양성 통제", async () => {
    await withFixture({}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
        assert.match(out, /전부 덮임/);
    });
});

test("matcher 를 `/api/:path*` 로 좁히면 페이지가 관문 밖이 된다", async () => {
    await withFixture({regexp: String.raw`^\/api(?:\/(.*))?$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /관문 밖입니다/);
    });
});

test("확장자로 가르면 점 든 동적 세그먼트가 관문 밖이 된다", async () => {
    await withFixture({regexp: String.raw`^\/((?!_next\/static|.*\.[A-Za-z0-9]+$).*)$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /7\.0|logo|a\.b/);
    });
});

test("실재 라우트의 접두를 빼면 그 라우트를 지목해 반려한다", async () => {
    await withFixture({regexp: String.raw`^\/((?!_next\/static|api\/cart).*)$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /\/api\/cart/);
    });
});

test("배제 접두 밑에 만든 쓰기 라우트를 잡는다", async () => {
    await withFixture({routes: [...ROUTES, "images/upload/route.ts"]}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /\/images\/upload/);
    });
});

test("matcher 가 없으면 무엇을 덮는지 알 수 없다고 반려한다", async () => {
    await withFixture({regexp: null}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
    });
});

test("특수 세그먼트에서 도출이 깨지지 않는다", async () => {
    const routes = [
        "page.tsx",
        "(marketing)/deals/page.tsx", // 라우트 그룹 — URL 에 안 나온다
        "@modal/preview/page.tsx", // 병렬 라우트 — 독립 주소가 아니다
        "_internal/helper/page.tsx", // 사설 폴더 — 라우팅 대상이 아니다
        "docs/[[...all]]/page.tsx",
        "files/[...path]/route.ts",
    ];
    await withFixture({routes}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
        // ⚠ **개수만 보지 마라.** 라우트 그룹을 URL 로 흘리는 변이는 개수가 그대로라 안 잡힌다.
        //   도출 경로 자체를 본다 — matcher 를 그 넷만 덮게 좁혀, 하나라도 다르면 반려가 난다.
        assert.match(out, /도출한 4개/);
    });

    // 도출 **경로**를 직접 본다 — 개수만 보면 라우트 그룹을 URL 로 흘리는 변이가 살아남는다.
    // `routes.mjs` 를 직접 부른다(스크립트는 경로를 안 찍는다).
    await withFixture({routes}, async (d) => {
        const {derivedRoutes, appDirOf} = await import("./routes.mjs");
        assert.deepEqual(derivedRoutes(appDirOf(d)).sort(), ["/", "/deals", "/docs/a.b/c.d", "/files/a.b/c.d"]);
    });
});

test("트리에 없는 프로브가 반드시 있다 — 새 라우트가 덮이는가를 그것으로만 잰다", async () => {
    const {SYNTHETIC, derivedRoutes, appDirOf} = await import("./routes.mjs");
    assert.ok(SYNTHETIC.length >= 2, `미존재 프로브가 ${SYNTHETIC.length}개다 — 비우면 "새 라우트도 덮인다"를 아무도 안 잰다`);
    await withFixture({}, (d) => {
        const derived = derivedRoutes(appDirOf(d));
        for (const p of SYNTHETIC) assert.equal(derived.includes(p), false, `${p} 가 트리에 실재한다 — 프로브로 못 쓴다`);
    });
    // 점이 든 값이어야 확장자 배제 구멍이 드러난다.
    assert.ok(SYNTHETIC.some((p) => /\.[A-Za-z0-9]+$/.test(p)), "점으로 끝나는 프로브가 없다");
});

test("루트 `app/` 과 `src/app` 이 둘 다 있으면 **루트를 고른다** — Next 와 같은 순서", async () => {
    // 순서를 뒤집으면 실제로 빌드되는 트리를 아무 검사도 안 본다.
    // 근거: `node_modules/next/dist/lib/find-pages-dir.js` — "prioritize ./${name} over ./src/${name}"
    const {appDirOf, derivedRoutes} = await import("./routes.mjs");
    const dir = mkdtempSync(join(tmpdir(), "both-"));
    try {
        for (const [p, f] of [["app/images/upload", "route.ts"], ["src/app/hello", "page.tsx"]]) {
            mkdirSync(join(dir, p), {recursive: true});
            writeFileSync(join(dir, p, f), "export async function POST() {}\n");
        }
        assert.equal(appDirOf(dir), join(dir, "app"), "루트 `app/` 을 안 골랐다 — Next 와 순서가 다르다");
        assert.deepEqual(derivedRoutes(appDirOf(dir)), ["/images/upload"]);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test("`src` 가 트리 밖 심링크면 따라가지 않고 **판정 불능**으로 낸다", async () => {
    // 따라가면 검사기가 링크가 가리킨 디렉터리를 훑고, **그 파일명이 반려문에 실린다** —
    // 러너는 반려문을 개발자에게 그대로 전달하라고 지시하므로 반출 경로까지 이어진다.
    const {sourceRoot} = await import("./routes.mjs");
    const victim = mkdtempSync(join(tmpdir(), "victim-"));
    const dir = mkdtempSync(join(tmpdir(), "srclink-"));
    try {
        writeFileSync(join(victim, "ROSTER.ts"), "export const x = 1;\n");
        symlinkSync(victim, join(dir, "src"));
        const {dir: picked, reason} = sourceRoot(dir);
        assert.equal(picked, null, "심링크를 따라갔다 — 검수자 트리가 검사 대상이 된다");
        assert.match(reason, /심링크/);
    } finally {
        rmSync(dir, {recursive: true, force: true});
        rmSync(victim, {recursive: true, force: true});
    }
});

test("`app` 이 심링크면 라우트 도출을 하지 않는다 — 걷기는 막혀도 **뿌리는 넘어간다**", async () => {
    const {appDirOf, derivedRoutes} = await import("./routes.mjs");
    const victim = mkdtempSync(join(tmpdir(), "victim-app-"));
    const dir = mkdtempSync(join(tmpdir(), "applink-"));
    try {
        mkdirSync(join(victim, "secret-tenant"), {recursive: true});
        writeFileSync(join(victim, "secret-tenant", "page.tsx"), "export default function P() {}\n");
        symlinkSync(victim, join(dir, "app"));
        assert.equal(appDirOf(dir), null, "심링크 `app` 을 골랐다 — 트리 밖이 도출 대상이 된다");
        assert.equal(derivedRoutes(appDirOf(dir)), null, "판정 불능으로 안 떨어졌다");
    } finally {
        rmSync(dir, {recursive: true, force: true});
        rmSync(victim, {recursive: true, force: true});
    }
});

test("통제군 — 심링크가 아닌 정상 배치는 두 판정 다 통과한다", async () => {
    const {sourceRoot, appDirOf} = await import("./routes.mjs");
    await withFixture({}, (d) => {
        assert.equal(sourceRoot(d).dir, join(d, "src"));
        assert.equal(sourceRoot(d).reason, null);
        assert.equal(appDirOf(d), join(d, "src", "app"));
    });
});

test("루트 `app/` 배치에서도 도출한다 — 그 트리에서 CI 가 영구 적색이 되지 않게", async () => {
    await withFixture({appAt: "app"}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
    });
});

test("`app` 이 없으면 통과가 아니라 **판정 불능**이다", async () => {
    await withFixture({routes: []}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 2, out);
        assert.match(out, /통과가 아닙니다/);
    });
});
