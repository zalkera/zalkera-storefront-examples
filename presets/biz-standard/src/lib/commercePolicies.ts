/**
 * `site_config.commerce_policies` — 테넌트가 채운 **스키마리스 JSON** 의 읽기 전용 뷰.
 *
 * ⚠ `.tsx` 가 아니라 `.ts` 에 산다. 순수 파싱이라 JSX 가 없고, **그래야 시험이 이 함수를 직접
 * 부를 수 있다** — node 시험 러너는 `.tsx` 를 못 읽는다(`ERR_UNKNOWN_FILE_EXTENSION`).
 * 화면을 가르는 판정(무통장 선택지)이 여기 있으므로 그물이 닿는 자리에 두는 것이 요점이다.
 */

/**
 * 테넌트가 채운 커머스 정책(스키마리스 JSON)의 **읽기 전용 뷰**. 파싱 실패·미설정이면 빈 객체 —
 * 정책은 부가 정보라 여기서 페이지를 죽이지 않는다.
 *
 * 서버가 스키마를 못박지 않는 자리라(문구가 테넌트·업태마다 다르다) 소비 쪽에서 방어적으로 읽는다.
 */
export type CommercePolicies = {
    returns?: {windowDays?: number; notes?: string};
    exchange?: {notes?: string};
    shipping?: {notes?: string};
    as?: {notes?: string};
    /**
     * 무통장입금 수취 계좌. **이 절이 있어야 무통장 주문이 성립한다** — 없으면 백엔드가
     * `checkout({paymentMethod: "BANK_TRANSFER"})` 를 409 `BANK_TRANSFER_NOT_CONFIGURED` 로 막는다.
     * 그래서 화면은 이 절의 유무로 결제수단 선택지를 낸다.
     *
     * ⚠ `dueDays` 는 **참고값**이다. 마감의 정본은 주문이 들고 오는 `paymentDueAt` 이고,
     * 백엔드가 1~7일로 조여 적용한다 — 화면에 마감을 적을 때는 반드시 `paymentDueAt` 을 써라.
     *
     * ⛔ 세 칸(`bankName`·`accountNo`·`holder`)은 **선택이 아니다** — 절이 있으면 셋이 다 있다.
     * 하나라도 없으면 파서가 절을 통째로 버린다(백엔드가 그 설정을 409 로 막기 때문).
     */
    bankTransfer?: {bankName: string; accountNo: string; holder: string; dueDays?: number};
};

/**
 * 정책 JSON 을 읽는다 — **절대 throw 하지 않고, 선언한 타입이 참이 되도록 필드까지 좁힌다.**
 *
 * 최상위 한 겹만 보면 부족하다. `JSON.parse("null")` 이 `null` 을 돌려주는 것도 문제지만,
 * 통과시킨 뒤 `as CommercePolicies` 로 캐스트하면 **필드 타입에 대해 계속 거짓말**을 한다:
 * `{"returns":{"notes":{"ko":"…","en":"…"}}}` 처럼 다국어 객체를 넣으면(스키마리스 패스스루에서
 * 가장 흔한 확장 모양이다) `policies/page.tsx` 가 그 값을 React 자식으로 그려
 * "Objects are not valid as a React child" 로 `/policies` 가 500 이 된다.
 *
 * 그래서 `src/lib/seo.ts` 의 `parseSeo` 와 **같은 깊이로** — 객체 판정 + 필드별 `typeof` 확인까지 한다.
 * 값이 형에 안 맞으면 그 필드만 버린다(절 전체를 버리지 않는다). 정책은 부가 정보라
 * 여기서 페이지를 죽이지 않는 것이 계약이다.
 */
function asPlainObject(value: unknown): Record<string, unknown> | null {
    // 배열·null 도 typeof "object" 를 통과한다.
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** 문자열이 아니면 버린다 — 객체·배열이 React 자식으로 새어 나가는 것을 막는 자리다. */
function asNotes(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/** `merchantReturnDays` 는 음수·소수·NaN 이 의미가 없다(구글도 정수를 요구한다). */
function asWindowDays(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** `notes` 하나만 갖는 절(교환·배송·A/S). 남는 필드가 없으면 절 자체를 내지 않는다. */
function notesSection(value: unknown): {notes?: string} | undefined {
    const obj = asPlainObject(value);
    const notes = obj ? asNotes(obj.notes) : undefined;
    return notes === undefined ? undefined : {notes};
}

export function parsePolicies(raw: string | null): CommercePolicies {
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    const root = asPlainObject(parsed);
    if (!root) return {};

    const returnsObj = asPlainObject(root.returns);
    const windowDays = returnsObj ? asWindowDays(returnsObj.windowDays) : undefined;
    const returnNotes = returnsObj ? asNotes(returnsObj.notes) : undefined;

    return {
        returns: windowDays === undefined && returnNotes === undefined ? undefined : {windowDays, notes: returnNotes},
        exchange: notesSection(root.exchange),
        shipping: notesSection(root.shipping),
        as: notesSection(root.as),
        bankTransfer: bankTransferSection(root.bankTransfer),
    };
}

/**
 * 계좌 절. **은행·계좌번호·예금주 셋이 다 있어야 절이 성립한다.**
 *
 * ⛔ **셋이다 — 둘이 아니다.** 백엔드는 셋 중 하나라도 blank 인 설정을 무통장 불가로 본다
 * (`BANK_TRANSFER_NOT_CONFIGURED`). 여기서 둘만 세면 예금주가 빈 설정에서 화면에 「무통장입금」
 * 선택지가 뜨고, 고객은 정보를 다 넣고 제출한 뒤에야 거절을 본다.
 *
 * 재현: `npm test` → `계좌 절은 세 칸이 다 있어야 성립한다` 가 red.
 *
 * `dueDays` 는 정수 1~7 만 받는다(백엔드가 그 범위로 조인다). 밖이면 그 필드만 버린다 —
 * 절을 통째로 버리면 계좌가 멀쩡한데 무통장이 안 뜬다.
 */
function bankTransferSection(value: unknown): CommercePolicies["bankTransfer"] {
    const obj = asPlainObject(value);
    if (!obj) return undefined;
    const bankName = asNotes(obj.bankName)?.trim();
    const accountNo = asNotes(obj.accountNo)?.trim();
    const holder = asNotes(obj.holder)?.trim();
    if (!bankName || !accountNo || !holder) return undefined;
    const raw = obj.dueDays;
    const dueDays = typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : undefined;
    return {bankName, accountNo, holder, dueDays};
}
