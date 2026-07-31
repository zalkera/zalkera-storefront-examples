import {NextResponse} from "next/server";
import {ZalkeraError} from "@zalkera/client";

/**
 * ZalkeraError → JSON 응답. 네트워크 오류(status 0)는 502 로.
 *
 * 세 가지를 다 실어야 클라이언트가 온전히 분기한다:
 *  - `code` — 기계 판독 errorCode(예: NOT_CANCELABLE·TOO_MANY_REQUESTS)로 분기
 *  - `errors` — 400 필드 검증 배열. **이걸 빠뜨리면 폼의 필드별 에러 표시가 죽은 코드가 된다**
 *    (실측 사고: InquiryForm 의 data.errors 분기가 도달 불가였다 — memo 57 §9 F1).
 */
export function errorResponse(error: unknown): NextResponse {
    if (error instanceof ZalkeraError) {
        return NextResponse.json(
            {message: error.message, code: error.code, errors: error.validationErrors},
            {status: error.status || 502},
        );
    }
    return NextResponse.json({message: "요청 처리 중 오류가 발생했습니다."}, {status: 500});
}

export async function readJsonBody(req: Request): Promise<any | null> {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
    return body;
}

/** readJsonBody 가 null 일 때의 표준 400. INVALID_BODY 는 신규 코드 — 기존 분기와 충돌 없음. */
export function invalidBody(): NextResponse {
    return NextResponse.json({message: "잘못된 요청 본문입니다.", code: "INVALID_BODY"}, {status: 400});
}
