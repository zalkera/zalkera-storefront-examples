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
 * 본문 미디어의 최종 주소 — **못 쓰는 주소면 `null`**(호출자는 그때 아무것도 안 그린다).
 *
 * ⚠ **`null` 이 그물이다.** 문자열 센티넬(`"#"`)을 돌려주면 호출자가 그 검사를 지워도 컴파일이
 *   통과하고, `<img src="#">` 가 그 쪽 HTML 을 이미지로 다시 요청한다. `null` 이면 검사를 지우는
 *   순간 타입이 막는다.
 *
 * ⚠ **이미지 주소는 링크 주소보다 좁다.** 소독기는 링크용이라 `mailto:`·`tel:`·`#조각`·상대경로를
 *   통과시키는데(링크로는 정당하다) 그것들은 이미지가 될 수 없다. `http:` 도 뺀다 — 사이트는
 *   https 라 혼합 콘텐츠로 어차피 막히고, 막히는 그림은 안 그리는 것이 낫다. 상대경로는
 *   **막는다**: 소독기가 루트 기준으로 정규화해 저작기 미리보기와 **다른 주소**를 그린다.
 *
 * ⚠ **스킴 판정은 파서에 묻는다**(`safeUrl.ts` 와 같은 규율) — 문자로 보면 `ht<TAB>tps:` 처럼
 *   브라우저는 https 로 읽는 값을 놓친다.
 *
 * 경로 조각을 손으로 잇지 않고 `mediaSrc` 를 부른다 — 주소 형태의 소유자는 client 하나다.
 */
export function bodyMediaSrc(raw: string | null | undefined): string | null {
    const id = resolveMediaRef(raw);
    if (id !== null) return mediaSrc(id) ?? null;

    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "") return null;

    const internal = value.startsWith("/") && !value.startsWith("//");
    if (!internal && protocolOf(value) !== "https:") return null;

    const safe = safeLinkUrl(value);
    // 소독기가 무력화했거나(`#`) 사이트 루트로 접혔으면(`"   "`·`/..`) 그릴 것이 없다.
    return safe === "#" || safe === "/" ? null : safe;
}

/** 브라우저와 같은 파서로 스킴을 읽는다. 절대 URL 이 아니면 `null`. */
function protocolOf(value: string): string | null {
    try {
        return new URL(value).protocol;
    } catch {
        return null;
    }
}

/**
 * 자체 업로드 영상의 주소 — **불변 참조만** 받는다.
 *
 * 🔴 여기서 외부 주소를 받으면 방문자가 아무 조작도 안 했는데 `preload="metadata"` 가 그 호스트로
 *    나간다(IP·UA 가 제3자에게 간다 · 실측). 외부 영상은 ```` ```video ```` 펜스의 몫이고 그쪽은
 *    링크로만 그린다. 그래서 이 함수는 [bodyMediaSrc] 보다 **한 겹 더 좁다**.
 */
export function bodyVideoSrc(raw: string | null | undefined): string | null {
    const id = resolveMediaRef(raw);
    return id === null ? null : (mediaSrc(id) ?? null);
}
