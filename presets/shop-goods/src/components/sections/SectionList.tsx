import type {ContentSection} from "@/lib/content";
import {SectionRenderer} from "./SectionRenderer";

/**
 * 섹션 배열을 그린다.
 *
 * 섹션 페이지 입구가 둘이라(고정 페이지 `[slug]`, 홈 `/`) 이 로직이 두 벌이 되면 한쪽만 고치는
 * 드리프트가 난다 — 이 레포가 memo102 §6 에서 내내 싸우는 병이라 여기서도 사본을 안 만든다.
 *
 * ## 이 컴포넌트는 백엔드를 부르지 않는다 (memo142 §1 경계 규칙)
 *
 * 종전에는 여기서 `listProducts` 를 불렀다. 섹션 어휘에 **조회형 타입**(`SERVICE_MENU`·`BOOKING_CTA`)이
 * 있었고, 그 선언이 "이 갈래를 진열해라"라고 **호출을 대신 지시**했기 때문이다. 계약 rev 6 에서 그
 * 타입 둘이 삭제되면서 이 축이 통째로 사라졌다.
 *
 * 경계는 **정본 값의 거처**로 긋는다:
 *
 *  - **값이 콘텐츠 파일 안에 산다** = 저작물. `content/pages/*.json` 을 지우면 그 정보가 세상에서
 *    사라진다(HERO 문구·`public/` 이미지 경로·링크·배열 순서). → **선언 섹션의 소관.** 선언이 곧
 *    데이터라 자기완결이고, 그래서 이 렌더 경로에 네트워크가 0 이다.
 *  - **값이 업무 축(DB)에 살고 화면은 비추기만 한다** = 조회. 콘텐츠를 지워도 상품·갈래는 DB 에
 *    그대로 있다. → **소스가 `@zalkera/client` 를 직접 호출**한다(`ProductRail` 이 그 본보기다).
 *
 * 절반 선언이 왜 안 되는지도 여기서 나온다: `{ categorySlug }` 는 "어디에"만 선언에 두고
 * "어떻게"(카드 그리드·필드·개수)를 이 공유 렌더러에 얼려 뒀다. 진열의 디자인이 어휘에 고정되는 것 —
 * **자연어로 다양한 디자인을 만든다**는 방향과 정반대다. 직접 호출은 "어디에"도 "어떻게"도 소스에 있어
 * 받은 사람의 LLM 이 마음대로 뜯어고칠 수 있다.
 */
export function SectionList({sections}: {sections: ContentSection[]}) {
    return sections.map((section, i) => <SectionRenderer key={i} section={section} />);
}
