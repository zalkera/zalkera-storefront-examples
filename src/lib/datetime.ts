/**
 * **사이트의 시각 표시는 한 시간대로 못박는다.**
 *
 * ## 왜 이 파일이 생겼나
 *
 * `toLocale*` 은 `timeZone` 을 안 주면 **그것이 도는 기계의 시간대**를 쓴다. 그 기계는 둘 다 될 수 있다:
 *  · RSC·라우트 핸들러라면 **서빙 박스** — 컨테이너는 대개 UTC 다.
 *  · 클라이언트 아일랜드라면 **방문자 브라우저** — 어디서 보든 그 사람의 시간대다.
 *
 * 둘 다 사고가 난다. 재현은 이 파일의 시험이 든다 — `npm test` 가 다섯 시간대로 자식을 띄워
 * 같은 답이 나오는지 대조하고, `timeZone` 을 지우면 red 가 된다:
 *  · 가게 시계로 **자정**인 `paymentDueAt` 이 UTC 박스에서 **전날**로 찍힌다. 하필 **마감**이라
 *    하루가 어긋나면 고객이 주문을 잃는다.
 *  · 14:00 KST 예약 슬롯 → UTC 브라우저 **05:00** · Kiritimati **19:00**. 방문자가 다른 시각에 온다.
 *  · 22:00 KST 슬롯 → Kiritimati 브라우저에서 **다음 날**로 묶인다(달력 칸이 통째로 어긋난다).
 *
 * ## 규칙
 *
 * ⛔ **`toLocale*` 을 직접 부르지 마라 — 이 파일의 함수를 써라.** 값이 한 곳에 있어야 사이트를
 * 다른 나라에 낼 때 **한 줄만** 고친다. 사본이 흩어지면 그중 하나가 조용히 낡는다.
 *
 * ⚠ 금액(`Number.toLocaleString`)은 시간대와 무관하므로 이 파일의 소관이 아니다.
 */

/**
 * 이 사이트가 시각을 말하는 기준 시간대. **가게가 있는 곳**이지 방문자가 있는 곳이 아니다 —
 * 예약 시각·입금 마감은 가게의 시계로 말해야 방문자가 제 시간에 온다.
 *
 * 다른 나라에 사이트를 내면 이 값을 바꾼다(IANA 시간대 이름).
 */
export const SITE_TIME_ZONE = "Asia/Seoul";

/** 이 사이트의 표시 로케일. 시간대와 짝이라 같이 둔다. */
export const SITE_LOCALE = "ko-KR";

/** 날짜만 — 「2026. 9. 11.」 */
export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
    return new Date(iso).toLocaleDateString(SITE_LOCALE, {timeZone: SITE_TIME_ZONE, ...options});
}

/** 날짜 + 시각 — 「2026. 9. 11. 오전 12:00」 */
export function formatDateTime(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
    return new Date(iso).toLocaleString(SITE_LOCALE, {timeZone: SITE_TIME_ZONE, ...options});
}

/** 시각만 — 「오후 02:00」 */
export function formatTime(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
    return new Date(iso).toLocaleTimeString(SITE_LOCALE, {
        timeZone: SITE_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        ...options,
    });
}

/**
 * 달력 칸 키 — `YYYY-MM-DD`(가게 시간대 기준).
 *
 * ⚠ `sv-SE` 로케일을 쓰는 이유는 그것이 ISO 모양(`YYYY-MM-DD`)을 내주기 때문이다.
 * 로케일을 바꿔도 이 함수의 **출력 모양은 바뀌면 안 된다** — 키라서 그렇다(`SITE_LOCALE` 과 무관).
 */
export function dayKey(iso: string): string {
    return new Date(iso).toLocaleDateString("sv-SE", {timeZone: SITE_TIME_ZONE});
}

/**
 * [dayKey] 가 만든 키를 사람이 읽는 라벨로 — 「9. 11. (금)」
 *
 * ⛔ **키를 `new Date(\`${ymd}T00:00:00\`)` 로 되읽지 마라.** 그 문자열은 **그 기계의 시간대**로
 * 해석돼서, 동쪽 끝 브라우저(UTC+14)에서는 하루 앞으로 밀린다. 오프셋을 명시해 못박는다.
 *
 * ⚠ 그래서 이 함수는 `SITE_TIME_ZONE` 이 **KST 라는 사실에 오프셋으로 묶여 있다**. 시간대를 바꾸면
 * 아래 `+09:00` 도 같이 바꿔야 한다 — `DAY_KEY_OFFSET` 이 그 짝이고, 시험이 둘의 일치를 잰다.
 */
export const DAY_KEY_OFFSET = "+09:00";

export function formatDayKey(ymd: string, options: Intl.DateTimeFormatOptions = {}): string {
    return new Date(`${ymd}T00:00:00${DAY_KEY_OFFSET}`).toLocaleDateString(SITE_LOCALE, {
        timeZone: SITE_TIME_ZONE,
        ...options,
    });
}
