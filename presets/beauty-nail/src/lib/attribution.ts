import type {LeadTracking, OrderAttribution} from "@zalkera/client";

/**
 * **광고 유입 — 들어온 요청에서 잡아 담기·예약·리드에 싣는다.**
 *
 * 캠페인별 매출·ROAS 는 주문에 실린 `utm_campaign` 으로 센다. 광고를 눌러 들어온 첫 요청의 URL 에만 `utm_*`·클릭 ID 가 있고
 * 담기·예약은 보통 다른 페이지에서 일어나므로, `middleware` 가 들어온 요청에서 값을 읽어 이 쿠키에 두고 BFF 가 읽어 넘긴다.
 * 클라이언트 JS 는 없고, SEO 페이지에서 `searchParams` 를 읽지 않으니 정적 렌더도 그대로다.
 *
 * - **유입** = 캠페인·소스·매체·클릭 ID 중 하나라도 있는 것([hasAdTouch]) — `utm_term`·`utm_content` 만으로는 유입이 아니다.
 * - **마지막 광고 접점**: 새 유입이 덮고, 유입이 아닌 요청은 안 덮는다. 단 캠페인 없는 유입(예: 광고 아닌 공유 링크에도 붙는 `fbclid` 만)은
 *   캠페인이 든 쿠키를 덮지 않는다([nextTouch]) — 캠페인 표의 매출은 캠페인 이름으로만 센다. 백엔드 카트는 처음 실린 값만 남긴다.
 * - **잡는 요청** = 방문자가 연 문서 요청뿐([shouldCaptureLanding]) — 프리페치·이미지 같은 하위 요청이 쿠키를 덮지 않게.
 * - `referrer` 는 **호스트만**(전체 URL 에는 검색어가 들어 있을 수 있다) · 자기 사이트면 안 싣는다 · `landingPath` 는 쿼리를 뗀 경로.
 * - 값마다 255자까지 · 제어문자가 든 값은 버린다(자르지 않는다 — 잘린 이름은 광고비와 맞지 않는 다른 캠페인이다). 서버도 같은 규칙이다.
 *
 * 이 모듈은 `middleware` 가 가져온다 — Node 전용 모듈(`node:*`·`next/headers`)을 가져오지 마라.
 */
export const ATTRIBUTION_COOKIE = "zalkera_attribution";

export const ATTRIBUTION_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
} as const;

const VALUE_MAX = 255;
/** 인코딩한 쿠키 값의 상한 — 브라우저는 이름·속성 포함 4KB 를 넘는 쿠키를 말없이 버린다. 한글은 인코딩하면 세 배 넘게 는다. */
const COOKIE_VALUE_BUDGET = 3000;

const QUERY_KEYS = [
    ["utm_source", "utmSource"],
    ["utm_medium", "utmMedium"],
    ["utm_campaign", "utmCampaign"],
    ["utm_term", "utmTerm"],
    ["utm_content", "utmContent"],
    ["gclid", "gclid"],
    ["fbclid", "fbclid"],
    ["nclid", "nclid"],
] as const;

/** 예산이 모자라면 뒤에서부터 버린다 — 캠페인 매출을 세는 세 칸이 맨 앞이다. */
const PRIORITY = [
    "utmCampaign",
    "utmSource",
    "utmMedium",
    "landingPath",
    "referrer",
    "utmContent",
    "utmTerm",
    "gclid",
    "fbclid",
    "nclid",
] as const satisfies readonly (keyof OrderAttribution)[];

function clean(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    const value = raw.trim();
    // eslint-disable-next-line no-control-regex
    if (value === "" || value.length > VALUE_MAX || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return undefined;
    return value;
}

/** 유입인가 — 캠페인·소스·매체·클릭 ID 중 비지 않은 문자열이 하나라도 있으면. 쿠키·리드 폼 추적 둘 다 이 기준으로 판정한다. */
export function hasAdTouch(t: Record<string, unknown> | null | undefined): boolean {
    if (!t) return false;
    return (["utmCampaign", "utmSource", "utmMedium", "gclid", "fbclid", "nclid"] as const).some(
        (k) => clean(t[k]) !== undefined,
    );
}

/**
 * 이 요청에서 유입을 잡을까 — GET 이고, 방문자가 연 **문서** 요청일 때만.
 * `Sec-Fetch-Dest` 가 없으면(브라우저가 아닌 클라이언트) 문서로 본다. 프리페치(`Next-Router-Prefetch`·`Sec-Purpose: prefetch`)와
 * 이미지·스크립트 같은 하위 요청은 건너뛴다 — 다른 사이트의 `<img>` 나 화면에 스친 링크가 방문자의 유입을 덮지 않게.
 */
export function shouldCaptureLanding(method: string, header: (name: string) => string | null): boolean {
    if (method !== "GET") return false;
    const dest = header("sec-fetch-dest");
    if (dest !== null && dest !== "document") return false;
    if (header("next-router-prefetch") !== null) return false;
    return !/prefetch/i.test(header("sec-purpose") ?? header("purpose") ?? "");
}

/** 쿠키에 쓸 유입 — 쓰지 않으면 `null`. 캠페인 없는 새 유입은 캠페인이 든 기존 쿠키를 덮지 않는다. */
export function nextTouch(
    existing: OrderAttribution | null,
    incoming: OrderAttribution | null,
): OrderAttribution | null {
    if (!incoming) return null;
    if (existing?.utmCampaign && !incoming.utmCampaign) return null;
    return incoming;
}

function fitBudget(touch: OrderAttribution): OrderAttribution | null {
    const kept: OrderAttribution = {};
    for (const key of PRIORITY) {
        const value = touch[key];
        if (!value) continue;
        const next = {...kept, [key]: value};
        if (encodeURIComponent(JSON.stringify(next)).length <= COOKIE_VALUE_BUDGET) Object.assign(kept, {[key]: value});
    }
    return hasAdTouch(kept as Record<string, unknown>) ? kept : null;
}

/**
 * 들어온 요청의 유입 — 캠페인·소스·매체·클릭 ID 가 하나도 없으면 `null`(직접 방문은 쿠키를 덮지 않는다).
 * `ownHost` 는 `x-forwarded-host ?? host` — 서빙 컨테이너 안에서 `req.url` 의 호스트는 내부 주소다.
 */
export function readLandingTouch(url: URL, referer: string | null, ownHost: string | null): OrderAttribution | null {
    const touch: OrderAttribution = {};
    for (const [param, key] of QUERY_KEYS) {
        const value = clean(url.searchParams.get(param));
        if (value) touch[key] = value;
    }
    if (Object.keys(touch).length === 0) return null;
    const path = clean(url.pathname);
    if (path) touch.landingPath = path;
    if (referer) {
        try {
            const host = clean(new URL(referer).host);
            if (host && host !== ownHost) touch.referrer = host;
        } catch {
            // 해석 안 되는 Referer 는 싣지 않는다.
        }
    }
    return fitBudget(touch);
}

export function encodeTouch(touch: OrderAttribution): string {
    return JSON.stringify(touch);
}

/** 쿠키 값 → 유입. 모르는 키·문자열 아닌 값·규칙을 어긴 값은 버린다 — 쿠키는 방문자가 고칠 수 있다. */
export function decodeTouch(raw: string | undefined): OrderAttribution | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const touch: OrderAttribution = {};
    for (const key of PRIORITY) {
        const value = clean(record[key]);
        if (value) touch[key] = value;
    }
    return fitBudget(touch);
}

/** 리드 추적은 키가 다르다(`utmAdgroup` 있음 · `utmTerm`·`referrer`·`landingPath` 없음) — 겹치는 칸만 옮긴다. */
export function toLeadTracking(touch: OrderAttribution): LeadTracking {
    return {
        utmSource: touch.utmSource ?? null,
        utmMedium: touch.utmMedium ?? null,
        utmCampaign: touch.utmCampaign ?? null,
        utmContent: touch.utmContent ?? null,
        gclid: touch.gclid ?? null,
        fbclid: touch.fbclid ?? null,
        nclid: touch.nclid ?? null,
    };
}
