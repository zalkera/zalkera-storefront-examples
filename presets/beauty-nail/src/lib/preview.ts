/**
 * 프리뷰 모드 판별. 프리뷰 러너가 `next dev` 프로세스에 NEXT_PUBLIC_ZALKERA_PREVIEW=1 을 주입한다(구 이름도 수용).
 * =1 이면 프로덕션 공개 API(읽기)만 소비하고 쓰기(체크아웃·장바구니 변경)를 차단해 프로덕션 데이터를 오염시키지 않는다.
 */
// NEXT_PUBLIC_* 는 빌드 시 리터럴로 치환되므로 동적 키 접근이 불가하다 — 두 이름을 그대로 나열한다.
export const isPreview = (): boolean =>
    process.env.NEXT_PUBLIC_ZALKERA_PREVIEW === "1" || process.env.NEXT_PUBLIC_ONEQUE_PREVIEW === "1";

// ⚠ **여기에 적용 지점을 나열하지 마라.** 손으로 관리하던 목록이 둘에서 멈춰 있는 사이 카트 세 곳이
//   무방비였고, 그동안 `CUSTOMIZE.md` 는 "장바구니 쓰기가 막힌다"고 보증하고 있었다(—
//   프리뷰 빌드에서 항목 삭제가 운영 백엔드까지 갔다). 목록은 반드시 낡는다.
//
//   지금 집행하는 것은 **`src/middleware.ts` 하나**다 — 요청의 메서드·경로만 보므로 라우트가 어떤
//   형태로 쓰였든, 어디에 있든 덮인다. 아래 라우트들의 `if (isPreview())` 는 **이중 방어**로 남긴
//   것이고 집행 지점이 아니다. 면제는 `previewGuard.ts` 의 `PREVIEW_WRITE_ALLOW` 한 곳에 있다.
//
//   ⚠ 종전에는 이 규약을 소스를 **텍스트로 파싱**해 재는 시험이 있었고 **네 판 연속 뚫렸다.**
//   그 이력은 `previewGuard.ts` 머리말에 있다 — 파싱으로 되돌리지 마라.
