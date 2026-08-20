/**
 * 교차사이트 위조(CSRF) **판정** — 순수 함수. 응답 생성은 `@/lib/http` 의 `assertSameOrigin` 이 맡는다.
 *
 * ## 왜 판정과 전송을 갈랐는가
 * 이 판정 규칙은 네 줄이 전부 사고의 기록이라(아래) **테스트로 잠가야** 한다. 그런데 `next/server` 를
 * import 하는 모듈은 Node 기본 테스트 러너가 못 읽는다(`ERR_MODULE_NOT_FOUND` — 실측). 판정을 웹 표준
 * `Request` 만 쓰는 순수 함수로 두면 **의존성 추가 없이** 테스트가 돈다. 예제 소스는 고객이 `npm ci`
 * 하는 물건이라 devDependency 하나도 무게다.
 *
 * ## 무엇을 막는가
 * `evil.example` 의 자동제출 `<form>` 이 브라우저를 `POST https://내사이트/api/...` 로 **직접** 보내는
 * 경로다. 이때 우리 클라이언트 번들은 **한 줄도 실행되지 않는다** — 그래서 `sessionStorage`·
 * `localStorage` 로는 이 문을 닫을 수 없다. 서버가 검증할 수 있는 증거는 요청 헤더뿐이다.
 */

/**
 * ```
 * 통과 ⇔ Origin 존재 ∧ Origin ≠ "null"
 *        ∧ Origin.host == (x-forwarded-host ?? host)
 *        ∧ (Sec-Fetch-Site 가 있으면 그 값이 "same-origin")
 * ```
 *
 * **⑴ `Sec-Fetch-Site` 를 단독으로 쓰지 않는다.** 흔한 관용구는 `!== "cross-site"` 인데, 플랫폼 존이
 * `{tenant}.{zone}` 이라 **테넌트끼리 서로 `same-site`** 다. 그 관용구를 쓰면 테넌트-대-테넌트 CSRF 가
 * 열린 채로 "고쳤다"고 기록된다. 그래서 **"있으면 same-origin 일 때만"** 이라는 보조 신호로만 쓴다
 * (구형 브라우저·인앱 브라우저는 헤더를 안 보내므로 부재는 통과).
 *
 * **⑵ 스킴을 비교하지 않는다.** 서빙 오케스트레이터는 `x-forwarded-proto: "http"` 를 넣는데 공개 스킴은
 * https 다. 비교하면 **전 사이트가 즉시 죽는다.** 호스트만 본다.
 *
 * **⑶ `Origin` 부재를 통과시키지 않는다.** "Origin 없으면 통과"는 흔한 완화지만, 그 구멍으로 폼 제출이
 * 다시 들어온다. 서버-대-서버 호출자는 자기 자격증명을 들고 오므로 이 가드가 필요 없다 — 면제는
 * 그 라우트에 마커로 명시한다.
 *
 * **⑷ env 화이트리스트를 쓰지 않는다.** 커스텀 도메인·미리보기 호스트·localhost 조합에서 반드시
 * 드리프트해 장애를 만든다. **요청이 실제로 도달한 호스트와 비교**하는 자기참조가 정석이다.
 */
export function isSameOriginRequest(req: Request): boolean {
    const origin = req.headers.get("origin");
    // ⚠ `origin === "null"` 은 **오늘 동치 가드다**(실측: 그 절만 지워도 스위트가 전부 통과). 아래
    // `new URL("null")` 이 throw 해서 `catch → false` 로 같은 답이 나오기 때문이다. 그래도 남기는
    // 이유는 **의도를 드러내기 위해서다** — 샌드박스 iframe 의 `Origin: null` 을 막는 것이 판정
    // 규칙의 일부이고, 파싱 실패에 얹혀 우연히 참인 상태로 두면 URL 파서 동작이 바뀌는 날 조용히
    // 열린다. `oauthState.ts` 의 동치 가드와 같은 계열이다.
    if (!origin || origin === "null") return false;

    // 프록시 뒤에서는 `host` 가 내부 호스트다 — Next 자신의 Server Action 판정과 같은 우선순위를 쓴다.
    //
    // ⚠ **콤마 목록을 풀지 않는다.** 관리형 서빙은 오케스트레이터가 이 헤더를 **덮어쓰므로**
    // 값이 항상 호스트 하나다. 그러나 값을 **덧붙이는** 프록시(BYO 자체 인프라) 뒤에 놓이면
    // `"a.com, b.com" !== originHost` 라 **모든 변이가 403** 이 된다 — fail-closed 라 안전하지만
    // 진단이 어려운 장애다. 첫 항목만 취하는 완화는 그 항목이 신뢰할 수 없는 값이라 안 한다.
    const expected = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!expected) return false;

    let originHost: string;
    try {
        originHost = new URL(origin).host;
    } catch {
        return false; // 파싱 불가 Origin
    }
    if (originHost !== expected) return false;

    // 보조 신호 — **있을 때만** 본다. `!== "cross-site"` 로 쓰면 안 된다(⑴).
    const fetchSite = req.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin";
}

/**
 * 본문이 필수인 변이 라우트의 `Content-Type` 판정 — JSON 만 받는다.
 *
 * 교차 오리진 `fetch` 로 `application/json` 을 보내면 preflight 가 뜨고, 이 코드베이스에 CORS 헤더가
 * 0건이라 실패한다. 반대로 `<form enctype="text/plain">` 은 preflight 없이 통과하는데 — 그것이 원
 * 익스플로잇의 운반체였다.
 *
 * ⚠ **전면 규칙으로 걸면 안 된다.** 본문 없는 변이(로그아웃·주문 취소/완료·카트 비우기·조회수 비콘)는
 * `Content-Type` 을 안 보내므로 정상 사용자가 깨진다. **본문을 읽는 라우트에만** 건다.
 *
 * ⚠ `readJsonBody` 는 이 방어가 아니다 — 그건 형식 가드이고 `Content-Type` 을 보지 않는다.
 */
export function isJsonContentType(req: Request): boolean {
    const ct = req.headers.get("content-type");
    if (!ct) return false;
    return ct.split(";")[0]!.trim().toLowerCase() === "application/json";
}
