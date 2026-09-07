"use client";

import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import type {CustomerSummary} from "@zalkera/client";
import {Button} from "@/components/ui/Button";

/**
 * 프로필 수정 + **회원 탈퇴** 아일랜드. 둘 다 `/api/me` BFF 를 경유한다
 * (access 토큰은 httpOnly 쿠키에만 있고 이 컴포넌트는 그것을 못 본다).
 *
 * ⛔ **탈퇴는 확인 단계 없이 부르지 않는다.** 되돌릴 수 없고, 프로필 PII 비식별화와 전 세션
 * 폐기가 함께 일어난다. 그래서 「탈퇴」를 누르면 바로 부르지 않고 확인 UI 를 편다.
 *
 * ⚠ **「모든 기록이 삭제됩니다」로 안내하지 마라 — 거짓이다.** 주문 이력은 전자상거래법상
 * 보존 대상이라 백엔드가 지우지 않는다. 아래 문구가 그 사실을 그대로 말한다.
 */
export function AccountSettings({me}: {me: CustomerSummary}) {
    const router = useRouter();
    const [name, setName] = useState(me.name ?? "");
    const [phone, setPhone] = useState(me.phone ?? "");
    const [message, setMessage] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        startTransition(async () => {
            const res = await fetch("/api/me", {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({name, phone}),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMessage(data?.message ?? "프로필을 저장하지 못했습니다.");
                return;
            }
            // ⚠ 전화가 실제로 바뀌면 백엔드가 **전화 인증 상태를 내린다** — 그 값에 기대는 화면이
            //   있으므로 서버 렌더를 다시 받아 화면과 원장을 맞춘다.
            setMessage("저장했습니다.");
            router.refresh();
        });
    };

    const withdraw = () => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch("/api/me", {method: "DELETE"});
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMessage(data?.message ?? "탈퇴에 실패했습니다.");
                setConfirming(false);
                return;
            }
            // 세션이 죽었다 — 서버가 쿠키를 지웠으므로 홈으로 보낸다.
            router.replace("/");
            router.refresh();
        });
    };

    return (
        <section className="mt-6">
            <h2>계정 설정</h2>
            <form onSubmit={save} className="grid max-w-md gap-2">
                <label htmlFor="account-name">이름</label>
                <input
                    id="account-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    placeholder="이름"
                />
                <label htmlFor="account-phone">연락처</label>
                <input
                    id="account-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={30}
                    placeholder="010-0000-0000"
                />
                <p className="text-xs text-muted">연락처를 바꾸면 본인인증을 다시 해야 합니다.</p>
                <Button type="submit" disabled={pending}>
                    {pending ? "저장 중…" : "저장"}
                </Button>
            </form>

            <div className="mt-6 rounded-xl border border-border p-4">
                <h3 className="m-0 text-base">회원 탈퇴</h3>
                {!confirming ? (
                    <>
                        <p className="mt-2 text-sm text-muted">
                            탈퇴하면 프로필 정보가 비식별화되고 소셜 연결과 모든 로그인 세션이 사라집니다.
                            <strong> 되돌릴 수 없습니다.</strong> 주문 이력은 관련 법령에 따라 보존됩니다.
                        </p>
                        <Button variant="outline" onClick={() => setConfirming(true)} disabled={pending}>
                            탈퇴하기
                        </Button>
                    </>
                ) : (
                    <>
                        <p className="mt-2 text-sm text-danger">정말 탈퇴하시겠습니까? 이 동작은 되돌릴 수 없습니다.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                                취소
                            </Button>
                            <Button onClick={withdraw} disabled={pending}>
                                {pending ? "처리 중…" : "탈퇴 확인"}
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {message && <p className="mt-3 text-sm">{message}</p>}
        </section>
    );
}
