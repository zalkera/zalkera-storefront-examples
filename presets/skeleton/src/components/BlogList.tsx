import {ZalkeraError} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {siteUrl} from "@/lib/site";
import {JsonLd, breadcrumbJsonLd, itemListJsonLd} from "@/components/JsonLd";
import {formatDate} from "@/lib/datetime";
import {BLOG_PAGE_SIZE, OFFSET_EXCEEDED_CODE, PAGE_NOT_ADDRESSABLE, blogPagePath, hasNextPage} from "@/lib/blogPaging";

/**
 * 블로그 목록 한 쪽 — `/blog`(1쪽)와 `/blog/page/{n}`(2쪽 이상)이 **함께** 쓴다.
 *
 * 쪽 주소가 왜 쿼리가 아니라 경로 세그먼트인지는 `lib/blogPaging.ts` KDoc 이 근거와 재현 명령을
 * 함께 들고 있다.
 */
/**
 * 그 쪽의 글 — **백엔드가 죽어도 셸은 살아야 한다.** 실패는 삼키고 `null` 로 강하한다.
 *
 * ⚠ 쪽 라우트가 **범위 밖 판정**을 하려면 목록을 먼저 봐야 해서 밖으로 뺐다. 두 번 부르지 않도록
 *   그 결과를 [BlogList] 에 넘긴다.
 */
export async function listBlogPage(page: number) {
    return zalkera.listPosts({page: page - 1, size: BLOG_PAGE_SIZE, sort: "publishedAt,desc"}).catch((error: unknown) =>
        // 🔴 **오프셋 상한 거절만 「없음」이다 — 나머지는 전부 「모름」.** 그 쪽이 주소로 없다는 것은
        //    백엔드가 `PUBLIC_LIST_OFFSET_EXCEEDED` 로 **말해 준다**. 「모름」으로 접으면 `n >= 501` 이
        //    전부 200 소프트 404 로 서고 그 주소 집합은 무한하다.
        //    형제 `blog/[slug]`·`products/[slug]` 가 404 를 `notFound()` 로 옮기는 것과 같은 자리다.
        //
        // ⛔ **상태(400)로 가르지 마라.** 한 판 `error.status === 400` 이었는데, 400 은 이 호출에서
        //    하나가 아니다 — 테넌트 헤더 누락(`TENANT_HEADER_MISSING`) · 중간 장비의 비JSON 400 ·
        //    그리고 이 파일을 고치는 사람이 `listPosts` 에 인자를 하나 붙이는 순간 열리는 검증 400.
        //    그때 설정 오류 하나가 블로그 **전 쪽**을 404 로 만들고 `revalidate` 동안 굳는다(보안 축 심의 🟠).
        error instanceof ZalkeraError && error.code === OFFSET_EXCEEDED_CODE ? PAGE_NOT_ADDRESSABLE : null,
    );
}

export async function BlogList(props: {page: number; posts?: Awaited<ReturnType<typeof listBlogPage>>}) {
    const {page} = props;
    // ⚠ **인자가 «왔는가» 로 가른다.** `!== undefined` 로 가르면 라우트가 넘긴 값이 `undefined`
    //    일 때 가드가 풀려 **부르지 않기로 한 자리에서 부른다**.
    //    ⚠ 지금 배송 형상에서는 Next 요청 메모이제이션이 그 왕복을 합쳐서 눈에 안 보인다 —
    //    「두 번 나간다」로 적지 마라(실물에서 재현되지 않는다). 판정을 정확히 두는 것이 이유다.
    const posts = "posts" in props ? props.posts : await listBlogPage(page);
    // 🔴 **「모름」과 「0건」을 가른다.** `?? []` 로 접으면 상류가 안 될 때 방문자·답변 엔진에게
    //    「게시글이 없습니다」라는 **거짓 진술**을 그리고, 이 쪽은 `force-static`+`revalidate` 라
    //    그것이 그대로 굳는다. 모르면 그 자리를 **안 그린다**(형제 `app/page.tsx` 와 같은 형상).
    // ⚠ 「없음」(백엔드가 그 쪽을 거절함)은 라우트가 이미 404 로 보냈다 — 여기 오면 모름과 같이
    //    **안 그린다**(「게시글이 없습니다」라는 거짓 진술을 굳히지 않는다).
    const items = posts === PAGE_NOT_ADDRESSABLE ? undefined : posts?.content;
    const base = siteUrl();
    // ⚠ **판정은 여기 없다** — `hasNextPage` 가 진다. 이 **배선**은 `lib/blogListRender.test.ts` 가
    //    실제로 렌더해서 잰다(술어만 재면 `const hasNext = false` 로 고정하는 변이가 통과한다 —
    //    그 변이는 「다음」을 통째로 없애 21번째 글을 다시 도달 불가로 만든다).
    const hasNext = hasNextPage(posts);

    return (
        <main>
            {/* 목록 그래프 — 글이 0건이면 안 낸다(빈 목록을 그래프로 주장할 이유가 없다). */}
            {items != null && items.length > 0 && (
                <JsonLd data={itemListJsonLd(items.map((p) => ({name: p.title, url: `${base}/blog/${p.slug}`})))} />
            )}
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: "블로그", url: `${base}/blog`},
                ])}
            />
            <h1>블로그</h1>
            {items == null ? null : items.length === 0 ? (
                <p className="text-muted">게시글이 없습니다.</p>
            ) : (
                <ul className="grid list-none gap-4 p-0">
                    {items.map((p) => (
                        <li key={p.id} className="border-b border-border pb-3">
                            <a href={`/blog/${p.slug}`} className="text-lg font-semibold">
                                {p.title}
                            </a>
                            {p.summary && <p className="my-1 text-muted">{p.summary}</p>}
                            {p.publishedAt && <time className="text-xs text-muted">{formatDate(p.publishedAt)}</time>}
                        </li>
                    ))}
                </ul>
            )}
            {(page > 1 || hasNext) && (
                // ⚠ **`<a>` 다.** 크롤러가 따라가야 2쪽 이후의 글이 발견된다 — 버튼·클라이언트
                //    라우팅으로 바꾸면 그 글들이 색인에서 사라진다.
                <nav aria-label="쪽 이동" className="mt-6 flex justify-between">
                    {page > 1 ? (
                        <a href={blogPagePath(page - 1)} rel="prev">
                            ← 이전
                        </a>
                    ) : (
                        <span />
                    )}
                    {hasNext ? (
                        <a href={blogPagePath(page + 1)} rel="next">
                            다음 →
                        </a>
                    ) : (
                        <span />
                    )}
                </nav>
            )}
        </main>
    );
}
