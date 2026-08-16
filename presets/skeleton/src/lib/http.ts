import {NextResponse} from "next/server";
import {ZalkeraError} from "@zalkera/client";
import {isJsonContentType, isSameOriginRequest} from "@/lib/crossOrigin";

/**
 * ZalkeraError → JSON 응답. 네트워크 오류(status 0)는 502 로.
 *
 * 세 가지를 다 실어야 클라이언트가 온전히 분기한다:
 *  - `code` — 기계 판독 errorCode(예: NOT_CANCELABLE·TOO_MANY_REQUESTS)로 분기
 *  - `errors` — 400 필드 검증 배열. **이걸 빠뜨리면 폼의 필드별 에러 표시가 죽은 코드가 된다**
 *    (실측 사고: InquiryForm 의 data.errors 분기가 도달 불가였다
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

/**
 * 본문을 객체로 읽는다. 실패·비객체는 `null` → 호출부가 [invalidBody] 로 400 을 낸다.
 *
 * ⚠ **이건 CSRF 방어가 아니다.** `Content-Type` 을 보지 않으므로 `<form enctype="text/plain">`
 * 이 보낸 본문도 그대로 파싱된다 — 원 익스플로잇의 운반체가 정확히 그것이었다. 교차사이트
 * 위조를 막는 것은 [assertSameOrigin](①층)과 [assertJsonContentType](③층)이고, 이 함수는
 * **형식 가드**다. 이 오해는 가 DON'T-BUILD 로 명시해 죽인 것이다.
 */
export async function readJsonBody(req: Request): Promise<any | null> {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
    return body;
}

/** readJsonBody 가 null 일 때의 표준 400. INVALID_BODY 는 신규 코드 — 기존 분기와 충돌 없음. */
export function invalidBody(): NextResponse {
    return NextResponse.json({message: "잘못된 요청 본문입니다.", code: "INVALID_BODY"}, {status: 400});
}

/**
 * 교차사이트 위조 가드 — **변이 메서드를 export 하는 모든 BFF 라우트의 첫 줄**.
 *
 * ```ts
 * export async function POST(req: Request) {
 *     const blocked = assertSameOrigin(req);
 *     if (blocked) return blocked;
 *     ...
 * }
 * ```
 *
 * 판정 규칙과 그 근거는 `@/lib/crossOrigin` 의 [isSameOriginRequest] 에 있다. 여기는 전송만 맡는다.
 *
 * 차단 응답에는 **어떤 `Set-Cookie` 도 실리지 않아야 한다** — 세션을 만들기 전에 끝내는 것이 요점이라,
 * 뒤에 쿠키를 심는 코드가 실행되면 방어가 무의미해진다. 가드는 반드시 **첫 줄**이다.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
    if (isSameOriginRequest(req)) return null;
    return NextResponse.json({message: "허용되지 않은 요청 출처입니다.", code: "CROSS_ORIGIN_BLOCKED"}, {status: 403});
}

/** 본문 필수 라우트의 `Content-Type` 강제 — [assertSameOrigin] 다음 줄. 근거는 [isJsonContentType]. */
export function assertJsonContentType(req: Request): NextResponse | null {
    if (isJsonContentType(req)) return null;
    return NextResponse.json(
        {message: "요청 본문 형식이 올바르지 않습니다.", code: "UNSUPPORTED_MEDIA_TYPE"},
        {status: 415},
    );
}
