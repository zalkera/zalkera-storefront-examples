import type {Metadata} from "next";
import {ProductRail} from "@/components/ProductRail";
import {SectionList} from "@/components/sections/SectionList";
import {loadPageContent} from "@/lib/content";
import {zalkera} from "@/lib/zalkera";
import {fallbackSiteName, siteUrl} from "@/lib/site";
import {parseSeo} from "@/lib/seo";
import {pageMetadata} from "@/lib/metadata";
import {JsonLd, organizationJsonLd} from "@/components/JsonLd";

/**
 * 홈 — **`shop-goods` 의 호출 구성**(정본 `src/app/page.tsx` 를 가리는 프리셋 오버레이 · memo140 §4).
 *
 * 이 파일이 이 팩의 정체다. 저작물(선언 섹션)과 조회(직접 호출 진열)를 **한 화면에 나란히** 둔 것이
 * 사장이 LLM 에게 시킬 바로 그 일("여기에 상품 목록을 보여줘")의 본보기이고,
 * 팩들의 차이가 데이터가 아니라 **어떤 호출을 어떻게 조합하는가**로 표현된다는 판정의 실물이다
 * (memo142 §3-4·§3-6).
 *
 * ⚠ **가림 비용을 안다**: 이 파일이 정본 홈을 가리므로, 정본 `src/app/page.tsx` 에 붙는 패치는 이 팩에
 * 안 닿는다. 팩 스크립트가 매번 가림 목록을 찍어 그것을 가시화한다(전면 포크와 다른 점).
 *
 * ⚠ **레일이 비면 아무것도 안 그려진다** — 개시 직후에는 카탈로그가 비어 있으므로 정상이다.
 * 빈 진열대를 그리거나 "상품을 등록하세요" 안내를 넣지 마라(그 문장의 독자는 사장이고 사장의 표면은 콘솔이다).
 */
export const dynamic = "force-static";
export const revalidate = 600;

const HOME_SLUG = "home";

export async function generateMetadata(): Promise<Metadata> {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const seo = parseSeo(config?.seoDefaults);
    const siteName = seo.title ?? config?.companyName ?? fallbackSiteName();
    return pageMetadata({
        ogTitle: siteName,
        description: seo.description,
        path: "/",
        siteName: config?.companyName,
    });
}

export default async function Home() {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const sections = loadPageContent(HOME_SLUG)?.sections ?? [];

    // 저작물은 앞에서 2 개, 진열 레일을 끼운 뒤 나머지 저작물 — 배열 순서가 곧 화면 순서다.
    return (
        <main className="py-8">
            {config && <JsonLd data={organizationJsonLd(config, siteUrl())} />}
            <SectionList sections={sections.slice(0, 2)} />
            <ProductRail title="이번 주 물건" moreLabel="전체 상품" />
            <SectionList sections={sections.slice(2)} />
        </main>
    );
}
