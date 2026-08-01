import type {ContentSection} from "@/lib/content";
import {BeforeAfterGallerySection} from "./BeforeAfterGallerySection";
import {DoctorIntroSection} from "./DoctorIntroSection";
import {FaqListSection} from "./FaqListSection";
import {FeatureGridSection} from "./FeatureGridSection";
import {HeroSection} from "./HeroSection";
import {LeadCtaSection} from "./LeadCtaSection";
import {LogoWallSection} from "./LogoWallSection";
import {StatsBandSection} from "./StatsBandSection";
import {TestimonialsSection} from "./TestimonialsSection";
import {TextMediaSection} from "./TextMediaSection";

/**
 * 섹션 디스패처.
 *
 * **모르는 타입은 조용히 건너뛴다** — 계약이 스큐 내성으로 설계돼 있다. 타입이 늘어도 옛 스토어프론트가
 * 깨지지 않고, **타입이 빠져도**(계약 rev 6 이 조회형 둘을 삭제했다) 그 값을 적어 둔 옛 콘텐츠 파일이
 * 페이지를 죽이지 않는다. 에러도 경고도 내지 않는 게 맞다.
 *
 * **전 타입이 선언형이다** — 어느 것도 백엔드를 부르지 않는다(memo142 §1 · `SectionList` KDoc).
 * 업무 데이터를 비추는 진열은 섹션이 아니라 소스의 직접 호출이다(`ProductRail`).
 */
export function SectionRenderer({section}: {section: ContentSection}) {
    switch (section.type) {
        case "BEFORE_AFTER_GALLERY":
            return <BeforeAfterGallerySection config={section.config} />;
        case "DOCTOR_INTRO":
            return <DoctorIntroSection config={section.config} />;
        // ── 기업 마케팅(memo102) ──
        case "HERO":
            return <HeroSection config={section.config} />;
        case "FEATURE_GRID":
            return <FeatureGridSection config={section.config} />;
        case "TEXT_MEDIA":
            return <TextMediaSection config={section.config} />;
        case "LOGO_WALL":
            return <LogoWallSection config={section.config} />;
        case "STATS_BAND":
            return <StatsBandSection config={section.config} />;
        case "TESTIMONIALS":
            return <TestimonialsSection config={section.config} />;
        case "FAQ_LIST":
            return <FaqListSection config={section.config} />;
        case "LEAD_CTA":
            return <LeadCtaSection config={section.config} />;
        default:
            return null;
    }
}
