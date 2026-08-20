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
 * ⚠ **팩 트리에서도 존재를 요구한다.** 팩에 안 실리는 스위트를 여기 적으면 멀쩡한 팩이
 * 「가드 미달」이라는 틀린 사유로 막힌다. 팩에 안 실리는 것은 [REPO_ONLY_FLOORS] 로 간다.
 * 무엇이 실리는지는 `scripts/pack-preset.mjs` 의 `SOURCE_EXCLUDES` 가 정한다.
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
    "scripts/lib/floors.test.mjs": 23,
    "scripts/lib/gateProbe.test.mjs": 14,
    "scripts/lib/junkEntries.test.mjs": 8,
    "scripts/lib/childEnv.test.mjs": 12,
    "scripts/lib/vendorSet.test.mjs": 3,
    "scripts/workflow-syntax.test.mjs": 32,
    "scripts/lib/floorGate.test.mjs": 11,
    "scripts/lib/contentRoutes.test.mjs": 6,
    "src/lib/docsRev.test.ts": 1,
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
 * 하한표의 키로 인정하는 형태. **이 키는 `node` 의 argv 로 들어간다.**
 *
 * `-` 로 시작하는 문자열은 파일이 아니라 플래그로 해석되므로, 형태를 안 잠그면 zip 이
 * `--import=./x.mjs` 를 키로 써서 이 러너를 돌리는 기계에서 코드를 돌릴 수 있다.
 * 점은 `.test.ts` 자리에만 허용한다 — 그래야 `..` 로 트리 밖을 못 가리킨다.
 */
export const FLOOR_KEY_REGEX = /^(src|scripts)\/[A-Za-z0-9_\-/]+\.test\.(tsx?|mjs)$/;

/**
 * zip 의 하한표를 요구치와 합친다.
 *
 * @param floors  zip 에서 읽은 표(`null` 이면 못 읽은 것)
 * @param exists  스위트 파일이 트리에 있는지 묻는 함수 `(relPath) => boolean`
 * @returns `{bad, effective}` — `bad` 가 비어 있지 않으면 반려다.
 */
export function judgeFloors(floors, exists) {
    const bad = [];
    // 정본 저장소면 팩에 안 실리는 것까지 요구한다. 팩 트리에서는 요구하지 않는다 — 거기 없는
    // 파일을 요구하면 멀쩡한 팩이 「가드 미달」이라는 틀린 사유로 막힌다.
    const required = isCanonicalRepo(exists) ? {...REQUIRED_FLOORS, ...REPO_ONLY_FLOORS} : {...REQUIRED_FLOORS};
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

    return {bad, effective};
}
