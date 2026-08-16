import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {isPreview} from "@/lib/preview";
import {isPreviewBlockedWrite} from "@/lib/previewGuard";

/**
 * **프리뷰 모드 쓰기 차단의 관문.**
 *
 * 판정은 `src/lib/previewGuard.ts` 가 한다. 여기는 그 판정을 요청에 붙인다.
 *
 * ## matcher 는 **정적 산출 접두만** 뺀다
 *
 * 관문은 모든 요청에서 엣지 런타임을 한 번 태우고 그 값은 0 이 아니다 — 정적 에셋은 원래 가장 싼
 * 경로라 상대 비용이 크다. 그래서 `_next/static`·`_next/image`·`favicon.ico` 를 빼고, `public/` 을
 * 쓰는 트리에서는 그 최상위(`images/`)도 뺀다.
 *
 * `public/` 을 새로 만들거나 그 밑에 다른 최상위를 두면 이 목록에 더할 수 있다. 다만 **배제 접두
 * 밑에 쓰기 라우트를 만들면 그 라우트는 관문 밖**이 된다 — 그 형상은 `gate-probe.mjs` 가 잡는다
 * (프로브를 `src/app` 에서 도출하므로 `src/app/images/upload/route.ts` 같은 자리가 바로 걸린다).
 *
 * ⚠ **확장자로 가르지 마라.** `.*\.[A-Za-z0-9]+$` 로 빼면 **동적 세그먼트에 점이 들어간 쓰기 경로가
 *   통째로 관문 밖**이 된다 — `/api/cart/items/7.0`·`/api/booking/AB.C`·`/api/assets/logo.png` 처럼
 *   파일명·슬러그·자산 id 를 마지막 세그먼트로 받는 자리가 전부 그렇다.
 *   재현: `node -e 'console.log(/^\/((?!_next\/static|.*\.[A-Za-z0-9]+$).*)$/.test("/api/cart/items/7.0"))'`
 *
 * ⚠ **여기를 더 좁히지 마라.** 경로 목록으로 좁히면 빠뜨린 자리가 무방비가 된다.
 *
 *   실재 라우트의 접두를 빼면 `scripts/lib/gate-probe.mjs` 가 잡는다 — 그 검사는 프로브를
 *   고정 목록이 아니라 `src/app` 을 걸어 **이 트리에서 도출**하므로, 무엇을 빼든 그 라우트가
 *   곧 프로브다. `npm run build` 뒤에 `ci.yml`·`verify-zip` 이 부른다.
 *   재현: matcher 에 `|api/checkout` 을 넣고 `npm run build && node scripts/lib/gate-probe.mjs`
 *
 *   판정 자체를 무력화하면(`if (true) return next()`) 등재 검사는 못 본다. 그것은
 *   `scripts/lib/gate-behavior.mjs` 가 프리뷰 빌드를 **띄워** 실 HTTP 로 잡는다 —
 *   우리 레포 CI 와 `verify-zip --pack` 에서 돈다(빌드를 두 번 더 굽는 검사라 고객 CI 에는
 *   안 붙인다. 고객이 부르는 무인자 `verify-zip` 에도 없다).
 *
 * ## 배제로 걷힌 것은 두 접두뿐이다
 *
 * `_next/static`·`images/` 는 관문 도입 전 수준을 되찾는다. 그 밖의 최상위 정적 파일
 * (`robots.txt`·`sitemap.xml`·`og.png`·`fonts/`·`manifest.webmanifest` …)은 **관문을 탄다** —
 * 배제 목록에 없기 때문이다. "정적 원가를 걷었다"로 읽지 마라.
 *
 * `public/` 밑에 새 최상위를 만들면(에이전트가 `og.png`·`fonts/` 를 만드는 자리다) 그 에셋도
 * 관문을 탄다. 필요하면 배제 목록에 더하되, **그 밑에 쓰기 라우트를 두면 관문 밖**이 된다.
 *
 * 원가를 다시 재려면:
 *     node .next/standalone/server.js &   # 관문 있는 빌드와 없는 빌드를 각각
 *     # keep-alive 부하기로 /_next/static/... · /images/*.png · /robots.txt · /api/cart 를
 *     # 교대(회전마다 순서 반전)로 측정하고 중앙값을 쓴다. 콜드 부팅과 RSS·VSZ 도 같이 잰다.
 *
 * ## 프리뷰가 아니면 판정 첫 줄에서 빠진다
 *
 * 그래도 요청마다 함수 호출과 엣지 런타임 진입은 일어난다. "아무 비용이 없다"고 읽지 마라.
 */
export function middleware(req: NextRequest) {
    if (!isPreview()) return NextResponse.next();
    if (!isPreviewBlockedWrite(req.method, req.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.json(
        {
            message: "프리뷰 모드에서는 쓰기가 비활성화됩니다.",
            code: "PREVIEW_READ_ONLY",
        },
        {status: 403},
    );
}

export const config = {
    // 정적 산출의 **접두**만 뺀다. `favicon\.ico` 의 점은 이스케이프한다 — 안 하면 `/faviconXico`
    // 한 글자까지 관문 밖이 된다.
    matcher: ["/((?!_next/static|_next/image|images/|favicon\\.ico$).*)"],
};
