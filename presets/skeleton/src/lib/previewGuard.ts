/**
 * 프리뷰 모드 쓰기 차단의 **판정**. 순수 함수라 전수로 시험한다(`previewGuard.test.ts`).
 * 집행은 `src/middleware.ts` 가 요청의 메서드·경로만 보고 한다.
 *
 * ⚠ **소스를 파싱해 "핸들러마다 가드를 불렀는가"로 재지 마라.** 선언 형태·별칭 재수출·
 *   `export * from`·문자열 리터럴이 전부 우회한다. 판정이 요청 경로에 있는 이유다.
 *
 * 면제는 아래 `PREVIEW_WRITE_ALLOW` 한 곳이다. 빠뜨리면 과하게 막혀 403 이 눈에 띈다 —
 * 조용히 새는 방향이 아니다.
 */

/** 본문을 만들 수 있는 메서드. `GET`·`HEAD`·`OPTIONS` 은 읽기다. */
export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 프리뷰에서도 막지 **않는** 경로. 사유는 각 라우트 파일 머리의
 * `// zalkera-allow-preview-write: <이유>` 마커에 한 줄로 있다(사유가 없으면 면제가 안 된다).
 *
 * ⚠ 여기 넣는 것은 "운영 데이터를 써도 좋다"는 뜻이다. 넣기 전에 그 라우트가 **누구의** 데이터를
 *   건드리는지 확인하라 — 로그인·로그아웃은 프리뷰어 자기 세션이고, `revalidate` 는 고객 데이터가
 *   아니라 캐시이며 시크릿 헤더가 없으면 401 이다.
 */
export const PREVIEW_WRITE_ALLOW = [
    "/api/auth/logout",
    "/api/auth/social",
    "/api/auth/social/start",
    "/api/revalidate",
] as const;

/** 끝 슬래시·대소문자를 정규화한다 — `/api/revalidate/` 로 우회되지 않게. */
function normalize(pathname: string): string {
    const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return p.toLowerCase();
}

/**
 * 이 요청을 프리뷰에서 막아야 하는가. **프리뷰 여부는 여기서 안 본다** — 부르는 쪽이 판단한다
 * (그래야 이 함수가 순수해지고 전수 시험이 된다).
 *
 * 면제는 **정확일치**다. 접두 일치로 넓히면 `/api/revalidate/all` 처럼 그 아래가 통째로 열린다.
 */
export function isPreviewBlockedWrite(method: string, pathname: string): boolean {
    if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
    const p = normalize(pathname);
    return !PREVIEW_WRITE_ALLOW.some((allowed) => normalize(allowed) === p);
}
