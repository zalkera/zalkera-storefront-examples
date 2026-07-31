"use client";

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import type {ConsentInput, SocialProvider} from "@zalkera/client";
import {CONSENT_STORAGE_KEY, STATE_STORAGE_KEY, isConsentError} from "@/lib/oauth";
import {notifyAuthHintChange} from "@/lib/useAuthHint";

/**
 * OAuth 콜백 처리(클라이언트). URL 의 code 를 읽어 서버 라우트 `/api/auth/social` 로 교환 요청한다
 * (토큰은 서버가 httpOnly 쿠키에 저장 — JS 에 노출 안 됨). 성공 시 /mypage 로 이동, 실패 시 에러 표시.
 * redirect_uri 는 authorize 때와 정확히 같아야 하므로 현재 페이지 origin+pathname 으로 재구성한다.
 */
export function CallbackHandler({
    provider,
    code,
    state,
    providerError,
}: {
    provider: SocialProvider | null;
    code?: string;
    state?: string;
    providerError: string | null;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const ran = useRef(false);

    useEffect(() => {
        // 콜백 교환은 한 번만(useEffect 재실행·StrictMode 중복 방지).
        if (ran.current) return;
        ran.current = true;

        void (async () => {
            if (providerError) {
                setError(`소셜 로그인이 취소되었거나 실패했습니다 (${providerError}).`);
                return;
            }
            if (!provider) {
                setError("알 수 없는 로그인 제공자입니다.");
                return;
            }
            if (!code) {
                setError("인가 코드(code)가 없습니다.");
                return;
            }
            // CSRF: authorize 시 심은 state 와 대조한다. **값이 없으면 거부한다**(fail-closed).
            // 정상 흐름은 SocialLoginButtons 가 crypto.randomUUID() 로 반드시 둘 다 만들므로,
            // 한쪽이라도 비었다는 것은 이 창에서 시작하지 않은 콜백이라는 뜻이다 — 공격자가 자기
            // code 를 담은 링크를 피해자에게 열게 하면 피해자 브라우저에 **공격자 계정 세션**이 심긴다.
            const saved = sessionStorage.getItem(STATE_STORAGE_KEY);
            sessionStorage.removeItem(STATE_STORAGE_KEY);
            if (!saved || !state || saved !== state) {
                setError("로그인 요청을 확인할 수 없습니다. 로그인 화면에서 처음부터 다시 시도해 주세요.");
                return;
            }

            // 로그인 시작 때 심은 약관 동의(consents)를 꺼내 백엔드로 함께 전달한다.
            const consents = readConsents();

            const redirectUri = `${window.location.origin}${window.location.pathname}`;
            const res = await fetch("/api/auth/social", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({provider, code, redirectUri, consents}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(
                    isConsentError(res.status, data)
                        ? "가입을 완료하려면 필수 약관에 모두 동의해야 합니다. 로그인 화면에서 다시 시도해 주세요."
                        : (data.message ?? "로그인에 실패했습니다."),
                );
                return;
            }
            // 서버가 응답에 로그인 힌트 쿠키를 심었다 — 헤더가 즉시 로그인 크롬으로 갱신되게 알린다.
            notifyAuthHintChange();
            router.replace("/mypage");
            router.refresh();
        })();
    }, [provider, code, state, providerError, router]);

    if (error) {
        return (
            <>
                <p className="text-danger">{error}</p>
                <p>
                    <Link href="/login">로그인으로 돌아가기</Link>
                </p>
            </>
        );
    }
    return <p className="text-muted">잠시만 기다려 주세요…</p>;
}

/** 로그인 시작 때 sessionStorage 에 심은 동의 목록을 읽어 소비(제거)한다. 없거나 깨졌으면 undefined. */
function readConsents(): ConsentInput[] | undefined {
    const raw = sessionStorage.getItem(CONSENT_STORAGE_KEY);
    sessionStorage.removeItem(CONSENT_STORAGE_KEY);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ConsentInput[]) : undefined;
    } catch {
        return undefined;
    }
}
