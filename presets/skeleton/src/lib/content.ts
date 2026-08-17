import {asString} from "@zalkera/client";
import {safeLinkUrl} from "@/lib/safeUrl";
import {ownPage} from "./ownPage";
import {nav, pages} from "../../content";

/**
 * 콘텐츠 파일 로더 — **사이트의 얼굴은 이 레포가 정본으로 갖는다**(어휘 계약 rev 4 `contentFile`).
 *
 * 페이지·섹션·정적 문구·섹션 이미지·내비는 `content/` 아래 json 이고, 업무 데이터(상품·주문·회원)는
 * 그대로 `@zalkera/client` 뒤 DB 다. 둘을 잇는 유일한 키가 상품 `handle`(= `ProductSummary.slug`)이다 —
 * 숫자 id 는 테넌트마다 다른 값이라 소스에 적을 수 없다(그 소스는 고객 것이고 그대로 재업로드된다).
 *
 * **이 파일의 계약은 렌더 가드와 같다: 절대 throw 하지 않는다.** json 은 사람과 AI 가 손으로 고치는
 * 파일이라 형상이 틀릴 수 있다. 틀린 곳은 그 부분만 사라지고 페이지는 산다 — 문구 하나 잘못 고쳤다고
 * 사이트 전체가 500 이 나면 "말로 고친다"가 성립하지 않는다.
 */

/** 콘텐츠 파일의 섹션 1건. `config` 는 **객체**다(문자열로 감싸지 않는다). */
export interface ContentSection {
    type: string;
    config: unknown;
}

/** `content/pages/<slug>.json` 한 장. */
export interface PageContentFile {
    title: string;
    /** SEO 오버라이드. 없으면 페이지 제목·사이트 기본값으로 강하한다. */
    seo?: {title?: string; description?: string};
    /** **배열 순서가 화면 순서다** — `sortOrder` 키는 없다. */
    sections: ContentSection[];
}

/** `content/nav.json` 의 링크 1건. */
export interface NavLink {
    label: string;
    href: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 섹션 배열 정규화. `type` 이 문자열인 객체만 남긴다 — 그 외는 렌더러가 볼 것이 없다.
 * `config` 는 판정하지 않고 그대로 넘긴다(각 섹션 컴포넌트가 `readConfig` 로 강하시킨다).
 */
function normalizeSections(value: unknown): ContentSection[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        if (!isRecord(raw)) return [];
        const type = asString(raw.type)?.trim();
        return type ? [{type, config: raw.config}] : [];
    });
}

function normalizeSeo(value: unknown): PageContentFile["seo"] {
    if (!isRecord(value)) return undefined;
    const title = asString(value.title)?.trim();
    const description = asString(value.description)?.trim();
    if (!title && !description) return undefined;
    return {...(title ? {title} : {}), ...(description ? {description} : {})};
}

/**
 * 콘텐츠 페이지 하나. 매니페스트에 없으면 `null` — 호출자가 404 든 폴백이든 정한다.
 *
 * 제목이 비면 slug 를 쓴다. 제목 없는 파일 하나가 `<h1>` 을 통째로 비우는 것보다, 사람이 보고
 * "아 제목을 안 적었구나"를 알아채는 쪽이 낫다(빈 문자열은 화면에서 안 보인다).
 */
export function loadPageContent(slug: string): PageContentFile | null {
    // 자기 키만 본다 — 이유는 [ownPage].
    const raw = ownPage(pages, slug);
    if (!isRecord(raw)) return null;
    return {
        title: asString(raw.title)?.trim() || slug,
        seo: normalizeSeo(raw.seo),
        sections: normalizeSections(raw.sections),
    };
}

/**
 * 콘텐츠 페이지 slug 전량. `generateStaticParams`(발행 빌드에서 전 페이지 프리렌더)와 sitemap 이 읽는다.
 * 매니페스트 키 순서 = 선언 순서다.
 */
export function pageSlugs(): string[] {
    return Object.keys(pages);
}

/** 내비 링크 정규화 — label·href 가 둘 다 있는 것만. href 는 여기서 소독한다(저장형 XSS). */
function normalizeNav(value: unknown): NavLink[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        if (!isRecord(raw)) return [];
        const label = asString(raw.label)?.trim();
        const href = asString(raw.href)?.trim();
        return label && href ? [{label, href: safeLinkUrl(href)}] : [];
    });
}

/**
 * `content/nav.json`. 파일이 없거나 비어도 정상이다 — 내비가 비는 것이지 오류가 아니다.
 * 헤더·푸터를 따로 두는 이유는 위치가 곧 다른 목록이기 때문이다 — 한 배열에 `position` 을 섞어
 * 적고 렌더가 걸러내는 형상보다, 파일이 두 키를 갖는 편이 읽고 고치기 쉽다.
 */
export function loadNav(): {header: NavLink[]; footer: NavLink[]} {
    const raw: unknown = nav;
    if (!isRecord(raw)) return {header: [], footer: []};
    return {header: normalizeNav(raw.header), footer: normalizeNav(raw.footer)};
}
