import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {LIVE_SNAPSHOT_TTL_MS, liveEventId} from "@/lib/liveEvent";
import {createSnapshotCache} from "@/lib/liveSnapshotCache";

/**
 * 회차마다 한 벌을 이 서버가 몇 초 들고 나눠 준다(`@/lib/liveSnapshotCache`). 열린 방송 화면은 남은 수량을 따라가려고
 * 스냅샷을 다시 읽는데(판매는 리비전을 안 올린다), 그 요청이 시청자 수만큼 백엔드로 가지 않게 한다.
 */
const snapshots = createSnapshotCache((id: number) => zalkera.getLiveEvent(id), {ttlMs: LIVE_SNAPSHOT_TTL_MS});

/**
 * 라이브 방송 스냅샷(읽기) — 열린 방송 화면이 15초 안팎마다, 그리고 결제가 방송·수량 사유로 거절된 뒤 다시 읽는다.
 * 브라우저에는 캐시하지 말라고 답한다(`no-store`) — 들고 있는 것은 이 서버의 몇 초짜리 공유 사본 하나다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const id = liveEventId((await params).id);
    if (id === null) {
        return NextResponse.json({message: "방송을 찾을 수 없습니다.", code: "LIVE_EVENT_NOT_FOUND"}, {status: 404});
    }
    try {
        return NextResponse.json(await snapshots.get(id), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        const response = errorResponse(error);
        response.headers.set("Cache-Control", "no-store");
        return response;
    }
}
