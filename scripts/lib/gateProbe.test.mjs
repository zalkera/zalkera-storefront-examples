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
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
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

function withFixture(opts, fn) {
    const dir = fixture(opts);
    try {
        return fn(dir);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

test("배송 matcher 는 이 트리를 전부 덮는다 — 양성 통제", () => {
    withFixture({}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
        assert.match(out, /전부 덮임/);
    });
});

test("matcher 를 `/api/:path*` 로 좁히면 페이지가 관문 밖이 된다", () => {
    withFixture({regexp: String.raw`^\/api(?:\/(.*))?$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /관문 밖입니다/);
    });
});

test("확장자로 가르면 점 든 동적 세그먼트가 관문 밖이 된다", () => {
    withFixture({regexp: String.raw`^\/((?!_next\/static|.*\.[A-Za-z0-9]+$).*)$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /7\.0|logo|a\.b/);
    });
});

test("실재 라우트의 접두를 빼면 그 라우트를 지목해 반려한다", () => {
    withFixture({regexp: String.raw`^\/((?!_next\/static|api\/cart).*)$`}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /\/api\/cart/);
    });
});

test("배제 접두 밑에 만든 쓰기 라우트를 잡는다", () => {
    withFixture({routes: [...ROUTES, "images/upload/route.ts"]}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
        assert.match(out, /\/images\/upload/);
    });
});

test("matcher 가 없으면 무엇을 덮는지 알 수 없다고 반려한다", () => {
    withFixture({regexp: null}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 1, out);
    });
});

test("특수 세그먼트에서 도출이 깨지지 않는다", () => {
    const routes = [
        "page.tsx",
        "(marketing)/deals/page.tsx", // 라우트 그룹 — URL 에 안 나온다
        "@modal/preview/page.tsx", // 병렬 라우트 — 독립 주소가 아니다
        "_internal/helper/page.tsx", // 사설 폴더 — 라우팅 대상이 아니다
        "docs/[[...all]]/page.tsx",
        "files/[...path]/route.ts",
    ];
    withFixture({routes}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
        // `@`·`_` 는 빠지고 그룹은 URL 에서 사라진다 — `/`·`/deals`·`/docs/…`·`/files/…` 넷.
        assert.match(out, /도출한 4개/);
    });
});

test("루트 `app/` 배치에서도 도출한다 — 그 트리에서 CI 가 영구 적색이 되지 않게", () => {
    withFixture({appAt: "app"}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 0, out);
    });
});

test("`app` 이 없으면 통과가 아니라 **판정 불능**이다", () => {
    withFixture({routes: []}, (d) => {
        const {rc, out} = run(d);
        assert.equal(rc, 2, out);
        assert.match(out, /통과가 아닙니다/);
    });
});
