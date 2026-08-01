import {clsx, type ClassValue} from "clsx";
import {twMerge} from "tailwind-merge";

/**
 * 클래스 병합 — `twMerge(clsx(...))`(shadcn 관용구).
 *
 * 단순 문자열 연결이 아니다. shadcn 계열 컴포넌트는 "나중에 온 유틸리티가 앞을 덮는다"를 전제로
 * 작성돼 있어서(예: `<Button className="px-6">` 가 기본 `px-5` 를 이겨야 한다), 연결만 하면 두 클래스가
 * 함께 남아 **CSS 순서가 이기는 쪽**이 렌더된다 — 조용히 잘못 그려지는 종류의 버그다.
 *
 * 인자 타입은 clsx 의 `ClassValue` 라 종전(문자열·falsy)의 상위집합이다 — 기존 호출부는 그대로 동작한다.
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
