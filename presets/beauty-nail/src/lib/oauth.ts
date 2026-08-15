// 클라이언트/서버 공용 — 서버 클라이언트 싱글턴(lib/zalkera)이나 값 import 를 포함하지 않으므로
// "use client" 컴포넌트에서 안전하게 import 할 수 있다(validator E1/E2 무관).
import type {ConsentInput, ConsentType, SocialProvider} from "@zalkera/client";
import {internalPath} from "./safeUrl.ts";

/** 로그인 버튼으로 노출할 소셜 제공자 순서. TEST 는 실OAuth 가 아니라 여기에 없다(개발 전용 별도 진입점). */
export const SOCIAL_PROVIDERS: SocialProvider[] = ["KAKAO", "NAVER", "GOOGLE"];

/** authorize 요청 시 심고 콜백에서 대조하는 CSRF state 의 sessionStorage 키. */
export const STATE_STORAGE_KEY = "zalkera_oauth_state";

/**
 * 소셜 버튼 클릭 시 사용자가 고른 약관 동의(consents)를 OAuth 리다이렉트 너머로 옮기기 위한
 * sessionStorage 키. 콜백 핸들러가 읽어 `/api/auth/social` POST 바디에 실어 백엔드로 전달한다.
 */
export const CONSENT_STORAGE_KEY = "zalkera_oauth_consents";

/**
 * 현재 약관 문서 버전. 동의받은 정책 버전을 백엔드에 함께 저장한다(정책 개정 시 재동의 판단용).
 * 약관 내용이 바뀌면 이 상수만 올린다.
 */
export const POLICY_VERSION = "v1";

/**
 * 로그인 복귀 경로 안전 판정 — **내부 경로만** 통과시킨다.
 *
 * 문자 검사(`startsWith("/")` + `!startsWith("//")`)로는 못 막는다. 실측으로 뚫린 입력:
 * `/\t/evil.com` · `/\evil.com` · `/\n/evil.com` — 전부 `/` 로 시작하고 `//` 로 시작하지 않지만
 * URL 파서는 `https://evil.com/` 으로 읽는다. 그래서 **파서가 어떻게 읽는지로** 판정한다.
 *
 * 통과 값도 원문이 아니라 파서가 정규화한 경로를 돌려준다 — 제어문자가 섞인 원문을 그대로 넘기면
 * 소비자가 또 다르게 해석할 여지가 남는다.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
    // 판정은 `safeUrl.ts` 의 `internalPath` 하나가 진다 — 규칙을 여기 옮겨 적지 마라.
    // 종전에는 같은 규칙이 두 파일에 베껴져 있었고, 그래서 둘이 같이 틀렸다(오픈 리다이렉트).
    if (!raw || !raw.startsWith("/")) return null;
    return internalPath(raw);
}

/** 로그인 동의 UI 에 노출할 항목 정의. `required` 3종은 신규 가입에 모두 체크돼야 한다. */
export interface ConsentItem {
    type: ConsentType;
    label: string;
    required: boolean;
}

export const CONSENT_ITEMS: ConsentItem[] = [
    {type: "TERMS", label: "이용약관 동의", required: true},
    {type: "PRIVACY", label: "개인정보 수집·이용 동의", required: true},
    {type: "OVER_14", label: "만 14세 이상입니다", required: true},
    {type: "MARKETING_EMAIL", label: "마케팅 정보 이메일 수신", required: false},
    {type: "MARKETING_SMS", label: "마케팅 정보 SMS 수신", required: false},
];

/** 필수 동의 종류. 신규 가입에 셋 다 granted=true 여야 백엔드가 가입을 허용한다. */
export const REQUIRED_CONSENT_TYPES: ConsentType[] = CONSENT_ITEMS.filter((c) => c.required).map((c) => c.type);

/** 체크된 동의 집합을 백엔드로 보낼 `ConsentInput[]`(모든 항목에 대해 granted 명시)로 변환. */
export function buildConsents(granted: ReadonlySet<ConsentType>): ConsentInput[] {
    return CONSENT_ITEMS.map((item) => ({
        consentType: item.type,
        policyVersion: POLICY_VERSION,
        granted: granted.has(item.type),
    }));
}

/** 필수 3종이 모두 체크됐는지 — 소셜/테스트 로그인 버튼 활성화 게이트. */
export function hasAllRequiredConsents(granted: ReadonlySet<ConsentType>): boolean {
    return REQUIRED_CONSENT_TYPES.every((t) => granted.has(t));
}

/**
 * 로그인 응답이 "필수 동의 미충족" 실패인지 판별. 백엔드가 `code: CONSENT_REQUIRED` 를 주면 그걸 쓰고,
 * 그렇지 않은 빌드(예: 400 + `code: "Bad Request"`)면 메시지의 "약관" 문구로 보수적으로 감지한다.
 */
export function isConsentError(status: number, body: {code?: string; message?: string} | null): boolean {
    if (status !== 400 || !body) return false;
    if (body.code === "CONSENT_REQUIRED") return true;
    return typeof body.message === "string" && body.message.includes("약관");
}

interface ProviderConfig {
    /** 버튼·에러 메시지에 쓰는 한글 라벨. */
    label: string;
    /** provider 의 OAuth authorize 엔드포인트. */
    authorizeUrl: string;
    /**
     * public client_id — NEXT_PUBLIC_* 환경변수로 빌드 타임에 인라인된다.
     * client_secret 은 절대 프론트에 두지 않는다(백엔드 tenant_oauth_app 이 보관).
     */
    clientId: string | undefined;
    /** 요청 스코프(있으면). 구글은 openid 로그인에 필수. */
    scope?: string;
}

export const PROVIDER_CONFIG: Record<SocialProvider, ProviderConfig> = {
    KAKAO: {
        label: "카카오",
        authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
        clientId: process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID,
    },
    NAVER: {
        label: "네이버",
        authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
        clientId: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID,
    },
    GOOGLE: {
        label: "구글",
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        scope: "openid email profile",
    },
};

/** provider 별 콜백 경로. redirect_uri 는 여기에 origin 을 붙여 만든다(authorize·교환 동일해야 함). */
export function callbackPath(provider: SocialProvider): string {
    return `/auth/callback/${provider.toLowerCase()}`;
}

/** 동적 라우트의 소문자 provider 파라미터를 SocialProvider 로 검증·변환. 모르는 값이면 null. */
export function parseProviderParam(raw: string): SocialProvider | null {
    const upper = raw.toUpperCase();
    return (SOCIAL_PROVIDERS as string[]).includes(upper) ? (upper as SocialProvider) : null;
}

/** provider authorize URL 조립. redirectUri 는 우리 콜백 페이지, state 는 CSRF 방지용 난수. */
export function buildAuthorizeUrl(provider: SocialProvider, redirectUri: string, state: string): string {
    const cfg = PROVIDER_CONFIG[provider];
    const params = new URLSearchParams({
        response_type: "code",
        client_id: cfg.clientId ?? "",
        redirect_uri: redirectUri,
        state,
    });
    if (cfg.scope) params.set("scope", cfg.scope);
    return `${cfg.authorizeUrl}?${params.toString()}`;
}
