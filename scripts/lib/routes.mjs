/**
 * `src/app`(또는 루트 `app`)을 걸어 **이 트리가 실제로 라우팅하는 경로**를 모은다.
 * 순수 함수라 전수로 시험한다 — 계약은 `gateProbe.test.mjs` 가 실물 스크립트로 진다.
 *
 * 프리뷰 관문 matcher 가 무엇을 덮어야 하는지의 잣대다. 손으로 적은 목록을 쓰면 그 목록에 없는
 * 접두를 빼는 순간 영원히 안 잡히므로, 잣대를 트리에서 만든다.
 *
 * 동적 세그먼트에는 **점이 든 값**을 넣는다 — 확장자로 가르는 matcher 의 구멍은 그 형태에서만
 * 드러난다. 재현: `node -e 'console.log(/^\/((?!.*\.[A-Za-z0-9]+$).*)$/.test("/api/cart/items/7.0"))'` → false
 */
import {readdirSync, existsSync} from "node:fs";
import {join} from "node:path";

/** 동적 세그먼트 대표값. 점을 넣는다. */
export const DYN = "7.0";
/** catch-all 대표값. */
export const CATCH_ALL = ["a.b", "c.d"];
/** 트리에 **없는** 경로. 새 라우트가 아무것도 안 하고 덮이는가를 이것으로만 잴 수 있다. */
export const SYNTHETIC = ["/api/__gate_probe_new__/1.0", "/__gate_probe_new_page__.item"];

/** `src/app` 이 표준이지만 Next 는 루트 `app/` 도 받는다. 한쪽만 보면 그 배치가 판정 불능이 된다. */
export function appDirOf(srcRoot) {
    const nested = join(srcRoot, "src", "app");
    return existsSync(nested) ? nested : join(srcRoot, "app");
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
