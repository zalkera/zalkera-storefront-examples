/**
 * **sitemap 에서 빼는 최상위 이름.** 콘텐츠 slug 가 이 이름이면 `sitemap.xml` 에 넣지 않는다.
 *
 * 빼는 이유는 **둘뿐**이고, 둘 다 트리에서 확인할 수 있다:
 *
 * ⑴ **가려진다** — 그 경로에 페이지나 라우트 핸들러가 이미 있다. Next 는 정적 세그먼트를 `[slug]`
 *    보다 우선하므로, slug 가 `cart` 인 페이지를 만들어도 `/cart` 는 장바구니가 뜬다. 그 URL 을
 *    sitemap 에 실으면 크롤러에게 **페이지가 아닌 것을 페이지라고** 알리는 셈이다.
 *
 * ⑵ **크롤러에게 막아 둔 곳이다** — `robots.ts` 가 `disallow` 로 적은 경로. sitemap 은 "색인하라"
 *    이고 robots 는 "하지 마라" 라, 둘 다 적으면 우리가 스스로 모순된 말을 한다.
 *
 * ⚠ **디렉터리가 있다고 가려지는 것이 아니다.** `src/app/c/` 안에 `[slug]/` 만 있으면 `/c` 자체는
 *   `[slug]` 가 만든다 — 그런 이름을 여기 넣으면 **멀쩡히 서는 페이지가 sitemap 에서 조용히 빠진다.**
 *   `src/lib/reservedSegments.test.ts` 가 두 이유를 각각 트리에서 도출해 이 목록과 대조한다.
 *
 * ■ 라우트를 더하거나 **지우셨다면**
 *   이 목록도 같이 고치십시오. 기업 사이트에서 `cart`·`checkout`·`products` 를 지우는 것은 흔한
 *   첫 손질인데, 지운 이름을 여기 남겨 두면 그 slug 의 페이지가 sitemap 에서 빠집니다.
 *   `robots.ts` 의 `disallow` 도 같이 정리하십시오 — 이 목록은 그 둘에서 도출됩니다.
 *   어느 쪽으로 어긋났는지는 `npm test` 가 이름을 대고 말해 줍니다.
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
    // ⑴ 가려짐 — 그 경로에 page/route 가 있다
    "blog",
    "cart",
    "checkout",
    "contact",
    "login",
    "mypage",
    "policies",
    "products",
    // ⑵ robots 가 막는 곳
    "api",
    "auth",
    "orders",
]);
