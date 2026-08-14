"use client";

import {useEffect, useState, useTransition} from "react";
import type {LeadTracking} from "@zalkera/client";
import {Button} from "@/components/ui/Button";

/**
 * 광고 랜딩 리드 폼 아일랜드 — `/api/lead` BFF 로 POST(clientIp 는 BFF 라우트가 `visitorIp()` 로 뽑아 붙인다).
 *
 * 문의(InquiryForm)와 다른 점: **연락처가 필수, 이메일이 선택**이고, 광고 유입 추적(UTM·클릭ID)을
 * `tracking` 으로 동봉한다. `interest`·`isQuick` 은 랜딩마다 다르므로 props 로 받아 본문에 싣는다.
 * 소비 랜딩 페이지는 codegen 몫이라 스타터에는 두지 않는다(재사용 이음새로만).
 *
 * **UTM 은 mount 후 `window.location.search` 로 캡처한다** — 이 폼을 얹는 랜딩은 force-static ISR 일
 * 수 있어 RSC 에서 `searchParams` 를 읽으면 정적 셸이 깨진다. `useSearchParams()` 도 같은 이유로 금지.
 */
export function LeadForm({interest, quick}: {interest?: string; quick?: boolean}) {
    const [form, setForm] = useState({name: "", phone: "", email: "", message: ""});
    const [consentMarketing, setConsentMarketing] = useState(false);
    const [tracking, setTracking] = useState<LeadTracking | undefined>(undefined);
    const [message, setMessage] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [pending, startTransition] = useTransition();

    // 광고 유입 추적 — mount 시 쿼리스트링에서 8키를 캡처한다(하나라도 있으면 tracking 을 채운다).
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const t: LeadTracking = {
            utmSource: q.get("utm_source"),
            utmMedium: q.get("utm_medium"),
            utmCampaign: q.get("utm_campaign"),
            utmAdgroup: q.get("utm_adgroup"),
            utmContent: q.get("utm_content"),
            fbclid: q.get("fbclid"),
            gclid: q.get("gclid"),
            nclid: q.get("nclid"),
        };
        if (Object.values(t).some((v) => v != null)) setTracking(t);
    }, []);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({...f, [k]: e.target.value}));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setErrors({});
        startTransition(async () => {
            const res = await fetch("/api/lead", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    name: form.name,
                    phone: form.phone,
                    email: form.email || undefined,
                    message: form.message || undefined,
                    interest,
                    isQuick: quick,
                    consentMarketing,
                    tracking,
                }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                setMessage("상담 신청이 접수되었습니다. 빠르게 연락드리겠습니다.");
                // tracking 은 유지(같은 방문의 재제출도 같은 유입으로 귀속) — 입력만 초기화.
                setForm({name: "", phone: "", email: "", message: ""});
                setConsentMarketing(false);
                return;
            }
            // 레이트리밋 — 공개 폼이라 흔하다. 재시도 안내(§4.3 e.code 규약).
            if (data?.code === "TOO_MANY_REQUESTS") {
                setMessage("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }
            // 400 필드 검증 — errors 배열을 필드별로 표시.
            if (Array.isArray(data?.errors)) {
                setErrors(
                    Object.fromEntries(data.errors.map((v: {field: string; message: string}) => [v.field, v.message])),
                );
                return;
            }
            setMessage(data?.message ?? "상담 신청에 실패했습니다.");
        });
    };

    return (
        <form onSubmit={submit} className="grid max-w-md gap-2">
            <input placeholder="이름" value={form.name} onChange={set("name")} required />
            {errors.name && <span className={ERR}>{errors.name}</span>}
            <input type="tel" placeholder="연락처" value={form.phone} onChange={set("phone")} required />
            {errors.phone && <span className={ERR}>{errors.phone}</span>}
            <input type="email" placeholder="이메일(선택)" value={form.email} onChange={set("email")} />
            {errors.email && <span className={ERR}>{errors.email}</span>}
            <textarea placeholder="문의 내용(선택)" value={form.message} onChange={set("message")} rows={4} />
            <label className="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    className="w-auto"
                    checked={consentMarketing}
                    onChange={(e) => setConsentMarketing(e.target.checked)}
                />
                마케팅 정보 수신에 동의합니다(선택)
            </label>
            <Button type="submit" disabled={pending}>
                {pending ? "접수 중…" : "상담 신청"}
            </Button>
            {message && <p>{message}</p>}
        </form>
    );
}

const ERR = "text-xs text-danger";
