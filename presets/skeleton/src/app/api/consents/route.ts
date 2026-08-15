import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";

/**
 * 로그인 고객의 동의 상태 조회·갱신. access 토큰은 httpOnly 쿠키에서만 읽어 백엔드로 전달한다
 * (클라 JS 에 노출하지 않는다). 마이페이지의 마케팅 수신 토글이 이 라우트를 경유한다.
 */
export async function GET() {
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    try {
        const consents = await zalkera.getConsents(accessToken);
        return NextResponse.json({consents});
    } catch (error) {
        return errorResponse(error);
    }
}

export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    // 본문을 읽는 라우트라 ③층(CT 강제)도 건다 — `<form enctype="text/plain">` 운반체를 막는다.
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 프로덕션 데이터 오염 방지로 쓰기를 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 동의 변경가 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {consents} = body;
    try {
        const message = await zalkera.updateConsents(accessToken, consents);
        return NextResponse.json({message});
    } catch (error) {
        return errorResponse(error);
    }
}
