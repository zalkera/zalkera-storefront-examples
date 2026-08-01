import type {ProductSummary} from "@zalkera/client";
import type {ContentSection} from "@/lib/content";
import {SectionRenderer, needsProducts} from "./SectionRenderer";
import {zalkera} from "@/lib/zalkera";

/**
 * 섹션 배열을 그린다 — 상품 프리페치·렌더 디스패치를 한 자리에 모은다.
 *
 * 섹션 페이지 입구가 둘이라(고정 페이지 `[slug]`, 홈 `/`) 이 로직이 두 벌이 되면 한쪽만 고치는
 * 드리프트가 난다 — 이 레포가 memo102 §6 에서 내내 싸우는 병이라 여기서도 사본을 안 만든다.
 *
 * **정렬하지 않는다**: 콘텐츠 파일의 `sections` **배열 순서가 곧 화면 순서**다(어휘 계약 rev 4
 * `contentFile`). 종전엔 `sortOrder` 로 한 번 더 정렬했는데, 순서의 원장이 파일 하나가 된 지금은
 * 그 축이 아예 없다 — 순서를 정하는 곳이 둘이면 "후기를 위로 올려줘"가 어느 쪽을 고치는 일인지가
 * 매번 판별 문제가 되고, 그 판별이 곧 토큰이다.
 *
 * **상품 맵의 키는 handle 이다**(숫자 id 가 아니라). 소스가 DB 카탈로그를 가리키는 유일한 안정 키가
 * handle(= `ProductSummary.slug`)이고, 숫자 id 는 테넌트 스코프라 소스에 적으면 그 소스가 다른
 * 테넌트에서 의미를 잃는다 — 고객이 소스를 소유하고 재업로드한다는 전제가 그것을 금지한다.
 */
export async function SectionList({sections}: {sections: ContentSection[]}) {
    // 상품 참조 섹션이 있을 때만 1회 조회. 공개 API 에 handle 필터가 없어 목록을 맵으로 만든다.
    // 실패해도 페이지는 살아야 한다 — 그 섹션들만 빠진다.
    //
    // ⚠ **유형으로 거르지 마라.** 초판은 `productType: "SERVICE"` 를 박아 뒀는데, 그러면 재화를 파는
    //    사이트에서 이 맵이 통째로 비어 상품 참조 섹션이 **조용히 사라진다**(`ServiceMenuSection` 이
    //    `items.length === 0` 에서 `return null`). 실측으로 커머스 프리셋의 홈에서 상품 카드 5종과
    //    `ItemList` JSON-LD 가 전부 없어졌고, 예약 프리셋에서만 우연히 맞아 발견이 늦었다.
    //    섹션의 상품 참조는 **명시 핸들**이라 유형 필터가 애초에 불필요하다(`/products` 도 무필터다).
    let products = new Map<string, ProductSummary>();
    if (needsProducts(sections)) {
        const list = await zalkera.listProducts({size: 100}, {tags: ["products"]}).catch(() => null);
        if (list) products = new Map(list.content.map((p) => [p.slug, p]));
    }

    return sections.map((section, i) => <SectionRenderer key={i} section={section} products={products} />);
}
