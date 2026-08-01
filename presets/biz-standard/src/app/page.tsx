import type {Metadata} from "next";
import {SectionList} from "@/components/sections/SectionList";
import {loadPageContent} from "@/lib/content";
import {zalkera} from "@/lib/zalkera";
import {fallbackSiteName, siteUrl} from "@/lib/site";
import {parseSeo} from "@/lib/seo";
import {pageMetadata} from "@/lib/metadata";
import {JsonLd, organizationJsonLd} from "@/components/JsonLd";

/**
 * 홈 (RSC · ISR). 사이트 설정·커머스 카테고리는 세션 무관 공개 데이터라 요청마다 서버 렌더할
 * 이유가 없다 — 정적으로 프리렌더하고 `revalidate` 주기로만 갱신한다(SKILL.md "서버 동적 렌더 최소화").
 * revalidate 를 주면 이 세그먼트의 fetch 기본값이 no-store 에서 이 주기 캐시로 바뀌어 라우트가 ISR 이 된다.
 */
export const dynamic = "force-static";
export const revalidate = 600;

/**
 * 사이트 첫 화면이 되는 콘텐츠 페이지의 slug — `content/pages/home.json`.
 * 마케팅 테마의 홈이 `/home` 에만 살면 방문자에게 **도달하지 않으므로**, 루트가 이 페이지를 집어 온다.
 */
const HOME_SLUG = "home";

/**
 * 홈의 canonical·공유 카드. 제목·설명은 루트 layout 이 이미 사이트 기본값으로 내므로 여기서 다시 주지
 * 않는다 — 겹쳐 쓰면 두 곳이 갈린다. 이 함수의 일은 **"이 사이트의 정본 주소는 여기"** 를 못박는 것이다.
 *
 * layout 과 **같은 인자로** 부르므로 request memoization 이 두 호출을 1회로 합친다(인자가 갈리면 조용히 2회).
 */
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
    // ISR 캐시 태그(memo31 §0-1) — 백엔드가 설정/상품 변경 시 revalidateTag 로 이 페이지만 콕 집어 무효화한다.
    // site-config: 사이트 설정·테마·레이아웃(전 페이지 영향) · products: 카탈로그 변경.
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    // 사이트의 얼굴은 이 레포가 정본으로 갖는다(어휘 계약 rev 4 `contentFile`) — 백엔드 왕복이 없다.
    // 콘텐츠가 없는 것은 **정상**이다: 커머스 테넌트는 홈 파일 없이 아래 골격을 그린다.
    const sections = loadPageContent(HOME_SLUG)?.sections ?? [];

    // 섹션이 있으면 그것이 홈이다. 제목은 **안 그린다** — HERO 가 이미 h1 을 갖는다(h1 둘은 SEO 상 흠).
    if (sections.length > 0) {
        return (
            <main className="py-8">
                {config && <JsonLd data={organizationJsonLd(config, siteUrl())} />}
                <SectionList sections={sections} />
            </main>
        );
    }

    const categories = await zalkera.listProductCategories({tags: ["products"]}).catch(() => []);

    return (
        <main className="py-8">
            {/* 사이트 주체 — 홈에 1회만(memo 50 W1). 오프라인 점포·뷰티샵 테마는 organizationJsonLd 의
                type 을 LocalBusiness·BeautySalon 으로 좁힌다. 설정이 비면 낼 게 없으므로 생략한다. */}
            {config && <JsonLd data={organizationJsonLd(config, siteUrl())} />}
            <h1>{config?.companyName ?? fallbackSiteName()}</h1>

            <h2>카테고리</h2>
            <ul className="flex flex-wrap gap-2 list-none p-0">
                {categories.map((c) => (
                    <li key={c.id} className="rounded-full border border-border px-3 py-1 text-sm">
                        {c.name} <span className="text-muted">/{c.slug}</span>
                    </li>
                ))}
                {categories.length === 0 && <li className="text-muted">카테고리가 없습니다.</li>}
            </ul>
            {/* 여기가 거래처 홈이 자랄 자리다 — 히어로·상품 그리드·예약 CTA 를 AI 로 붙인다.
                개발자용 안내 문구는 두지 않는다: 이 골격은 거래처 사이트로 그대로 복제된다.
                장바구니·마이페이지 링크는 SiteHeader 에 이미 있다. */}
        </main>
    );
}
