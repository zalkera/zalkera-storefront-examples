"use client";

import {useMemo, useState} from "react";
import type {ConsentType} from "@zalkera/client";
import {CONSENT_ITEMS, buildConsents, hasAllRequiredConsents} from "@/lib/oauth";
import {SocialLoginButtons} from "./SocialLoginButtons";
import {TestLogin} from "./TestLogin";

/**
 * 로그인 패널(클라이언트). 약관 동의 상태를 한 곳에서 소유하고, 그 값으로 소셜/테스트 로그인 버튼을
 * 게이트한다. 필수 3종(이용약관·개인정보·만14세)이 모두 체크되기 전에는 로그인 버튼이 비활성화된다.
 *
 * 동의 선택은 `ConsentInput[]` 로 만들어 자식에게 넘긴다. 소셜 버튼은 리다이렉트 전 sessionStorage 에
 * 저장하고, 테스트 로그인은 바로 바디에 싣는다.
 */
export function LoginPanel({showTest}: {showTest: boolean}) {
    const [granted, setGranted] = useState<ReadonlySet<ConsentType>>(new Set());

    const toggle = (type: ConsentType) => {
        setGranted((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const allChecked = granted.size === CONSENT_ITEMS.length;
    const toggleAll = () => {
        setGranted(allChecked ? new Set() : new Set(CONSENT_ITEMS.map((c) => c.type)));
    };

    const ready = hasAllRequiredConsents(granted);
    const consents = useMemo(() => buildConsents(granted), [granted]);

    return (
        <div className="grid gap-4 max-w-xs">
            <fieldset className="rounded-xl border border-border p-4 m-0">
                <legend className="px-1.5 text-muted">약관 동의</legend>

                <label className="flex items-center gap-2 font-semibold pb-2">
                    <input type="checkbox" className="w-auto" checked={allChecked} onChange={toggleAll} />
                    전체 동의
                </label>

                <div className="border-t border-border pt-2 grid gap-1.5">
                    {CONSENT_ITEMS.map((item) => (
                        <label key={item.type} className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="w-auto"
                                checked={granted.has(item.type)}
                                onChange={() => toggle(item.type)}
                            />
                            <span>
                                <span className={item.required ? "text-danger" : "text-muted"}>
                                    [{item.required ? "필수" : "선택"}]
                                </span>{" "}
                                {item.label}
                            </span>
                        </label>
                    ))}
                </div>

                {!ready && <p className="text-muted text-sm mt-2">가입을 진행하려면 필수 약관에 모두 동의해 주세요.</p>}
            </fieldset>

            <SocialLoginButtons consents={consents} disabled={!ready} />
            {showTest && <TestLogin consents={consents} disabled={!ready} />}
        </div>
    );
}
