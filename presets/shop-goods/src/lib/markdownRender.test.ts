import {strict as assert} from "node:assert";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import ts from "typescript";
import {INLINE_COST, parseInline, parseMarkdown} from "./markdown.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/**
 * 본문 렌더러를 **실제로 렌더해서** 잰다.
 *
 * ## 왜 이 파일이 있나
 *
 * `astGuards.test.ts` 는 주소가 **어느 함수에 묶였는가**(배선)를 본다. 그것이 못 보는 것이
 * 하나 있다 — **도달 불가**다. 이미지 갈래 맨 앞에 `return null` 을 넣으면 JSX 는 그대로 남아
 * 배선 문자열이 안 바뀌고, 그 팩만 본문 그림이 통째로 사라지는데 전 게이트가 초록이다
 * 재현: 이미지 갈래 맨 앞에 `if (true) return null;` 을 심고 두 시험을 견주면
 * `astGuards` 는 **0건 red**, 이 파일은 **3건 red** 다 —
 * `node --experimental-strip-types --test src/lib/astGuards.test.ts src/lib/markdownRender.test.ts`
 *
 * ⚠ **「이 하네스로는 렌더 시험이 안 된다」는 한 판 적힌 거짓이다.** 러너가 `.test.ts` 만 잡고
 *   `--experimental-strip-types` 가 JSX 를 못 벗기는 것은 맞지만, `typescript`(이미 devDependency
 *   이고 `astGuards.test.ts` 가 쓴다)로 TSX 를 전사해 dynamic import 하면 `react-dom/server` 로
 *   렌더된다. 새 의존성 0 이다.
 *
 * 재현: `node --experimental-strip-types --test src/lib/markdownRender.test.ts; echo rc=$?` → rc=0
 */
/**
 * 전사한 모듈을 **한 번만** 만든다.
 *
 * ⚠ 호출마다 전사하면 같은 파일을 이 파일의 호출 수만큼 다시 컴파일한다 — 이 파일 소요의 절반
 *   가까이가 재전사였다.
 *
 * 재현: `compiled ??= compileMarkdown()` 을 `await compileMarkdown()` 으로 되돌리고
 * `time node --experimental-strip-types --test src/lib/markdownRender.test.ts` 를 견준다.
 */
let compiled: Promise<{Markdown: (props: {source: string}) => unknown}> | null = null;

async function renderMarkdown(source: string): Promise<string> {
    compiled ??= compileMarkdown();
    const [{Markdown}, {renderToStaticMarkup}, {createElement}] = await Promise.all([
        compiled,
        import("react-dom/server"),
        import("react"),
    ]);
    return renderToStaticMarkup(createElement(Markdown as never, {source}));
}

async function compileMarkdown() {
    // ⚠ **`/tmp` 에 쓰면 안 된다.** node 는 맨 지정자(`react`)를 **가져오는 파일 기준**으로 푼다 —
    //    레포 밖이면 `Cannot find package 'react'` 다. `node_modules/.cache` 아래면 해석이 레포
    //    `node_modules` 로 올라간다(그 디렉터리는 이미 무시 대상이다).
    const cache = resolve(SRC, "../node_modules/.cache");
    mkdirSync(cache, {recursive: true});
    const dir = mkdtempSync(join(cache, "zalkera-render-"));
    try {
        // `@/` 별칭은 번들러가 푸는 것이라 여기서 직접 절대경로로 바꾼다. 확장자도 붙인다 —
        // node ESM 은 확장자를 안 추론하고, 대상은 전부 `.ts`(JSX 없음)라 그대로 실행된다.
        const tsx = ts.sys.readFile(join(SRC, "components/Markdown.tsx"));
        assert.ok(tsx, "Markdown.tsx 를 못 읽었다 — 이 시험이 헛돈다");
        const resolved = tsx!.replace(
            /from "@\/([^"]+)"/g,
            (_m, rest: string) => `from "${SRC}/${rest}${rest.endsWith(".ts") ? "" : ".ts"}"`,
        );
        const js = ts.transpileModule(resolved, {
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
                allowImportingTsExtensions: true,
            },
        }).outputText;
        const file = join(dir, "Markdown.mjs");
        writeFileSync(file, js);
        return (await import(file)) as {Markdown: (props: {source: string}) => unknown};
    } finally {
        // 모듈은 이미 적재됐다 — 파일은 남길 이유가 없다.
        rmSync(dir, {recursive: true, force: true});
    }
}

test("🔴 우리 주소는 그림으로 그린다 — 이 갈래가 죽으면 본문 이미지가 통째로 사라진다", async () => {
    const html = await renderMarkdown("![제품 사진](media:12)");
    assert.match(html, /<img[^>]+src="\/media\/12"/, `본문 이미지가 안 그려졌다: ${html}`);
    assert.match(html, /alt="제품 사진"/, `alt 가 사라졌다 — 색인이 그것을 읽는다: ${html}`);
});

test("🔴 남의 호스트는 그림이 아니라 링크다 — `img src` 면 방문자 IP 가 제3자에게 간다", async () => {
    const html = await renderMarkdown("![캡션](https://cdn.example/a.png)");
    assert.doesNotMatch(html, /<img/, `외부 주소가 img 로 나갔다 — 방문자 브라우저가 그 호스트를 부른다: ${html}`);
    assert.match(html, /<a[^>]+href="https:\/\/cdn\.example\/a\.png"/, `링크로도 안 그렸다: ${html}`);
    assert.match(html, /rel="noopener noreferrer"/, `외부 링크에 rel 이 없다: ${html}`);
});

/**
 * ⚠ **파서가 http(s) 로 읽는 꼴은 전부 링크가 돼야 한다.** 문자 정규식으로 놓으면 이 넷이 그림도
 * 링크도 아닌 **아무것도 아닌 것**이 된다 — 저작기 미리보기에는 있고 사이트에는 없다.
 * 「안 그리면 저작자의 그림이 사라진다」가 이 트랜치의 근거 문장이므로, 그 문장을 참으로
 * 유지하는 것이 이 시험이다.
 *
 * 재현: `safeUrl.ts` 의 `externalHref` 를 `/^https?:\/\//i.test(sanitized) ? sanitized : null` 로
 * 되돌리고 `node --experimental-strip-types --test src/lib/markdownRender.test.ts` → 1건 red
 * (판정 소유자가 `bodyImageHref` 에서 그쪽으로 옮겼다)
 */
test("🔴 파서가 http(s) 로 읽는 꼴은 하나도 안 잃는다", async () => {
    for (const odd of [
        "https:cdn.example/a.png",
        "https:/cdn.example/a.png",
        "https:///cdn.example/a.png",
        "https://cdn.example/a.png",
    ]) {
        const html = await renderMarkdown(`![캡션](${odd})`);
        assert.match(
            html,
            /<a[^>]+href=/,
            `${JSON.stringify(odd)} 가 아무것도 안 그렸다 — 저작자의 그림이 사라진다: ${html}`,
        );
        assert.doesNotMatch(html, /<img/, `${JSON.stringify(odd)} 가 img 로 나갔다: ${html}`);
    }
});

/** **음성 짝** — 그림도 링크도 될 수 없는 것은 정말 아무것도 안 그린다(뜻 없는 링크를 안 세운다). */
test("이미지도 링크도 될 수 없는 주소는 아무것도 안 그린다", async () => {
    for (const junk of ["javascript:alert(1)", "#section-2", "?page=2", "mailto:a@b.co", "//evil.example/a.png"]) {
        const html = await renderMarkdown(`![캡션](${junk})`);
        assert.doesNotMatch(html, /<img/, `${JSON.stringify(junk)} 가 img 로 섰다: ${html}`);
        assert.doesNotMatch(html, /<a[^>]+href=/, `${JSON.stringify(junk)} 가 링크로 섰다: ${html}`);
    }
});

/**
 * 브라우저가 **요청을 내는** 속성 전부 — 태그 이름을 세지 않는다.
 *
 * ⚠ 「`<img>` 가 없다 · `<a>` 가 없다」로 재면 **다른 태그로 새면 그만**이다. `<div
 *   style="background-image:url(//evil.example/x.png)">` 는 방문자 조작 없이 그 호스트를 부르는데
 *   두 단언을 다 통과한다(심의가 프리셋 한 벌을 그렇게 바꿔 전 게이트를 초록으로 만들었다).
 *   그래서 **속성을 전수로** 훑는다.
 */
const REQUESTING_ATTRS =
    /\s(?:src|srcset|imagesrcset|poster|background|data|href|action|formaction|ping|style|srcdoc)\s*=\s*"([^"]*)"/gi;

/** 그 값 안에 우리 오리진 밖을 가리키는 것이 있는가 — `url(...)` 안쪽까지 본다. */
function offOriginRefs(html: string): string[] {
    const found: string[] = [];
    for (const m of html.matchAll(REQUESTING_ATTRS)) {
        const value = m[1] ?? "";
        for (const candidate of [value, ...[...value.matchAll(/url\(\s*['"]?([^'")]+)/gi)].map((u) => u[1] ?? "")]) {
            const v = candidate.trim();
            if (v === "" || (v.startsWith("/") && !v.startsWith("//"))) continue;
            if (v.startsWith("#") || v.startsWith("?")) continue;
            found.push(v);
        }
    }
    return found;
}

test("🔴 렌더 결과에 방문자 조작 없이 나가는 제3자 요청이 0건이다 — 태그를 세지 않고 속성을 훑는다", async () => {
    // 이미지·영상·링크·표·목록을 한 본문에 다 넣는다. 새 갈래가 생겨도 이 시험을 지나간다.
    const html = await renderMarkdown(
        [
            "# 제목",
            "![우리 것](media:12)",
            "![남의 것](https://cdn.example/a.png)",
            "![못 쓰는 것](//evil.example/x.png)",
            "[링크](https://cdn.example/page)",
            "```videofile\nmedia:34\n```",
            "```video\nhttps://youtu.be/abc\n```",
            "| a | b |\n|---|---|\n| 1 | 2 |",
        ].join("\n\n"),
    );

    // `href` 는 방문자가 **누를 때만** 나간다 — 자동 요청이 아니다. 그 둘을 갈라 센다.
    const auto = offOriginRefs(html.replace(/<a\b[^>]*>/gi, (tag) => tag.replace(/\shref\s*=\s*"[^"]*"/i, "")));
    assert.deepEqual(
        auto,
        [],
        `방문자 조작 없이 나가는 제3자 요청이 있다 — 브라우저가 그 호스트를 부른다: ${auto.join(" · ")}\n${html}`,
    );

    // 통제군 — 훑개가 실제로 값을 본다. 0개면 위 단언이 공허참이다.
    assert.ok(offOriginRefs(html).length > 0, `훑개가 아무 속성도 못 봤다 — 위 단언이 공허참이다: ${html}`);
});

/** 자체 업로드 영상만 `<video>` 다 — 외부 영상은 링크(그 판정은 `bodyVideoSrc` 가 진다). */
test("자체 영상은 video 로, 외부 영상은 링크로", async () => {
    const own = await renderMarkdown("```videofile\nmedia:34\n```");
    assert.match(own, /<video[^>]+src="\/media\/34"/, `자체 영상이 안 그려졌다: ${own}`);

    const external = await renderMarkdown("```video\nhttps://youtu.be/abc\n```");
    assert.doesNotMatch(external, /<video/, `외부 영상이 video 로 나갔다 — preload 가 그 호스트를 부른다: ${external}`);
    assert.match(external, /<a[^>]+href="https:\/\/youtu\.be\/abc"/, `외부 영상이 링크로도 안 그려졌다: ${external}`);
});

/**
 * 🔴 **가중치가 실제 산출과 맞는지 잰다 — `INLINE_COST` 는 «산출 크기 비율» 이라고 선언한다.**
 *
 * 그 선언이 참인지 아무도 안 재고 있었다. 재보면(이 시험이 그 실측이다 —
 * `node --experimental-strip-types --test src/lib/markdownRender.test.ts`)
 * `text` 하나가 **역전**돼 있다: 글자 노드는 요소를 안 만들어 **구조 비용이 0** 인데
 * 링크(35바이트)와 **같은 몫 2** 를 문다. 정상 기사 몫의 78% 가 그 `text` 라, 예산이 먼저
 * 닿는 축을 사실상 이 한 값이 정한다.
 *
 * ⚠ **「글자 노드 N개」 씨앗은 만들 수 없다** — 이어진 글자는 파서가 **노드 하나**로 준다.
 *   한 판 그 씨앗으로 「노드당 2바이트」를 쟀는데, 그것은 노드당이 아니라 **글자당** 비용이었고
 *   그 값으로는 「글자를 `<span>` 으로 감싼다」는 변이가 **안 죽었다**. 그래서 글자는
 *   «개수 × 비용» 이 아니라 **«감싸는 요소가 있는가»** 로 잰다.
 *
 * ⚠ 이 시험은 **현행 값을 못박는다.** `text` 를 1 로 내리면 red 다 — 그것이 의도다(제품 결정이
 *   있어야 움직이는 값이고, 움직일 때 이 자리가 함께 움직였는지 보이게 한다).
 */
test("🔴 글자 노드는 구조 비용이 0 인데 링크와 같은 몫을 문다", async () => {
    // ⑴ 글자는 요소로 안 감싼다 — 그것이 「구조 비용 0」의 뜻이다.
    const plain = await renderMarkdown("가나다라마바사");
    const inner = plain.replace(/^<div>|<\/div>$/g, "").replace(/^<p[^>]*>|<\/p>$/g, "");
    assert.equal(inner, "가나다라마바사", `평문이 요소로 감싸였다 — 구조 비용 0 이 깨졌다: ${plain}`);

    // ⑵ 나머지 다섯은 유닛 하나가 노드 하나다 — **파서로 확인한다**(가정하지 않는다).
    //    구조 비용 = 같은 글자를 마크업 없이 그렸을 때와의 차이.
    const N = 200;
    const bytes = async (source: string): Promise<number> => Buffer.byteLength(await renderMarkdown(source));
    const overhead: Record<string, number> = {};
    for (const [kind, unit, text] of [
        ["image", "![a](media:1)", "a"],
        ["code", "`c`", "c"],
        ["link", "[a](/x)", "a"],
        ["strong", "**b**", "b"],
        ["em", "*i*", "i"],
    ] as Array<[string, string, string]>) {
        const src = "x " + Array(N).fill(unit).join(" ");
        const nodes = parseInline(src).filter((n) => n.kind === kind).length;
        assert.equal(nodes, N, `${kind} 씨앗이 노드 ${nodes}개다 — 분모가 틀렸다`);
        overhead[kind] = Math.round(((await bytes(src)) - (await bytes("x " + Array(N).fill(text).join(" ")))) / N);
    }

    // 산출 순서: 이미지 > 코드 > 링크 > 강조 > 기울임. 가중치도 그 순서여야 한다.
    assert.deepEqual(
        Object.entries(overhead)
            .sort((a, b) => b[1] - a[1])
            .map(([k]) => k),
        ["image", "code", "link", "strong", "em"],
        `산출 순서가 바뀌었다: ${JSON.stringify(overhead)}`,
    );
    assert.ok(overhead.link! > 20, `링크 구조 비용이 ${overhead.link}B 뿐이다 — 훑개가 죽었다(통제군)`);

    // 🔴 구조 비용 0 인 `text` 가 링크와 같은 몫을 문다.
    assert.equal(INLINE_COST.text, INLINE_COST.link, "text 몫이 바뀌었다 — 위 KDoc 과 예산 문면을 함께 고쳐라");
});

/**
 * **「본문 + 구조」에서 «본문» 쪽도 1배가 아니다.** 이스케이프가 글자를 늘린다 — `&` 하나가
 * `&amp;` 다섯 자다. 예산 셋을 거의 안 건드리는 형상이 가장 큰 산출을 낸다(블록 1 · 몫 2).
 *
 * ⚠ 쪽 전체는 여기에 RSC 사본이 더 붙는다 — 이 시험이 재는 것은 **렌더러까지**다.
 */
test("이스케이프 증폭 — 예산이 못 막는 축이 있다", async () => {
    const body = "&".repeat(64 * 1024);
    const html = await renderMarkdown(body);
    const ratio = Buffer.byteLength(html) / Buffer.byteLength(body);
    assert.ok(ratio > 4.5, `이스케이프 증폭이 ${ratio.toFixed(1)}배뿐이다 — 이 시험이 축을 놓쳤다`);
    // 통제군 — 예산은 이 형상을 거의 안 본다(그래서 구조 예산으로 못 막는다).
    assert.equal(parseMarkdown(body).length, 1);
});
