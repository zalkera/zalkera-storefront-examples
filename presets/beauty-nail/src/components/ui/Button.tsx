import {cva, type VariantProps} from "class-variance-authority";
import type {ButtonHTMLAttributes} from "react";
import {cn} from "@/lib/cn";

/**
 * 버튼 프리미티브. 내부는 shadcn 관용구(cva)로 쓰되 **우리 토큰 어휘만** 쓴다 — shadcn 의 변수층
 * (`:root{--primary}` + `@theme inline`)이나 `.dark` 세트는 반입하지 않는다(memo102 §4.1). 남의 토큰
 * 이름(`bg-card`·`text-muted-foreground` 등)이 섞여 들어오는 것은 validator S6 가 막는다.
 *
 * props 시그니처는 종전과 동일하다 — 이식된 호출부 다수가 이 컴포넌트와 [buttonClasses] 를 쓰고 있어
 * 시그니처를 바꾸면 그 전부가 파급된다.
 */
const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold " +
        "transition-colors disabled:opacity-50 disabled:pointer-events-none " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    {
        variants: {
            variant: {
                primary: "bg-primary text-primary-foreground hover:opacity-90",
                outline: "border border-border bg-background text-foreground hover:bg-surface",
                ghost: "text-foreground hover:bg-surface",
            },
        },
        defaultVariants: {variant: "primary"},
    },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

/**
 * variant 클래스 문자열 헬퍼. `<Link>`·`<a>` 에 그대로 얹는다(BookingCta 가 이 용법).
 * `<button>` 이 아닌 요소는 이 헬퍼를, `<button>` 은 아래 Button 컴포넌트를 쓴다.
 */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
    return cn(buttonVariants({variant}), className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
}

/** 지시자 없는 공용 컴포넌트(RSC·클라이언트 양쪽에서 쓸 수 있다 — 훅 없음). */
export function Button({variant = "primary", className, type = "button", ...rest}: ButtonProps) {
    return <button type={type} className={buttonClasses(variant, className)} {...rest} />;
}

export {cn};
