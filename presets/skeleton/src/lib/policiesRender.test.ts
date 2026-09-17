import {strict as assert} from "node:assert";
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

/**
 * 구매 정책 페이지의 **사업자 정보**를 실제로 그려서 잰다 — 콘솔 사이트 설정의 표시항목이 방문자 화면에 나오는가.
 *
 * 통신판매업 신고번호·개인정보보호책임자는 콘솔에 칸이 있어도 페이지가 안 그리면 조용히 빠진다(타입·빌드는 초록이다).
 * 그래서 백엔드를 대역으로 갈아 끼우고 페이지를 렌더한다 — 값이 있으면 줄이 서고, 없으면(null·빈 문자열·옛 응답에 칸 없음) 라벨도 없다.
 *
 * 재현: `node --experimental-strip-types --test src/lib/policiesRender.test.ts; echo rc=$?` → rc=0
 */

/** `@/foo/bar` → 실제 파일. 확장자는 파일이 있는 쪽으로 정한다(번들러가 하던 일). */
function sourceOf(spec: string): string | null {
    for (const ext of ["", ".ts", ".tsx"]) {
        const candidate = join(SRC, spec + ext);
        if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
    }
    return null;
}

/** 사이트 설정 대역 — 시험이 심은 값을 돌려준다. */
const ZALKERA_STUB = `
globalThis.__siteConfig = {value: null};
export const zalkera = {
    getSiteConfig: async () => globalThis.__siteConfig.value,
};
`;

/** 메타데이터 대역 — 이 시험은 본문만 본다. */
const METADATA_STUB = `
export function pageMetadata() { return {}; }
export function withSiteName(title) { return title; }
`;

function compileGraph(entry: string, stubs: Record<string, string>) {
    // ⚠ `/tmp` 에 쓰면 안 된다 — node 는 맨 지정자(`react`)를 가져오는 파일 기준으로 푼다.
    const cache = resolve(SRC, "../node_modules/.cache");
    mkdirSync(cache, {recursive: true});
    const dir = mkdtempSync(join(cache, "zalkera-policies-"));
    try {
        return transpileInto(dir, entry, stubs);
    } catch (e) {
        // 전사가 import 전에 멈추면 폴더가 남는다 — 실패해도 지운다.
        rmSync(dir, {recursive: true, force: true});
        throw e;
    }
}

function transpileInto(dir: string, entry: string, stubs: Record<string, string>) {
    const out = (spec: string) => join(dir, spec.replace(/\//g, "__") + ".mjs");
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
        const spec = queue.shift()!;
        if (seen.has(spec)) continue;
        seen.add(spec);
        if (stubs[spec] !== undefined) {
            writeFileSync(out(spec), stubs[spec]!);
            continue;
        }
        const file = sourceOf(spec);
        assert.ok(file, `@/${spec} 를 못 찾았다 — 이 시험이 헛돈다`);
        const source = ts.sys.readFile(file!);
        assert.ok(source, `${file} 를 못 읽었다 — 이 시험이 헛돈다`);
        const rewritten = source!.replace(/(["'])@\/([^"']+)\1/g, (_m, q: string, rest: string) => {
            queue.push(rest);
            return `${q}${out(rest)}${q}`;
        });
        writeFileSync(
            out(spec),
            ts.transpileModule(rewritten, {
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2022,
                    jsx: ts.JsxEmit.ReactJSX,
                },
            }).outputText,
        );
    }
    return import(out(entry)).finally(() => rmSync(dir, {recursive: true, force: true})) as Promise<{
        default: () => Promise<unknown>;
    }>;
}

// 구매 정책 페이지를 걷은 트리에서는 요구하지 않는다 — 하한 게이트도 같은 파일을 보고 이 스위트를 요구에서 뺀다
// (`scripts/lib/floors.mjs` 의 FLOOR_SUBJECT). 정본 저장소에서는 켜지지 않는다. ⚠ 건너뛰면 반드시 말한다.
const CANONICAL = existsSync(join(SRC, "..", "presets")) && existsSync(join(SRC, "..", "scripts", "pack-preset.mjs"));
const POLICIES_SKIP =
    CANONICAL || existsSync(join(SRC, "app/policies/page.tsx"))
        ? false
        : "구매 정책 페이지가 이 트리에 없다 — 지킬 대상이 없어 건너뜀(하한 게이트도 이 스위트를 요구하지 않는다)";

let page: Promise<{default: () => Promise<unknown>}> | null = null;

async function render(config: Record<string, unknown>): Promise<string> {
    page ??= compileGraph("app/policies/page", {"lib/zalkera": ZALKERA_STUB, "lib/metadata": METADATA_STUB});
    const [{default: PoliciesPage}, {renderToStaticMarkup}, {createElement}] = await Promise.all([
        page,
        import("react-dom/server"),
        import("react"),
    ]);
    (globalThis as unknown as {__siteConfig: {value: unknown}}).__siteConfig.value = config;
    const element = await PoliciesPage();
    return renderToStaticMarkup(createElement(() => element as never));
}

const BASE = {
    companyName: "잘커라 상점",
    ceoName: "홍길동",
    bizRegNo: "123-45-67890",
    commercePolicies: null,
    defaultReturnShippingFee: null,
};

test("🔴 사업자 정보 — 통신판매업 신고번호·개인정보보호책임자가 있으면 줄이 선다", {skip: POLICIES_SKIP}, async () => {
    const html = await render({...BASE, mailOrderRegNo: "2026-서울강남-0001", privacyOfficer: "김책임"});
    assert.match(html, /통신판매업 신고번호: 2026-서울강남-0001/);
    assert.match(html, /개인정보보호책임자: 김책임/);
    assert.match(html, /사업자등록번호: 123-45-67890/, "양성 짝 — 기존 줄도 그대로");
});

test("🔴 사업자 정보 — 값이 없으면(null·빈 문자열·칸 없음) 라벨도 그리지 않는다", {skip: POLICIES_SKIP}, async () => {
    for (const blank of [{mailOrderRegNo: null, privacyOfficer: null}, {mailOrderRegNo: "", privacyOfficer: ""}, {}]) {
        const html = await render({...BASE, ...blank});
        assert.doesNotMatch(html, /통신판매업 신고번호/, `빈 값에 라벨이 섰다: ${JSON.stringify(blank)}`);
        assert.doesNotMatch(html, /개인정보보호책임자/, `빈 값에 라벨이 섰다: ${JSON.stringify(blank)}`);
        assert.match(html, /사업자 정보/, "양성 짝 — 절 자체는 선다");
    }
});
