"use client";

import {useState, useTransition} from "react";
import {Button} from "@/components/ui/Button";

/**
 * 문의 폼 아일랜드 — `/api/inquiry` BFF 로 POST(clientIp 는 BFF 라우트가 `visitorIp()` 로 뽑아 붙인다).
 *
 * 필수 4종(name·email·subject·message)은 SDK 계약(InquiryInput) 그대로. phone·company 는 선택.
 */
export function InquiryForm() {
    const [form, setForm] = useState({name: "", email: "", phone: "", subject: "", message: ""});
    const [message, setMessage] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [pending, startTransition] = useTransition();

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({...f, [k]: e.target.value}));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        setErrors({});
        startTransition(async () => {
            const res = await fetch("/api/inquiry", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                setMessage("문의가 접수되었습니다. 빠르게 답변드리겠습니다.");
                setForm({name: "", email: "", phone: "", subject: "", message: ""});
                return;
            }
            // 레이트리밋 — 공개 폼이라 흔하다. 재시도 안내(§4.3 e.code 규약).
            if (data?.code === "TOO_MANY_REQUESTS") {
                setMessage("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }
            // 400 필드 검증 — errors 배열을 필드별로 표시.
            if (Array.isArray(data?.errors)) {
                setErrors(Object.fromEntries(data.errors.map((v: {field: string; message: string}) => [v.field, v.message])));
                return;
            }
            setMessage(data?.message ?? "문의 접수에 실패했습니다.");
        });
    };

    return (
        <form onSubmit={submit} className="grid max-w-md gap-2">
            <input placeholder="이름" value={form.name} onChange={set("name")} required />
            {errors.name && <span className={ERR}>{errors.name}</span>}
            <input type="email" placeholder="이메일" value={form.email} onChange={set("email")} required />
            {errors.email && <span className={ERR}>{errors.email}</span>}
            <input placeholder="연락처(선택)" value={form.phone} onChange={set("phone")} />
            <input placeholder="제목" value={form.subject} onChange={set("subject")} required />
            {errors.subject && <span className={ERR}>{errors.subject}</span>}
            <textarea placeholder="문의 내용" value={form.message} onChange={set("message")} rows={5} required />
            {errors.message && <span className={ERR}>{errors.message}</span>}
            <Button type="submit" disabled={pending}>
                {pending ? "접수 중…" : "문의 보내기"}
            </Button>
            {message && <p>{message}</p>}
        </form>
    );
}

const ERR = "text-xs text-danger";
