import {strict as assert} from "node:assert";
import {readFileSync, readdirSync} from "node:fs";
import {createRequire} from "node:module";
import {join} from "node:path";
import test from "node:test";

/**
 * **팩 정본은 계약 어휘를 전량 그린다.**
 *
 * client 의 C2 검사는 「콘텐츠가 **쓰는** 타입」만 잰다 — 계약에 타입이 추가될 때 그것을 안 쓰는
 * 기존 사이트를 막지 않으려고 좁힌 것이다. 그 대신 **어휘 전량 커버는 팩 정본이 자기 시험으로
 * 지킨다**고 위임했는데, 그 시험이 없었다. 없으면 rev 가 올라 타입이 늘어도 팩이 안 그리고,
 * 콘솔에서 넣은 섹션이 화면에 안 나오는 것을 아무도 못 잡는다.
 *
 * ⚠ **정본 전용이다**(`REPO_ONLY_FLOORS`). 고객 레포는 자기가 쓰는 것만 그리면 되고,
 *   전량 커버를 요구하면 그것이 곧 C2 가 물러난 그 요구가 된다.
 */
const require_ = createRequire(import.meta.url);
const ROOT = new URL("../..", import.meta.url).pathname;

/** 루트 + 프리셋 전부. 하나라도 빠지면 어느 팩은 되고 어느 팩은 안 된다. */
function renderers() {
    const out = [["src", join(ROOT, "src/components/sections/SectionRenderer.tsx")]];
    for (const preset of readdirSync(join(ROOT, "presets"), {withFileTypes: true})) {
        if (!preset.isDirectory()) continue;
        out.push([
            `presets/${preset.name}`,
            join(ROOT, "presets", preset.name, "src/components/sections/SectionRenderer.tsx"),
        ]);
    }
    return out;
}

const casesOf = (path) =>
    new Set([...readFileSync(path, "utf8").matchAll(/case\s+"([A-Z_]+)"/g)].map((m) => m[1]));

test("렌더러 5벌이 계약 어휘를 전량 그린다", () => {
    const {SECTION_CONTRACT} = require_("@zalkera/client");
    const wanted = SECTION_CONTRACT.map((s) => s.type);
    assert.ok(wanted.length > 0, "계약이 비었다 — 이 시험이 아무것도 안 재고 있다");

    for (const [label, path] of renderers()) {
        const have = casesOf(path);
        const missing = wanted.filter((t) => !have.has(t));
        assert.deepEqual(missing, [], `${label} 이 ${missing.join("·")} 를 안 그린다`);
    }
});

test("렌더러 5벌이 서로 같은 어휘를 그린다", () => {
    // 갈리면 어느 팩은 되고 어느 팩은 안 되는데, 그건 고객이 알 방법이 없다.
    const all = renderers().map(([label, path]) => [label, [...casesOf(path)].sort()]);
    const [, first] = all[0];
    for (const [label, cases] of all.slice(1)) {
        assert.deepEqual(cases, first, `${label} 의 case 목록이 루트와 다르다`);
    }
});
