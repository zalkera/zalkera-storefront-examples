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
import {existsSync, readFileSync, readdirSync} from "node:fs";
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

/** 이 시험 파일 옆의 `../app/layout.tsx` 와, 레포 루트에서 찾은 프리셋 사본 전부. */
function layoutSources(): {label: string; source: string}[] {
    const here = dirname(fileURLToPath(import.meta.url));
    const found: {label: string; source: string}[] = [];
    const own = join(here, "..", "app", "layout.tsx");
    if (existsSync(own)) found.push({label: "src/app/layout.tsx", source: readFileSync(own, "utf8")});
    // 고객 zip 에는 `presets/` 가 없다 — 없으면 조용히 건너뛴다(결여를 실패로 만들지 않는다).
    const presets = join(here, "..", "..", "..", "presets");
    if (existsSync(presets)) {
        for (const code of readdirSync(presets)) {
            const f = join(presets, code, "src", "app", "layout.tsx");
            if (existsSync(f))
                found.push({label: `presets/${code}/src/app/layout.tsx`, source: readFileSync(f, "utf8")});
        }
    }
    return found;
}

test("루트 layout 이 실제로 siteVerification() 을 metadata 에 싣는다", () => {
    // 함수가 완벽해도 **아무도 안 부르면** 태그가 안 나간다. 시험이 함수만 잠그면 그 형상이 그물 밖이다.
    // `NEXT_PUBLIC_*` 는 빌드 시 리터럴로 치환되므로 런타임 주입으로는 못 잰다 — 소스를 구문으로 본다
    // (`preview.test.ts` 와 같은 이유·같은 방식).
    const sources = layoutSources();
    assert.ok(sources.length > 0, "layout.tsx 를 하나도 못 찾았다 — 시험이 아무것도 안 재고 있다");
    for (const {label, source} of sources) {
        assert.match(
            source,
            /import\s*\{[^}]*\bsiteVerification\b[^}]*\}\s*from\s*"@\/lib\/site"/,
            `${label}: siteVerification 를 import 하지 않는다`,
        );
        assert.match(
            source,
            /\bverification:\s*siteVerification\(\)/,
            `${label}: metadata.verification 에 배선되지 않았다`,
        );
    }
});
