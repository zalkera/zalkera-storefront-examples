/**
 * `src/app`(또는 루트 `app`)을 걸어 **이 트리가 실제로 라우팅하는 경로**를 모은다.
 * 순수 함수라 전수로 시험한다 — 계약은 `gateProbe.test.mjs` 가 실물 스크립트로 진다.
 *
 * 미리보기 관문 matcher 가 무엇을 덮어야 하는지의 잣대다. 손으로 적은 목록을 쓰면 그 목록에 없는
 * 접두를 빼는 순간 영원히 안 잡히므로, 잣대를 트리에서 만든다.
 *
 * 동적 세그먼트에는 **점이 든 값**을 넣는다 — 확장자로 가르는 matcher 의 구멍은 그 형태에서만
 * 드러난다. 재현: `node -e 'console.log(/^\/((?!.*\.[A-Za-z0-9]+$).*)$/.test("/api/cart/items/7.0"))'` → false
 */
import {readdirSync, existsSync, lstatSync} from "node:fs";
import {join} from "node:path";

/** 심링크인가. 없으면 `false` — 존재 여부는 부르는 쪽이 따로 본다. */
function isLink(p) {
    try {
        return lstatSync(p).isSymbolicLink();
    } catch {
        return false;
    }
}

/**
 * 규약 검사기에 넘길 **소스 루트**. 심링크면 `dir: null` 이고 그 자리는 검사하지 않는다.
 *
 * `existsSync` 는 심링크를 따라간다. zip 이 `src` 를 검수자 트리로 건 심링크로 두면 검사기가 그쪽을
 * 훑고, **검수자 디스크의 파일명이 반려문에 실린다** — 러너는 반려문을 "개발자에게 그대로
 * 전달하십시오"라고 지시하므로 반출 경로까지 이어진다.
 *
 * 재현: `src` 를 트리 밖으로 건 심링크로 만든 zip 을 `verify-zip.mjs` 에 물리면
 * `읽지 못한 자리 … src — 심링크라 …` 한 줄만 나오고, 링크가 가리킨 디렉터리의 파일명은 안 나온다.
 *
 * @returns `{dir, reason}` — `dir` 이 `null` 이면 판정 불능(통과가 아니다).
 */
export function sourceRoot(root) {
    const src = join(root, "src");
    if (isLink(src)) return {dir: null, reason: "src — 심링크라 규약 검사를 하지 않았습니다"};
    return {dir: existsSync(src) ? src : root, reason: null};
}

/** 동적 세그먼트 대표값. 점을 넣는다. */
export const DYN = "7.0";
/** catch-all 대표값. */
export const CATCH_ALL = ["a.b", "c.d"];
/** 트리에 **없는** 경로. 새 라우트가 아무것도 안 하고 덮이는가를 이것으로만 잴 수 있다. */
export const SYNTHETIC = ["/api/__gate_probe_new__/1.0", "/__gate_probe_new_page__.item"];

/**
 * Next 가 실제로 고르는 `app` 디렉터리. **루트 `app/` 이 `src/app` 보다 우선한다** — Next 소스가
 * 그렇게 적는다(`node_modules/next/dist/lib/find-pages-dir.js`: "prioritize ./${name} over ./src/${name}").
 *
 * 순서를 뒤집으면 둘 다 있는 트리에서 **실제로 빌드되는 쪽을 아무 검사도 안 본다** — 관문 등재
 * 프로브가 엉뚱한 트리에서 나오고, 배제 접두 밑 쓰기 라우트가 그 사각으로 들어온다.
 *
 * 고른 자리가 심링크면 `null` — `derivedRoutes(null)` 이 판정 불능으로 떨어진다. 걷기 자체는
 * `isDirectory()` 로 심링크 하위를 이미 안 따라가지만, **뿌리는 그대로 넘어가** 트리 밖이 열린다.
 */
export function appDirOf(srcRoot) {
    const rootApp = join(srcRoot, "app");
    const picked = existsSync(rootApp) ? rootApp : join(srcRoot, "src", "app");
    return isLink(picked) ? null : picked;
}

/** 한 세그먼트를 URL 조각으로. `null` 이면 그 세그먼트를 버리고, `false` 면 라우트째 버린다. */
export function segment(name) {
    if (name.startsWith("(") && name.endsWith(")")) return null; // 라우트 그룹 — URL 에 안 나온다
    if (name.startsWith("@")) return false; // 병렬 라우트 — 독립 주소가 아니다
    if (name.startsWith("_")) return false; // 사설 폴더 — 라우팅 대상이 아니다
    if (/^\[\[?\.\.\./.test(name)) return CATCH_ALL.join("/");
    if (name.startsWith("[") && name.endsWith("]")) return DYN;
    return name;
}

/**
 * 라우팅되는 경로를 모은다. 못 걸으면 `null` — **통과가 아니다.**
 * `appDir` 이 없거나 라우트가 0개여도 `null` 이다(걷기가 깨진 것과 구분하지 않는다 — 둘 다 판정 불능).
 */
export function derivedRoutes(appDir) {
    if (!existsSync(appDir)) return null;
    const walk = (dir, parts) => {
        let out = [];
        let entries;
        try {
            entries = readdirSync(dir, {withFileTypes: true});
        } catch {
            return null;
        }
        if (entries.some((e) => e.isFile() && /^(route|page)\.(t|j)sx?$/.test(e.name))) {
            out.push("/" + parts.filter(Boolean).join("/"));
        }
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            const seg = segment(e.name);
            if (seg === false) continue;
            const sub = walk(join(dir, e.name), seg === null ? parts : [...parts, seg]);
            if (sub === null) return null;
            out = out.concat(sub);
        }
        return out;
    };
    const found = walk(appDir, []);
    if (found === null || found.length === 0) return null;
    return [...new Set(found)];
}
