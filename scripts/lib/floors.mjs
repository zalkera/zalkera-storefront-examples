/**
 * 가드 회귀 스위트의 **하한 판정**. 순수 함수라 전수로 시험할 수 있다(`floors.test.mjs`).
 *
 * 요구치는 이 파일이 든다 — zip 안의 `scripts/lib/test-floors.json` 이 아니다. 그 파일만 보면
 * 비우는 것으로 게이트를 끌 수 있다. zip 의 표는 요구를 **올리거나 늘리는** 자리다.
 */

/** 요구 스위트와 그 통과 하한. 현재치와 같게 둔다 — 여유는 그만큼 시험을 지울 수 있게 한다. */
export const REQUIRED_FLOORS = {
    "src/lib/crossOrigin.test.ts": 18,
    "src/lib/oauthState.test.ts": 9,
    "src/lib/previewGuard.test.ts": 6,
    "src/lib/safeUrl.test.ts": 6,
    "src/lib/safeUrlDrift.test.ts": 4,
    "scripts/lib/floors.test.mjs": 14,
    "scripts/lib/gateProbe.test.mjs": 9,
    "scripts/lib/junkEntries.test.mjs": 8,
    "scripts/lib/childEnv.test.mjs": 5,
};

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
    const effective = {...REQUIRED_FLOORS};

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
        if (f in REQUIRED_FLOORS && min < REQUIRED_FLOORS[f]) {
            bad.push(`${f} 하한을 낮췄습니다 ${min} < ${REQUIRED_FLOORS[f]}`);
            continue;
        }
        effective[f] = Math.max(effective[f] ?? 0, min);
    }

    // 요구 스위트 파일이 없으면 반려.
    for (const f of Object.keys(REQUIRED_FLOORS)) {
        if (!exists(f)) bad.push(`${f} 가 없습니다 — 가드를 재는 자리입니다`);
    }

    // 표가 비었으면 반려. 요구치는 위에서 살지만, 비우는 것은 게이트를 끄려는 시도다.
    // `ci.yml` 의 하한 스텝도 같은 판정을 쓴다 — 두 정본이 갈리면 어느 쪽이 참인지 알 수 없다.
    const listed = Object.keys(floors ?? {}).filter((k) => k !== "_").length;
    const want = Object.keys(REQUIRED_FLOORS).length;
    if (floors && listed < want) {
        bad.push(`하한표 항목이 ${listed}개입니다 — 비었거나 지워졌습니다(요구 ${want}개)`);
    }

    return {bad, effective};
}
