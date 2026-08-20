/**
 * **팩 버전 관문의 판정부.** 파일시스템·git 을 안 만진다 — 그래야 시험이 전 분기를 밟는다.
 *
 * ■ 왜 떼어냈나
 *   판정이 `pack-preset.mjs` 안에 섞여 있을 때, 「같은 깨끗한 트리면 이어 굽기를 허용한다」는
 *   분기를 시험이 **한 번도 못 밟았다.** 그 분기는 트리가 깨끗해야 서는데 개발 중 트리는 늘
 *   더럽고, CI 는 `dist-presets/` 가 gitignore 라 아예 비어 있어 관문 자체를 안 지났다.
 *   관문을 통째로 지워도 전건 초록인 상태였다.
 *
 * ■ 두 관문은 서로 다른 것을 지킨다
 *   **원장**: 한 버전은 한 판본에서만 나온다(테넌트마다 다른 소스를 받는 것을 막는다).
 *   **단조성**: 이미 있는 것보다 낮은 번호를 안 얹는다(승격하면 되돌릴 수 없다).
 *   그래서 `--allow-rewind` 는 **단조성만** 비킨다. 원장은 못 비킨다 — 갈린 판본은
 *   사람이 「그래도 하겠다」고 할 성질의 것이 아니라 그냥 사고다.
 */

/** semver core 셋을 숫자로 비교한다. 사전순은 `1.4.9 > 1.4.10` 이라 못 쓴다. */
export function cmpVersion(a, b) {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/**
 * 이번 굽기를 허용할지 정한다.
 *
 * @param {object} input
 * @param {string} input.version 이번에 구울 번호.
 * @param {string|null} input.localMax `dist-presets/` 에 이미 있는 최대 번호. 없으면 `null`.
 * @param {{head: string, dirty: boolean, clientSha?: string, codes: string[]}|undefined} input.prior 원장 항목.
 * @param {string} input.head 지금 트리의 커밋.
 * @param {boolean} input.dirty 지금 트리가 더러운가.
 * @param {string|null} input.clientSha 설치된 `@zalkera/client` 운반본(`llms.txt`)의 지문.
 * @param {boolean} input.allowRewind `--allow-rewind` 가 붙었는가.
 * @returns {{allow: boolean, code: null|"LEDGER_SPLIT"|"NOT_HIGHER", appendable: boolean}}
 */
export function packGateDecision({version, localMax, prior, head, dirty, clientSha, allowRewind}) {
    // 원장이 먼저다. 종전에는 단조성이 앞에 있어, 「넷 중 하나만 구웠으니 나머지를 잇는다」는
    // 정상 작업이 `version <= localMax` 로 막혔고 사람이 관문을 비껴 굽다가 판본이 갈렸다.
    //
    // ⚠ **트리가 같다고 입력이 같은 것이 아니다.** zip 의 `llms.txt` 는 git 트리가 아니라 설치된
    //   `node_modules/@zalkera/client` 에서 온다. `node_modules` 는 gitignore 라 `dirty` 가 못 본다.
    //   그래서 그 운반본의 지문을 같이 잰다 — 지문이 없는 옛 원장 항목도 「다르다」로 본다(fail-closed).
    if (prior && (prior.head !== head || prior.dirty || dirty || prior.clientSha !== clientSha)) {
        return {allow: false, code: "LEDGER_SPLIT", appendable: false};
    }
    const appendable = Boolean(prior) && localMax !== null && cmpVersion(version, localMax) === 0;
    if (localMax !== null && cmpVersion(version, localMax) <= 0 && !appendable && !allowRewind) {
        return {allow: false, code: "NOT_HIGHER", appendable};
    }
    return {allow: true, code: null, appendable};
}

/**
 * 원장에 적을 코드 목록. **덮지 않고 잇는다** — 덮으면 「넷 중 하나만 다시 구웠다」가 원장에도
 * 그대로 남아, 나머지 셋이 어느 트리에서 나왔는지가 사라진다. 그 상태가 갈림을 못 잡게 한 자리다.
 */
export function mergeCodes(prior, targets) {
    return [...new Set([...(prior?.codes ?? []), ...targets])].sort();
}
