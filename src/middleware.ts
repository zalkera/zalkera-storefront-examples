import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {isPreview} from "@/lib/preview";
import {isPreviewBlockedWrite} from "@/lib/previewGuard";

/**
 * **프리뷰 모드 쓰기 차단의 관문.**
 *
 * 판정 근거와 "왜 미들웨어인가"(소스를 파싱해 재던 검사가 네 판 연속 뚫린 이력)는
 * `src/lib/previewGuard.ts` 머리말에 있다. 여기는 그 판정을 요청에 붙이기만 한다.
 *
 * ⚠ **`matcher` 를 두지 않았다.** 좁히면 빠뜨린 경로가 **조용히** 무방비가 되는데, 그것이 바로
 *   이 물결에서 네 번 반복된 실패 형상이다. 대신 읽기 메서드는 첫 줄에서 즉시 빠진다 —
 *   정적 에셋 요청(GET)은 비용이 사실상 0이다.
 *
 * ⚠ 프리뷰가 아니면 **아무것도 하지 않는다.** 운영 서빙 경로의 동작은 이 파일 도입 전과 같다.
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
