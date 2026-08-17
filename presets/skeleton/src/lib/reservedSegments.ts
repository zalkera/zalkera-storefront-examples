/**
 * **고정 라우트 세그먼트** — 이 이름과 같은 slug 의 콘텐츠 페이지는 sitemap 에 넣지 않는다.
 *
 * Next 는 정적 세그먼트를 `[slug]` 보다 우선한다. slug 가 `cart` 인 페이지를 만들어도 `/cart` 는
 * 장바구니가 뜬다 — 그 URL 을 sitemap 에 실으면 크롤러에게 **페이지가 아닌 것을 페이지라고** 알리는
 * 셈이고, 색인은 되는데 내용이 다르다.
 *
 * ■ 왜 별도 모듈인가
 *   이 목록은 **손으로 유지된다.** 라우트를 하나 더하고 여기 안 적으면 그 조합에서만 조용히
 *   되살아난다 — 실제로 `src/app/c/` 가 생긴 뒤 목록에 안 들어가 있었다. 라우트 파일에 두면
 *   시험이 그것만 따로 읽을 수 없어, 목록이 실제 라우트와 맞는지 아무도 못 잰다.
 *   `src/lib/reservedSegments.test.ts` 가 `src/app/` 을 훑어 대조한다.
 *
 * ■ 페이지를 더 만드셔도 됩니다
 *   여기 없는 이름은 그대로 sitemap 에 실린다. 라우트를 새로 만드셨다면 그 이름을 여기 더하십시오 —
 *   안 더하면 시험이 말해 줍니다.
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
    "api",
    "auth",
    "blog",
    "c",
    "cart",
    "checkout",
    "contact",
    "login",
    "media",
    "mypage",
    "orders",
    "payment",
    "policies",
    "products",
]);
