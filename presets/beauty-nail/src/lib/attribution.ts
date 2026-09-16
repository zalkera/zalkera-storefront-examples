import type {LeadTracking, OrderAttribution} from "@zalkera/client";

/**
 * **광고 유입 — 들어온 요청에서 잡아 담기·예약·리드에 싣는다.**
 *
 * 캠페인별 매출·ROAS 는 주문에 실린 `utm_campaign` 으로 센다. 광고를 눌러 들어온 첫 요청의 URL 에만 `utm_*`·클릭 표지가 있고
 * 담기·예약은 보통 다른 페이지에서 일어나므로, `middleware` 가 들어온 요청에서 값을 읽어 이 쿠키에 두고 BFF 가 읽어 넘긴다.
 * 쿠키 경로에는 클라이언트 JS 가 없고, SEO 페이지에서 `searchParams` 를 읽지 않으니 정적 렌더도 그대로다.
 *
 * - **유입** = 캠페인·소스·매체·클릭 표지 중 하나라도 있는 것([hasAdTouch]) — `utm_term`·`utm_content` 만으로는 유입이 아니다.
 *   클릭 표지 = `gclid`·`gbraid`·`wbraid`(Google Ads) · `NaPm`(네이버) · `fbclid`(Meta).
 * - **마지막 광고 접점**: 새 유입이 덮고, 유입이 아닌 요청은 안 덮는다. 단 **광고 여부를 모르는 링크 표지만** 붙은 유입 — `fbclid` 만,
 *   또는 `tr` 이 `sa`·`gfa` 가 아닌 `NaPm` 만 — 은 **광고 접점이 든 쿠키**를 덮지 않는다([nextTouch] · 공유 링크·검색결과 클릭에도 붙는다).
 *   백엔드 카트는 처음 실린 값만 남긴다.
 * - **클릭 ID 원문은 쿠키·요청에 싣지 않는다** — 구글·Meta 표지는 「있음」(`"1"`)만, `NaPm` 은 매체 판정에 쓰는 `tr` 조각만([markerValue]).
 *   매체 판정에는 그것이면 충분하고, 원문은 방문자를 가리키는 식별값이라 사이트가 쥘 목적이 없다(서버도 판정값만 남긴다).
 * - 쿠키에는 유입 기록(utm·표지 있음·경로·호스트)이 들어 있다 — 사이트 개인정보 처리방침의 쿠키(자동 수집 장치) 고지 대상이다.
 * - 광고 URL(유입이 읽히는 URL)의 응답은 쿠키를 심든 안 심든 `Cache-Control: private, no-store` — 공유 캐시가 쿠키 있는 응답을 재생하거나,
 *   쿠키 없는 응답을 저장해 뒤 방문자가 쿠키를 못 받는 일이 없게.
 * - **잡는 요청** = 방문자가 연 문서 요청뿐([shouldCaptureLanding]) — 프리페치·이미지 같은 하위 요청이 쿠키를 덮지 않게.
 * - `referrer` 는 **호스트만**(전체 URL 에는 검색어가 들어 있을 수 있다) · 자기 사이트면 안 싣는다 · `landingPath` 는 쿼리를 뗀 경로.
 * - 값마다 255자까지 · 제어문자가 든 값은 버린다(자르지 않는다 — 잘린 이름은 광고비와 맞지 않는 다른 캠페인이다). 서버도 같은 규칙이다.
 *
 * 이 모듈은 `middleware` 와 **리드 폼(클라이언트)** 이 가져온다 — 브라우저 번들에 실리니 Node 전용 모듈(`node:*`·`next/headers`)·
 * 서버 전용 값·비밀을 두지 마라(`@zalkera/client` 는 타입만 가져온다).
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
    ["gbraid", "gbraid"],
    ["wbraid", "wbraid"],
    ["NaPm", "naPm"],
    ["fbclid", "fbclid"],
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
    "gbraid",
    "wbraid",
    "naPm",
    "fbclid",
] as const satisfies readonly (keyof OrderAttribution)[];

function clean(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    // 앞뒤 공백은 JS `trim` 정의다 — 서버(Kotlin)는 BOM 을 안 떼고 U+001C~1F 를 뗀다. 매체 URL 에는 안 나오는 문자라 맞추지 않는다.
    const value = raw.trim();
    // eslint-disable-next-line no-control-regex
    if (value === "" || value.length > VALUE_MAX || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return undefined;
    return value;
}

/** 유입인가 — 캠페인·소스·매체·클릭 표지 중 비지 않은 문자열이 하나라도 있으면. 쿠키·리드 폼 추적 둘 다 이 기준으로 판정한다. */
export function hasAdTouch(t: Record<string, unknown> | null | undefined): boolean {
    if (!t) return false;
    return (["utmCampaign", "utmSource", "utmMedium", "gclid", "gbraid", "wbraid", "naPm", "fbclid"] as const).some(
        (k) => clean(t[k]) !== undefined,
    );
}

/** 클릭 표지 칸에 둘 값 — 구글·Meta 는 「있음」(`"1"`) · `NaPm` 은 `tr` 조각 · 그 밖의 칸은 거른 값 그대로. 값은 이미 거른 것이어야 한다. */
function markerValue(key: string, value: string): string {
    if (key === "naPm") return reduceNaPm(value);
    if (key === "gclid" || key === "gbraid" || key === "wbraid" || key === "fbclid") return "1";
    return value;
}

/** 해독된 `NaPm`(`ct=…|ci=…|tr=sa|…`)의 `tr` 값 — 첫 `tr=` 조각. 없으면 undefined. */
function naverType(naPm: string): string | undefined {
    const part = naPm.split("|").find((p) => p.startsWith("tr="));
    return part === undefined ? undefined : part.slice(3);
}

/** `NaPm` 에서 `tr` 조각만 남긴다(SDK llms.txt 「광고 유입」 규칙 — 서버는 원문이든 조각이든 같은 매체로 가른다) — 모양이 이상한 `tr` 은 `tr=` 로. */
export function reduceNaPm(raw: string): string {
    const type = naverType(raw);
    return "tr=" + (type !== undefined && /^[A-Za-z0-9_]{1,32}$/.test(type) ? type : "");
}

/** 네이버 광고 유형(`tr=sa` 검색광고 · `tr=gfa` 성과형 디스플레이)인가 — 그 밖의 `NaPm` 은 광고 여부를 모른다. */
function isNaverAd(naPm: string | null | undefined): boolean {
    if (!naPm) return false;
    const type = naverType(naPm);
    return type === "sa" || type === "gfa";
}

/**
 * 이 요청에서 유입을 잡을까 — GET 이고, 방문자가 연 **문서** 요청일 때만.
 * `Sec-Fetch-Dest` 가 없으면(브라우저가 아닌 클라이언트) 문서로 본다. 브라우저 프리페치(`Sec-Purpose: prefetch`)와 이미지·스크립트·
 * RSC fetch(`empty`) 같은 하위 요청은 건너뛴다 — 다른 사이트의 `<img>` 나 화면에 스친 링크가 방문자의 유입을 덮지 않게.
 * ⚠ `Next-Router-Prefetch`·`RSC` 로 가르지 마라 — Next 가 middleware 에 넘기기 전에 그 헤더들을 뗀다.
 */
export function shouldCaptureLanding(method: string, header: (name: string) => string | null): boolean {
    if (method !== "GET") return false;
    const dest = header("sec-fetch-dest");
    if (dest !== null && dest !== "document") return false;
    return !/prefetch/i.test(header("sec-purpose") ?? header("purpose") ?? "");
}

/**
 * 광고 접점인가 — 캠페인·소스·매체 · 구글 표지 · 광고 유형 `NaPm` 중 하나라도. `fbclid`·광고 유형이 아닌 `NaPm` 은 광고 여부를 모른다.
 * 쿠키 해독값과 리드 폼 추적 둘 다 이 기준이다(규칙을 두 벌 두지 않는다).
 */
function isAdTouch(t: Record<string, unknown> | null | undefined): boolean {
    if (!t) return false;
    const has = (k: string) => clean(t[k]) !== undefined;
    return (
        has("utmCampaign") ||
        has("utmSource") ||
        has("utmMedium") ||
        has("gclid") ||
        has("gbraid") ||
        has("wbraid") ||
        isNaverAd(clean(t.naPm))
    );
}

/**
 * 쿠키에 쓸 유입 — 쓰지 않으면 `null`. 새 유입은 덮되, **광고 여부를 모르는 링크 표지만** 붙은 유입(`fbclid` 만 · 광고 유형이 아닌
 * `NaPm` 만)은 **광고 접점이 든** 기존 쿠키를 덮지 않는다 — 캠페인 없이 `gclid` 만 든 쿠키도 지킨다(그 주문은 utm 없는 광고 클릭 매출로 센다).
 * 광고 접점이 있는 유입은 늘 덮는다 — 막으면 나중에 누른 다른 광고의 매출이 앞 접점에 잡힌다.
 */
export function nextTouch(
    existing: OrderAttribution | null,
    incoming: OrderAttribution | null,
): OrderAttribution | null {
    if (!incoming) return null;
    if (isAdTouch(existing as Record<string, unknown> | null) && !isAdTouch(incoming as Record<string, unknown>))
        return null;
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
 * 들어온 요청의 유입 — 캠페인·소스·매체·클릭 표지가 하나도 없으면 `null`(직접 방문은 쿠키를 덮지 않는다).
 * `ownHost` 는 `x-forwarded-host ?? host` — 서빙 컨테이너 안에서 `req.url` 의 호스트는 내부 주소다.
 */
export function readLandingTouch(url: URL, referer: string | null, ownHost: string | null): OrderAttribution | null {
    const touch: OrderAttribution = {};
    for (const [param, key] of QUERY_KEYS) {
        const value = clean(url.searchParams.get(param));
        if (value) touch[key] = markerValue(key, value);
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
        if (value) touch[key] = markerValue(key, value);
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
        gbraid: touch.gbraid ?? null,
        wbraid: touch.wbraid ?? null,
        naPm: touch.naPm ?? null,
        fbclid: touch.fbclid ?? null,
    };
}

/** 리드 폼이 읽는 쿼리 키 — 주문 귀속과 달리 `utm_adgroup` 이 있고 `utm_term`·경로·호스트가 없다. */
const LEAD_QUERY_KEYS = [
    ["utm_source", "utmSource"],
    ["utm_medium", "utmMedium"],
    ["utm_campaign", "utmCampaign"],
    ["utm_adgroup", "utmAdgroup"],
    ["utm_content", "utmContent"],
    ["gclid", "gclid"],
    ["gbraid", "gbraid"],
    ["wbraid", "wbraid"],
    ["NaPm", "naPm"],
    ["fbclid", "fbclid"],
] as const satisfies readonly (readonly [string, keyof LeadTracking])[];

/**
 * 리드 폼이 **그 페이지의** 쿼리에서 읽는 추적 — 쿠키와 같은 규칙으로 거르고(빈 값·255자 초과·제어문자 버림) `NaPm` 은 조각으로 줄인다.
 * 하나도 없으면 `undefined`. 폼(클라이언트)은 이것만 부른다 — 규칙 사본이 컴포넌트에 남지 않게.
 */
export function leadTrackingFromQuery(search: string): LeadTracking | undefined {
    const q = new URLSearchParams(search);
    const tracking: LeadTracking = {};
    for (const [param, key] of LEAD_QUERY_KEYS) {
        const value = clean(q.get(param));
        if (value) tracking[key] = markerValue(key, value);
    }
    return Object.keys(tracking).length === 0 ? undefined : tracking;
}

/**
 * 리드에 실을 추적 — 폼이 보낸 값(그 페이지의 쿼리)과 들어온 요청의 쿠키 중 무엇인가. 쿠키의 덮기 규칙([nextTouch])과 같다:
 * 폼이 광고 접점이면 폼 · 쿠키만 광고 접점이면 쿠키(광고로 들어온 뒤 네이버 검색결과·공유 링크로 돌아와 문의해도 캠페인이 남게) ·
 * 둘 다 광고 접점이 아니면 유입이 있는 폼 · 폼에 유입이 없으면 쿠키 · 둘 다 없으면 폼 그대로.
 */
export function chooseLeadTracking(form: unknown, landing: OrderAttribution | null): unknown {
    const formRecord =
        typeof form === "object" && form !== null && !Array.isArray(form) ? (form as Record<string, unknown>) : null;
    const landingRecord = landing as Record<string, unknown> | null;
    // 폼을 고를 때도 표지는 「있음」·조각으로 — 옛 탭의 JS 나 고친 폼이 원문을 보내도 서버 요청에 싣지 않는다.
    const fromForm = formRecord ? withMarkersOnly(formRecord) : form;
    if (isAdTouch(formRecord)) return fromForm;
    if (landing && isAdTouch(landingRecord)) return toLeadTracking(landing);
    if (hasAdTouch(formRecord)) return fromForm;
    return landing ? toLeadTracking(landing) : fromForm;
}

/** 표지 칸만 [markerValue] 로 바꾼 사본 — 걸러지는 표지 칸과 `nclid`(옛 탭이 보내는 원문)는 뺀다. 다른 칸은 그대로(서버가 거른다). */
function withMarkersOnly(record: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {...record};
    for (const key of ["gclid", "gbraid", "wbraid", "fbclid", "naPm"]) {
        if (!(key in out)) continue;
        const value = clean(out[key]);
        if (value) out[key] = markerValue(key, value);
        else delete out[key];
    }
    delete out.nclid;
    return out;
}
