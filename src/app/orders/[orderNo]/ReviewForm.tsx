"use client";

import {useState, useTransition} from "react";
import {buttonClasses} from "@/components/ui/Button";

/**
 * 후기 작성 폼 — 주문 상세의 배송완료 라인에만 붙는 아일랜드.
 *
 * 구매검증은 백엔드가 하므로 여기선 상태 게이트(부모가 DELIVERED/COMPLETED + productId 존재 라인에만
 * 렌더)만 한다. 401 은 갱신 신호(§24-3), 오류는 `e.code`(BFF 가 code 로 싣는다 — §9 F1 이후 errors 도).
 */
export function ReviewForm({productId, orderItemId}: {productId: number; orderItemId: number}) {
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(false);
    const [rating, setRating] = useState(5);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [message, setMessage] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [pending, startTransition] = useTransition();

    const submit = () => {
        setMessage("");
        setFieldErrors({});
        startTransition(async () => {
            const res = await fetch("/api/reviews", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({productId, orderItemId, rating, title, content}),
            });
            const data = await res.json().catch(() => null);
            if (res.ok) {
                setDone(true);
                return;
            }
            if (res.status === 401) {
                // 갱신 신호 — 로그인으로 내쫓지 않는다. 이 주문 상세로 돌아온다.
                window.location.href = `/api/auth/refresh?next=${encodeURIComponent(window.location.pathname)}`;
                return;
            }
            // 이미 작성했으면(라인당 1개) 그렇게 알린다 — 재시도해도 소용없다.
            if (data?.code === "ALREADY_REVIEWED") {
                setMessage("이미 후기를 작성한 상품입니다.");
                return;
            }
            // 400 필드 검증 — 필드별 표시(§11 R3 · §9 F1: BFF 가 errors 를 실어 준다).
            if (Array.isArray(data?.errors)) {
                setFieldErrors(
                    Object.fromEntries(data.errors.map((v: {field: string; message: string}) => [v.field, v.message])),
                );
                return;
            }
            setMessage(data?.message ?? "후기 작성에 실패했습니다.");
        });
    };

    if (done) return <p className="text-sm text-muted">후기가 등록되었습니다. 감사합니다!</p>;
    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className={LINK}>
                후기 쓰기
            </button>
        );
    }

    return (
        <div className="mt-2 grid max-w-sm gap-1.5">
            <label>
                별점{" "}
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                    {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                            {"★".repeat(n)}
                        </option>
                    ))}
                </select>
            </label>
            <input placeholder="제목(선택)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
                placeholder="후기 내용"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                required
            />
            {fieldErrors.content && <span className="text-xs text-danger">{fieldErrors.content}</span>}
            <div className="flex gap-2">
                <button type="button" onClick={submit} disabled={pending || !content.trim()} className={PRIMARY}>
                    {pending ? "등록 중…" : "등록"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className={LINK}>
                    취소
                </button>
            </div>
            {message && <p className="text-sm">{message}</p>}
        </div>
    );
}

const LINK = "text-sm underline underline-offset-4";
const PRIMARY = buttonClasses("primary", "px-4 py-1.5");
