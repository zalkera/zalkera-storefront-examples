import type {HTMLAttributes} from "react";
import {cn} from "./Button";

/**
 * 카드 프리미티브 — 얇게. 경계선 카드(그림자 없음 — 절제). 상품 카드·요약 박스에서 반복돼 모은다.
 * 지시자 없는 공용 컴포넌트(RSC·클라이언트 양쪽, 훅 없음).
 */
export function Card({className, children, ...rest}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("rounded-xl border border-border bg-background p-4", className)} {...rest}>
            {children}
        </div>
    );
}
