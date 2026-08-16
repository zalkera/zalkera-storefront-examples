"use client";

import Link from "next/link";
import {useEffect, useMemo, useState, useTransition} from "react";
import type {AvailabilitySlot, ProductDetail} from "@zalkera/client";
import {notifyAuthHintChange, useAuthHint} from "@/lib/useAuthHint";
import {buttonClasses, cn} from "@/components/ui/Button";

/**
 * 예약 슬롯 선택 + 예약 잡기 — **SERVICE 상품의 담기 버튼 자리**.
 *
 * ## 왜 클라이언트 아일랜드인가
 * 슬롯 가용성은 **볼라틸**이다 — 옆 손님이 방금 잡으면 바뀐다. 상품 상세는 ISR(`force-static`+300s)이라
 * 서버에서 구우면 **5분 낡은 시간표**를 보여주고 `SLOT_FULL` 을 만든다. 그래서 페이지의 정적성은
 * 그대로 두고(productType 은 사실상 불변이라 stale 무해) 슬롯만 마운트 후 당긴다.
 *
 * SDK 는 서버 전용(baseUrl 노출 금지)이라 여기서 직접 못 부른다 — **BFF 를 거친다**.
 */
export function BookingPanel({product}: {product: ProductDetail}) {
    const authed = useAuthHint();
    const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [selected, setSelected] = useState<AvailabilitySlot | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [contactName, setContactName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    const load = () => {
        setLoadError(false);
        void fetch(`/api/booking/availability?productId=${product.id}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
            .then((data: AvailabilitySlot[]) => setSlots(data))
            .catch(() => {
                setSlots([]);
                setLoadError(true);
            });
    };
    // 마운트 후 1회. 슬롯이 서버 HTML 에 박히지 않으므로 하이드레이션 불일치가 없다.
    useEffect(load, [product.id]);

    // 날짜별로 묶는다 — 시간 칩만 늘어놓으면 며칠치가 뒤섞여 못 읽는다.
    const byDate = useMemo(() => groupByDate(slots ?? []), [slots]);
    const dates = Object.keys(byDate);
    const [activeDate, setActiveDate] = useState<string | null>(null);
    const shownDate = activeDate && byDate[activeDate] ? activeDate : dates[0];

    // 잔여·1회 한도(10) 안에서만 고를 수 있게 — 넘기면 백엔드가 QUANTITY_EXCEEDED/SLOT_FULL 로 막는다.
    const maxQuantity = Math.min(selected?.availableCount ?? 1, MAX_QUANTITY);

    const book = () => {
        if (!selected) return;
        setMessage("");
        startTransition(async () => {
            const res = await fetch("/api/booking", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({slotId: selected.slotId, quantity, contactName, contactPhone}),
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                // **401 은 "갱신하라"이지 "로그아웃하라"가 아니다**. access 는 15분,
                // refresh 는 30일 — 401 을 로그인으로 보내면 그 30일이 무의미해지고 고객이 15분마다
                // 재로그인한다. 갱신 경유지로 보내 살아 있는 refresh 로 되살린 뒤 제자리로 돌아온다.
                // (힌트 쿠키가 stale 인 채 버튼이 "예약하기"로 남아 재클릭 401 무한이 되는 것도 이걸로 끊긴다.)
                if (res.status === 401) {
                    notifyAuthHintChange(); // 힌트 재판정 — 죽은 세션이면 버튼이 로그인 유도로 바뀐다
                    const back = `/products/${product.slug}`;
                    window.location.href = `/api/auth/refresh?next=${encodeURIComponent(back)}`;
                    return;
                }
                // 정원 소진 — 내 목록이 stale 했다는 뜻이다. 재조회해서 지금 진짜 남은 걸 보여준다.
                // BFF(src/lib/http.ts)는 백엔드 errorCode 를 `code` 로 실어 준다(SDK ZalkeraError.code 그대로) —
                // `errorCode` 로 읽으면 영영 안 잡힌다(실기동에서 그 버그를 만났다).
                if (data?.code === "SLOT_FULL") {
                    setSelected(null);
                    load();
                    setMessage("방금 마감된 시간입니다. 남은 시간을 다시 불러왔어요.");
                    return;
                }
                setMessage(data?.message ?? "예약에 실패했습니다.");
                return;
            }

            // 유료·예약금 — 체크아웃과 **완전히 같은 결제 관용구**(신설 없음).
            if (data.widget) {
                sessionStorage.setItem(
                    "zalkera_payment_widget",
                    JSON.stringify({...data.widget, orderNo: data.orderNo, phone: contactPhone}),
                );
                window.location.href = "/payment/widget";
                return;
            }
            if (data.paymentUrl) {
                window.location.href = data.paymentUrl;
                return;
            }
            // 무료 예약 — 즉시 확정. 내 예약에서 확인·취소할 수 있다.
            window.location.href = "/mypage";
        });
    };

    if (slots === null) return <p className="text-muted">예약 가능 시간을 불러오는 중…</p>;

    if (loadError) {
        return (
            <p className="text-muted">
                예약 가능 시간을 불러오지 못했습니다.{" "}
                <button type="button" onClick={load} className={LINK}>
                    다시 시도
                </button>
            </p>
        );
    }
    /*
     * 슬롯 0 — **개점 준비 중의 정직한 표기**.
     *
     * 시드는 시술 카탈로그까지만 만들고 예약 캘린더(자원·직원·슬롯·영업시간)는 만들지 않는다. 그것들은
     * 매장의 사실이라 제작자가 발명하면 그럴듯해서 더 위험하다. 그래서 프리셋으로 개시한 직후 이 상태가
     * **정상적으로** 나타난다 — 없애야 할 결함이 아니라 보여 줘야 할 상태다. 제거하는 것은 조용함뿐이라,
     * 손님에게는 갈 곳(문의)을 주고 원장에게는 무엇이 남았는지 알려 준다(콘솔 "예약 받기 시작" 카드가 짝).
     *
     * 예약이 정말 마감돼 슬롯이 0 인 매장과 아직 안 연 매장을 여기서 구분하지 않는 이유: 손님이 지금
     * 할 수 있는 일이 양쪽 다 "문의"로 같고, 구분하려면 프론트가 예약 자원 유무를 따로 물어야 한다.
     */
    if (dates.length === 0) {
        return (
            <div className="mt-4">
                <p className="text-muted">
                    예약 준비 중입니다 — 아직 온라인으로 받을 수 있는 시간이 열려 있지 않습니다.
                </p>
                <Link href="/contact" className={buttonClasses("primary", "no-underline")}>
                    문의하기
                </Link>
            </div>
        );
    }

    return (
        <div className="mt-4">
            <h2>예약 시간 선택</h2>

            {/* 날짜 스트립 */}
            <div className="flex gap-2 overflow-x-auto py-2">
                {dates.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => {
                            setActiveDate(d);
                            setSelected(null);
                        }}
                        className={chipClass(d === shownDate)}
                    >
                        {formatDate(d)}
                    </button>
                ))}
            </div>

            {/* 시간 칩 — 잔여를 병기해 "왜 못 고르나"를 설명한다 */}
            <div className="mt-2 mb-4 flex flex-wrap gap-2">
                {(byDate[shownDate!] ?? []).map((s) => (
                    <button
                        key={s.slotId}
                        type="button"
                        onClick={() => {
                            setSelected(s);
                            setQuantity(1);
                        }}
                        className={chipClass(selected?.slotId === s.slotId)}
                    >
                        {formatTime(s.startAt)}
                        <span className="ml-1.5 text-xs text-muted">{s.availableCount}자리</span>
                    </button>
                ))}
            </div>

            {selected && (
                <div className="grid max-w-xs gap-2">
                    {maxQuantity > 1 && (
                        <label>
                            인원{" "}
                            <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                                {Array.from({length: maxQuantity}, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {/* 연락처는 **필수**다(§46 B3). 백엔드가 유료 예약 주문에 `buyerPhone = contactPhone
                        ?: customer.phone` 을 넣는데 **소셜 로그인 고객은 phone 이 null 일 수 있다** —
                        비우면 주문 조회 크리덴셜이 없는 유료 예약이 생겨, access 토큰(15분)이 끊기면
                        고객이 자기 결제건을 영영 못 찾는다. 매장이 연락할 수단이기도 하다. */}
                    <input
                        placeholder="예약자 이름"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                    />
                    <input
                        placeholder="연락처 (예: 010-1234-5678)"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        required
                    />

                    {authed ? (
                        <button
                            type="button"
                            onClick={book}
                            disabled={pending || !contactPhone.trim()}
                            className={buttonClasses("primary", "w-full")}
                        >
                            {pending ? "예약 중…" : "예약하기"}
                        </button>
                    ) : (
                        // 예약은 로그인 필수(게스트 불가) — 여기가 경계다. 슬롯을 먼저 보여주고
                        // 결심한 뒤에 로그인을 요구하는 게 자연스러운 순서다.
                        <a
                            href={`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`}
                            className={buttonClasses("primary", "px-4 py-1.5")}
                        >
                            로그인하고 예약하기
                        </a>
                    )}
                </div>
            )}

            {message && <p className="mt-3">{message}</p>}
        </div>
    );
}

/** 슬롯을 현지 날짜(YYYY-MM-DD)로 묶는다. 서버는 UTC ISO 로 준다. */
function groupByDate(slots: AvailabilitySlot[]): Record<string, AvailabilitySlot[]> {
    const out: Record<string, AvailabilitySlot[]> = {};
    for (const s of slots) {
        const key = new Date(s.startAt).toLocaleDateString("sv-SE"); // YYYY-MM-DD
        (out[key] ??= []).push(s);
    }
    return out;
}

const formatDate = (ymd: string) =>
    new Date(`${ymd}T00:00:00`).toLocaleDateString("ko-KR", {month: "numeric", day: "numeric", weekday: "short"});
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", {hour: "2-digit", minute: "2-digit"});

/** 백엔드 1회 예약 수량 한도(BookingService.MAX_QUANTITY) — 넘기면 QUANTITY_EXCEEDED. */
const MAX_QUANTITY = 10;

/** 날짜·시간 칩 — 선택 상태만 토큰 색으로 반전한다(리터럴 색 없음). */
function chipClass(on: boolean): string {
    return cn(
        "cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-2 text-sm",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
    );
}
const LINK = "underline underline-offset-4";
