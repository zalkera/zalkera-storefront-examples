/**
 * **회차별 스냅샷 공유 캐시**(서버 메모리) — 라이브 BFF(`/api/live/[id]`)가 쓴다.
 *
 * 열린 방송 화면은 남은 수량을 따라가려고 스냅샷을 몇 초마다 다시 읽는다(판매는 리비전을 안 올린다). 시청자마다
 * 백엔드를 부르면 시청자 수만큼 부하가 늘어나므로, 서버 하나가 회차마다 한 벌을 `ttlMs` 동안 들고 나눠 준다.
 *
 * - 같은 창 안의 요청은 **진행 중인 한 번**을 같이 기다린다 — 동시에 몰려도 백엔드 호출은 한 번이다.
 * - 실패도 그 창 동안 들고 있다 — 백엔드가 아플 때 시청자 수만큼 다시 두드리지 않게.
 * - 항목 수에 상한이 있다(`maxEntries`) — 넘치면 가장 오래 묵은 것부터 버린다(회차 id 를 흩뿌리는 요청에 메모리가 안 는다).
 *
 * 서버 인스턴스마다 따로 든다 — 묶이는 부하는 「인스턴스 수 × 회차 수 / ttl」 이다.
 */
export interface SnapshotCache<T> {
    get(id: number): Promise<T>;
}

export function createSnapshotCache<T>(
    load: (id: number) => Promise<T>,
    {ttlMs, maxEntries = 256, now = Date.now}: {ttlMs: number; maxEntries?: number; now?: () => number},
): SnapshotCache<T> {
    const entries = new Map<number, {at: number; value: Promise<T>}>();
    return {
        get(id) {
            const hit = entries.get(id);
            if (hit && now() - hit.at < ttlMs) return hit.value;
            entries.delete(id);
            const value = load(id);
            // 실패를 다시 던지는 것은 부르는 쪽 몫이다 — 이 줄은 처리되지 않은 거절 경고만 없앤다.
            value.catch(() => undefined);
            entries.set(id, {at: now(), value});
            while (entries.size > maxEntries) {
                const oldest = entries.keys().next().value;
                if (oldest === undefined) break;
                entries.delete(oldest);
            }
            return value;
        },
    };
}
