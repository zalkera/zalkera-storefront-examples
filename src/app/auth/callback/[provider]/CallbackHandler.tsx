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

        // ⛔ **주소창에서 `code`·`state` 를 지운다 — 갈래를 타기 «전에».**
        //    값은 이미 props 로 손에 있으므로(서버가 `searchParams` 에서 읽어 넘긴다) 여기서 지워도
        //    아래 로직이 멀쩡하다. 성공 갈래는 어차피 `router.replace` 로 빠지지만 **실패 갈래는
        //    이 화면에 머문다** — 그때 주소가 그대로면 `code`·`state` 가 히스토리·리퍼러에 남는다.
        //
        //    ⚠ **이것으로 다 막히지 않는다**(`llms.txt` 의 유출 통로 표). 이 줄이 닫는 것은
        //    히스토리·공유 링크뿐이고, **서버 액세스 로그와 제3자 분석 태그는 이미 그 URL 을 봤다** —
        //    JS 가 돌기 전에 기록·전송되기 때문이다. 완전히 닫으려면 서버가 쿼리를 받아 쿠키로
        //    옮기고 쿼리 없는 주소로 리다이렉트해야 한다.
        //    여기서 그렇게 안 하는 이유: OAuth `code` 는 교환에 **client secret**(백엔드 보유)이
        //    필요하고, 우리 `/api/auth/social` 로 되먹여도 httpOnly `state` 쿠키 대조에서 막힌다.
        //    ⚠ **재설정·인증 메일 토큰은 사정이 다르다** — 그것 하나면 계정이 넘어가므로
        //    이 형태로 끝내지 말고 서버 리다이렉트를 써라.
        stripSensitiveQuery();

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

/**
 * 주소창에서 쿼리를 떼어 낸다 — **경로는 그대로 두고 쿼리만**.
 *
 * `router.replace` 를 쓰지 않는 이유: 그것은 라우팅이라 렌더를 한 번 더 돌리고, 이 시점에는
 * 아직 교환 중이라 화면이 깜빡인다. `history.replaceState` 는 현재 히스토리 항목만 갈아 끼운다.
 */
function stripSensitiveQuery(): void {
    // 서버 렌더 중에는 `window` 가 없다. `useEffect` 안이라 없을 수 없지만, 이 함수가 다른 데서
    // 불릴 때를 위해 지킨다 — 없으면 조용히 아무것도 안 한다.
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    const {pathname, hash} = window.location;
    window.history.replaceState(null, "", `${pathname}${hash}`);
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
