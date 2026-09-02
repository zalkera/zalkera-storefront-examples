import type {MetadataRoute} from "next";
import {pageSlugs} from "@/lib/content";
import {zalkera} from "@/lib/zalkera";
import {RESERVED_SEGMENTS} from "@/lib/reservedSegments";
import {siteUrl} from "@/lib/site";

/**
 * sitemap.xml — 크롤러에게 "이 사이트에 어떤 URL 이 있는지" 알린다.
 *
 * ISR 로 굳힌다. 카탈로그가 바뀌어도 크롤러는 이 주기 안에 따라오면 충분하고, 크롤러 요청마다
 * 전 상품을 훑는 것은 낭비다. (여기서 `headers()` 를 쓰지 않으므로 §0-12 ISR-우선 게이트와 무충돌.)
 *
 * **여기 넣는 것은 실제로 존재하는 공개 라우트뿐이다.** 장바구니·결제·마이페이지는 세션 경로라
 * 색인 대상이 아니다(robots.ts 에서도 막는다).
 *
 * **콘텐츠는 자동 열거된다** — 상품·글은 목록 API 로, 고정 페이지는 콘텐츠 매니페스트
 * (`content/index.ts`)로 훑는다. 말로 페이지를 만들면 저절로 실린다. 손으로 추가할 필요가 없다.
 * 반대로 **codegen 이 새 `.tsx` 라우트를 만든 경우는 알 수 없다** — 그때만 여기에 손으로 넣는다.
 */
export const revalidate = 3600;

/**
 * 열거 상한 — 상품·글 각각 `MAX_PAGES × PAGE_SIZE` 건까지만 싣는다. 크롤 1회가 백엔드를 끝없이 훑지 않게
 * 하는 안전장치이고, 이 상한을 넘는 항목은 sitemap 에서 **빠진다**. 그래서 상한 초과와 백엔드 미도달은 아래가
 * 서버 로그에 경고로 남긴다(llms.txt §5.1 — 조용히 누락하는 sitemap 은 「있는 것을 없다고 말하는」 거짓이다).
 * 한 sitemap 파일의 규격 상한은 URL 50,000건·비압축 50MB 라 이 상한 안에서는 한 파일로 충분하다.
 *
 * 카탈로그가 여기 닿으면 **하위 라우트로** 나눈다 — `app/products/sitemap.ts` 에 `generateSitemaps` 를 두면
 * `/products/sitemap/0.xml` 이 되고, 그 주소들을 `robots.ts` 의 `sitemap` 배열에 싣는다.
 * ⚠ **이 파일에 `generateSitemaps` 를 넣지 마라** — 라우트가 `/sitemap/[id].xml` 로 바뀌어 `/sitemap.xml` 이
 *   사라지고(Next 는 인덱스를 만들지 않는다) robots 가 가리키던 자리와 AEO 게이트가 같이 깨진다.
 */
const MAX_PAGES = 50;
const PAGE_SIZE = 100;
const ENUMERATION_CAP = MAX_PAGES * PAGE_SIZE;

/** 상한에 걸린 축을 서버 로그에 남긴다 — 빌드·재생성 로그에서 보인다. */
function warnTruncated(what: string): void {
    console.warn(
        `sitemap: ${what} ${ENUMERATION_CAP}건 상한에 걸렸다 — 그 뒤 항목은 sitemap 에서 빠진다. ` +
            "하위 라우트(app/products/sitemap.ts 등)의 generateSitemaps 로 나누고 robots.ts 의 sitemap 배열에 " +
            "실으라 — 이 파일에 넣으면 /sitemap.xml 이 없어진다(llms.txt §5.1).",
    );
}

/** 백엔드에 못 닿아 한 축이 통째로 빠진 것을 남긴다 — fail-soft 로 축소된 sitemap 이 나갔다는 사실이다. */
function warnFetchFailed(what: string): void {
    console.warn(`sitemap: ${what} 목록을 못 읽었다 — 이 축이 통째로 빠진 sitemap 이 나간다(백엔드 미도달).`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = siteUrl();

    const products: MetadataRoute.Sitemap = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        // 백엔드가 죽어도 sitemap 은 홈만이라도 내야 한다 — 500 보다 축소된 sitemap 이 낫다. 다만 말은 남긴다.
        const result = await zalkera.listProducts({page, size: PAGE_SIZE}).catch(() => null);
        if (!result) {
            warnFetchFailed("상품");
            break;
        }

        for (const p of result.content) {
            products.push({url: `${base}/products/${p.slug}`, changeFrequency: "daily", priority: 0.8});
        }
        if (result.last) break;
        if (page === MAX_PAGES - 1) warnTruncated("상품");
    }

    // 상품 카테고리 — `/c/{slug}`. **상품 0건인 카테고리도 싣는다**: 목록·글 목록을 비었을 때 빼는
    // 규칙과 갈리는 자리라 이유를 적어 둔다. `/products`·`/blog` 는 싱글턴이라 비면 "이 사이트에 그런
    // 것이 아예 없다"지만, 카테고리는 테넌트가 의도해 만든 분류 축이고 그 페이지는 언제나 자기
    // 그래프(CollectionPage + ItemList)를 낸다 — 크롤러에게 빈 껍데기를 알리는 것이 아니다.
    // 실패는 삼킨다(카테고리를 못 읽었다고 sitemap 전체를 죽이지 않는다).
    const categories = await zalkera.listProductCategories().catch(() => null);
    const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((c) => ({
        url: `${base}/c/${c.slug}`,
        changeFrequency: "daily",
        priority: 0.6,
    }));

    // 두 레인의 경계가 이 파일에 그대로 보인다 — **카테고리는 DB**(상품 분류는 업무 데이터라
    // 콘솔·MCP 가 소유한다), **페이지는 소스**(정본이 `content/pages/*.json`). 그래서 위는
    // 백엔드 왕복이고 아래는 매니페스트 읽기다.
    // 고정 페이지 — 정본이 `content/pages/*.json` 이라 매니페스트가 곧 목록이다(백엔드 왕복 0).
    // 이게 없으면 "말로 만든 페이지가 검색에 안 잡히는" 결함이 남는다.
    // `lastModified` 는 원본에 그 시각이 있을 때만 낸다(글의 `publishedAt` 처럼 — llms.txt §5.1). 콘텐츠
    // 페이지 파일에는 그 값이 없고, 빌드 시각을 대신 넣으면 재빌드마다 안 바뀐 페이지까지 "방금 수정됨"이라
    // 주장해 크롤 판단을 망친다(지어낸 시각의 정확한 해악).
    const pages: MetadataRoute.Sitemap = pageSlugs()
        // 홈은 `/` 로 이미 실려 있다(`/home` 은 루트로 리다이렉트된다 — 두 URL 로 색인되면 안 된다).
        .filter((slug) => slug !== "home")
        // 그림자화된 slug 는 건너뛴다(RESERVED_SEGMENTS 주석 참고).
        .filter((slug) => !RESERVED_SEGMENTS.has(slug))
        .map((slug) => ({url: `${base}/${slug}`, changeFrequency: "weekly" as const, priority: 0.6}));

    // 글 — 라우트는 `/blog/{slug}` 다(`/posts` 아님).
    const posts: MetadataRoute.Sitemap = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const result = await zalkera.listPosts({page, size: PAGE_SIZE}).catch(() => null);
        if (!result) {
            warnFetchFailed("글");
            break;
        }

        for (const p of result.content) {
            posts.push({
                url: `${base}/blog/${p.slug}`,
                changeFrequency: "weekly",
                priority: 0.6,
                ...(p.publishedAt ? {lastModified: new Date(p.publishedAt)} : {}),
            });
        }
        if (result.last) break;
        if (page === MAX_PAGES - 1) warnTruncated("글");
    }

    return [
        {url: base, changeFrequency: "daily", priority: 1},
        // 구매 정책 — 사람에게는 거래조건 표시면, 기계에게는 MerchantReturnPolicy 의 근거 페이지.
        {url: `${base}/policies`, changeFrequency: "monthly", priority: 0.3},
        // 상품 목록 — 상품이 하나라도 있을 때만. 목록 라우트를 여기 안 실으면 카탈로그의 허브가
        // 크롤러에게 안 알려지고, 상세 N건을 개별 발견에만 맡기게 된다(빈 목록은 색인 대상이 아니다).
        ...(products.length > 0 ? [{url: `${base}/products`, changeFrequency: "daily" as const, priority: 0.7}] : []),
        // 글 목록 — 글이 하나라도 있을 때만. 빈 목록 페이지를 색인시킬 이유가 없다.
        ...(posts.length > 0 ? [{url: `${base}/blog`, changeFrequency: "daily" as const, priority: 0.5}] : []),
        ...categoryEntries,
        ...pages,
        ...products,
        ...posts,
    ];
}
