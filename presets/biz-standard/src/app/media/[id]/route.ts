import {NextResponse} from "next/server";
import {apiBase, tenantCode} from "@/lib/env";
import {routeParam} from "@/lib/routeParam";
import {cacheControlFrom} from "@/lib/mediaCache";

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
 * 1회만 낸다. 이 302 의 캐시 상한은 **상류가 보낸 지시에서 파생**한다 — 숫자를 여기 적지 않는다
 * (판정과 그 이유는 `src/lib/mediaCache.ts`). 서명보다 오래 캐시하면 죽은 링크를 재사용하게 되고,
 * 아예 캐시하지 않으면 같은 방문자의 재방문도 백엔드를 다시 친다.
 *
 * ⚠ **이미지 바이트의 실효 캐시 수명은 이 302 의 수명과 같다.** 백엔드 `/raw` 는 요청마다 **새
 *   서명**을 발급하므로, 이 302 가 만료되면 Location 이 달라져 브라우저 캐시 키도 바뀐다 — 스토리지
 *   응답 헤더가 아무리 길어도 같은 바이트를 다시 받는다. 즉 「스토리지가 알아서 캐시한다」로 읽지
 *   마라. 늘리려면 이 302 의 상한(그리고 서명 수명)을 늘려야 한다.
 *
 * 트래픽이 커지면 종착지는 CDN + 공개 읽기 버킷이고(백엔드 `/raw` 주석의 기존 정본), 그때 이 라우트는
 * URL 생성 지점 1곳 교체로 은퇴한다.
 */
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
    const {id: rawParam} = await params;
    const id = routeParam(rawParam);
    // id 를 그대로 URL 에 이어붙이므로 숫자만 통과시킨다(경로 주입 차단).
    // ⚠ **실패에도 캐시 지시를 단다.** 404 는 RFC 9111 의 휴리스틱 캐시 **대상**이라, 지시가 없으면
    //    공유 캐시가 제 마음대로 저장한다 — 아직 발행 안 된 미디어의 깨진 이미지가 무효화 수단 없이
    //    굳는다. 반대로 상한 없이 매번 뚫리면 죽은 id 하나가 뷰마다 백엔드를 친다.
    if (!/^\d+$/.test(id)) return new NextResponse(null, {status: 404, headers: NOT_FOUND_CACHE});

    const base = apiBase();
    const tenant = tenantCode();

    let res: Response;
    try {
        res = await fetch(`${base}/api/public/media/${id}/raw`, {
            headers: {"X-Tenant": tenant},
            // 302 를 따라가면 바이트가 이 런타임을 통과한다 — Location 만 필요하다.
            redirect: "manual",
            cache: "no-store",
            // ⚠ **상한을 건다.** 백엔드가 연결만 받고 응답을 안 주면 이 핸들러가 매달린다 —
            //    런타임 기본값은 이 코드가 정하는 것이 아니고 분 단위라 상한 구실을 못 한다.
            //    이 라우트는 **페이지뷰마다 이미지 수만큼** 불리므로(카탈로그 페이지는 상한 24),
            //    백엔드가 느려지면 한 뷰가 핸들러 24개를 한꺼번에 붙든다. 서명 발급은 DB 한 번 +
            //    로컬 서명이라 짧게 잡는다.
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // 상류 장애는 곧 풀린다 — 캐시하지 않는다.
        return new NextResponse(null, {status: 502, headers: {"Cache-Control": "no-store"}});
    }

    const location = res.headers.get("location");
    // 백엔드가 302+Location 을 안 주면(없는 id·타 테넌트 id → 404) 그대로 없는 것으로 취급한다.
    if (!location) {
        return res.status === 404
            ? new NextResponse(null, {status: 404, headers: NOT_FOUND_CACHE})
            : new NextResponse(null, {status: 502, headers: {"Cache-Control": "no-store"}});
    }

    // 이 302 의 Location 은 만료되는 서명 URL 이다. 서명보다 오래 캐시하면 방문자에게 죽은
    // 링크가 나간다. 상한은 [cacheControlFrom] 이 **상류가 보낸 지시에서** 뽑는다.
    return NextResponse.redirect(location, {
        status: 302,
        headers: {"Cache-Control": cacheControlFrom(res.headers.get("cache-control"))},
    });
}

/**
 * 없는 미디어의 캐시 지시. 404 는 휴리스틱 캐시 **대상**이라 지시를 안 달면 공유 캐시가 제 마음대로
 * 정한다. 짧게 달아 ⑴ 죽은 id 가 뷰마다 백엔드를 치지 않게 하고 ⑵ 나중에 발행된 미디어가 오래
 * 안 보이지 않게 한다. 성공 경로의 상한과 같은 근거의 짧은 쪽이다.
 */
const NOT_FOUND_CACHE = {"Cache-Control": "private, max-age=30"} as const;
