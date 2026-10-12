import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {liveEventId} from "@/lib/liveEvent";

/**
 * 라이브 방송 스냅샷(읽기) — 열린 방송 화면이 리비전이 바뀌었을 때 다시 받는다. 응답을 캐시하지 않는다 — 방송
 * 상태·특가·남은 수량은 몇 초 단위로 바뀐다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const id = liveEventId((await params).id);
    if (id === null) {
        return NextResponse.json({message: "방송을 찾을 수 없습니다.", code: "LIVE_EVENT_NOT_FOUND"}, {status: 404});
    }
    try {
        return NextResponse.json(await zalkera.getLiveEvent(id), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        return errorResponse(error);
    }
}
