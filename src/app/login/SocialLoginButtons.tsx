"use client";

import type {ConsentInput, SocialProvider} from "@zalkera/client";
import {CONSENT_STORAGE_KEY, PROVIDER_CONFIG, SOCIAL_PROVIDERS, STATE_STORAGE_KEY} from "@/lib/oauth";
import {Button} from "@/components/ui/Button";

/**
 * 카카오/네이버/구글 소셜 로그인 버튼. 클릭하면 provider 의 OAuth authorize URL 로 리다이렉트한다.
 * redirect_uri 는 우리 콜백 페이지(`/auth/callback/{provider}`) — 콜백에서 code 를 서버 라우트로 교환한다.
 * CSRF 방지용 state 와 사용자가 고른 약관 동의(consents)를 sessionStorage 에 심어 콜백이 읽게 한다.
 *
 * 필수 동의(이용약관·개인정보·만14세)가 아직이면 `disabled` 로 버튼이 잠긴다.
 */
export function SocialLoginButtons({consents, disabled}: {consents: ConsentInput[]; disabled: boolean}) {
    /**
     * 개시는 **서버가 한다**(memo118 ②층). state 를 브라우저가 만들어 sessionStorage 에만 두면,
     * 그 검사는 우리 클라이언트 코드가 실행될 때만 산다 — AI 가 이 파일을 다시 쓰거나 BYO 고객이
     * 자기 로그인 화면을 짜면 조용히 사라진다. 서버가 발행해 httpOnly 쿠키에 심으면 교환 라우트가
     * **어떤 프론트엔드가 붙든 스스로 방어한다.**
     */
    const start = async (provider: SocialProvider) => {
        const cfg = PROVIDER_CONFIG[provider];
        if (!cfg.clientId) {
            alert(`${cfg.label} client_id 환경변수(NEXT_PUBLIC_*)가 설정되지 않았습니다.`);
            return;
        }
        const res = await fetch("/api/auth/social/start", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({provider}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.message ?? "로그인을 시작할 수 없습니다.");
            return;
        }
        // ⚠ 이 sessionStorage 대조는 **방어가 아니다** — 방어는 서버의 httpOnly 쿠키가 한다.
        // 사용자에게 더 이른 피드백을 주려고 남겨 둔 UX 장치이므로, 지워도 보안은 그대로다.
        sessionStorage.setItem(STATE_STORAGE_KEY, data.state);
        // 동의 선택을 리다이렉트 너머로 전달 — 콜백이 읽어 백엔드로 실어 보낸다.
        sessionStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consents));
        window.location.href = data.authorizeUrl;
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
