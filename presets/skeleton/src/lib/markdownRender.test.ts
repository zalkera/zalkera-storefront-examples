import {strict as assert} from "node:assert";
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import ts from "typescript";

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
async function renderMarkdown(source: string): Promise<string> {
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
        const resolved = tsx!.replace(/from "@\/([^"]+)"/g, (_m, rest: string) =>
            `from "${SRC}/${rest}${rest.endsWith(".ts") ? "" : ".ts"}"`,
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

        const [{Markdown}, {renderToStaticMarkup}] = await Promise.all([
            import(file),
            import("react-dom/server"),
        ]);
        const {createElement} = await import("react");
        return renderToStaticMarkup(createElement(Markdown, {source}));
    } finally {
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
 * 재현: `bodyImageHref` 의 `new URL(href).protocol` 갈래를 `/^https?:\/\//i.test(href)` 로 되돌리고
 * `node --experimental-strip-types --test src/lib/markdownRender.test.ts` → 1건 red
 */
test("🔴 파서가 http(s) 로 읽는 꼴은 하나도 안 잃는다", async () => {
    for (const odd of [
        "https:cdn.example/a.png",
        "https:/cdn.example/a.png",
        "https:///cdn.example/a.png",
        "https://cdn.example/a.png",
    ]) {
        const html = await renderMarkdown(`![캡션](${odd})`);
        assert.match(html, /<a[^>]+href=/, `${JSON.stringify(odd)} 가 아무것도 안 그렸다 — 저작자의 그림이 사라진다: ${html}`);
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
            if (v === "" || v.startsWith("/") && !v.startsWith("//")) continue;
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
