import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertSameOrigin, errorResponse} from "@/lib/http";
import {isPreview} from "@/lib/preview";

/**
 * 조회수 비콘 BFF — **공개(인증 없음)**. 브라우저 아일랜드(ViewBeacon)가 이걸 친다.
 *
 * inquiry/route.ts 의 clientIp 관용구를 복제한다: 백엔드가 `X-Forwarded-For` 첫 홉으로 방문자별
 * dedup(sha256(IP|UA))을 하므로 원 방문자 IP 를 뽑아 넘긴다(안 넘기면 테넌트 서버 IP 하나로 뭉쳐
 * 모든 조회가 1건으로 접힌다). 프리뷰에서는 세지 않는다(초안 열람이 조회로 잡히면 안 됨).
 */
export async function POST(req: Request, {params}: {params: Promise<{slug: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    if (isPreview()) {
        return NextResponse.json({counted: false}, {status: 403});
    }
    const {slug} = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    try {
        const counted = await zalkera.recordPostView(slug, {clientIp: ip});
        return NextResponse.json({counted});
    } catch (error) {
        return errorResponse(error);
    }
}
