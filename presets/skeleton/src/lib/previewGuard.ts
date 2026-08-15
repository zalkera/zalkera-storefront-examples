/**
 * 프리뷰 모드 쓰기 차단의 **판정**. 순수 함수라 전수로 시험할 수 있다(`previewGuard.test.ts`).
 *
 * ## 왜 미들웨어인가 — 소스를 읽어서 재던 검사가 **네 판 연속** 뚫렸다
 *
 * 종전에는 "쓰기 핸들러는 저마다 `isPreview()` 를 부른다"는 **관례**를 두고, 그것을 지키는지 시험이
 * `route.ts` 를 **텍스트로 파싱**해 확인했다. 그 파서가 네 번 뚫렸다(전부 심의 실측):
 *
 *  ⑴ 파일 내용에 `"isPreview"` 가 있는가 → 가드를 지워도 **import 줄**이 남아 초록.
 *  ⑵ `^export async function` 만 핸들러로 셈 → `export const POST = async`·비동기 아닌 `function`·
 *     `route.js`·`api/` 밖이 세어지지도 않음.
 *  ⑶ 몸통을 다음 `^export ` 까지 자름 → 마지막 핸들러가 파일 끝까지를 몸통으로 봐서 아래 헬퍼의
 *     가드에 세탁됨. 절단자가 공백 리터럴이라 **탭 하나**로 실패.
 *  ⑷ 주석을 문자열보다 **먼저** 지움 → `"https://…"` 의 `//` 가 주석으로 먹혀 따옴표 짝이 깨지고,
 *     그런 URL 문자열이 **둘**이면 그 사이가 통째로 증발해 핸들러 선언 자체가 안 보임.
 *     **URL 은 웹 코드에서 가장 흔한 문자열이다.** 심의가 배송 `api/cart/items/route.ts` 에서 가드를
 *     지우고 URL 상수 둘을 앞뒤에 둔 것만으로 모든 게이트가 초록인 채 프리뷰 쓰기가 **운영 백엔드에
 *     도달**하는 것을 실 HTTP 로 실증했다.
 *
 * 정규식을 네 번 고쳤고 네 번 다 새 구멍이 났다. 다섯 번째를 고쳐도 여섯 번째가 온다 —
 * **문면을 파싱해서 규약 준수를 재는 접근 자체가 틀렸다.**
 *
 * 그래서 판정을 **요청 경로 하나**로 옮겼다(`src/middleware.ts`). 미들웨어는 라우트 소스를 **아예
 * 보지 않고** 실제 요청의 메서드·경로만 본다 — 선언 형태·주석·문자열·심링크·재수출 어느 것도
 * 우회할 수 없다. 새 라우트는 **아무것도 안 해도** 덮인다.
 *
 * ## 남는 목록 하나
 *
 * 면제 경로는 여기 한 곳에 있다. 목록이 남는 것은 사실이지만 종전과 방향이 반대다 — 빠뜨리면
 * **과하게 막혀서 403 이 눈에 띈다**(시끄러운 실패). 종전 관례는 빠뜨리면 **조용히 새어나갔다**.
 *
 * ## 라우트 핸들러의 `isPreview()` 는 남겨 둔다
 *
 * 미들웨어가 먼저 끊으므로 프리뷰에서는 그 가드에 도달하지 않는다. 그래도 지우지 않았다 —
 * 미들웨어가 빠지거나 matcher 가 잘못되는 날의 이중 방어이고, 지우는 편익이 없다.
 */

/** 본문을 만들 수 있는 메서드. `HEAD`·`OPTIONS`·`GET` 은 읽기다. */
export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 프리뷰에서도 막지 **않는** 경로. 사유는 각 라우트 파일 머리의
 * `// zalkera-allow-preview-write:` 마커에 한 줄로 적혀 있다.
 *
 * ⚠ 여기 넣는 것은 "운영 데이터를 써도 좋다"는 뜻이다. 넣기 전에 그 라우트가 **누구의** 데이터를
 *   건드리는지 확인하라 — 로그인·로그아웃은 프리뷰어 자기 세션이고, `revalidate` 는 고객 데이터가
 *   아니라 캐시이며 시크릿 헤더가 없으면 401 이다.
 */
export const PREVIEW_WRITE_ALLOW = [
    "/api/auth/logout",
    "/api/auth/social",
    "/api/auth/social/start",
    "/api/revalidate",
] as const;

/** 끝 슬래시·대소문자를 정규화한다 — `/api/revalidate/` 로 우회되지 않게. */
function normalize(pathname: string): string {
    const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return p.toLowerCase();
}

/**
 * 이 요청을 프리뷰에서 막아야 하는가. **프리뷰 여부는 여기서 안 본다** — 부르는 쪽이 판단한다
 * (그래야 이 함수가 순수해지고 전수 시험이 된다).
 */
export function isPreviewBlockedWrite(method: string, pathname: string): boolean {
    if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
    const p = normalize(pathname);
    return !PREVIEW_WRITE_ALLOW.some((allowed) => normalize(allowed) === p);
}
