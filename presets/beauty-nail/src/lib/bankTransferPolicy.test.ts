import test from "node:test";
import assert from "node:assert/strict";
import {parsePolicies} from "./commercePolicies.ts";

/**
 * **무통장 계좌 절이 성립하는 조건.**
 *
 * 이 판정 하나가 `/checkout` 의 결제수단 선택지를 켜고 끈다. 백엔드는 은행·계좌번호·**예금주**
 * 셋이 다 차 있을 때만 무통장 주문을 받으므로, 여기서 덜 세면 **선택지는 뜨는데 제출이 거절되는**
 * 화면이 나간다 — 고객은 정보를 다 넣은 뒤에 막힌다.
 *
 * ⚠ 이 표가 잡으려는 것은 「파서가 안 죽는다」가 아니라 **「어떤 설정에서 선택지가 뜨는가」**다.
 * 그래서 단언은 전부 «절이 있느냐/없느냐»로 쓴다 — 그것이 화면을 가르는 값이다.
 */

const FULL = {bankName: "국민은행", accountNo: "123-456-789", holder: "잘커라"};
const wrap = (bank: unknown) => JSON.stringify({bankTransfer: bank});

test("계좌 절은 세 칸이 다 있어야 성립한다", () => {
    assert.notEqual(parsePolicies(wrap(FULL)).bankTransfer, undefined, "세 칸이 다 찼는데 절이 죽었다");
});

/** 한 칸씩 빼면 전부 죽어야 한다 — 부분집합 어느 것도 「계좌」가 아니다. */
for (const missing of ["bankName", "accountNo", "holder"] as const) {
    test(`«${missing}» 이 없으면 절이 죽는다 — 백엔드가 그 설정을 거절한다`, () => {
        const bank: Record<string, unknown> = {...FULL};
        delete bank[missing];
        assert.equal(parsePolicies(wrap(bank)).bankTransfer, undefined, `${missing} 없이 선택지가 뜬다`);
    });

    test(`«${missing}» 이 공백뿐이어도 절이 죽는다 — 콘솔에서 지우면 빈 문자열이 남는다`, () => {
        assert.equal(parsePolicies(wrap({...FULL, [missing]: "   "})).bankTransfer, undefined);
    });

    test(`«${missing}» 이 문자열이 아니면 절이 죽는다`, () => {
        assert.equal(parsePolicies(wrap({...FULL, [missing]: {ko: "국민"}})).bankTransfer, undefined);
    });
}

test("앞뒤 공백은 다듬어 싣는다 — 콘솔에서 붙여 넣으면 흔히 딸려 온다", () => {
    const bank = parsePolicies(wrap({bankName: " 국민은행 ", accountNo: " 123 ", holder: " 잘커라 "})).bankTransfer;
    assert.deepEqual(bank, {bankName: "국민은행", accountNo: "123", holder: "잘커라", dueDays: undefined});
});

test("dueDays 는 1~7 정수만 — 밖이면 그 칸만 버리고 절은 산다", () => {
    for (const bad of [0, 8, -1, 3.5, "3", null]) {
        const bank = parsePolicies(wrap({...FULL, dueDays: bad})).bankTransfer;
        assert.notEqual(bank, undefined, `dueDays=${String(bad)} 이 절을 통째로 죽였다`);
        assert.equal(bank?.dueDays, undefined, `dueDays=${String(bad)} 이 실렸다`);
    }
    // 양성 짝 — 「늘 undefined」로 위 단언이 참이 되면 안 된다.
    assert.equal(parsePolicies(wrap({...FULL, dueDays: 5})).bankTransfer?.dueDays, 5);
});

test("절이 아예 없거나 쓰레기면 죽는다 — 그리고 페이지는 안 죽는다", () => {
    for (const raw of [null, "", "{", "null", "[]", "{}", wrap(null), wrap("계좌"), wrap([FULL])]) {
        assert.equal(parsePolicies(raw).bankTransfer, undefined, `«${String(raw).slice(0, 20)}» 이 통과했다`);
    }
});

test("다른 정책 절은 계좌와 무관하게 산다 — 한 절이 죽어도 옆이 안 죽는다", () => {
    const raw = JSON.stringify({bankTransfer: {bankName: "국민"}, shipping: {notes: "3일"}});
    const p = parsePolicies(raw);
    assert.equal(p.bankTransfer, undefined);
    assert.deepEqual(p.shipping, {notes: "3일"});
});
