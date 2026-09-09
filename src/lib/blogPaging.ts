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

/**
 * 경로 세그먼트 → **2쪽 이상의 쪽 번호**. 그 꼴이 아니면 `null`(호출자는 404).
 *
 * ## 왜 `Number()` 로 읽지 않는가
 *
 * 한 판 `Number(value)` + `isSafeInteger` 였고, 그것은 **표기를 정규화하지 않는다** — `03`·`0003`·
 * `0x3`·`0b11`·`0o3`·`3e0`·`3.`·`2.0` 이 전부 통과했다. 그 주소들은 각자 열려 **자기를 canonical
 * 이라 주장**한다(루트 layout 이 `alternates.canonical: "./"` 로 요청 경로를 그대로 낸다).
 * 1쪽을 양쪽에서 막은 근거가 「같은 내용이 두 주소에 서면 색인이 갈린다 · 우리가 **만든 적 없는
 * 주소로 들어올 때** 열린다」인데, 그 구멍이 무한히 나 있었다(심의 실물 확인).
 *
 * 그래서 **꼴을 요구한다**: 앞자리 0 없는 십진수, 2 이상.
 *
 * ⚠ **1쪽은 여기서 `null` 이다.** `/blog/page/1` 은 `/blog` 와 같은 내용이라 두 주소가 된다.
 *   [blogPagePath] 도 1쪽을 `/blog` 로 만든다 — 만드는 쪽과 받는 쪽 둘 다 막아야 한다.
 */
export function parseBlogPageSegment(raw: string): number | null {
    if (!/^[1-9][0-9]{0,8}$/.test(raw)) return null;
    const page = Number(raw);
    return page >= 2 ? page : null;
}

/**
 * 「다음 쪽」을 그릴 것인가 — 이 판정이 **발견 경로를 만든다.**
 *
 * ⚠ **백엔드가 죽으면(`null`) 안 그린다.** 마지막 쪽인지 모를 때 없는 쪽으로 크롤러를 보내지
 *   않는다. 한 판 이 자리에 그물이 없어, `false` 로 고정하는 변이(=「다음」이 통째로 사라져
 *   21번째 글이 다시 도달 불가)가 전 게이트를 통과했다.
 */
export function hasNextPage(posts: {last?: boolean} | null): boolean {
    return posts !== null && posts.last === false;
}

/**
 * 범위 밖 쪽인가 — **글이 0건인 2쪽 이상**은 없는 쪽이다(호출자는 404).
 *
 * ⚠ **200 빈 목록을 내지 마라.** 그것은 소프트 404 이고, `page > 1` 이면 「이전」이 무조건
 *   그려져 `/blog` 까지 이어지는 빈 쪽 사슬의 입구가 된다. 글을 지워 쪽 수가 줄면 **이미 색인된**
 *   쪽이 그 상태로 남는다. 같은 판단이 `sitemap.ts`(「빈 목록 페이지를 색인시킬 이유가 없다」)와
 *   `BlogList`(글 0건이면 `ItemList` 를 안 낸다)에 이미 있다 — 라우트에만 없었다.
 */
export function isOutOfRange(page: number, itemCount: number): boolean {
    return page > 1 && itemCount === 0;
}
