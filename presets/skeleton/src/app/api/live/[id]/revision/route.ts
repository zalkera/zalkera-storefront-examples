import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {liveEventId} from "@/lib/liveEvent";

/**
 * 라이브 방송 리비전(읽기 · 가볍다) — 열린 방송 화면이 15초마다 묻는다. 값이 바뀌면 화면이 스냅샷을 다시 받는다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const id = liveEventId((await params).id);
    if (id === null) {
        return NextResponse.json({message: "방송을 찾을 수 없습니다.", code: "LIVE_EVENT_NOT_FOUND"}, {status: 404});
    }
    try {
        return NextResponse.json(await zalkera.getLiveRevision(id), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        return errorResponse(error);
    }
}
