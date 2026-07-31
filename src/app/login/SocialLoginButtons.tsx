"use client";

import type {ConsentInput, SocialProvider} from "@zalkera/client";
import {
    CONSENT_STORAGE_KEY,
    PROVIDER_CONFIG,
    SOCIAL_PROVIDERS,
    STATE_STORAGE_KEY,
    buildAuthorizeUrl,
    callbackPath,
} from "@/lib/oauth";
import {Button} from "@/components/ui/Button";

/**
 * 카카오/네이버/구글 소셜 로그인 버튼. 클릭하면 provider 의 OAuth authorize URL 로 리다이렉트한다.
 * redirect_uri 는 우리 콜백 페이지(`/auth/callback/{provider}`) — 콜백에서 code 를 서버 라우트로 교환한다.
 * CSRF 방지용 state 와 사용자가 고른 약관 동의(consents)를 sessionStorage 에 심어 콜백이 읽게 한다.
 *
 * 필수 동의(이용약관·개인정보·만14세)가 아직이면 `disabled` 로 버튼이 잠긴다.
 */
export function SocialLoginButtons({
    consents,
    disabled,
}: {
    consents: ConsentInput[];
    disabled: boolean;
}) {
    const start = (provider: SocialProvider) => {
        const cfg = PROVIDER_CONFIG[provider];
        if (!cfg.clientId) {
            alert(`${cfg.label} client_id 환경변수(NEXT_PUBLIC_*)가 설정되지 않았습니다.`);
            return;
        }
        const redirectUri = `${window.location.origin}${callbackPath(provider)}`;
        const state = crypto.randomUUID();
        sessionStorage.setItem(STATE_STORAGE_KEY, state);
        // 동의 선택을 리다이렉트 너머로 전달 — 콜백이 읽어 백엔드로 실어 보낸다.
        sessionStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consents));
        window.location.href = buildAuthorizeUrl(provider, redirectUri, state);
    };

    return (
        <div className="grid gap-2 max-w-xs">
            {SOCIAL_PROVIDERS.map((p) => (
                <Button key={p} variant="outline" className="w-full" onClick={() => start(p)} disabled={disabled}>
                    {PROVIDER_CONFIG[p].label}로 로그인
                </Button>
            ))}
        </div>
    );
}
