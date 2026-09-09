// 블로그 미사용 테넌트는 app/blog/·api/posts/ 통째로 삭제 가능 — 결합은 sitemap.ts 한 곳.
import type {Metadata} from "next";
import {zalkera} from "@/lib/zalkera";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {parseSeo} from "@/lib/seo";
import {BlogList} from "@/components/BlogList";

/**
 * 블로그/공지 목록 **1쪽** (RSC · ISR). 발행글은 세션 무관 읽기라 요청마다 SSR 하지 않는다:
 * 첫 요청에 렌더한 뒤 `revalidate` 주기로 캐시한다(상품 상세와 같은 사상).
 *
 * ⚠ **`searchParams` 를 받지 않는 것이 의도다.** 쪽 번호를 쿼리로 받으면 Next 가 물음표 뒤를
 *   미리 알 수 없어 이 라우트가 **동적 렌더로 강등**된다 — 1쪽까지 포함해 요청마다 서버가
 *   그린다. 2쪽 이상은 `/blog/page/{n}` **정적 세그먼트**가 받는다 — 숫자와
 *   재현 명령은 `lib/blogPaging.ts` KDoc 한 자리에 있다.
 *
 * ⚠ `listPosts` 는 0.32.0 부터 [ReadOptions] 를 받는다 — 태그를 달 수 있다. 다만 **태그는 캐시가
 * 아니고**(왕복을 안 줄인다) 무효화 도달도 빌드마다 다르다(`llms.txt` 의 「ISR 캐시 태그」 절).
 * 그래서 이 쪽의 갱신은 **시간 기반 `revalidate` 가 지고**, 태그는 그 위의 최선 노력이다.
 */
export const dynamic = "force-static";
export const revalidate = 300;

const TITLE = "블로그";

/**
 * ⚠ **정적 `metadata` 가 아니라 `generateMetadata` 다** — 상호(`site_config`)가 서버에서 와야
 * 공유 카드에 상호를 넣고 canonical 을 낼 수 있다(형제 목록 쪽들과 같은 형태).
 */
export async function generateMetadata(): Promise<Metadata> {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    // ⚠ **이 쪽의 설명을 지어내지 않는다.** 쪽의 `description` 은 layout 의 것을 **라우트 단위로
    //    이긴다** — 여기 한 문장을 박으면 전 테넌트의 `/blog` 가 자기 사이트 설명 대신 그것을
    //    단다. `blog` 는 예약 세그먼트라 테넌트가 자기 페이지로 덮을 길도 없다.
    //    사이트 기본 설명을 그대로 잇는다(없으면 없는 채로 — 이 레포의 「지어내지 않는다」 규칙).
    const seo = parseSeo(config?.seoDefaults);
    return {
        title: TITLE,
        ...pageMetadata({
            ogTitle: withSiteName(TITLE, config?.companyName),
            description: seo.description,
            path: "/blog",
            siteName: config?.companyName,
        }),
    };
}

export default async function BlogPage() {
    return <BlogList page={1} />;
}
