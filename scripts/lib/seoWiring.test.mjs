/**
 * **소유확인 배선의 정본 전용 불변식 둘.**
 *
 * ■ 왜 배송본이 아니라 여기인가
 *   `src/lib/siteVerification.test.ts` 는 고객 zip 에 실린다. 그래서 거기서는 프리셋을
 *   「있으면 잰다」로 둘 수밖에 없고, 그 조건절은 **판별 표식을 깨면 조용히 꺼진다**
 *   (가드를 지우는 것이 고치는 것보다 쉬우면 안 된다는 규약과 반대 방향). 이 파일은
 *   `SOURCE_EXCLUDES` 라 정본에만 있으므로 **조건 없이** 단언한다.
 *
 * ■ 불변식 ⑴ — 5벌 전부 배선돼 있다
 *   함수가 완벽해도 부르는 곳이 없으면 태그가 안 나간다. 루트만 잠그면 고객이 실제로 받는
 *   4팩은 무방비다.
 *
 * ■ 불변식 ⑵ — 스냅샷 가림 목록이 배송 코드가 낼 수 있는 이름을 전부 덮는다
 *   `snapshot-preview.mjs` 의 `OWNERSHIP_META_NAMES` 는 transform 과 verify 가 **같이** 보는
 *   목록이라, 이름을 빼면 지우지도 않고 찾지도 않아 「검증 통과」가 나온다(자기확증 오라클).
 *   그 목록을 **바깥 사실**(`site.ts` 가 실제로 내는 이름)에 묶어야 회귀가 잡힌다.
 *
 * 재현: `npm test`
 */
import assert from "node:assert/strict";
import test from "node:test";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 배송 코드가 낼 수 있는 소유확인 meta 이름. `site.ts` 소스에서 뽑는다 — 손으로 적으면 같이 낡는다. */
function emittedMetaNames() {
    const src = readFileSync(join(ROOT, "src", "lib", "site.ts"), "utf8");
    const names = new Set();
    // `other` 레코드에 박히는 리터럴 키.
    for (const m of src.matchAll(/other\[\s*"([^"]+)"\s*\]\s*=/g)) names.add(m[1]);
    // `verification.google` 은 Next 가 `google-site-verification` 으로 렌더한다.
    if (/\bgoogle\s*\?\s*\{google\}/.test(src) || /\{\s*google\s*\}/.test(src)) names.add("google-site-verification");
    return names;
}

test("루트와 프리셋 전부가 metadata.verification 에 siteVerification() 을 싣는다", () => {
    const layouts = [{label: "src/app/layout.tsx", file: join(ROOT, "src", "app", "layout.tsx")}];
    const presets = join(ROOT, "presets");
    assert.ok(existsSync(presets), "정본 레포에 presets/ 가 없다");
    for (const code of readdirSync(presets)) {
        const f = join(presets, code, "src", "app", "layout.tsx");
        if (existsSync(f)) layouts.push({label: `presets/${code}/src/app/layout.tsx`, file: f});
    }
    // 팩이 늘면 이 수도 늘어야 한다. 「있으면 잰다」로 두면 0벌을 재도 통과한다.
    assert.ok(layouts.length >= 5, `layout 을 ${layouts.length}벌만 찾았다 — 루트 + 프리셋 4벌이어야 한다`);
    for (const {label, file} of layouts) {
        const source = readFileSync(file, "utf8");
        assert.match(source, /\bverification:\s*siteVerification\(\)/, `${label}: metadata.verification 에 배선되지 않았다`);
    }
});

test("스냅샷 가림 목록이 배송 코드가 내는 소유확인 meta 를 전부 덮는다", () => {
    const emitted = emittedMetaNames();
    assert.ok(emitted.size >= 3, `site.ts 에서 meta 이름을 ${emitted.size}개만 뽑았다 — 추출식이 낡았다`);

    const snap = readFileSync(join(ROOT, "scripts", "snapshot-preview.mjs"), "utf8");
    const decl = snap.match(/const OWNERSHIP_META_NAMES\s*=\s*\[([^\]]*)\]/);
    assert.ok(decl, "snapshot-preview.mjs 에서 OWNERSHIP_META_NAMES 를 못 찾았다");
    const listed = new Set([...decl[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

    for (const name of emitted) {
        assert.ok(listed.has(name), `OWNERSHIP_META_NAMES 에 ${name} 가 없다 — 그 토큰이 미리보기 사진에 남는다`);
    }
    // 목록이 transform 과 verify 양쪽에서 **실제로 쓰이는지**도 본다. 한쪽만 쓰면 반쪽이다.
    assert.match(snap, /OWNERSHIP_META_NAMES\.includes\(/, "transform 이 목록을 안 쓴다");
    assert.match(snap, /for\s*\(const\s+\w+\s+of\s+OWNERSHIP_META_NAMES\)/, "verify 가 목록을 안 쓴다");
});
