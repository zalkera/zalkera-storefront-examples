import {InquiryForm} from "./InquiryForm";

/**
 * 문의 페이지 (RSC · 정적 셸) — 데이터 페치 없이 폼만. 제출은 InquiryForm 아일랜드 → BFF.
 * 뷰티 리드 수집의 접점이라 스캐폴드 골격에 둔다(memo 57 축C — 문의폼은 안전 이음새 완제 대상).
 */
export const dynamic = "force-static";

export default function ContactPage() {
    return (
        <main>
            <h1>문의하기</h1>
            <InquiryForm />
        </main>
    );
}
