/**
 * **동적 라우트 세그먼트를 읽는 자리.** `params` 가 주는 값은 **퍼센트 인코딩된 원문**이다.
 *
 * ■ 왜 필요한가
 *   `generateStaticParams` 는 디코드된 값(`회사연혁`)을 돌려주는데, 그 값으로 만들어진 라우트의
 *   페이지 컴포넌트는 **인코딩된 값**(`%ED%9A%8C%EC%82%AC%EC%97%B0%ED%98%81`)을 받는다. 두 값이
 *   다르므로 `pages[slug]` 같은 조회가 miss 하고 `notFound()` 로 떨어진다 — 그런데 `sitemap.ts` 는
 *   디코드된 값으로 URL 을 만들어 **그 404 를 크롤러에 광고한다.**
 *
 *   ASCII slug 는 인코딩이 항등이라 이 결함이 안 보인다. 한국어 사이트에서 한글 페이지명은 예외가
 *   아니라 기본값이고, 배송 문서가 드는 예제 자체가 `content/pages/회사연혁.json` 이다.
 *
 * ■ 왜 판정을 한 자리에 두나
 *   동적 세그먼트를 읽는 자리가 열 곳이 넘고, 한 라우트 안에서도 `generateMetadata` 와 컴포넌트가
 *   **각각** 읽는다. 한 곳만 고치면 제목은 나오는데 본문이 404 인 형상이 된다.
 *
 * 재현: `content/pages/회사연혁.json` 을 배선하고 `npm run build` →
 * `.next/server/app/회사연혁.meta` 의 `status` 가 `404` 인지 본다.
 */

/**
 * 세그먼트를 사람이 쓴 값으로 되돌린다.
 *
 * ⚠ 못 되돌리면 **원문을 그대로 준다.** `decodeURIComponent` 는 홀로 선 `%` 에 `URIError` 를 던지는데,
 *   그것은 방문자가 주소창에 아무거나 쳐도 만들 수 있는 입력이다 — 500 을 내는 대신 조회를 miss 시켜
 *   정상적인 404 로 떨어뜨린다.
 */
/**
 * `?page=` 를 **1-기반 쪽 번호**로 읽는다 — 못 읽으면 1.
 *
 * ⚠ **던지지 않는다.** 크롤러·손편집이 `?page=abc`·`-1`·`0`·`1e999`·`?page=1&page=2` 를 보낸다.
 *   던지면 그 주소가 500 이 되고, 크롤러는 한 번 본 링크를 **다시 온다** — 500 이 굳는다.
 *   조용히 1로 접으면 첫 쪽이 나가고 그 쪽의 canonical 이 스스로를 가리킨다.
 *
 * ⚠ **안전정수 밖은 거절한다.** `Number("1e999")` 는 `Infinity` 이고 `Number("9007199254740993")` 는
 *   **다른 수로 반올림된다** — 그 값을 `page - 1` 로 백엔드에 넘기면 무슨 쪽을 받을지 모른다
 *   (`resolveMediaRef` 가 같은 이유로 안전정수를 요구한다).
 */
export function pageParam(raw: string | string[] | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string" || value.trim() === "") return 1;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

export function routeParam(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}
