import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {isPreview} from "@/lib/preview";
import {isPreviewBlockedWrite} from "@/lib/previewGuard";

/**
 * **프리뷰 모드 쓰기 차단의 관문.**
 *
 * 판정은 `src/lib/previewGuard.ts` 가 한다. 여기는 그 판정을 요청에 붙인다.
 *
 * ## matcher 는 **정적 파일만** 뺀다
 *
 * 관문은 모든 요청에서 엣지 런타임을 한 번 태우고, 그 값은 0 이 아니다 — 정적 에셋은 원래 가장
 * 싼 경로라 상대 비용이 크다. 그래서 확장자가 있는 경로(`.js`·`.png`·`.txt` …)와 `_next/static`·
 * `_next/image`·`favicon.ico` 를 뺀다. **쓰기가 닿는 자리는 확장자가 없다** — API 라우트·페이지
 * 경로(서버 액션은 페이지 URL 로 POST 한다)가 전부 그렇다.
 *
 * ⚠ **여기를 더 좁히지 마라.** 경로 목록으로 좁히면 빠뜨린 자리가 **조용히** 무방비가 된다.
 *   지금 형태는 "정적 파일이 아닌 것은 전부"라 새 라우트가 아무것도 안 해도 덮인다.
 *   `ci.yml`·`verify-zip` 이 빌드 산출물의 matcher 를 프로브 경로로 검증한다 — 좁히면 거기서 막힌다.
 *
 * 원가를 다시 재려면:
 *     node .next/standalone/server.js &   # 관문 있는 빌드와 없는 빌드를 각각
 *     # keep-alive 부하기로 /_next/static/... 과 /api/cart 를 교대 측정
 *
 * ## 프리뷰가 아니면 판정 첫 줄에서 빠진다
 *
 * 그래도 요청마다 함수 호출과 엣지 런타임 진입은 일어난다. "아무 비용이 없다"고 읽지 마라.
 */
export function middleware(req: NextRequest) {
    if (!isPreview()) return NextResponse.next();
    if (!isPreviewBlockedWrite(req.method, req.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.json(
        {
            message: "프리뷰 모드에서는 쓰기가 비활성화됩니다.",
            code: "PREVIEW_READ_ONLY",
        },
        {status: 403},
    );
}

export const config = {
    // 확장자가 있는 경로 = 정적 파일. 쓰기가 닿는 자리(API·페이지)는 확장자가 없다.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
