"use client";

import {useEffect} from "react";

/**
 * 조회수 비콘 — mount 시 BFF(/api/posts/{slug}/view)를 한 번 친다. 렌더는 없다(null).
 *
 * **RSC 에서 recordPostView 를 직접 부르지 않는다**: 상세는 ISR 프리렌더라 서버에서 세면 크롤·빌드가
 * 조회로 잡히고 방문자별 dedup(백엔드가 sha256(IP|UA))이 서지 않는다. 실제 브라우저에서만 세도록 내린다.
 */
export function ViewBeacon({slug}: {slug: string}) {
    useEffect(() => {
        fetch(`/api/posts/${encodeURIComponent(slug)}/view`, {method: "POST"}).catch(() => {});
    }, [slug]);
    return null;
}
