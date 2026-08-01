"use client";

import {useTransition} from "react";
import {useRouter} from "next/navigation";
import {clearAuthHint} from "@/lib/useAuthHint";
import {Button} from "@/components/ui/Button";

/**
 * 로그아웃 버튼. 서버 라우트 `/api/auth/logout`(백엔드 세션 폐기 + 쿠키 삭제) 호출 후 홈으로 이동한다.
 * 토큰은 httpOnly 쿠키라 JS 에서 만질 수 없다 — 서버 라우트가 삭제한다.
 */
export function LogoutButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const logout = () => {
        startTransition(async () => {
            await fetch("/api/auth/logout", {method: "POST"});
            // 서버 라우트가 힌트 쿠키를 비우지만, 헤더가 focus 를 기다리지 않고 즉시 익명으로 돌아가도록
            // 클라이언트에서도 힌트를 지우고 구독자에게 알린다(표시 전용 — 실제 세션 정리는 서버가 했다).
            clearAuthHint();
            router.push("/");
            router.refresh();
        });
    };

    return (
        <Button variant="ghost" onClick={logout} disabled={pending}>
            {pending ? "로그아웃 중…" : "로그아웃"}
        </Button>
    );
}
