import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {ZalkeraError, type LiveEvent} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {liveEventId} from "@/lib/liveEvent";
import {LiveBoard} from "./LiveBoard";

/**
 * **라이브 방송 쪽** — 방송 QR 이 여는 주소(`/live/{id}`). 여러 손님이 같은 주소로 들어와 각자 「바로 구매」로
 * 한 주문씩 낸다(카트를 안 쓴다).
 *
 * 쪽은 요청마다 그리지 않는다 — 짧은 주기로 굽고(ISR), 열린 화면(`LiveBoard`)이 리비전을 물어 바뀐 값을 다시
 * 받는다. 방송 상태·특가·남은 수량은 몇 초 단위로 바뀌고 백엔드가 이 값에 캐시 태그를 발화하지 않아서다.
 * 살 수 있는지의 최종 판정은 결제 때 서버가 다시 한다 — 이 화면의 구매 칸은 안내다.
 */
export const dynamic = "force-static";
export const revalidate = 15;

async function loadLive(raw: string): Promise<LiveEvent> {
    const id = liveEventId(raw);
    if (id === null) notFound();
    try {
        const live = await zalkera.getLiveEvent(id);
        if (live == null) notFound();
        return live;
    } catch (error) {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    }
}

export async function generateMetadata({params}: {params: Promise<{id: string}>}): Promise<Metadata> {
    const {id} = await params;
    const live = await loadLive(id);
    // 방송이 끝나면 사라지는 쪽이라 색인에 남기지 않는다(링크는 따라가게 둔다).
    return {title: live.title, robots: {index: false, follow: true}};
}

export default async function LivePage({params}: {params: Promise<{id: string}>}) {
    const {id} = await params;
    const live = await loadLive(id);
    return (
        <main className="py-8">
            <LiveBoard initial={live} />
        </main>
    );
}
