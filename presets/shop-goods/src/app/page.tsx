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
 * 홈 — **`shop-goods` 의 홈**. 이 팩의 소스는 이 팩의 것이다(오너 확정 2026-08-01 — 팩 4종은 소스를
 * 공유하지 않고 각자 온전한 소스를 갖는다. 종전의 "정본을 가리는 오버레이"는 개념째 없어졌다).
 *
 * 이 파일이 이 팩의 정체다. 저작물(선언 섹션)과 조회(직접 호출 진열)를 **한 화면에 나란히** 둔 것이
 * 사장이 LLM 에게 시킬 바로 그 일("여기에 상품 목록을 보여줘")의 본보기이고,
 * 팩들의 차이가 데이터가 아니라 **어떤 호출을 어떻게 조합하는가**로 표현된다는 판정의 실물이다
 *.
 *
 * ⚠ **이 파일은 다른 팩과 갈려도 된다** — 홈은 사이트가 소유하는 얼굴이라 갈리는 것이 정상이다.
 * 갈리면 안 되는 것은 전송·인증 배선뿐이고, 그것은 팩 게이트가 바이트 동일로 잠근다
 * (정본 저장소의 팩 게이트가 잠근다 — 그 도구는 이 소스에 없다).
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
