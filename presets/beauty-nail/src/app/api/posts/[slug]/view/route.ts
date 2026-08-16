import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertSameOrigin, errorResponse} from "@/lib/http";
import {isPreview} from "@/lib/preview";
import {visitorIp} from "@zalkera/client";
import {routeParam} from "@/lib/routeParam";

/**
 * 조회수 비콘 BFF — **공개(인증 없음)**. 브라우저 아일랜드(ViewBeacon)가 이걸 친다.
 *
 * inquiry/route.ts 의 clientIp 관용구를 복제한다. 이 축은 **레이트리밋이 아니라 조회 dedup** 이다 —
 * 키가 `sha256(방문자 IP|User-Agent)` 이고 **게시글별·UTC 하루** 단위라, 안 넘기면 IP 가 테넌트 서버
 * 하나로 뭉쳐 **게시글마다 하루 한 건**으로 접힌다(429 가 아니라 집계가 죽는다 — 그 UA 는 방문자 것이
 * 아니라 서버 것이라 상수다). 프리뷰에서는 세지 않는다(초안 열람이 조회로 잡히면 안 됨).
 */
export async function POST(req: Request, {params}: {params: Promise<{slug: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    if (isPreview()) {
        return NextResponse.json({counted: false}, {status: 403});
    }
    const {slug: rawParam} = await params;
    const slug = routeParam(rawParam);
    const ip = visitorIp(req.headers);
    try {
        const counted = await zalkera.recordPostView(slug, {clientIp: ip});
        return NextResponse.json({counted});
    } catch (error) {
        return errorResponse(error);
    }
}
