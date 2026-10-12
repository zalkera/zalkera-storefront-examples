"use client";

import {useEffect, useRef, useState} from "react";
import {forgetPendingPayment, recallPendingPayment} from "@zalkera/client";
import {Button} from "@/components/ui/Button";
import {goToPayment, type PaymentStart} from "@/lib/paymentStart";
import {CONFIRM_RETRY_DELAYS_MS, confirmVerdict, restartVerdict, type ConfirmResult} from "@/lib/paymentReturn";

type Phase =
    | {kind: "checking"}
    /** 결과를 모른 채 몇 번 물어도 안 닫혔다(확인 중·연결 끊김·시간 초과) — 결제통보가 닫는다. */
    | {kind: "unsettled"}
    /** 400 `PAYMENT_CONFIRM_FAILED` — 결제되지 않았다. 같은 주문으로 다시 결제할 수 있다(`notice` 는 다시 열기 실패 안내). */
    | {kind: "failed"; notice?: string}
    /** 게스트인데 이 탭에 연락처가 없다(다른 기기·다른 탭에서 돌아왔다) — 손님에게 묻는다. */
    | {kind: "needPhone"; wrong: boolean}
    | {kind: "error"; message: string}
    | {kind: "missing"};

/**
 * **결제창에서 돌아오는 화면** — 위젯형(토스 성공 URL)과 리다이렉트형(결제사 결제창의 복귀 주소)이 같이 쓴다.
 *
 * 돌아온 쿼리(`orderNo` 와 결제사가 붙인 값)를 `/api/payment/confirm` 으로 넘겨 확정을 묻는다. **이 화면이 「결제
 * 성공」을 판단하지 않는다** — 서버가 결제사에 직접 묻는다(리다이렉트형의 복귀 쿼리는 화면용이다).
 *
 * 게스트의 확정은 **연락처**가 있어야 선다. 결제창으로 떠나기 전에 이 탭에 남긴 값을 주문번호로 꺼낸다
 * (`recallPendingPayment` — 위젯형·리다이렉트형 공통). 없으면 로그인 토큰으로 확인하고, 그것도 아니면 손님에게 묻는다.
 *
 * 갈래(판정은 `@/lib/paymentReturn`): **결과를 모르면**(확인 중 409 · 연결 끊김·시간 초과 · 코드 없는 502/503/504)
 * 간격을 늘려 몇 번 다시 묻고 그래도 모르면 「다시 확인」을 둔다 — 승인이 났을 수 있으니 실패로 보이지 않는다 ·
 * 결제 안 됨이면 「다시 결제」(같은 주문으로 결제창을 다시 연다 — 새 주문을 만들지 않는다). 새로고침해도 안전하다
 * (이미 승인된 주문은 서버가 조용히 통과시킨다).
 */
export default function PaymentCompletePage() {
    const [orderNo, setOrderNo] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>({kind: "checking"});
    const [phoneInput, setPhoneInput] = useState("");
    const [busy, setBusy] = useState(false);
    const params = useRef<Record<string, string>>({});
    const phone = useRef<string | undefined>(undefined);
    const started = useRef(false);

    const confirmOnce = async (no: string): Promise<ConfirmResult> => {
        const res = await fetch("/api/payment/confirm", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({orderNo: no, ...params.current, ...(phone.current ? {phone: phone.current} : {})}),
        }).catch(() => null);
        if (!res) return {ok: false, status: 0, message: "결제 확인 중 연결이 끊겼습니다."};
        if (res.ok) return {ok: true};
        const body = (await res.json().catch(() => ({}))) as {code?: string; message?: string};
        return {ok: false, status: res.status, code: body.code, message: body.message};
    };

    const check = async (no: string) => {
        setPhase({kind: "checking"});
        for (let attempt = 0; ; attempt += 1) {
            const result = await confirmOnce(no);
            const verdict = confirmVerdict(result);
            if (verdict === "confirmed") {
                forgetPendingPayment(no);
                // 주문 상태는 주문 페이지가 서버에서 다시 읽는다 — 이 화면이 정본이 아니다. 게스트는 조회에도 연락처가
                // 필요하다(우리 사이트 안의 이동이라 결제사엔 안 샌다).
                const to = `/orders/${encodeURIComponent(no)}`;
                window.location.href = phone.current ? `${to}?phone=${encodeURIComponent(phone.current)}` : to;
                return;
            }
            if (verdict === "unknown") {
                const delay = CONFIRM_RETRY_DELAYS_MS[attempt];
                if (delay === undefined) {
                    setPhase({kind: "unsettled"});
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            if (verdict === "failed") {
                setPhase({kind: "failed"});
                return;
            }
            if (verdict === "needPhone") {
                setPhase({kind: "needPhone", wrong: phone.current !== undefined});
                return;
            }
            setPhase({kind: "error", message: (!result.ok && result.message) || "결제 확인에 실패했습니다."});
            return;
        }
    };

    useEffect(() => {
        // StrictMode 의 두 번째 마운트가 확정을 한 번 더 부르지 않게(서버는 멱등이지만 인가 실패는 센다).
        if (started.current) return;
        started.current = true;
        const q = new URLSearchParams(window.location.search);
        const no = q.get("orderNo");
        if (!no) {
            setPhase({kind: "missing"});
            return;
        }
        // 결제사가 붙인 값을 통째로 넘긴다 — 무엇이 오는지는 결제사가 정하고, 쓸지는 서버가 정한다.
        q.forEach((v, k) => {
            if (k !== "orderNo" && k !== "phone") params.current[k] = v;
        });
        phone.current = recallPendingPayment(no);
        setOrderNo(no);
        void check(no);
    }, []); // 처음 한 번만 묻는다 — 다시 묻는 것은 단추가 한다

    const payAgain = async () => {
        if (!orderNo) return;
        setBusy(true);
        const res = await fetch("/api/payment/session", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({orderNo, ...(phone.current ? {phone: phone.current} : {})}),
        }).catch(() => null);
        const data = res
            ? ((await res.json().catch(() => ({}))) as PaymentStart & {message?: string; code?: string})
            : null;
        if (!res || !res.ok || !data) {
            setBusy(false);
            // 닫힌 주문(만료·취소·이미 결제)만 단추를 거둔다 — 연결 끊김·시간 초과는 다시 누르면 같은 주문으로 열린다.
            if (restartVerdict(data?.code) === "closed") {
                setPhase({kind: "error", message: data?.message ?? "이 주문은 더 결제할 수 없습니다."});
            } else {
                setPhase({kind: "failed", notice: "결제창을 다시 열지 못했습니다. 다시 눌러 주세요."});
            }
            return;
        }
        if (!goToPayment(data, phone.current ?? "")) {
            setBusy(false);
            setPhase({kind: "failed", notice: "결제창을 다시 열지 못했습니다. 다시 눌러 주세요."});
        }
    };

    const submitPhone = (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderNo || phoneInput.trim() === "") return;
        phone.current = phoneInput.trim();
        void check(orderNo);
    };

    const orderHref = orderNo
        ? `/orders/${encodeURIComponent(orderNo)}${phone.current ? `?phone=${encodeURIComponent(phone.current)}` : ""}`
        : "/";

    return (
        <main className="grid max-w-md gap-4 py-8">
            <h1>결제 확인</h1>
            {orderNo && <p className="text-sm text-muted">주문번호 {orderNo}</p>}

            {phase.kind === "checking" && (
                <p className="text-muted" role="status">
                    결제를 확인하고 있습니다…
                </p>
            )}

            {phase.kind === "unsettled" && (
                <div className="grid gap-3" role="status">
                    <p>
                        결제 결과를 아직 확인하지 못했습니다. 결제사에서 처리 중일 수 있습니다 — 잠시 뒤 다시 확인해
                        주세요. 결제가 끝났다면 곧 주문에 반영됩니다.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => orderNo && void check(orderNo)}>다시 확인</Button>
                        <a className="self-center text-sm" href={orderHref}>
                            주문 보기
                        </a>
                    </div>
                </div>
            )}

            {phase.kind === "failed" && (
                <div className="grid gap-3" role="alert">
                    <p>결제가 완료되지 않았습니다. 같은 주문으로 다시 결제할 수 있습니다.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={payAgain} disabled={busy}>
                            {busy ? "여는 중…" : "다시 결제"}
                        </Button>
                        <a className="self-center text-sm" href={orderHref}>
                            주문 보기
                        </a>
                    </div>
                    {phase.notice && <p className="text-sm text-danger">{phase.notice}</p>}
                </div>
            )}

            {phase.kind === "needPhone" && (
                <form className="grid gap-3" onSubmit={submitPhone}>
                    <p>
                        {phase.wrong
                            ? "연락처가 주문과 다릅니다. 주문할 때 적은 연락처를 다시 넣어 주세요."
                            : "주문할 때 적은 연락처를 넣어 주세요 — 결제를 확인합니다."}
                    </p>
                    <input
                        required
                        aria-label="연락처"
                        placeholder="연락처"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                    />
                    <Button type="submit">확인</Button>
                </form>
            )}

            {phase.kind === "error" && (
                <div className="grid gap-2" role="alert">
                    <p className="text-danger">{phase.message}</p>
                    {orderNo && (
                        <a className="text-sm" href={orderHref}>
                            주문 보기
                        </a>
                    )}
                </div>
            )}

            {phase.kind === "missing" && <p className="text-danger">주문 정보를 찾을 수 없습니다.</p>}
        </main>
    );
}
