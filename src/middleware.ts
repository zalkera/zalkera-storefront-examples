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
 * 경로라 상대 비용이 크다. 그래서 `_next/static`·`_next/image`·`favicon.ico` 와 `public/` 의 실제
 * 최상위(`images/`)를 뺀다.
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
 *   `ci.yml` 과 `verify-zip --pack` 에서 돈다(고객이 부르는 무인자 `verify-zip` 에는 없다).
 *
 * 원가를 다시 재려면:
 *     node .next/standalone/server.js &   # 관문 있는 빌드와 없는 빌드를 각각
 *     # keep-alive 부하기로 /_next/static/... 과 /api/cart 를 교대 측정
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
