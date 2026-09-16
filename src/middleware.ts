import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {isPreview} from "@/lib/preview";
import {isPreviewBlockedWrite} from "@/lib/previewGuard";
import {
    ATTRIBUTION_COOKIE,
    ATTRIBUTION_COOKIE_OPTIONS,
    decodeTouch,
    encodeTouch,
    nextTouch,
    readLandingTouch,
    shouldCaptureLanding,
} from "@/lib/attribution";

/**
 * 미리보기 모드 쓰기 차단의 **집행 지점**. 판정은 `src/lib/previewGuard.ts` 가 한다.
 *
 * 요청의 메서드와 경로만 보므로 라우트 소스의 선언 형태·파일명과 무관하게 걸린다.
 * 라우트 안의 `if (isPreview())` 는 이중 방어다 — 미리보기에서는 여기서 먼저 끊긴다.
 *
 * ## matcher 는 정적 산출 접두만 뺀다
 *
 * `_next/static`·`_next/image`·`images/`·`favicon.ico`. 관문은 모든 요청에서 엣지 런타임을 한 번
 * 태우고 정적 에셋은 원래 가장 싼 경로라 상대 비용이 크다. 그 밖의 최상위 정적 파일
 * (`robots.txt`·`og.png`·`fonts/` …)은 배제 목록에 없어 관문을 탄다.
 *
 * ⚠ **확장자로 가르지 마라.** `.*\.[A-Za-z0-9]+$` 로 빼면 동적 세그먼트에 점이 든 쓰기 경로가
 *   통째로 관문 밖이 된다(`/api/cart/items/7.0`·`/api/booking/AB.C`).
 *   재현: `node -e 'console.log(/^\/((?!.*\.[A-Za-z0-9]+$).*)$/.test("/api/cart/items/7.0"))'` → false
 *
 * ⚠ **배제 접두 밑에 쓰기 라우트를 두지 마라.** 그 라우트는 관문 밖이다.
 *   재현: `src/app/images/upload/route.ts` 를 만들고
 *         `npm run build && node scripts/lib/gate-probe.mjs; echo rc=$?` → rc=1
 *
 * ## 광고 유입도 여기서 잡는다
 *
 * 방문자가 연 문서 요청의 쿼리에 캠페인·소스·매체·클릭 표지가 있으면 그 값을 httpOnly 쿠키에 둔다 — 담기·예약·리드 BFF 가 읽어
 * 넘긴다(규칙은 `src/lib/attribution.ts`). 페이지 파일에서 읽으면 SEO 페이지가 요청마다 렌더된다.
 * 광고 URL 의 응답은 `Cache-Control: private, no-store` — 공유 캐시가 쿠키째 재생하거나 쿠키 없는 응답을 저장하지 않게.
 *
 * ⚠ **이 파일은 배선이라 모든 팩에서 바이트가 같다.** 팩마다 갈리는 사실을 여기 적지 마라.
 */
export function middleware(req: NextRequest) {
    if (isPreview() && isPreviewBlockedWrite(req.method, req.nextUrl.pathname)) {
        return NextResponse.json(
            {
                message: "미리보기 모드에서는 쓰기가 비활성화됩니다.",
                code: "PREVIEW_READ_ONLY",
            },
            {status: 403},
        );
    }
    const response = NextResponse.next();
    if (req.method === "GET") {
        const ownHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        const incoming = readLandingTouch(req.nextUrl, req.headers.get("referer"), ownHost);
        if (incoming) {
            // 광고 URL 의 응답은 쿠키를 심든 안 심든 공유 캐시에 남기지 않는다.
            response.headers.set("Cache-Control", "private, no-store");
            const touch = shouldCaptureLanding(req.method, (name) => req.headers.get(name))
                ? nextTouch(decodeTouch(req.cookies.get(ATTRIBUTION_COOKIE)?.value), incoming)
                : null;
            if (touch) {
                response.cookies.set(ATTRIBUTION_COOKIE, encodeTouch(touch), {
                    ...ATTRIBUTION_COOKIE_OPTIONS,
                    secure: process.env.NODE_ENV === "production",
                });
            }
        }
    }
    return response;
}

export const config = {
    // `favicon\.ico` 의 점은 이스케이프한다 — 안 하면 `/faviconXico` 까지 관문 밖이 된다.
    matcher: ["/((?!_next/static|_next/image|images/|favicon\\.ico$).*)"],
};
