/**
 * **팩 관문 판정부의 시험.** 파일시스템·git 을 안 만지므로 CI 에서도 전 분기를 밟는다.
 *
 * 종전에는 이 판정이 `pack-preset.mjs` 안에 있었고, 「같은 트리 이어굽기」 분기는 트리가 깨끗하고
 * `dist-presets/` 에 같은 번호가 있어야만 섰다. CI 는 그 폴더가 gitignore 라 늘 비어 있었으므로
 * 그 분기도, 단조성 관문 자체도 한 번도 안 밟혔다.
 *
 * 재현: `node --experimental-strip-types --test scripts/lib/packGate.test.mjs`
 */
import {deepStrictEqual, ok, strictEqual} from "node:assert/strict";
import {test} from "node:test";
import {cmpVersion, mergeCodes, packGateDecision} from "./pack-gate.mjs";

const CLEAN = {head: "aaaaaaa", dirty: false, allowRewind: false};
const decide = (over) => packGateDecision({...CLEAN, ...over});

test("cmpVersion 은 숫자로 본다 — 사전순이면 1.4.9 가 1.4.10 보다 크다", () => {
    ok(cmpVersion("1.4.10", "1.4.9") > 0, "1.4.10 이 1.4.9 보다 커야 한다");
    ok(cmpVersion("1.5.0", "1.4.99") > 0);
    strictEqual(cmpVersion("1.4.43", "1.4.43"), 0);
});

test("판정표 — 각 줄이 하나의 자리다", () => {
    const rows = [
        // [설명, 입력, 기대 code, 기대 appendable]
        ["빈 폴더 첫 굽기", {version: "1.4.44", localMax: null, prior: undefined}, null, false],
        ["더 높은 번호", {version: "1.4.44", localMax: "1.4.43", prior: undefined}, null, false],
        ["같은 번호인데 원장에 없다", {version: "1.4.43", localMax: "1.4.43", prior: undefined}, "NOT_HIGHER", false],
        ["낮은 번호", {version: "1.4.42", localMax: "1.4.43", prior: undefined}, "NOT_HIGHER", false],
        [
            "낮은 번호 + --allow-rewind 는 사람 판단",
            {version: "1.4.42", localMax: "1.4.43", prior: undefined, allowRewind: true},
            null,
            false,
        ],
        [
            "같은 깨끗한 트리에서 세트를 잇는다",
            {version: "1.4.43", localMax: "1.4.43", prior: {head: "aaaaaaa", dirty: false, codes: ["skeleton"]}},
            null,
            true,
        ],
        [
            "다른 트리에서 같은 번호",
            {version: "1.4.43", localMax: "1.4.43", prior: {head: "bbbbbbb", dirty: false, codes: ["skeleton"]}},
            "LEDGER_SPLIT",
            false,
        ],
        [
            "원장이 더러운 트리에서 나왔다",
            {version: "1.4.43", localMax: "1.4.43", prior: {head: "aaaaaaa", dirty: true, codes: ["skeleton"]}},
            "LEDGER_SPLIT",
            false,
        ],
        [
            "지금 트리가 더럽다 — sha 로 판본을 못 짚는다",
            {
                version: "1.4.43",
                localMax: "1.4.43",
                prior: {head: "aaaaaaa", dirty: false, codes: ["skeleton"]},
                dirty: true,
            },
            "LEDGER_SPLIT",
            false,
        ],
        [
            "원장에 있는데 옆에 더 높은 판이 있다 — 이어굽기가 아니라 되돌리기다",
            {version: "1.4.42", localMax: "1.4.43", prior: {head: "aaaaaaa", dirty: false, codes: ["skeleton"]}},
            "NOT_HIGHER",
            false,
        ],
    ];
    for (const [what, input, code, appendable] of rows) {
        const d = decide(input);
        strictEqual(d.code, code, `${what}: code`);
        strictEqual(d.appendable, appendable, `${what}: appendable`);
        strictEqual(d.allow, code === null, `${what}: allow 는 code 와 어긋나면 안 된다`);
    }
});

test("--allow-rewind 로는 원장을 못 비킨다 — 갈린 판본은 사람이 승인할 성질이 아니다", () => {
    // 두 관문이 지키는 것이 다르다. 되돌리기는 사람이 책임질 수 있지만, 한 버전이 두 트리에서
    // 나온 것은 테넌트마다 다른 소스를 받는 사고다.
    const d = decide({
        version: "1.4.43",
        localMax: "1.4.43",
        prior: {head: "bbbbbbb", dirty: false, codes: ["skeleton"]},
        allowRewind: true,
    });
    strictEqual(d.code, "LEDGER_SPLIT");
    strictEqual(d.allow, false);
});

test("원장은 덮지 않고 잇는다 — 덮으면 나머지 셋의 출처가 사라진다", () => {
    deepStrictEqual(mergeCodes({codes: ["skeleton"]}, ["beauty-nail", "biz-standard"]), [
        "beauty-nail",
        "biz-standard",
        "skeleton",
    ]);
    deepStrictEqual(mergeCodes({codes: ["skeleton"]}, ["skeleton"]), ["skeleton"], "중복이 늘면 안 된다");
    deepStrictEqual(mergeCodes(undefined, ["skeleton"]), ["skeleton"], "첫 굽기");
});
