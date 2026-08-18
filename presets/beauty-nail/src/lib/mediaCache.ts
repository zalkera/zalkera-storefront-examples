/**
 * `/media/{id}` 302 의 **캐시 상한 판정**.
 *
 * 이 302 의 `Location` 은 만료되는 서명 URL 이다. 서명보다 오래 캐시하면 방문자에게 죽은 링크가
 * 나가고, 아예 캐시하지 않으면 같은 방문자의 재방문도 백엔드를 다시 친다.
 *
 * ⚠ **상한을 숫자로 베껴 두지 않는다.** 서명 수명(`storage.presign-expiry-seconds`)은 설정으로
 *   바뀌는 값이라, 여기에 적어 두면 그 설정을 낮추는 날 캐시가 서명보다 오래 살고 **두 값이
 *   이어져 있다는 사실이 어디에도 안 적혀** 있다. 상류가 이미 자기 잔여 수명에서 계산해 보내므로
 *   그것을 읽는다.
 *
 * 세 가지를 지킨다:
 *   ⑴ **못 읽으면 캐시하지 않는다** — 모르는 것을 «캐시해도 된다»로 읽지 않는다.
 *   ⑵ **넓히지 않는다** — 상류가 `public` 이라 해도 `private` 로만 낸다(공유 캐시 설정은 이 레포
 *      밖이라 그 동작을 여기서 검증할 수 없다). 재검증을 요구하면(`no-cache`) 그것도 캐시로 바꾸지
 *      않는다.
 *   ⑶ **우리 상한으로 자른다** — 미디어를 교체했을 때 방문자가 옛 것을 보는 시간의 상한이다.
 *      서명 수명과는 별개의 이유라 상류가 아니라 우리가 정한다.
 */

/** 미디어를 교체했을 때 방문자가 옛 것을 보는 시간의 상한(초). */
export const MAX_MEDIA_CACHE_SECONDS = 120;

/** 상류가 캐시를 금지하거나 재검증을 요구하는 지시. 하나라도 있으면 캐시하지 않는다. */
const FORBIDS_REUSE = /(?:^|,)\s*(?:no-store|no-cache|must-revalidate|proxy-revalidate)\s*(?:,|$)/i;

/** 우리가 쓰는 유일한 수치. `s-maxage`(공유 캐시용)는 우리 것이 아니므로 `\b` 로 갈라낸다. */
const MAX_AGE = /(?:^|,)\s*max-age\s*=\s*(\d+)\s*(?:,|$)/i;

/**
 * 상류 `Cache-Control` 에서 우리가 낼 지시를 만든다.
 *
 * @param upstream 백엔드 응답의 `Cache-Control`. 없으면 `null`.
 * @returns `private, max-age=N` 또는 `no-store`. 그 둘 말고는 내지 않는다.
 */
export function cacheControlFrom(upstream: string | null): string {
    const directive = upstream ?? "";
    if (FORBIDS_REUSE.test(directive)) return "no-store";
    const maxAge = MAX_AGE.exec(directive)?.[1];
    if (maxAge === undefined) return "no-store";
    const seconds = Math.min(Number(maxAge), MAX_MEDIA_CACHE_SECONDS);
    return seconds > 0 ? `private, max-age=${seconds}` : "no-store";
}
