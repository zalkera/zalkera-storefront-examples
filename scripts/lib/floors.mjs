/**
 * 가드 회귀 스위트의 **하한 판정**. 순수 함수라 전수로 시험할 수 있다(`floors.test.mjs`).
 *
 * 요구치는 이 파일이 든다 — zip 안의 `scripts/lib/test-floors.json` 이 아니다. 그 파일만 보면
 * 비우는 것으로 게이트를 끌 수 있다. zip 의 표는 요구를 **올리거나 늘리는** 자리다.
 */

/**
 * **팩에도 실리는** 요구 스위트와 그 통과 하한. 현재치와 같게 둔다 — 여유는 그만큼 시험을 지울
 * 수 있게 한다.
 *
 * ⚠ **여기 없는 스위트는 조용히 지울 수 있다.** 표에 없으면 하한이 없기 때문이다. 새 스위트를
 * 만들면 여기나 [REPO_ONLY_FLOORS] 중 한 곳에 반드시 적는다 — `floor-gate.mjs` 가 표 밖의
 * 스위트를 반려한다.
 *
 * ⚠ **팩 트리에서 실제로 통과를 내는 스위트만 적는다.** 두 가지로 어긋난다:
 *   ⑴ 팩에 **안 실리는** 것(`SOURCE_EXCLUDES`) — 파일이 없어 0건.
 *   ⑵ 팩 트리에서 **스스로 스킵**하는 것 — 파일은 있는데 통과가 0건이다. `skip` 은 통과로
 *      안 센다(`floor-reporter.mjs`). `docsRev.test.ts` 가 그런 스위트다(정본 판별자로 스킵한다).
 *      여기 적으면 **모든 팩이 자기 검수에서 죽는다.**
 *      재현: `docsRev` 를 이 표로 옮기고 `node scripts/pack-preset.mjs --version 9.9.9 skeleton`
 *      → 「가드 회귀 스위트」 미달로 반려.
 *   둘 다 [REPO_ONLY_FLOORS] 로 간다.
 */
export const REQUIRED_FLOORS = {
    "src/lib/crossOrigin.test.ts": 18,
    "src/lib/oauthState.test.ts": 11,
    "src/lib/routeParam.test.ts": 5,
    "src/lib/content.test.ts": 3,
    "src/lib/reservedSegments.test.ts": 4,
    "src/lib/previewGuard.test.ts": 8,
    "src/lib/safeUrl.test.ts": 6,
    "src/lib/safeUrlDrift.test.ts": 4,
    "src/lib/mediaCache.test.ts": 11,
    "scripts/lib/floors.test.mjs": 26,
    "scripts/lib/gateProbe.test.mjs": 14,
    "scripts/lib/junkEntries.test.mjs": 8,
    "scripts/lib/childEnv.test.mjs": 12,
    "scripts/lib/vendorSet.test.mjs": 3,
    "scripts/workflow-syntax.test.mjs": 35,
    "scripts/lib/floorGate.test.mjs": 11,
    "scripts/lib/contentRoutes.test.mjs": 6,
    "src/lib/theme.test.ts": 9,
    "src/lib/preview.test.ts": 4,
};

/**
 * **정본 저장소에서만** 요구하는 스위트.
 *
 * 팩에 안 실리는 것들이다 — 팩 도구(`pack-preset.mjs`)의 판정부와 그 시험, 그리고 루트 `src/`
 * 에만 있는 것(팩의 `src/` 는 프리셋에서만 온다). 팩 트리에서 요구하면 멀쩡한 팩이 반려된다.
 *
 * 그래도 요구는 한다 — 안 하면 그 스위트들이 표 밖이 되어 조용히 지울 수 있다. 그중에는 팩
 * 관문·팩 매니페스트·팩 판번호처럼 **배송을 막는 판정**을 재는 것이 있다.
 */
export const REPO_ONLY_FLOORS = {
    "scripts/lib/packGate.test.mjs": 6,
    "scripts/lib/rendererCoverage.test.mjs": 2,
    "scripts/lib/packManifest.test.mjs": 7,
    "scripts/lib/themeEnums.test.mjs": 16,
    "scripts/lib/validateSeverity.test.mjs": 3,
    "scripts/lib/visitor-ip-parity.test.mjs": 32,
    "scripts/lib/wiringParity.test.mjs": 10,
    "scripts/lib/verifyZipSignal.test.mjs": 1,
    "scripts/lib/verifyZipJudgments.test.mjs": 9,
    "scripts/lib/docEnvNames.test.mjs": 4,
    "scripts/pack-version.test.mjs": 13,
    "src/lib/logoutCart.test.ts": 4,
    "src/lib/docsRev.test.ts": 1,
};

/**
 * 이 트리가 **정본 저장소**인가. `ci.yml` 이 정본 전용 검사를 켤 때 쓰는 것과 같은 판별자다.
 *
 * 둘 다 있어야 참이다 — 고객이 `presets/` 라는 폴더를 만드는 것만으로 참이 되면, 그 트리에
 * 없는 스위트를 요구해 고객 CI 가 영구 적색이 된다.
 */
export function isCanonicalRepo(exists) {
    return exists("presets") && exists("scripts/pack-preset.mjs");
}

/**
 * 하한표의 키로 인정하는 형태.
 *
 * ■ 무엇을 막나
 *   · **경로 이탈** — 각 조각이 영숫자·밑줄로 시작해야 하므로 `..`·`.hidden` 이 안 된다.
 *   · **플래그로 읽히는 이름** — 같은 규칙이 `-` 로 시작하는 조각을 막는다. 지금 이 키는
 *     argv 로 안 들어가지만(러너가 표에서 읽어 파일 존재만 묻는다), 표는 **zip 이 준 값**이라
 *     새 소비자가 생겼을 때 그 소비자가 안전하다고 가정하지 않는다.
 *
 * ■ 이름 안의 점은 받는다
 *   `foo.bar.test.ts` 는 흔한 이름이다. 거부하면 고객이 **막다른 길**에 갇힌다 — 표에 안 적으면
 *   「하한표 밖」으로, 적으면 「키 형태 위반」으로 양쪽 다 반려되는데 오류 문면은 「표에 적으라」
 *   고만 한다.
 *   재현: 이 정규식에서 `.` 을 빼고 `src/lib/foo.bar.test.ts` 를 만든 트리에 floor-gate 를
 *   돌리면, 표에 적든 안 적든 rc=1 이다.
 *
 * ■ 확장자는 **러너의 글롭과 같아야 한다**
 *   `floor-gate.mjs` 가 도는 글롭이 이 목록의 부분집합이면, 그 확장자로 등록한 스위트는 파일이
 *   있는데도 통과 0건이 되어 영구 미달이 된다. 둘을 같이 고친다.
 */
export const FLOOR_KEY_REGEX =
    /^(src|scripts)\/(?:[A-Za-z0-9_][A-Za-z0-9_.\-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.\-]*\.test\.(tsx?|mjs)$/;

/**
 * **능력별 시험 — 그 가드가 지킬 대상이 트리에 있을 때만 요구한다.**
 *
 * 요구 목록은 「가드가 옳은가」를 잠그는 자리다. 그런데 그중 하나는 **능력에 딸린** 가드다 —
 * `AGENTS.md` 의 능력 삭제표가 쇼핑몰을 지울 때 `src/lib/{oauth,oauthState}.ts` 를 지우라고 하는데,
 * 그러면 그 시험도 같이 지워야 하고 여기서 반려됐다. 로그인 화면이 없는 사이트가 **쓰지도 않는
 * 파일 둘을 남겨야** 통과하는 자리였다.
 *   재현: 트리에서 `src/lib/oauthState.{ts,test.ts}` 를 지우고 `node scripts/lib/floor-gate.mjs; echo rc=$?`
 *   → 고치기 전 rc=1(가드 미달) · 고친 뒤 rc=0 + 건너뜀 한 줄
 *
 * 지킬 대상이 없으면 지킬 약속도 없다. 그러니 **대상이 있을 때만** 요구한다.
 *
 * ⚠ **건너뛰면 반드시 말한다.** 조용히 넘어가면 그것이 곧 게이트 스위치가 된다.
 * ⚠ **판정은 경로다 — 심볼이 아니다.** 이 표 전체가 경로 키 모델이라 조건도 같은 모델로 둔다.
 *   따라서 **본체를 다른 이름으로 옮기면 이 요구가 사라진다.** 그 형상은 이 표가 원래 못 잡는다
 *   (경로가 바뀌면 시험 키도 안 맞는다). 심볼로 재는 그물은 검사기 `X3` 가 따로 들고 있다 —
 *   `consumeOAuthState` 정의를 소스 어디에서든 찾아, 못 찾으면 경고한다.
 */
const FLOOR_SUBJECT = Object.freeze({
    "src/lib/oauthState.test.ts": "src/lib/oauthState.ts",
});

/**
 * zip 의 하한표를 요구치와 합친다.
 *
 * @param floors  zip 에서 읽은 표(`null` 이면 못 읽은 것)
 * @param exists  스위트 파일이 트리에 있는지 묻는 함수 `(relPath) => boolean`
 * @returns `{bad, effective, skipped}` — `bad` 가 비어 있지 않으면 반려. `skipped` 는 대상 부재로
 *          요구를 걷은 스위트(호출부가 **출력해야 한다**).
 */
export function judgeFloors(floors, exists) {
    const bad = [];
    // 정본 저장소면 팩에 안 실리는 것까지 요구한다. 팩 트리에서는 요구하지 않는다 — 거기 없는
    // 파일을 요구하면 멀쩡한 팩이 「가드 미달」이라는 틀린 사유로 막힌다.
    const required = isCanonicalRepo(exists) ? {...REQUIRED_FLOORS, ...REPO_ONLY_FLOORS} : {...REQUIRED_FLOORS};
    // 지킬 대상이 없는 가드는 요구에서 걷는다(위 [FLOOR_SUBJECT]). 걷은 자리는 호출부가 찍는다.
    const skipped = [];
    for (const [suite, subject] of Object.entries(FLOOR_SUBJECT)) {
        if (suite in required && !exists(subject)) {
            delete required[suite];
            skipped.push({suite, subject});
        }
    }
    const effective = {...required};

    // ⚠ **`null`·`0`·`false`·`""` 도 «표가 없음»이다.** falsy 를 `?? {}` 로 흘려보내면 아래
    //   «항목이 모자라면 반려» 트립와이어가 통째로 꺼진다 — 표를 `null` 로 덮는 것이 그 가드를 끄는
    //   가장 싼 방법이 된다. 실질 하한은 [REQUIRED_FLOORS] 가 계속 들고 있어 집행은 서지만,
    //   «표가 판정을 통과했다» 는 거짓이 된다.
    //   재현: `printf 'null' > scripts/lib/test-floors.json && node scripts/lib/floor-gate.mjs .` → rc=1
    if (floors === null || typeof floors !== "object" || Array.isArray(floors)) {
        const what = floors === null ? "null" : Array.isArray(floors) ? "배열" : typeof floors;
        return {
            bad: [`하한표가 객체가 아닙니다(${what}) — 요구 ${Object.keys(required).length}개를 잴 수 없습니다`],
            effective: {},
            skipped,
        };
    }

    for (const [f, min] of Object.entries(floors ?? {})) {
        if (f === "_") continue;
        // argv 주입 차단. 조용히 건너뛰면 공격자는 잃을 게 없고 우리는 하한 하나를 잃는다.
        if (!FLOOR_KEY_REGEX.test(f)) {
            bad.push(`키 형태 위반 ${JSON.stringify(f).slice(0, 60)}`);
            continue;
        }
        if (!Number.isInteger(min) || min <= 0) {
            bad.push(`${f} 하한이 양의 정수가 아닙니다(${JSON.stringify(min)})`);
            continue;
        }
        if (f in required && min < required[f]) {
            bad.push(`${f} 하한을 낮췄습니다 ${min} < ${required[f]}`);
            continue;
        }
        effective[f] = Math.max(effective[f] ?? 0, min);
    }

    // 요구 스위트 파일이 없으면 반려.
    for (const f of Object.keys(required)) {
        if (!exists(f)) bad.push(`${f} 가 없습니다 — 가드를 재는 자리입니다`);
    }

    // 표가 비었으면 반려. 요구치는 위에서 살지만, 비우는 것은 게이트를 끄려는 시도다.
    // `ci.yml` 의 하한 스텝도 같은 판정을 쓴다 — 두 정본이 갈리면 어느 쪽이 참인지 알 수 없다.
    const listed = Object.keys(floors ?? {}).filter((k) => k !== "_").length;
    const want = Object.keys(required).length;
    if (floors && listed < want) {
        bad.push(`하한표 항목이 ${listed}개입니다 — 비었거나 지워졌습니다(요구 ${want}개)`);
    }

    return {bad, effective, skipped};
}
