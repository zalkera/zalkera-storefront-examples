"use client";

import {useEffect, useState, useTransition} from "react";
import type {Booking} from "@zalkera/client";
import {notifyAuthHintChange} from "@/lib/useAuthHint";
import {buttonClasses} from "@/components/ui/Button";

/**
 * 내 예약 목록 + 취소 — 마이페이지 아일랜드(memo 50 §45·§46).
 *
 * **왜 취소가 최소 완결선에 드나**: 잡을 수만 있고 무를 수 없으면 고객은 그냥 안 온다. 그걸 memo 53
 * 스위퍼가 `NO_SHOW` 로 치우며 **고객 이력에 낙인**이 남는다 — UI 가 노쇼를 제조하는 셈이다.
 *
 * 취소하면 목록이 바뀌므로 서버 렌더가 아니라 아일랜드다(취소 후 재조회가 자연스럽다).
 */
export function BookingList() {
    const [bookings, setBookings] = useState<Booking[] | null>(null);
    // 조회 실패와 "예약 없음"은 다른 사실이다 — 섞으면 장애를 정상으로 오표시한다(§46 B4).
    const [loadError, setLoadError] = useState(false);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const load = () => {
        setLoadError(false);
        void fetch("/api/booking/list")
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
            .then((data: Booking[]) => setBookings(data))
            .catch(() => {
                setBookings([]);
                setLoadError(true);
            });
    };
    useEffect(load, []);

    const cancel = (code: string) => {
        setMessage("");
        startTransition(async () => {
            const res = await fetch(`/api/booking/${encodeURIComponent(code)}`, {method: "DELETE"});
            const data = await res.json().catch(() => null);
            if (res.ok) {
                setMessage("예약을 취소했습니다.");
                load();
                return;
            }
            // 401 은 갱신 신호다(§24-3) — 15분 토큰이 끊긴 것뿐이니 로그인으로 내쫓지 않는다.
            if (res.status === 401) {
                notifyAuthHintChange();
                window.location.href = "/api/auth/refresh?next=%2Fmypage";
                return;
            }
            // 유료 예약은 고객이 못 무른다 — 환불이 얽혀 매장 판단이 필요하다(PAID_CANCEL_ADMIN_ONLY).
            setMessage(
                data?.code === "PAID_CANCEL_ADMIN_ONLY"
                    ? "결제한 예약은 매장에 문의해 주세요."
                    : (data?.message ?? "취소하지 못했습니다."),
            );
        });
    };

    if (bookings === null) return <p className="text-muted">예약을 불러오는 중…</p>;
    if (loadError) {
        return (
            <p className="text-muted">
                예약을 불러오지 못했습니다.{" "}
                <button type="button" onClick={load} className={LINK}>
                    다시 시도
                </button>
            </p>
        );
    }
    if (bookings.length === 0) return <p className="text-muted">예약 내역이 없습니다.</p>;

    return (
        <div className="grid max-w-md gap-2">
            {bookings.map((b) => (
                <div key={b.bookingCode} className="rounded-lg border border-border p-3">
                    <div className="flex justify-between gap-3">
                        <div>
                            <div className="font-semibold">{formatWhen(b.startAt)}</div>
                            <div className="text-sm text-muted">
                                {STATUS_LABEL[b.status] ?? b.status}
                                {b.quantity > 1 && ` · ${b.quantity}명`}
                                {/* 유료 예약이 아직 결제 전이면 그 사실을 알려준다(PENDING + orderNo). */}
                                {b.status === "PENDING" && b.orderNo && " · 결제 대기"}
                            </div>
                        </div>
                        {/* 정원을 쥐고 있는 상태에서만 취소가 의미 있다. 종단 예약엔 버튼을 안 낸다. */}
                        {CANCELABLE.has(b.status) && (
                            <button
                                type="button"
                                onClick={() => cancel(b.bookingCode)}
                                disabled={pending}
                                className={ACTION}
                            >
                                취소
                            </button>
                        )}
                    </div>
                    {b.status === "PENDING" && b.orderNo && (
                        <a href={`/orders/${b.orderNo}`} className="text-sm underline underline-offset-4">
                            결제 상태 보기 →
                        </a>
                    )}
                </div>
            ))}
            {message && <p>{message}</p>}
        </div>
    );
}

const formatWhen = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString("ko-KR", {
              month: "numeric",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "시간 미정";

const STATUS_LABEL: Record<string, string> = {
    PENDING: "결제 대기",
    CONFIRMED: "예약 확정",
    CANCELLED: "취소됨",
    COMPLETED: "방문 완료",
    NO_SHOW: "미방문",
};
/** 정원을 쥐고 있는 상태 — 그 외(취소·완료·노쇼)는 무를 게 없다. */
const CANCELABLE = new Set(["PENDING", "CONFIRMED"]);

const ACTION = buttonClasses("outline", "px-3 py-1.5");
const LINK = "underline underline-offset-4";
