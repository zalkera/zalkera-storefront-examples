"use client";

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import type {ConsentInput} from "@zalkera/client";
import {isConsentError} from "@/lib/oauth";
import {notifyAuthHintChange} from "@/lib/useAuthHint";
import {Button} from "@/components/ui/Button";

/**
 * 개발 전용 테스트 로그인. 실제 OAuth 없이 임의 code(=subject)로 서버 라우트 `/api/auth/social`
 * (provider:"TEST")를 호출한다 — 백엔드 `customer.auth.test-provider-enabled=true` 일 때만 동작.
 * 로그인 페이지에서 NODE_ENV!=="production" 조건으로만 렌더한다(프로덕션 미노출).
 *
 * 리다이렉트가 없으므로 약관 동의(consents)를 sessionStorage 를 거치지 않고 바로 바디에 싣는다.
 * 필수 동의 미충족이면 `disabled` 로 버튼이 잠긴다.
 */
export function TestLogin({consents, disabled}: {consents: ConsentInput[]; disabled: boolean}) {
    const [subject, setSubject] = useState("test-user-1");
    const [error, setError] = useState("");
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
            const res = await fetch("/api/auth/social", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({provider: "TEST", code: subject, consents}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(
                    isConsentError(res.status, data)
                        ? "가입을 완료하려면 필수 약관에 모두 동의해야 합니다."
                        : (data.message ?? "테스트 로그인에 실패했습니다."),
                );
                return;
            }
            // 서버가 응답에 로그인 힌트 쿠키를 심었다 — 헤더가 즉시 로그인 크롬으로 갱신되게 알린다.
            notifyAuthHintChange();
            router.push("/mypage");
            router.refresh();
        });
    };

    return (
        <section className="mt-6 pt-4 border-t border-border">
            <h2 className="text-base">개발용 테스트 로그인</h2>
            <p className="text-muted text-sm">
                실제 OAuth 없이 code(=subject)로 세션을 발급합니다. 백엔드 test-provider-enabled=true 필요.
            </p>
            <form onSubmit={submit} className="flex gap-2 mt-2">
                <input className="flex-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject" />
                <Button type="submit" disabled={pending || disabled}>
                    {pending ? "…" : "테스트 로그인"}
                </Button>
            </form>
            {error && <p className="text-danger mt-2">{error}</p>}
        </section>
    );
}
