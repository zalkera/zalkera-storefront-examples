/**
 * 프리뷰 모드 판별(memo29 §3). 프리뷰 러너가 `next dev` 프로세스에 NEXT_PUBLIC_ZALKERA_PREVIEW=1 을 주입한다(구 이름도 수용).
 * =1 이면 프로덕션 공개 API(읽기)만 소비하고 쓰기(체크아웃·장바구니 변경)를 차단해 프로덕션 데이터를 오염시키지 않는다.
 */
// NEXT_PUBLIC_* 는 빌드 시 리터럴로 치환되므로 동적 키 접근이 불가하다 — 두 이름을 그대로 나열한다.
export const isPreview = (): boolean =>
    process.env.NEXT_PUBLIC_ZALKERA_PREVIEW === "1" || process.env.NEXT_PUBLIC_ONEQUE_PREVIEW === "1";

// ⚠ **여기에 적용 지점을 나열하지 마라.** 손으로 관리하던 목록이 둘에서 멈춰 있는 사이 카트 세 곳이
//   무방비였고, 그동안 `CUSTOMIZE.md` 는 "장바구니 쓰기가 막힌다"고 보증하고 있었다(심의 실측 —
//   프리뷰 빌드에서 항목 삭제가 운영 백엔드까지 갔다). 목록은 반드시 낡는다.
//
//   규칙은 **쓰기 핸들러(POST·PATCH·PUT·DELETE)는 전부 이 함수를 부른다**이고, 못 부를 사정이 있으면
//   파일 머리에 `// zalkera-allow-preview-write: <한 줄 이유>` 를 단다. 그것을 재는 것은 목록이 아니라
//   `previewGuard.test.ts` 다 — `src/app/**/route.*` 의 쓰기 핸들러가 둘 다 빠뜨리면 빨개진다.
//   그 검사가 **모르는 형태를 만나면 통과가 아니라 빨강**이다(미지 선언 형태 fail-closed). 다만
//   서버 액션(`"use server"`)은 범위 밖이니, 쓴다면 거기서도 손으로 걸어라.
