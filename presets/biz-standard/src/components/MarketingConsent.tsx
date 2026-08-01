"use client";

import {useEffect, useState, useTransition} from "react";
import type {ConsentInput, ConsentStatus, ConsentType} from "@zalkera/client";
import {POLICY_VERSION} from "@/lib/oauth";

/** 마이페이지의 마케팅 수신 동의 토글. 현재 상태는 서버 라우트(/api/consents)를 통해 읽고 쓴다. */
const MARKETING: {type: ConsentType; label: string}[] = [
    {type: "MARKETING_EMAIL", label: "마케팅 정보 이메일 수신"},
    {type: "MARKETING_SMS", label: "마케팅 정보 SMS 수신"},
];

export function MarketingConsent() {
    const [granted, setGranted] = useState<Record<string, boolean>>({});
    const [loaded, setLoaded] = useState(false);
    const [message, setMessage] = useState("");
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        void (async () => {
            const res = await fetch("/api/consents");
            if (!res.ok) {
                setMessage("동의 상태를 불러오지 못했습니다.");
                setLoaded(true);
                return;
            }
            const data = (await res.json()) as {consents: ConsentStatus[]};
            const map: Record<string, boolean> = {};
            for (const c of data.consents ?? []) map[c.consentType] = c.granted;
            setGranted(map);
            setLoaded(true);
        })();
    }, []);

    const save = (type: ConsentType, next: boolean) => {
        setMessage("");
        setGranted((prev) => ({...prev, [type]: next}));
        const body: {consents: ConsentInput[]} = {
            consents: [{consentType: type, policyVersion: POLICY_VERSION, granted: next}],
        };
        startTransition(async () => {
            const res = await fetch("/api/consents", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                // 실패 시 낙관적 갱신 되돌림.
                setGranted((prev) => ({...prev, [type]: !next}));
                setMessage("변경을 저장하지 못했습니다.");
                return;
            }
            setMessage("저장되었습니다.");
        });
    };

    if (!loaded) return <p className="text-muted">마케팅 수신 설정을 불러오는 중…</p>;

    return (
        <section className="mt-6 pt-4 border-t border-border">
            <h2 className="text-base">마케팅 수신 동의</h2>
            <div className="grid gap-1.5 max-w-xs">
                {MARKETING.map((m) => (
                    <label key={m.type} className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            className="w-auto"
                            checked={Boolean(granted[m.type])}
                            disabled={pending}
                            onChange={(e) => save(m.type, e.target.checked)}
                        />
                        {m.label}
                    </label>
                ))}
            </div>
            {message && <p className="text-muted text-sm mt-2">{message}</p>}
        </section>
    );
}
