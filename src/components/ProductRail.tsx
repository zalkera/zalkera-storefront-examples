import Link from "next/link";
import {mediaSrc} from "@zalkera/client";
import {JsonLd, itemListJsonLd} from "@/components/JsonLd";
import {siteUrl} from "@/lib/site";
import {zalkera} from "@/lib/zalkera";

/**
 * 진열 레일 — **"이렇게 호출하면 이렇게 나옵니다"의 본보기**(memo142 §3-6).
 *
 * ## 왜 섹션이 아닌가
 *
 * 상품·갈래의 정본 값은 **업무 축(DB)** 에 산다. 콘텐츠 파일을 지워도 상품은 그대로 있고, 화면은
 * 그것을 비추기만 한다. 그런 조회를 선언(`content/pages/*.json`)에 적으면 "어디에"만 선언이 갖고
 * "어떻게"(카드 그리드·필드·개수)는 공유 렌더러에 얼어붙는다 — 진열의 디자인이 어휘에 고정되는 것이라
 * **자연어로 다양한 디자인을 만든다**는 방향과 반대다. 그래서 계약 rev 6 이 조회형 섹션 타입 둘을
 * 삭제했고, 진열의 자리가 여기로 왔다.
 *
 * ## 이 파일은 고쳐 쓰라고 있는 것이다
 *
 * **중립 배선이 아니라 능력 구성이다**(memo140 §3) — 지우든 가리든 통째로 다시 짜든 자유다. 사장이
 * LLM 에게 *"여기에 인기 상품 네 개만 가로로 보여줘"* 라고 말하면 고쳐야 하는 곳이 정확히 이 한 파일이다.
 * 정본에 한 벌만 두는 것은 팩마다 복제하면 그것이 드리프트의 씨앗이 되기 때문이다(memo102 포크 금지).
 *
 * ## 지키는 규율 셋
 *
 * ⑴ **이름을 하나도 안 박는다.** `listProducts()`·`listProductCategories()` 는 그 사장의 카탈로그가
 *    있는 대로 내놓는다. 배송물이 상품 handle 이나 갈래 slug 를 박으면 그 소스를 받은 사람의 카탈로그에는
 *    그 이름이 없어 화면이 **영구히** 빈다(memo142 §1 규칙 2).
 * ⑵ **비면 안 그린다.** 결과가 0건이면 `return null` 이다. 빈 진열대는 방문자에게 거짓이고,
 *    "상품을 등록하면 여기 표시됩니다" 같은 안내도 넣지 않는다 — 그 문장의 독자는 사장이고
 *    사장의 표면은 콘솔이다(memo142 §6-3).
 * ⑶ **JSON-LD 는 화면과 같은 배열에서 만든다.** 두 벌이 되면 갈라진다. 0건이면 그래프도 안 낸다
 *    (팔 것이 없다는 진술을 그래프로 하지 않는다 — `/products` 와 같은 규율).
 *
 * 실패는 삼킨다 — 백엔드가 죽어도 홈의 나머지(저작물 섹션)는 살아야 한다.
 */
export async function ProductRail({
    title,
    categorySlug,
    limit = DEFAULT_LIMIT,
    moreHref = "/products",
    moreLabel = "전체 보기",
}: {
    /** 레일 제목. 없으면 제목을 안 그린다(홈의 h1 은 HERO 가 갖는다 — h1 을 늘리지 않는다). */
    title?: string;
    /**
     * 특정 갈래만 진열하고 싶을 때의 slug. **배송물은 이 값을 박지 않는다** — 사이트 소유자가 자기
     * 카탈로그 안에서 자기 갈래를 가리키는 것은 정당하므로 인자로만 열어 둔다.
     */
    categorySlug?: string;
    limit?: number;
    moreHref?: string;
    moreLabel?: string;
}) {
    const items = await loadItems(categorySlug, limit);
    // ⑵ 빈 진열대를 그리지 않는다.
    if (items.length === 0) return null;

    const base = siteUrl();

    return (
        <section className="mb-12">
            {/* ⑶ 화면에 그리는 바로 그 카드들·그 순서 — 아래 목록과 같은 배열에서 만든다. */}
            <JsonLd data={itemListJsonLd(items.map((p) => ({name: p.name, url: `${base}/products/${p.slug}`})))} />
            <div className="mb-4 flex items-baseline justify-between gap-4">
                {title != null && <h2 className="m-0">{title}</h2>}
                <Link href={moreHref} className="text-sm text-primary no-underline">
                    {moreLabel}
                </Link>
            </div>
            <ul className="grid list-none gap-4 p-0 m-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                {items.map((p) => (
                    <li key={p.id} className="rounded-xl border border-border bg-background p-4">
                        <Link href={`/products/${p.slug}`} className="text-inherit no-underline">
                            {p.coverAssetId != null && (
                                <img
                                    src={mediaSrc(p.coverAssetId)}
                                    alt={p.name}
                                    loading="lazy"
                                    className="w-full aspect-[4/3] object-cover rounded mb-2"
                                />
                            )}
                            <div className="font-semibold">{p.name}</div>
                            {p.priceFrom != null && (
                                <div className="mt-1 text-primary">
                                    {Number(p.priceFrom).toLocaleString("ko-KR")}원~
                                </div>
                            )}
                            {/* 품절은 숨기지 않고 적는다 — 헛걸음을 만드는 침묵보다 낫다(`/products` 와 같은 판단). */}
                            {!p.inStock && <div className="mt-1 text-sm text-muted">품절</div>}
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** 한 레일에 그리는 상품 수. 레일은 **진열**이지 목록 라우트가 아니라 페이지네이션이 없다. */
const DEFAULT_LIMIT = 8;

/**
 * 갈래를 지정하면 그 갈래만, 아니면 카탈로그 앞에서부터.
 *
 * ⚠ **갈래 이름으로 목록을 긁어 그중에서 찾지 않는다.** 종전 `SectionList` 가 두 번 데인 자리다:
 * 상위 N건을 긁어 맵을 만들면 카탈로그가 커지는 순간 오래된 상품이 밀려나 진열이 조용히 빈다.
 * slug → id 해소만 한 번 하고, 그다음은 **서버가 그 갈래로 주는 대로** 그린다.
 */
async function loadItems(categorySlug: string | undefined, limit: number) {
    if (categorySlug == null) {
        const page = await zalkera.listProducts({size: limit}, {tags: ["products"]}).catch(() => null);
        return page?.content ?? [];
    }
    // ⚠ `listCategories()` 가 아니라 `listProductCategories()` 다 — 전자는 **게시판 카테고리**다
    //    (`/public/categories` vs `/public/product-categories`). 이름이 비슷해 한 번 잘못 잡았고,
    //    게시판이 비어 있으면 조용히 아무것도 안 그려져 증상이 "레일 소멸"로 같다.
    const categories = await zalkera.listProductCategories({tags: ["products"]}).catch(() => null);
    const category = categories?.find((c) => c.slug === categorySlug);
    if (category == null) return []; // 없는 갈래 = 이 레일만 안 그린다(페이지는 산다)
    const page = await zalkera
        .listProducts({categoryId: category.id, size: limit}, {tags: ["products"]})
        .catch(() => null);
    return page?.content ?? [];
}
