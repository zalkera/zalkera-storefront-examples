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
            // ⚠ **이건 방어가 아니라 UX 다.** 진짜 방어는 서버가 httpOnly 쿠키의 state 와 대조하는
            // 것이고, 그것은 이 파일을 통째로 지워도 산다.
            // 여기 남겨 둔 이유는 하나 — 서버까지 가기 전에 사용자에게 더 이른 안내를 주기 때문이다.
            // 그러니 이 블록을 지우거나 AI 가 다시 써도 보안은 그대로다. **그 반대로 읽지 말 것.**
            const saved = sessionStorage.getItem(STATE_STORAGE_KEY);
            sessionStorage.removeItem(STATE_STORAGE_KEY);
            if (!saved || !state || saved !== state) {
                setError("로그인 요청을 확인할 수 없습니다. 로그인 화면에서 처음부터 다시 시도해 주세요.");
                return;
            }

            // 로그인 시작 때 심은 약관 동의(consents)를 꺼내 백엔드로 함께 전달한다.
            const consents = readConsents();

            // `redirectUri` 는 **안 보낸다** — 서버가 요청 오리진에서 파생한다(열린 리다이렉터 차단).
            // `state` 는 보낸다: 서버가 httpOnly 쿠키의 값과 대조한다. 아래 sessionStorage
            // 대조는 그보다 이른 UX 피드백일 뿐 **방어가 아니다**.
            const res = await fetch("/api/auth/social", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({provider, code, state, consents}),
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
