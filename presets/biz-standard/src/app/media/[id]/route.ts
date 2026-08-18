import {NextResponse} from "next/server";
import {apiBase, tenantCode} from "@/lib/env";
import {routeParam} from "@/lib/routeParam";

/**
 * 미디어 안정 URL — `<img src="/media/{id}">` 와 JSON-LD `image` 가 쓰는 주소.
 *
 * **왜 프록시가 필요한가**: 백엔드 공개 미디어는 두 형태인데 둘 다 브라우저·크롤러가 직접 못 쓴다.
 *  - `/api/public/media/{id}/url` → **수 분 뒤 만료되는 presigned URL**. 마크업에 박으면 ISR 로 캐시된
 *    HTML 안에서 죽는다(상세는 revalidate 300s — 서명보다 오래 산다). JSON-LD 에 넣으면 크롤러가
 *    캐시한 뒤 깨진 이미지가 된다.
 *  - `/api/public/media/{id}/raw` → 안정 URL 이지만 **`X-Tenant` 헤더를 요구**한다(실측: 헤더 없이 400).
 *    크롤러도 브라우저 `<img>` 도 그 헤더를 못 보낸다.
 *
 * 그래서 이 라우트가 헤더를 붙여 백엔드를 부르고 **302 의 Location 만 그대로 넘긴다**.
 *
 * **이미지 바이트를 스트리밍하지 않는다** — 그러면 모든 이미지 트래픽이 Next 런타임을 통과해
 * 밀도 비용이 붙는다. 바이트는 스토리지→브라우저 직행하고, 우리는 이미지뷰당 서명 요청
 * 1회만 낸다. 이 302 는 **presign 만료보다 짧게** 캐시한다(`private, max-age=120` · 만료 300초) —
 * 그보다 오래 캐시하면 죽은 링크를 재사용하게 되고, 아예 캐시하지 않으면 같은 방문자의 재방문도
 * 백엔드를 다시 친다(이미지 바이트 자체는 스토리지 응답 헤더로 브라우저가 캐시한다).
 *
 * 트래픽이 커지면 종착지는 CDN + 공개 읽기 버킷이고(백엔드 `/raw` 주석의 기존 정본), 그때 이 라우트는
 * URL 생성 지점 1곳 교체로 은퇴한다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const {id: rawParam} = await params;
    const id = routeParam(rawParam);
    // id 를 그대로 URL 에 이어붙이므로 숫자만 통과시킨다(경로 주입 차단).
    if (!/^\d+$/.test(id)) return new NextResponse(null, {status: 404});

    const base = apiBase();
    const tenant = tenantCode();

    let res: Response;
    try {
        res = await fetch(`${base}/api/public/media/${id}/raw`, {
            headers: {"X-Tenant": tenant},
            // 302 를 따라가면 바이트가 이 런타임을 통과한다 — Location 만 필요하다.
            redirect: "manual",
            cache: "no-store",
            // ⚠ **상한을 건다.** Node 의 `fetch` 는 기본 타임아웃이 없다 — 백엔드가 연결만 받고
            //    응답을 안 주면 이 핸들러가 무기한 매단다. 이 라우트는 **페이지뷰마다 이미지 수만큼**
            //    불리므로(카탈로그 페이지는 상한 24), 백엔드가 느려지면 한 뷰가 핸들러 24개를
            //    한꺼번에 붙든다. 서명 발급은 수백 ms 짜리라 짧게 잡는다.
            signal: AbortSignal.timeout(5000),
    } catch {
        return new NextResponse(null, {status: 502});
    }

    const location = res.headers.get("location");
    // 백엔드가 302+Location 을 안 주면(없는 id·타 테넌트 id → 404) 그대로 없는 것으로 취급한다.
    if (!location) return new NextResponse(null, {status: res.status === 404 ? 404 : 502});

    // ⚠ **presign 만료보다 짧게 캐시한다**(오너 승인 2026-08-18).
    //    종전에는 `no-store` 였다 — 근거는 "302 대상이 곧 만료되므로 캐시하면 죽은 링크를
    //    재사용한다"이고 백엔드 `PublicMediaController.raw` 도 같은 문장을 자기 응답에 달았다.
    //    그 근거는 **만료보다 오래** 캐시할 때만 참이다. 실측: `StorageProperties.presignExpirySeconds`
    //    = 300초(상용 override 없음). 120초면 재사용 시점에도 서명이 최소 180초 남는다.
    //
    //    왜 고쳤나 — 이 라우트는 **페이지뷰마다 이미지 수만큼** 불린다(카탈로그 상한 24). `no-store`
    //    라 같은 방문자가 같은 페이지를 다시 봐도 백엔드 호출이 하나도 안 줄었다(심의 실측
    //    12/12/12). RDS 커넥션 천장이 30 인 단일 박스에서 이것이 페이지뷰당 유일한 백엔드 소비처다.
    //
    //    `public` 이 아니라 `private` 인 이유: CDN 설정은 이 레포 밖이라 공유 캐시 동작을 검증할 수
    //    없다. 브라우저 재사용만으로 위 재방문 비용은 사라지고, 공유 캐시는 그 설정을 확인한 뒤
    //    별도로 판단할 자리다.
    return NextResponse.redirect(location, {
        status: 302,
        headers: {"Cache-Control": "private, max-age=120"},
    });
}
