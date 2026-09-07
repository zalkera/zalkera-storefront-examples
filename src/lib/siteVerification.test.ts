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
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
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
 * 신뢰 밖 트리에서도 도는 시험이라 **심링크를 따라가지 않는다.** 표적을 물으면 검수자
 * 파일시스템에 대한 존재 오라클이 되고, 읽으면 그 내용이 반려문으로 나간다
 * (`scripts/lib/routes.mjs` 머리말·`scripts/verify-zip.mjs` 의 lstat 봉쇄와 같은 판단).
 * 그 대가로 **심링크 뒤에 숨긴 레이아웃은 세지 않는다** — 아래 픽스처가 그 성질을 못 박는다.
 */
function realFile(path: string): boolean {
    try {
        return lstatSync(path).isFile();
    } catch {
        return false;
    }
}
function realDir(path: string): boolean {
    try {
        return lstatSync(path).isDirectory();
    } catch {
        return false;
    }
}

/** 라우트 그룹 판별 — 형제 그물과 **같은 식**이다(`scripts/lib/routes.mjs`·`reservedSegments.test.ts`). */
const GROUP_DIR = /^\(.*\)$/;

/**
 * `appDir`(= `src/app`) 에서 **`<html>` 을 여는 레이아웃** 파일 경로.
 *
 * 루트 `layout.tsx` 가 있으면 **그것 하나다.** 그때 라우트 그룹의 `layout.tsx` 는 중첩
 * 레이아웃이라 `<html>` 을 열지 않는다(`docs/mockup-to-pack.md` §2-1 ⑵) — 거기까지 배선을
 * 요구하면 조직용 그룹을 쓰는 보통의 트리가 거짓 적색을 낸다.
 *
 * 루트가 없으면 **문서를 가른 것**이다. 시안 한 장을 옮기는 팩은 시안 CSS 와 시작 팩
 * Tailwind 를 한 문서에 둘 수 없어 `(landing)`·`(template)` 로 가르고 루트를 두지 않는다.
 * 그때는 `src/app` **직속** 그룹들이 각각 문서를 여니 전부 센다.
 */
function rootLayoutFilesIn(appDir: string): string[] {
    // `src/app` 자체가 심링크면 여기서 멈춘다 — 순서가 뒤면 아래 루트 파일 검사가 먼저
    // 통과해 트리 밖을 읽는다(`lstat` 은 **마지막 성분**만 안 따라간다).
    if (!realDir(appDir)) return [];
    const own = join(appDir, "layout.tsx");
    if (realFile(own)) return [own];
    const out: string[] = [];
    for (const entry of readdirSync(appDir, {withFileTypes: true})) {
        // dirent 의 `isDirectory()` 는 lstat 의미다 — 심링크 디렉터리에 false 이고, 그것이 위 정책이다.
        if (!entry.isDirectory() || !GROUP_DIR.test(entry.name)) continue;
        const f = join(appDir, entry.name, "layout.tsx");
        if (realFile(f)) out.push(f);
    }
    return out;
}

/**
 * 위 스캔의 픽스처. **정본 레포에는 라우트 그룹이 없어** 새 가지가 한 번도 안 돈다 —
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

test("루트가 있으면 그룹의 레이아웃은 중첩이라 안 센다", () => {
    // 조직용 라우트 그룹은 보통의 구성이다. 중첩 레이아웃에까지 배선을 요구하면 거짓 적색이 난다.
    const app = appTree(["layout.tsx", "(marketing)/layout.tsx"]);
    assert.deepEqual(relNames(app), ["layout.tsx"]);
});

test("레이아웃이 없는 그룹은 안 센다", () => {
    assert.deepEqual(relNames(appTree(["(empty)/page.tsx"])), []);
});

test("그룹 안쪽의 중첩 레이아웃은 안 센다 — `<html>` 을 열지 않는다", () => {
    const app = appTree(["(shop)/layout.tsx", "(shop)/cart/layout.tsx"]);
    assert.deepEqual(relNames(app), ["(shop)/layout.tsx"]);
});

test("그룹이 아닌 보통 디렉터리의 레이아웃은 안 센다", () => {
    assert.deepEqual(relNames(appTree(["blog/layout.tsx"])), []);
});

test("인터셉트 라우트는 그룹이 아니다 — 여는 괄호만 보지 않는다", () => {
    // `(.)photo`·`(..)photo` 는 URL 세그먼트다. 여는 괄호만 보면 그룹으로 오인해 거짓 적색이 난다.
    assert.deepEqual(relNames(appTree(["(.)photo/layout.tsx", "(..)photo/layout.tsx"])), []);
});

test("`src/app` 이 없으면 빈 목록 — 던지지 않는다", () => {
    assert.deepEqual(relNames(appTree([])), []);
});

test("`src/app` 자체가 심링크면 훑지 않는다", () => {
    // 이 갈래를 안 막으면 신뢰 밖 zip 이 `src/app` 을 검수자 트리로 걸어 **트리 밖 디렉터리를
    // 열거**시킬 수 있다(`scripts/lib/routes.mjs` 머리말의 위협모델).
    const outside = mkdtempSync(join(tmpdir(), "zalkera-rootlayout-outside-"));
    madeDirs.push(outside);
    mkdirSync(join(outside, "app", "(g)"), {recursive: true});
    writeFileSync(join(outside, "app", "layout.tsx"), "export default function L() {}\n");
    writeFileSync(join(outside, "app", "(g)", "layout.tsx"), "export default function L() {}\n");
    const root = mkdtempSync(join(tmpdir(), "zalkera-rootlayout-"));
    madeDirs.push(root);
    symlinkSync(join(outside, "app"), join(root, "app"), "dir");
    assert.deepEqual(rootLayoutFilesIn(join(root, "app")), []);
});

test("심링크는 따라가지 않는다 — 디렉터리도 파일도", () => {
    // 신뢰 밖 트리가 표적을 고르게 두면 존재 오라클이 된다(위 `realFile` 머리말).
    const app = appTree(["(real)/layout.tsx"]);
    const outside = mkdtempSync(join(tmpdir(), "zalkera-rootlayout-outside-"));
    madeDirs.push(outside);
    mkdirSync(join(outside, "group"));
    writeFileSync(join(outside, "group", "layout.tsx"), "export default function L() {}\n");
    symlinkSync(join(outside, "group"), join(app, "(linkdir)"), "dir");
    mkdirSync(join(app, "(linkfile)"));
    symlinkSync(join(outside, "group", "layout.tsx"), join(app, "(linkfile)", "layout.tsx"));
    assert.deepEqual(relNames(app), ["(real)/layout.tsx"]);
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
            const f = join(presets, code, "src", "app", "layout.tsx");
            if (existsSync(f))
                found.push({label: `presets/${code}/src/app/layout.tsx`, source: readFileSync(f, "utf8")});
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

/** 배선 판정 — `assert.match` 를 쓰면 실패 시 `actual` 에 **파일 원문**이 실려 반려문으로 나간다. */
const IMPORTS_HELPER = /import\s*\{[^}]*\bsiteVerification\b[^}]*\}\s*from\s*"@\/lib\/site"/;
const WIRES_METADATA = /\bverification:\s*siteVerification\(\)/;

test("루트 layout 이 실제로 siteVerification() 을 metadata 에 싣는다", () => {
    // 함수가 완벽해도 **아무도 안 부르면** 태그가 안 나간다. 시험이 함수만 잠그면 그 형상이 그물 밖이다.
    // `NEXT_PUBLIC_*` 는 빌드 시 리터럴로 치환되므로 런타임 주입으로는 못 잰다 — 소스를 구문으로 본다
    // (`preview.test.ts` 와 같은 이유·같은 방식).
    const sources = layoutSources();
    assert.ok(sources.length > 0, "layout.tsx 를 하나도 못 찾았다 — 시험이 아무것도 안 재고 있다");
    for (const {label, source} of sources) {
        assert.ok(IMPORTS_HELPER.test(source), `${label}: siteVerification 를 import 하지 않는다`);
        assert.ok(WIRES_METADATA.test(source), `${label}: metadata.verification 에 배선되지 않았다`);
    }
});
