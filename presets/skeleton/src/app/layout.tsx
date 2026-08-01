import "./globals.css";
import type {Metadata, Viewport} from "next";
import type {ReactNode} from "react";
import {SiteHeader} from "@/components/SiteHeader";
import {loadNav} from "@/lib/content";
import {zalkera} from "@/lib/zalkera";
import {parseSeo} from "@/lib/seo";
import {fallbackSiteName, metadataBaseUrl} from "@/lib/site";
import {parseThemeColors} from "@/lib/theme";
import {SiteFooter} from "@/components/SiteFooter";

/**
 * 자체 revalidate 가 없는 정적 라우트(checkout·payment/* 등)에 갱신 주기를 준다.
 *
 * 빌드가 백엔드에 못 닿으면 폴백 제목이 산출물에 박히는데, revalidate 가 없으면
 * `revalidateTag("site-config")` 가 올 때까지 **영구 고정**된다 — 테넌트가 설정을 한 번도 안 건드리면
 * 안 낫는다. 자체 revalidate 를 가진 라우트(홈 600 · [slug] 300)는 더 낮은 값이 이기므로 무영향이고,
 * `cookies()` 를 쓰는 동적 라우트(cart·mypage·orders·login)에는 애초에 적용되지 않는다.
 */
export const revalidate = 3600;

export const viewport: Viewport = {width: "device-width", initialScale: 1};

/**
 * 사이트 제목 — **거래처 것**이지 우리 것이 아니다.
 *
 * 홈에만 두지 않고 루트 layout 에 두는 이유: 제목은 layout 상속으로 전 라우트에 퍼진다. 홈만 고치면
 * 상품 상세(sitemap 등재 라우트)·policies·checkout 의 탭·검색결과 제목이 그대로 남는다.
 *
 * ISR 을 깨지 않는다 — 동적 렌더 opt-in 은 `cookies()`·`headers()`·`no-store`·`force-dynamic` 처럼
 * 열거된 어휘뿐이고, 태그만 실은 fetch 는 거기 해당하지 않는다(호출 위치가 layout 이든 page 든 같다).
 * 홈에서는 page 의 같은 fetch 와 request memoization 으로 1회로 합쳐진다.
 */
export async function generateMetadata(): Promise<Metadata> {
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    const seo = parseSeo(config?.seoDefaults);
    const siteName = seo.title ?? config?.companyName ?? fallbackSiteName();
    // 네이버 서치어드바이저 소유확인 메타. 값은 테넌트별로 다르고 브라우저에 그대로 노출되는 공개 문자열이라
    // memo86 의 BUILD_PUBLIC(`NEXT_PUBLIC_*` 강제) 축으로 주입한다 — 콘솔에서 테넌트가 자기 값을 넣으면
    // 재빌드로 반영된다. 미설정이면 태그 자체를 내지 않는다(빈 content 는 검증 실패로 잡힌다).
    const naver = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim();
    return {
        // canonical·og:url 의 상대 경로를 절대 URL 로 해석하는 기준점. 크롤러는 상대 canonical 을 신뢰하지
        // 않으므로 이게 없으면 아래 canonical 이 무의미해진다.
        metadataBase: metadataBaseUrl(),
        // canonical 정본(memo98 §3.3). `"./"` 는 **라우트별로** 자기 경로를 metadataBase 기준 절대 URL 로
        // 해석한다 — layout 한 줄이 전 공개 라우트를 덮으므로 라우트마다 다시 쓰지 않는다(실측 확인:
        // /policies → …/policies, /products/{slug} → …/products/{slug}. 홈으로 뭉개지지 않는다).
        //
        // 왜 필요한가: 한 사이트가 여러 host 로 동시에 서빙된다(플랫폼 서브도메인 + 커스텀 도메인).
        // 오케스트레이터가 Host 만 보고 같은 컨테이너로 프록시하므로 **같은 내용이 두 주소로 200** 이고,
        // 방치하면 양쪽이 따로 색인돼 평가가 갈린다. primary(`ZALKERA_SITE_URL`) 한쪽으로 모은다.
        alternates: {canonical: "./"},
        // 하위 라우트가 문자열 title 을 주면 "페이지제목 | 회사명" 이 된다([slug] 가 그렇다).
        // 접미사는 seo.title 이 아니라 companyName 이다 — seo.title 은 길 수 있어 접미사로는 비대해진다.
        title: {default: siteName, template: `%s | ${config?.companyName ?? siteName}`},
        // 없는 문구를 지어내지 않는다 — 생략이 낫다.
        description: seo.description,
        ...(naver ? {verification: {other: {"naver-site-verification": naver}}} : {}),
    };
}

export default async function RootLayout({children}: {children: ReactNode}) {
    // generateMetadata 와 **같은 인자로** 부른다 → request memoization 이 1회로 합친다(태그가 갈리면
    // 조용히 2회가 된다). 태그만 실은 fetch 는 동적 opt-in 이 아니므로 정적성을 깨지 않는다(§6).
    const config = await zalkera.getSiteConfig({tags: ["site-config"]}).catch(() => null);
    // themeColors → CSS 변수. inline style 은 어떤 스타일시트보다 우선하므로 @theme 기본값을 덮는다.
    const {cssVars} = parseThemeColors(config?.themeColors);
    // 내비는 `content/nav.json` — 사이트 얼굴의 구조라 소스가 정본이다(어휘 계약 rev 4 `contentFile`).
    // 파일이 없거나 비어도 사이트는 산다(내비만 빈다).
    const {header: headerMenus, footer: footerMenus} = loadNav();

    return (
        <html lang="ko" style={cssVars}>
            <body className="bg-background text-foreground font-sans antialiased">
                <div className="mx-auto max-w-4xl px-4">
                    <SiteHeader menus={headerMenus} />
                    {children}
                    <SiteFooter menus={footerMenus} />
                </div>
            </body>
        </html>
    );
}
