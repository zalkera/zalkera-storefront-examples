import {mediaSrc} from "@zalkera/client";
import {safeLinkUrl} from "./safeUrl.ts";

/**
 * 본문의 **불변 미디어 참조** `media:{id}` 해석 — 콘솔이 박는 문자열을 실제 주소로 바꾼다.
 *
 * ## 왜 필요한가 (이것이 없으면 본문 이미지가 전부 깨진다)
 *
 * 콘솔 미디어 드로어는 본문에 **presigned URL 을 안 박는다** — 수 분 뒤 만료되면 ISR 로 캐시된
 * HTML 안에서 죽기 때문이다. 대신 만료되지 않는 참조를 박고 **렌더 시점에 각자 해석**하기로 했다
 * (콘솔 정본: `zalkera-frontend-partner` 의 `src/shared/lib/media-ref.ts` · 삽입부는 같은 레포
 * `src/features/media/ui/MediaDrawer.tsx`).
 *
 *  - 이미지 → `![이름](media:{id})`
 *  - 자체 영상 → ` ```videofile ` 펜스 안에 `media:{id}`
 *
 * 그 해석이 없으면 `media:12` 가 소독기의 **모르는 스킴**이라 `#` 이 되고, `<img src="#">` 는
 * 브라우저가 **그 쪽 HTML 을 이미지로 다시 요청**하는 형태다 — 깨진 이미지 + 헛된 왕복이다.
 *
 * ⚠ **판정을 여기 말고 다른 데 또 적지 마라.** 렌더러가 직접 정규식을 들면 그 사본이 콘솔과
 *   갈리는 날 아무도 못 본다. 새 소비자는 이 함수를 부른다.
 */
const MEDIA_REF = /^media:(\d+)$/;

/**
 * 참조된 asset id — 참조가 아니거나 형식이 어긋나면 `null`.
 *
 * 콘솔 쪽 판정(`resolveMediaRef`)과 **같은 정규식**이다. `media:0` 은 id 가 아니고
 * (`/media/0` 은 백엔드에 없다), 안전정수를 넘는 값도 거른다 — `Number` 가 반올림해
 * **다른 자산**을 가리키게 되기 때문이다(`media:12345678901234567890` → `12345678901234567000`).
 */
export function resolveMediaRef(raw: string | null | undefined): number | null {
    if (typeof raw !== "string") return null;
    const match = MEDIA_REF.exec(raw.trim());
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * 본문 미디어의 최종 주소. 참조면 안정 URL(`/media/{id}` — 팩의 프록시 라우트)로, 그 외에는
 * 소독기를 태운 **뒤 한 번 더 좁힌다.**
 *
 * ⚠ **이미지 주소는 링크 주소보다 좁다.** 소독기는 링크용이라 `mailto:`·`tel:`·`#조각` 을
 *   통과시키는데(링크로는 정당하다) 그것들은 이미지가 될 수 없다 — `src="#조각"` 은 브라우저가
 *   **그 쪽 자신**으로 풀어 HTML 을 이미지로 다시 받는다. `http:` 도 뺀다: 사이트는 https 라
 *   혼합 콘텐츠로 어차피 막히고, 막히는 그림은 안 그리는 것이 낫다.
 *
 * 경로 조각을 손으로 잇지 않고 `mediaSrc` 를 부른다 — 주소 형태의 소유자는 client 하나다.
 * 못 쓰는 주소는 `#` 을 돌려준다. 호출자는 그때 **아무것도 안 그린다**(위 ⚠ 의 헛된 왕복).
 */
export function bodyMediaSrc(raw: string | null | undefined): string {
    const id = resolveMediaRef(raw);
    if (id !== null) return mediaSrc(id) ?? "#";

    const url = safeLinkUrl(raw);
    // 내부 절대경로(소독기가 이미 `//` 이탈을 걸렀다) 또는 https 만 남긴다.
    if (url.startsWith("/")) return url;
    return /^https:\/\//i.test(url) ? url : "#";
}
