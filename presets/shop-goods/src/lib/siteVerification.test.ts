/**
 * **소유확인 메타가 실제로 무엇을 내는가.**
 *
 * ■ 왜 생겼나
 *   이 배선이 조용히 죽으면 테넌트는 콘솔에 값을 넣고 재빌드까지 기다린 뒤 **각 도구에서 「확인
 *   실패」만** 본다 — 화면은 멀쩡하고 로그도 조용하다. 그래서 「값이 있으면 나온다」와 「없으면
 *   안 나온다」를 **둘 다** 잰다: 앞쪽만 재면 항상 태그를 내는 코드가 통과하고, 뒤쪽만 재면
 *   아무것도 안 내는 코드가 통과한다.
 *
 * ■ 입력이 아니라 **반환한 형상**을 본다
 *   `process.env` 를 세는 것으로는 못 잰다 — 읽어 놓고 버리는 코드가 초록이 된다.
 *   여기서는 함수를 실제로 부르고 나온 객체의 키·값을 확인한다.
 *
 * 재현: `npm test`
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import {inspect} from "node:util";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {siteVerification} from "./site.ts";

const NAMES = [
    "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
    "NEXT_PUBLIC_NAVER_SITE_VERIFICATION",
    "NEXT_PUBLIC_BING_SITE_VERIFICATION",
] as const;

/** 세 이름을 지운 상태에서 주어진 것만 세팅하고 부른다 — 남은 env 가 옆 시험을 오염시키지 않는다. */
function withEnv(values: Partial<Record<(typeof NAMES)[number], string>>) {
    const saved = NAMES.map((n) => [n, process.env[n]] as const);
    for (const n of NAMES) delete process.env[n];
    for (const [n, v] of Object.entries(values)) process.env[n] = v;
    try {
        return siteVerification();
    } finally {
        for (const [n, v] of saved) {
            if (v === undefined) delete process.env[n];
            else process.env[n] = v;
        }
    }
}

test("셋 다 비면 verification 키 자체가 없다", () => {
    assert.equal(withEnv({}), undefined);
    // 빈 문자열·공백만도 「없음」이다 — 빈 content 는 각 도구의 검증에서 실패로 잡힌다.
    assert.equal(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "   "}), undefined);
});

test("구글 토큰은 verification.google 로 나간다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gtok"}), {google: "gtok"});
});

test("네이버·Bing 은 각 도구가 정한 meta 이름으로 나간다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok"}), {
        other: {"naver-site-verification": "ntok"},
    });
    // Bing 은 `bing-site-verification` 이 아니다 — 이름을 틀리면 태그는 나가고 확인은 안 된다.
    assert.deepEqual(withEnv({NEXT_PUBLIC_BING_SITE_VERIFICATION: "btok"}), {
        other: {"msvalidate.01": "btok"},
    });
});

test("셋을 같이 넣으면 셋 다 나간다 — 하나가 다른 것을 가리지 않는다", () => {
    assert.deepEqual(
        withEnv({
            NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gtok",
            NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok",
            NEXT_PUBLIC_BING_SITE_VERIFICATION: "btok",
        }),
        {google: "gtok", other: {"naver-site-verification": "ntok", "msvalidate.01": "btok"}},
    );
});

test("앞뒤 공백은 벗긴다 — 붙여넣기가 흔하다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "  gtok\n"}), {google: "gtok"});
});

test("메타 태그 전문을 넣으면 버린다 — 값이 틀린 태그보다 없는 태그가 낫다", () => {
    const pasted = '<meta name="google-site-verification" content="gtok" />';
    assert.equal(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: pasted}), undefined);
    // 한 값이 나빠도 나머지는 산다 — 하나 때문에 셋이 같이 죽으면 원인이 안 보인다.
    assert.deepEqual(
        withEnv({
            NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: pasted,
            NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok",
        }),
        {other: {"naver-site-verification": "ntok"}},
    );
});

test("꺾쇠 없이 내부 공백만 있어도 버린다 — 토큰에 공백은 없다", () => {
    // 가드는 `/[<>\s]/` 다. 붙여넣기 시험은 `<` 로 잡히고 trim 시험은 `trim()` 이 먼저 먹으므로,
    // `\s` 절을 잠그려면 **꺾쇠 없이 내부 공백만 있는** 값이 따로 필요하다.
    assert.equal(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gtok abc"}), undefined);
    // ⚠ 가드가 잡지 못하는 것: `content="btok"` 처럼 **공백 없는 부분 붙여넣기**는 통과한다.
    //   `=` 를 가드에 더하면 구글 토큰의 `=` 패딩을 오탐하므로 일부러 두지 않았다.
    //   이 시험은 그 사실을 못 박는다 — 나중에 가드를 넓히면 여기가 먼저 빨개진다.
    assert.deepEqual(withEnv({NEXT_PUBLIC_BING_SITE_VERIFICATION: 'content="btok"'}), {
        other: {"msvalidate.01": 'content="btok"'},
    });
});

test("경고는 env 이름당 한 번만, 값은 싣지 않는다", () => {
    const lines: string[] = [];
    const saved = console.warn;
    console.warn = (...args: unknown[]) => void lines.push(args.join(" "));
    try {
        // 같은 프로세스에서 여러 번 불러도(동적 라우트는 요청마다 돈다) 줄이 늘지 않아야 한다.
        for (let i = 0; i < 5; i += 1) withEnv({NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "<meta n>"});
    } finally {
        console.warn = saved;
    }
    assert.equal(lines.length, 1, `요청마다 경고가 늘면 로그가 폭주한다 — ${lines.length}줄`);
    assert.match(lines[0], /NEXT_PUBLIC_NAVER_SITE_VERIFICATION/);
    // 토큰이 로그로 새면 안 된다 — env 이름만 남긴다.
    assert.ok(!lines[0].includes("<meta n>"), "경고에 값이 실렸다");
});

/**
 * `dir` 아래에서 **`<html>` 을 여는 레이아웃** 파일들.
 *
 * Next 의 규칙 그대로다 — `app/` 에서 페이지로 내려가며 **처음 만나는 `layout`** 이 그 경로의
 * 루트 레이아웃이다. 근거는 `next-app-loader` 의 `if (!rootLayout) rootLayout = layoutPath` 한 줄이고,
 * 그 자리는 세그먼트가 라우트 그룹인지도 깊이가 몇인지도 보지 않는다.
 * 파일 이름은 `layout.<pageExtensions>` 다 — 기본값 `tsx`·`ts`·`jsx`·`js` 를 그 순서로 찾는다.
 *
 * 그래서 **루트 레이아웃은 하나가 아닐 수 있다.** 시안 한 장을 옮기는 팩은 시안 CSS 와 시작 팩
 * Tailwind 를 한 문서에 둘 수 없어 `src/app/(landing)`·`(template)` 로 문서를 가르고 루트
 * `layout.tsx` 를 두지 않는다(`docs/mockup-to-pack.md` §2-1 ⑵). 그때는 그 둘이 각각 문서를 연다.
 *
 * ⚠ **세 겹까지만 내려간다** — 형제 `reservedSegments.test.ts` 와 같은 한계다. 그보다 깊게
 *   중첩된 레이아웃은 이 시험이 못 본다.
 * ⚠ **심링크를 따라간다**(`statSync`). 형제 `reservedSegments.test.ts` 와 같은 처리다.
 *   `lstatSync` 는 **마지막 성분만** 안 따라가므로 둘의 차이는 두 자리에서만 난다 —
 *   레이아웃 «파일» 자체가 심링크일 때와, 심링크 «폴더»를 재귀로 내려갈 때. 아래 픽스처가
 *   그 둘을 각각 잰다(폴더 심링크 아래 레이아웃을 바로 묻는 형상은 `lstat` 으로도 통과한다).
 *   여기서 심링크를 «막아» 봐야 지키는 것이 없다: 이 파일은 검수 도구가 아니라 **팩이 싣고 나가는
 *   것**이고, `scripts/lib/floor-gate.mjs` 가 **그 트리의** 시험을 그대로 실행한다. 즉 시험 본문을
 *   쓰는 주체와 트리를 쓰는 주체가 같다. 신뢰 밖 아티팩트에 대한 방어는 러너가 **자기 사본**으로
 *   도는 검사기(`gate-behavior.mjs`·`content-routes.mjs`)와 검수자의 격리가 진다.
 */
const MAX_DEPTH = 3;
/** Next 의 `pageExtensions` 기본값 그대로. `layout.tsx` 만 보면 `layout.js` 루트를 통째로 놓친다. */
const LAYOUT_EXTS = ["tsx", "ts", "jsx", "js"];
function statOf(path: string): {isDir: boolean; isFile: boolean} {
    try {
        const st = statSync(path);
        return {isDir: st.isDirectory(), isFile: st.isFile()};
    } catch {
        // 끊어진 심링크·ELOOP·권한 — 없는 것으로 친다. 여기서 던지면 판정이 아니라 크래시다.
        return {isDir: false, isFile: false};
    }
}
/** `dir` 자신의 레이아웃 파일. Next 와 같은 순서로 먼저 맞는 것을 쓴다. */
function layoutFileIn(dir: string): string | null {
    for (const ext of LAYOUT_EXTS) {
        const f = join(dir, `layout.${ext}`);
        // `existsSync` 로 물으면 `layout.tsx/` 디렉터리도 참이라 뒤에서 `readFileSync` 가 EISDIR 로 죽는다.
        if (statOf(f).isFile) return f;
    }
    return null;
}
function rootLayoutFilesIn(dir: string, depth = 0): string[] {
    const own = layoutFileIn(dir);
    if (own !== null) return [own];
    if (depth >= MAX_DEPTH || !statOf(dir).isDir) return [];
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        // `_` 는 Next 규칙이다(`route-discovery` 의 `ignorePartFilter` 가 걷는다).
        // `@`(병렬 슬롯)는 **우리 선택**이다 — 조상 레이아웃이 없으면 슬롯이 루트가 될 수는 있으나
        // 스토어프론트에 그 형상이 없고, 세면 슬롯마다 배선을 요구하게 된다.
        if (name.startsWith("_") || name.startsWith("@")) continue;
        // 하위가 파일이면 다음 재귀의 `statOf(dir).isDir` 이 걷는다 — 여기서 또 묻지 않는다.
        out.push(...rootLayoutFilesIn(join(dir, name), depth + 1));
    }
    return out;
}

/**
 * 위 스캔의 픽스처. **정본 레포에는 루트 레이아웃이 하나뿐**이라 나머지 가지가 한 번도 안 돈다 —
 * 그물 없이 두면 지워도 초록이라, 합성 트리로 여기서 잠근다.
 */
const madeDirs: string[] = [];
process.on("exit", () => {
    for (const d of madeDirs.splice(0)) {
        // 정리 실패가 시험 결과를 뒤집으면 안 된다 — exit 핸들러에서 던지면 rc 가 바뀌어
        // 호출부(`scripts/lib/floor-gate.mjs`)가 「시험이 실패했다」고 **틀린 사유**를 낸다.
        try {
            rmSync(d, {recursive: true, force: true});
        } catch {
            /* 남은 임시 디렉터리는 OS 가 걷는다 */
        }
    }
});
/** `files` 를 담은 합성 `src/app`. 빈 배열이면 `app` 자체를 안 만든다. */
function appTree(files: string[]): string {
    const root = mkdtempSync(join(tmpdir(), "zalkera-rootlayout-"));
    madeDirs.push(root);
    const app = join(root, "app");
    for (const rel of files) {
        const full = join(app, rel);
        mkdirSync(dirname(full), {recursive: true});
        writeFileSync(full, "export default function L() {}\n");
    }
    return app;
}
const relNames = (app: string) =>
    rootLayoutFilesIn(app)
        .map((f) => f.slice(app.length + 1))
        .sort();

test("루트 레이아웃 하나짜리 트리 — 그것 하나를 센다", () => {
    assert.deepEqual(relNames(appTree(["layout.tsx"])), ["layout.tsx"]);
});

test("라우트 그룹이 루트 레이아웃을 나눠 가지면 둘 다 센다 — 시안 레인의 형상", () => {
    // 이 형상에서 루트 `layout.tsx` 는 **없는 것이 정상**이다. 루트만 보고 그룹을 안 세면
    // 0개가 나와 아래 「하나도 못 찾았다」 단언이 터지고, 멀쩡한 팩이 반려된다.
    const app = appTree(["(landing)/layout.tsx", "(template)/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(landing)/layout.tsx", "(template)/layout.tsx"]);
});

test("루트가 있으면 더 안 내려간다 — 그 아래는 전부 중첩 레이아웃이다", () => {
    const app = appTree(["layout.tsx", "(marketing)/layout.tsx", "blog/layout.tsx"]);
    assert.deepEqual(relNames(app), ["layout.tsx"]);
});

test("문서를 연 레이아웃 아래로는 안 내려간다", () => {
    const app = appTree(["(shop)/layout.tsx", "(shop)/cart/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(shop)/layout.tsx"]);
});

test("중첩 라우트 그룹의 레이아웃도 문서를 연다", () => {
    // Next 는 처음 만나는 `layout` 을 루트로 잡는다 — 깊이도 그룹 여부도 안 본다.
    const app = appTree(["(site)/(landing)/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(site)/(landing)/layout.tsx"]);
});

test("루트가 없으면 보통 디렉터리의 레이아웃도 문서를 연다", () => {
    // `blog/layout.tsx` 위에 아무 레이아웃도 없으면 `/blog` 아래 페이지의 루트 레이아웃이다.
    assert.deepEqual(relNames(appTree(["blog/layout.tsx"])), ["blog/layout.tsx"]);
});

test("사설 폴더(`_`)와 병렬 슬롯(`@`)은 문서를 열지 않는다", () => {
    const app = appTree(["_internal/layout.tsx", "@modal/layout.tsx", "(landing)/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(landing)/layout.tsx"]);
});

test("레이아웃이 하나도 없으면 빈 목록 — 던지지 않는다", () => {
    assert.deepEqual(relNames(appTree(["(empty)/page.tsx"])), []);
    assert.deepEqual(relNames(appTree([])), []);
});

test("`layout.js` 도 루트 레이아웃이다 — Next 의 pageExtensions 기본값", () => {
    // `layout.tsx` 만 보면 진짜 루트를 놓치고, 재귀가 그 아래 중첩 레이아웃을 끌어와
    // **틀린 사유로** 반려한다. 종전 규칙은 그 자리에서 「하나도 못 찾았다」로 정직하게 죽었다.
    assert.deepEqual(relNames(appTree(["layout.js", "blog/layout.tsx"])), ["layout.js"]);
    assert.deepEqual(relNames(appTree(["(landing)/layout.jsx"])), ["(landing)/layout.jsx"]);
});

test("`layout.tsx` 라는 이름의 디렉터리는 레이아웃이 아니다", () => {
    // `existsSync` 로 물으면 참이 되고, 뒤에서 `readFileSync` 가 EISDIR 로 죽어 사유가 틀린 반려가 된다.
    const app = appTree(["layout.tsx/inner.txt", "(landing)/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(landing)/layout.tsx"]);
});

test("심링크 너머의 레이아웃도 센다 — 따라가는 것이 성질이다", () => {
    // 이 파일은 검수 도구가 아니라 팩이 싣고 나가는 것이라 심링크를 막아도 지키는 것이 없다.
    // 정책이 「따라간다」이므로 부정이 아니라 **양성**으로 잰다.
    //
    // ⚠ `lstat` 은 **마지막 성분만** 안 따라간다 — 폴더 심링크 아래 레이아웃을 «바로» 묻는
    //   형상은 `lstat` 으로도 통과하므로 그것만 두면 이 성질이 안 잠긴다. 두 자리를 다 잰다.
    const outside = mkdtempSync(join(tmpdir(), "zalkera-rootlayout-outside-"));
    madeDirs.push(outside);
    mkdirSync(join(outside, "deep", "inner"), {recursive: true});
    writeFileSync(join(outside, "deep", "inner", "layout.tsx"), "export default function L() {}\n");
    writeFileSync(join(outside, "lone.tsx"), "export default function L() {}\n");

    // ⑴ 레이아웃 «파일»이 심링크 — `lstatSync(...).isFile` 은 여기서 false 다.
    const one = appTree(["(direct)/page.tsx"]);
    symlinkSync(join(outside, "lone.tsx"), join(one, "(direct)", "layout.tsx"));
    assert.deepEqual(relNames(one), ["(direct)/layout.tsx"]);

    // ⑵ 심링크 «폴더»를 재귀로 내려간다 — `statOf(dir).isDir` 이 실제로 걸리는 자리다.
    const two = appTree(["(other)/page.tsx"]);
    symlinkSync(join(outside, "deep"), join(two, "(linked)"), "dir");
    assert.deepEqual(relNames(two), ["(linked)/inner/layout.tsx"]);
});

test("세 겹보다 깊은 레이아웃은 못 본다 — 알고 있는 한계다", () => {
    assert.deepEqual(relNames(appTree(["a/b/c/d/layout.tsx"])), []);
    assert.deepEqual(relNames(appTree(["a/b/c/layout.tsx"])), ["a/b/c/layout.tsx"]);
});

/**
 * 이 시험 파일 옆의 루트 레이아웃 전부와, **정본 레포일 때만** 프리셋 사본 전부.
 *
 * `appDirOverride` 는 **픽스처 전용**이다 — 아래 「호출부까지 잠근다」 시험이 합성 트리를
 * 물려 이 조립이 실제로 위 스캔을 쓰는지 잰다. 그 인자를 주면 정본 프리셋은 훑지 않는다.
 *
 * 정본 판별은 `scripts/pack-preset.mjs` 의 존재로 한다(`ci.yml` 이 쓰는 것과 같은 표식) —
 * 그 파일은 고객 zip 에 구조적으로 안 실린다. 홉 수를 세지 않고 **위로 훑어 찾는다**:
 * `join(here, "..", "..")` 처럼 칸을 세면 한 칸 틀렸을 때 그냥 「없음」이 되어 조용히 건너뛴다.
 *
 * ⚠ 여기서 「정본이면 N벌이어야 한다」를 단언하지 않는다 — 그 조건절은 표식을 깨는 것으로 꺼진다.
 *   5벌 강제는 배송되지 않는 `scripts/lib/seoWiring.test.mjs` 가 **조건 없이** 진다.
 */
function layoutSources(appDirOverride?: string): {label: string; source: string}[] {
    const here = dirname(fileURLToPath(import.meta.url));
    const appDir = appDirOverride ?? join(here, "..", "app");
    const found: {label: string; source: string}[] = [];
    for (const file of rootLayoutFilesIn(appDir)) {
        found.push({label: `src/app/${file.slice(appDir.length + 1)}`, source: readFileSync(file, "utf8")});
    }
    if (appDirOverride !== undefined) return found;

    let dir = here;
    let canonicalRoot: string | null = null;
    for (let hop = 0; hop < 6; hop += 1) {
        if (existsSync(join(dir, "scripts", "pack-preset.mjs")) && existsSync(join(dir, "presets"))) {
            canonicalRoot = dir;
            break;
        }
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    if (canonicalRoot !== null) {
        const presets = join(canonicalRoot, "presets");
        for (const code of readdirSync(presets)) {
            // 프리셋도 **같은 스캔**을 쓴다 — 여기만 `src/app/layout.tsx` 로 고정하면 프리셋이
            // 문서를 가르는 날 이 가지가 조용히 0벌을 넣는다.
            const presetApp = join(presets, code, "src", "app");
            for (const file of rootLayoutFilesIn(presetApp)) {
                found.push({
                    label: `presets/${code}/src/app/${file.slice(presetApp.length + 1)}`,
                    source: readFileSync(file, "utf8"),
                });
            }
        }
    }
    return found;
}

test("layoutSources 가 그룹 레이아웃을 실제로 집어 온다 — 호출부까지 잠근다", () => {
    // 스캔만 잠그면 조립부에서 다시 좁혀도(예: 루트만 걸러내도) 정본은 그룹이 0개라 초록이다.
    const app = appTree(["(landing)/layout.tsx", "(template)/layout.tsx"]);
    const got = layoutSources(app);
    assert.deepEqual(got.map((s) => s.label).sort(), ["src/app/(landing)/layout.tsx", "src/app/(template)/layout.tsx"]);
    assert.ok(
        got.every((s) => s.source.includes("export default")),
        "원문을 못 읽었다",
    );
});

const IMPORTS_HELPER = /import\s*\{[^}]*\bsiteVerification\b[^}]*\}\s*from\s*"@\/lib\/site"/;
const WIRES_METADATA = /\bverification:\s*siteVerification\(\)/;
/**
 * 배선 판정 한 자리. **`assert.match` 를 쓰지 않는다** — 실패하면 `actual` 에 파일 원문이 담겨
 * 반려문으로 나간다. `assert.ok(RE.test(...))` 는 `actual` 이 `false` 다(아래 시험이 잠근다).
 */
function assertWired(label: string, source: string): void {
    assert.ok(IMPORTS_HELPER.test(source), `${label}: siteVerification 를 import 하지 않는다`);
    assert.ok(WIRES_METADATA.test(source), `${label}: metadata.verification 에 배선되지 않았다`);
}

test("루트 layout 이 실제로 siteVerification() 을 metadata 에 싣는다", () => {
    // 함수가 완벽해도 **아무도 안 부르면** 태그가 안 나간다. 시험이 함수만 잠그면 그 형상이 그물 밖이다.
    // `NEXT_PUBLIC_*` 는 빌드 시 리터럴로 치환되므로 런타임 주입으로는 못 잰다 — 소스를 구문으로 본다
    // (`preview.test.ts` 와 같은 이유·같은 방식).
    const sources = layoutSources();
    assert.ok(sources.length > 0, "루트 레이아웃을 하나도 못 찾았다 — 시험이 아무것도 안 재고 있다");
    for (const {label, source} of sources) assertWired(label, source);
});

test("배선 판정이 실패해도 파일 원문이 오류에 안 실린다", () => {
    // `assert.match(source, RE, msg)` 로 되돌리면 `actual` 에 **파일 원문**이 담기고,
    // `scripts/verify-zip.mjs` 가 그 꼬리를 떠서 반려문에 싣는다. 주석으로만 적어 두면
    // 되돌려도 초록이라, 여기서 행위로 잠근다.
    const sentinel = "SENTINEL_이_문자열이_새면_안_된다";
    // ⚠ **두 단언을 각각 지나가야 한다.** 첫 단언에서만 실패시키면 둘째를 `assert.match` 로
    //   되돌려도 초록이다(실제로 그렇게 새어 이 주석이 생겼다).
    const probes: [string, string][] = [
        ["import 판정", sentinel],
        ["배선 판정", `import {siteVerification} from "@/lib/site";\n${sentinel}`],
    ];
    for (const [which, source] of probes) {
        let caught: (Error & {actual?: unknown}) | undefined;
        try {
            assertWired("probe", source);
        } catch (e) {
            caught = e as Error & {actual?: unknown};
        }
        assert.ok(caught, `${which}: 배선이 없는 원문인데 판정이 통과했다`);
        assert.notEqual(typeof caught.actual, "string", `${which}: 실패 오류의 actual 에 원문이 실렸다`);
        assert.ok(!inspect(caught).includes(sentinel), `${which}: 실패 오류를 찍으면 원문이 나온다`);
    }
});
