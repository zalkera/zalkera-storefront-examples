/**
 * 블로그 목록의 **쪽 주소**와 쪽 크기.
 *
 * ## 왜 쿼리가 아니라 경로 세그먼트인가
 *
 * `?page=N` 으로 받으면 Next 가 물음표 뒤를 미리 알 수 없어 **`/blog` 가 1쪽까지 포함해 동적
 * 렌더로 강등된다** — 요청마다 서버가 그린다. 블로그 목록은 크롤러가 가장 자주 오는 쪽이고
 * AEO 가 이 제품의 셀링이라, 그 트래픽이 곧 늘어날 트래픽이다.
 *
 * 실측(라우트 표): 쿼리 판은 `ƒ /blog`, 경로 세그먼트 판은 `○ /blog  5m`.
 * 재현: `ZALKERA_API_BASE=http://localhost:8100 ZALKERA_TENANT=ci-placeholder`
 * `ZALKERA_OFFLINE_BUILD=1 npm run build` 의 라우트 표에서 `/blog` 줄을 본다.
 *
 * 형제 `products/page.tsx` 가 같은 이유로 `searchParams` 를 **일부러 안 받는다**.
 *
 * ⚠ **글 주소와 안 부딪친다.** `/blog/page` 는 세그먼트가 둘이라 `/blog/[slug]` 가 받고
 *   (slug 가 `page` 인 글도 정상 접근된다), `/blog/page/{n}` 만 쪽 라우트가 받는다 — 재현:
 *   `python3 -c "import json,re; m=json.load(open('.next/routes-manifest.json'));`
 *   `[print(p, r['page']) for r in m['dynamicRoutes'] if r['page'].startswith('/blog')`
 *   ` for p in ['/blog/page','/blog/page/2'] if re.compile(r['regex']).match(p)]"`
 */

/** 한 쪽에 그리는 글 수. */
export const BLOG_PAGE_SIZE = 20;

/**
 * 쪽 번호 → 주소. **1쪽은 `/blog` 다** — `/blog/page/1` 을 따로 두면 같은 내용이 두 주소에 서서
 * 색인이 갈린다. 받는 쪽(`app/blog/page/[n]`)도 1쪽을 404 로 거절한다: 한쪽만 하면 크롤러가
 * 만든 적 없는 주소로 들어올 때 열린다.
 */
export function blogPagePath(page: number): string {
    return page <= 1 ? "/blog" : `/blog/page/${page}`;
}
