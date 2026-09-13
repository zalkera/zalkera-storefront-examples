/**
 * 이동 응답에 **경로만** 싣는다 — 호스트를 붙이지 않는다.
 *
 * ## 왜
 * 서빙 컨테이너 안에서 라우트가 받는 `req.url` 은 방문자가 친 주소가 아니라 **서버가 뜬 주소**
 * (`http://0.0.0.0:3000`)다. 그 origin 으로 절대 주소를 만들면 브라우저가 `0.0.0.0` 으로 간다.
 * `next dev` 에서는 두 주소가 같아 드러나지 않는다.
 *
 * 경로만 주면 브라우저가 **지금 보고 있는 주소**를 기준으로 해석한다(RFC 9110 §10.2.2) — 커스텀
 * 도메인에서도 그대로 맞고, 요청 헤더의 호스트값을 믿을 필요도 없다.
 * `NextResponse.redirect()` 는 절대 주소만 받으므로 이 파일을 거쳐 `new NextResponse(null, init)` 로 낸다.
 *
 * ⚠ 이 파일의 판정은 **「호스트가 섞였는가」 하나**다. 어느 내부 경로로 보내도 되는가(오픈 리다이렉트)는
 * `oauth.ts` 의 `safeNextPath` 가 정한다 — 여기로 옮겨 적지 마라.
 * ⚠ 받은 경로를 **그대로** 싣는다 — 정규화한 값(`pathname`)을 돌려주지 마라. `/..//evil` 은 상대 참조로는
 *   같은 origin 이지만, 정규화하면 `//evil` 이 되어 그 값을 다시 참조로 쓰는 순간 남의 호스트가 된다.
 */

/** 경로 조작에만 쓰는 자리표. 이 호스트가 결과에 남으면 판정이 틀린 것이다. */
const PLACEHOLDER = "http://placeholder.invalid";

/** 값이 호스트를 싣는가 — 정규식이 아니라 브라우저와 같은 URL 해석기에 묻는다(`/\t/evil` 은 `//evil` 이 된다). */
function carriesHost(path: string): boolean {
    if (!path.startsWith("/")) return true;
    try {
        return new URL(path, PLACEHOLDER).origin !== PLACEHOLDER;
    } catch {
        return true;
    }
}

/**
 * 307 이동 응답의 초기값. 호스트를 싣는 값이면 **던진다** — 조용히 고쳐 보내면 호출한 쪽의 잘못이 가려진다.
 *
 * @param path 이 사이트 안의 경로(`/login`, `/orders/A-1?phone=010`).
 * @param headers 함께 실을 헤더(예: `Cache-Control`). `Location` 은 이 함수가 정한다.
 */
export function pathOnlyRedirect(path: string, headers: Record<string, string> = {}): ResponseInit {
    if (carriesHost(path)) throw new Error(`이동 주소에 호스트가 섞였다 — 경로만 넘겨라: ${JSON.stringify(path)}`);
    return {status: 307, headers: {...headers, Location: path}};
}
