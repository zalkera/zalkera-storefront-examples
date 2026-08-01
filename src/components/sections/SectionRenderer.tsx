import type {ProductSummary} from "@zalkera/client";
import type {ContentSection} from "@/lib/content";
import {BeforeAfterGallerySection} from "./BeforeAfterGallerySection";
import {BookingCtaSection} from "./BookingCtaSection";
import {DoctorIntroSection} from "./DoctorIntroSection";
import {FaqListSection} from "./FaqListSection";
import {FeatureGridSection} from "./FeatureGridSection";
import {HeroSection} from "./HeroSection";
import {LeadCtaSection} from "./LeadCtaSection";
import {LogoWallSection} from "./LogoWallSection";
import {ServiceMenuSection} from "./ServiceMenuSection";
import {StatsBandSection} from "./StatsBandSection";
import {TestimonialsSection} from "./TestimonialsSection";
import {TextMediaSection} from "./TextMediaSection";

/**
 * 섹션 디스패처.
 *
 * **모르는 타입은 조용히 건너뛴다** — 백엔드 `SectionType` 이 append-only 라, 새 타입이 추가돼도
 * 옛 스토어프론트가 깨지지 않아야 한다는 게 계약이다. 에러도 경고도 내지 않는 게 맞다.
 */
export function SectionRenderer({
    section,
    products,
    categoryProducts,
}: {
    section: ContentSection;
    /** handle 참조 해소분 — `SectionList` 가 참조된 것만 직접 조회해 채운다. */
    products: Map<string, ProductSummary>;
    /** `categorySlug` 참조 해소분(동적) — 서버가 그 카테고리로 준 목록 그대로. */
    categoryProducts: Map<string, ProductSummary[]>;
}) {
    switch (section.type) {
        case "SERVICE_MENU":
            return (
                <ServiceMenuSection
                    config={section.config}
                    products={products}
                    categoryProducts={categoryProducts}
                />
            );
        case "BEFORE_AFTER_GALLERY":
            return <BeforeAfterGallerySection config={section.config} />;
        case "BOOKING_CTA":
            return <BookingCtaSection config={section.config} products={products} />;
        case "DOCTOR_INTRO":
            return <DoctorIntroSection config={section.config} />;
        // ── 기업 마케팅(memo102) — 전부 상품 비참조라 products 를 안 받는다 ──
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

/** 상품을 참조하는 섹션이 있는가 — 있을 때만 상품 목록을 부른다. */
export function needsProducts(sections: ContentSection[]): boolean {
    return sections.some((s) => s.type === "SERVICE_MENU" || s.type === "BOOKING_CTA");
}
