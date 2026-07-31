import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {getAccessToken} from "@/lib/session";

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
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    const {consents} = await req.json();
    try {
        const message = await zalkera.updateConsents(accessToken, consents);
        return NextResponse.json({message});
    } catch (error) {
        return errorResponse(error);
    }
}
