import {NextResponse} from "next/server";
import {apiBase, tenantCode} from "@/lib/env";

/**
 * 미디어 안정 URL — `<img src="/media/{id}">` 와 JSON-LD `image` 가 쓰는 주소(memo 50 W4).
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
 * 밀도 비용이 붙는다(memo 31). 바이트는 스토리지→브라우저 직행하고, 우리는 이미지뷰당 서명 요청
 * 1회만 낸다. `no-store` 인 이유도 백엔드 `/raw` 와 같다 — 302 대상이 곧 만료되므로 이 응답을
 * 캐시하면 죽은 링크를 재사용하게 된다(이미지 바이트는 스토리지 응답 헤더로 브라우저가 캐시한다).
 *
 * 트래픽이 커지면 종착지는 CDN + 공개 읽기 버킷이고(백엔드 `/raw` 주석의 기존 정본), 그때 이 라우트는
 * URL 생성 지점 1곳 교체로 은퇴한다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const {id} = await params;
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
        });
    } catch {
        return new NextResponse(null, {status: 502});
    }

    const location = res.headers.get("location");
    // 백엔드가 302+Location 을 안 주면(없는 id·타 테넌트 id → 404) 그대로 없는 것으로 취급한다.
    if (!location) return new NextResponse(null, {status: res.status === 404 ? 404 : 502});

    return NextResponse.redirect(location, {status: 302, headers: {"Cache-Control": "no-store"}});
}
