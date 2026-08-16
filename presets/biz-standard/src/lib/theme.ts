/**
 * 테넌트 테마 색 파서 (서버 전용).
 *
 * `SiteConfig.themeColors` 는 파싱하지 않은 raw JSON 문자열이다(백엔드 콘솔 `site.theme.update` 가
 * 넣는다). 같은 JSON 에 `layout` 등 이종 키가 병합돼 오므로 **색 키만 화이트리스트로** 읽는다.
 * 어떤 쓰레기가 와도 죽지 않는다(섹션 parse.ts 와 같은 사상) — 실패하면 빈 오버라이드(기본 테마).
 *
 * 읽어들인 색은 globals.css 의 `@theme` 변수를 `<html>` inline style 로 덮어, `bg-primary` 등
 * 전 유틸리티가 테넌트 색으로 바뀐다(layout.tsx). CSS 주입 방어를 위해 값은 hex 형식 검증 후에만 싣는다.
 *
 * `@zalkera/client` 를 import 하지 않으므로 validator E1/E2 와 무관하다.
 */

/** `#rgb`/`#rrggbb` 만 통과. 임의 문자열을 style 에 싣지 않는다(CSS 주입 방어). */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 콘솔 스키마의 색 키 → globals.css `@theme` 변수명 매핑. 이 키만 읽는다. */
const COLOR_KEYS: ReadonlyArray<readonly [string, string]> = [
    ["primary", "--color-primary"],
    ["secondary", "--color-secondary"],
    ["background", "--color-background"],
    ["text", "--color-foreground"],
];

/*
 * ── 전역 토큰 knob ──────────────────────────────
 * 색과 달리 knob 은 **enum**이다. 백엔드 `site.theme.update` 화이트리스트가 허용값만 저장하지만,
 * 여기서도 매핑 테이블 lookup 으로 한 번 더 봉한다: **사용자 문자열은 어떤 경로로도 style 에 실리지
 * 않는다** — enum 은 테이블 key 조회뿐이고, 없는 값(오염·구버전)은 조용히 버려 @theme 기본값을 유지한다.
 * 이 값들은 백엔드 enum(FONTS/RADII/DENSITIES)과 반드시 일치해야 한다(계약).
 */

/** 시스템 폰트 스택(globals.css --font-sans 와 동일 — system knob 의 기본값). */
const SYSTEM_STACK =
    'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/*
 * font: --font-sans 스택 교체.
 * TODO: pretendard·noto-serif-kr 의 self-host `@font-face` woff2 서브셋 자산 번들링.
 * 지금은 폰트 **패밀리명만** 스택 앞에 얹어, 사용자 환경에 설치돼 있으면 쓰고 없으면 폴백한다
 * (외부 CDN 0 유지). 자산이 동봉되면 여기 매핑은 그대로 두고 globals.css 에 @font-face 만 추가하면 된다.
 */
const FONTS: Readonly<Record<string, string>> = {
    system: SYSTEM_STACK,
    pretendard: `"Pretendard", ${SYSTEM_STACK}`,
    "noto-serif-kr": '"Noto Serif KR", ui-serif, Georgia, "Nanum Myeongjo", serif',
};

/** radius: --radius-knob 무단위 배수(globals.css radius 스케일이 곱한다). soft=1 이 Tailwind 기본과 일치. */
const RADII: Readonly<Record<string, string>> = {sharp: "0", soft: "1", round: "2"};

/** density: --spacing 베이스(Tailwind v4 기본 0.25rem). 전 spacing 유틸리티가 일괄 스케일. */
const DENSITIES: Readonly<Record<string, string>> = {compact: "0.22rem", cozy: "0.25rem"};

/** knob 키 → CSS 변수 → enum 매핑 테이블. */
const KNOB_KEYS: ReadonlyArray<readonly [string, string, Readonly<Record<string, string>>]> = [
    ["font", "--font-sans", FONTS],
    ["radius", "--radius-knob", RADII],
    ["density", "--spacing", DENSITIES],
];

export interface ParsedTheme {
    /** `<html style={...}>` 에 그대로 얹을 CSS 변수 맵. 오버라이드가 없으면 빈 객체(기본 테마 유지). */
    cssVars: Record<string, string>;
}

export function parseThemeColors(raw: string | null | undefined): ParsedTheme {
    const cssVars: Record<string, string> = {};
    if (!raw) return {cssVars};

    let obj: unknown;
    try {
        obj = JSON.parse(raw);
    } catch {
        return {cssVars};
    }
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return {cssVars};

    const src = obj as Record<string, unknown>;
    let primaryHex: string | undefined;
    for (const [key, cssVar] of COLOR_KEYS) {
        const value = src[key];
        if (typeof value === "string" && HEX.test(value)) {
            cssVars[cssVar] = value;
            if (key === "primary") primaryHex = value;
        }
    }

    // 콘솔 스키마에 primary-foreground 키가 없다 — primary 가 오버라이드되면 대비가 큰 쪽을
    // 서버가 산출해 함께 주입한다(테넌트가 밝은 액센트를 골라도 CTA 글자가 안 죽는다).
    if (primaryHex) {
        cssVars["--color-primary-foreground"] = onColor(primaryHex);
    }

    // 전역 토큰 knob(font·radius·density) — 매핑 테이블 lookup 만. hasOwnProperty 로 own key 만 채택해
    // 프로토타입 오염(constructor 등)·오염 문자열을 차단한다(사용자 문자열이 style 에 실리지 않는다).
    for (const [key, cssVar, table] of KNOB_KEYS) {
        const value = src[key];
        if (typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value)) {
            cssVars[cssVar] = table[value];
        }
    }

    return {cssVars};
}

/** primary 위에 얹을 글자색 — WCAG 상대 휘도로 흰색/slate-950 중 대비 큰 쪽. */
function onColor(hex: string): string {
    return relativeLuminance(hex) > 0.4 ? "#020617" /* slate-950 */ : "#ffffff";
}

/** WCAG 상대 휘도(0~1). 검증된 hex 만 들어온다(HEX 통과분). */
function relativeLuminance(hex: string): number {
    const [r, g, b] = toRgb(hex).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toRgb(hex: string): [number, number, number] {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
