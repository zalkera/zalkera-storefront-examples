import type {Metadata} from "next";
import {notFound, redirect} from "next/navigation";
import {SectionList} from "@/components/sections/SectionList";
import {loadPageContent, pageSlugs} from "@/lib/content";
import {zalkera} from "@/lib/zalkera";
import {pageMetadata, withSiteName} from "@/lib/metadata";
import {siteUrl} from "@/lib/site";
import {JsonLd, breadcrumbJsonLd, webPageJsonLd} from "@/components/JsonLd";

/**
 * 고정 페이지 (RSC · 정적) — `content/pages/<slug>.json` 을 그린다.
 *
 * 루트 `[slug]` 라 `/products`·`/cart` 같은 정적 세그먼트가 우선한다(Next 규칙) — 그 이름과 같은
 * slug 의 페이지는 가려진다. 대신 `/about` 처럼 깔끔한 URL 을 얻는다(내비가 그렇게 링크한다).
 *
 * **콘텐츠가 소스로 왔으므로 이 라우트는 백엔드 왕복이 없다.** 페이지를 고치는 것은 발행(재빌드)이고,
 * 온디맨드 revalidate 로 나르던 축이 사라졌다 — 그래서 `revalidate` 를 두지 않는다(이 라우트에
 * 갱신 주기가 필요한 데이터가 없다. 루트 layout 의 3600 이 사이트 설정 축을 덮는다).
 */
export const dynamic = "force-static";

/** 루트가 홈으로 집어 오는 slug(`src/app/page.tsx` 와 같은 값). 여기선 리다이렉트 판정에만 쓴다. */
const HOME_SLUG = "home";

/**
 * 콘텐츠 페이지 전량을 빌드 시점에 굽는다 — 매니페스트가 목록의 정본이라 열거가 공짜다.
 *
 * `dynamicParams` 를 끄지 않는 이유: 목록에 없는 slug 는 어차피 아래에서 `notFound()` 가 되고,
 * 끄면 그 판정이 라우팅 계층으로 올라가 동작이 같은데 설명만 두 곳이 된다.
 */
export function generateStaticParams(): {slug: string}[] {
    return pageSlugs().map((slug) => ({slug}));
}

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
    const {slug} = await params;
    const page = loadPageContent(slug);
    if (!page) notFound();
    const title = page.seo?.title ?? page.title;
    const description = page.seo?.description;
    // 상호는 공유 카드(og:site_name·og:title)에만 쓴다. layout 과 같은 인자라 fetch 는 1회로 합쳐진다.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    return {
        // layout 의 title.template(`%s | 상호`)을 타서 "페이지제목 | 상호" 가 된다.
        title,
        description,
        ...pageMetadata({
            ogTitle: withSiteName(title, config?.companyName),
            description,
            path: `/${slug}`,
            siteName: config?.companyName,
        }),
    };
}

export default async function StaticPage({params}: {params: Promise<{slug: string}>}) {
    const {slug} = await params;
    const page = loadPageContent(slug);
    if (!page) notFound();

    // 홈의 정본 주소는 루트다(`src/app/page.tsx`). `/home` 을 살려 두면 같은 내용이 두 URL 로 색인된다.
    if (slug === HOME_SLUG) redirect("/");

    // 구조화 데이터 — 아래 보이는 내용과 같은 값에서만 만든다(제목은 h1 과 동일·설명은 SEO 오버라이드가
    // 실제로 있을 때만). 전부 빌드 시점 값이라 정적성이 깨지지 않는다.
    const base = siteUrl();
    const description = page.seo?.description;

    return (
        <main>
            <JsonLd data={webPageJsonLd({title: page.title, slug}, base, description)} />
            {/* 서브페이지는 홈 아래 1뎁스 — 검색결과에 `홈 > 회사소개` 경로가 선다. 상품·글 상세만
                갖고 있던 표면이라, 순수 마케팅 사이트에는 여기가 유일한 거처였다. */}
            <JsonLd data={breadcrumbJsonLd([{name: "홈", url: base}, {name: page.title, url: `${base}/${slug}`}])} />
            <h1 className="text-foreground">{page.title}</h1>
            <SectionList sections={page.sections} />
        </main>
    );
}
