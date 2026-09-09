import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {zalkera} from "@/lib/zalkera";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {parseSeo} from "@/lib/seo";
import {isOutOfRange, parseBlogPageSegment} from "@/lib/blogPaging";
import {BlogList, listBlogPage} from "@/components/BlogList";

/**
 * 블로그 목록 **2쪽 이상** — `/blog/page/{n}` (RSC · ISR).
 *
 * ## 왜 쿼리(`?page=`)가 아닌가
 *
 * 쿼리로 받으면 `/blog` 가 **1쪽까지 포함해** 동적 렌더로 강등된다. 여기 정적 세그먼트로 두면
 * 각 쪽이 따로 미리 그려져 캐시된다. 숫자와 재현 명령은 `lib/blogPaging.ts` KDoc 한 자리에 있다.
 *
 * ⚠ **`/blog/page` 는 글 주소와 안 부딪친다.** 그 주소는 세그먼트가 둘이라 `/blog/[slug]` 가
 *   받는다(slug 가 `page` 인 글도 정상 접근된다). 이 라우트는 세그먼트가 셋이라 겹치지 않는다.
 */
export const dynamic = "force-static";
export const revalidate = 300;

const TITLE = "블로그";

/**
 * **1쪽은 여기 없다.** `/blog/page/1` 을 허용하면 같은 내용이 두 주소에 서서 색인이 갈린다.
 * 못 읽는 값과 **다른 표기**(`03`·`0x3`·`3e0`·`2.0`)도 같은 이유로 404 다 — 판정은
 * `parseBlogPageSegment` 가 지고, 그 KDoc 에 근거가 있다.
 */
function requirePage(raw: string): number {
    return parseBlogPageSegment(raw) ?? notFound();
}

export async function generateMetadata({params}: {params: Promise<{n: string}>}): Promise<Metadata> {
    const page = requirePage((await params).n);
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const seo = parseSeo(config?.seoDefaults);
    // ⚠ **canonical 은 자기 자신을 가리킨다.** 2쪽 이상을 1쪽으로 접으면 그 쪽의 글들이 색인에서
    //    사라진다 — 목록은 크롤러가 상세로 가는 **내부 링크 허브**다.
    return {
        title: `${TITLE} (${page}쪽)`,
        ...pageMetadata({
            ogTitle: withSiteName(TITLE, config?.companyName),
            description: seo.description,
            path: `/blog/page/${page}`,
            siteName: config?.companyName,
        }),
    };
}

export default async function BlogPagedPage({params}: {params: Promise<{n: string}>}) {
    const page = requirePage((await params).n);
    // ⚠ **범위 밖은 200 빈 목록이 아니라 404 다.** 200 을 내면 소프트 404 이고, 「이전」이 무조건
    //    그려져 `/blog` 까지 이어지는 빈 쪽 사슬의 입구가 된다 — 글을 지워 쪽 수가 줄면 **이미
    //    색인된** 쪽이 그 상태로 남는다(`isOutOfRange` KDoc).
    const posts = await listBlogPage(page);
    if (isOutOfRange(page, posts)) notFound();
    return <BlogList page={page} posts={posts} />;
}
