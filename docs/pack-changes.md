# 시작 팩 — 판 사이에 바뀐 것

이미 개시한 사이트의 소스는 고객 것이라 새 판이 **소급되지 않습니다.** 아래는 옮길 가치가 있는 수정과, 그 수정을
옮길 때 **함께 옮겨야 하는 파일**입니다. 받은 판은 `.zalkera/pack.json` 의 `version` 입니다(재업로드 전에 그 파일을 지웠다면 받을 때 적어 둔 판).

⚠ **파일은 최신 시작 팩(zip)에서 가져오십시오** — 공개 레포의 `scripts/lib/test-floors.json` 에는 팩이 걷어내는 정본 전용
하한이 더 들어 있어, 그대로 옮기면 하한 게이트가 없는 시험을 요구해 반려합니다.

⚠ **표의 파일은 한 벌로 옮기십시오.** 시험 파일만 옮기면 그 시험이 import 하는 소스가 옛 판이라 red 가 납니다.
옮긴 뒤 `npm run typecheck && npm test && node scripts/lib/floor-gate.mjs` 를 돌리십시오.

## 3.7.2 이후 누적

표는 3.7.2 에서 파일을 지우지 않은 트리를 기준으로 합니다.

| 바뀐 것 | 왜 | 함께 옮길 파일 |
|---|---|---|
| 마이페이지 주문 취소·구매확정이 **415** 로 실패하던 것 | 본문 없이 POST 하는 버튼에 Content-Type 관문(③층)이 걸려 있었습니다 | `src/app/api/orders/[orderNo]/cancel/route.ts` · `src/app/api/orders/[orderNo]/complete/route.ts` |
| 블로그 목록의 범위 밖 쪽이 **200 빈 쪽**이던 것 | 백엔드가 거절한 쪽을 404 로 냅니다 — 끝없는 빈 쪽 주소가 색인되지 않게 | `src/lib/blogPaging.ts` · `src/components/BlogList.tsx` · `src/lib/blogPaging.test.ts` · `src/lib/blogListRender.test.ts` |
| 소셜 로그인 — `redirect_uri` 를 헤더 원문이 아니라 **파서가 정규화한 오리진**으로 · 교환을 **한 입구**(`exchangeSocialLogin`)로 | 헤더에 섞인 userinfo 가 주소에 실리지 않게 · 싱글턴 `zalkera` 에서 `socialLogin` 을 떼어 SDK 로 교환하는 한 state 대조를 빠뜨릴 수 없게(대조·소각·교환의 행위를 시험이 잽니다). 두 수정이 같은 교환 라우트에 있어 **이 행은 한 벌로** 옮기십시오 | `src/lib/crossOrigin.ts` · `src/lib/zalkera.ts` · `src/lib/oauthState.ts` · `src/lib/session.ts` · `src/app/api/auth/social/route.ts` · `src/app/api/auth/social/start/route.ts` · `src/lib/crossOrigin.test.ts` · `src/lib/oauthState.test.ts` |
| 로그인 갱신 뒤 **`0.0.0.0` 으로 튕기던** 것 · 두 번째 만료에 **로그인으로 떨어지던** 것 | 갱신 라우트가 서버가 뜬 주소로 이동을 만들었습니다 — 로그인 15분 뒤 새로고침·로그아웃 상태의 마이페이지에서 났습니다. 이동에 경로만 싣습니다. 「방금 갱신했다」 표식은 주소(`?r=1`)에 남아 다음 만료까지 읽히므로 몇 초짜리 쿠키로 옮겼습니다 | `src/app/api/auth/refresh/route.ts` · `src/lib/redirect.ts` · `src/lib/redirect.test.ts` · `src/lib/session.ts` · `src/app/mypage/page.tsx` · `scripts/lib/floors.mjs` · `scripts/lib/test-floors.json` |
| 재검증 시크릿을 **상수시간**으로 대조 | 비교에 걸리는 시간으로 시크릿이 새지 않게 | `src/app/api/revalidate/route.ts` |
| 가드 배선 시험 신설 | 교차사이트 가드 세 층이 라우트에 실제로 달렸는지, 소셜 교환의 입구가 하나인지 잽니다(검사기 X1 은 경고만 냅니다) — **윗줄을 전부 먼저** 옮기십시오. 하한표에 블로그·소셜 행이 올린 하한이 함께 들어 있습니다 | `src/lib/guardWiring.test.ts` · `scripts/lib/floors.mjs` · `scripts/lib/test-floors.json` · `scripts/lib/floors.test.mjs` |
| 능력별 삭제표를 뺐습니다 | 표대로 지워도 검사가 초록이 되지 않았습니다 — 안 쓰는 능력은 파일을 지우지 말고 **입구를 닫습니다** | `AGENTS.md` 「안 쓰는 능력」 절 |
| `@zalkera/client` 0.37.0 | 새 메서드 둘(`listSessions`·`revokeSession`) — 팩은 부르지 않습니다 | `npm install @zalkera/client@^0.37.0` · 루트 `llms.txt`(최신 zip 에서) |
| 블로그·프리셋 섹션을 **지운 트리**에서 가드 회귀 스위트가 반려되던 것 | 시안 레인(`docs/mockup-to-pack.md`)은 그 둘을 지우는데, 그 디렉터리를 읽는 시험 아홉이 있어 지운 팩이 `verify-zip` 에서 막혔습니다. 디렉터리가 없으면 그 시험은 이유를 찍고 건너뛰고 하한도 같은 수만큼 낮아집니다(정본 저장소·일부만 남긴 디렉터리는 반려) | `src/lib/astGuards.test.ts` · `src/lib/blogListRender.test.ts` · `scripts/lib/floors.mjs` · `scripts/lib/floor-gate.mjs` · `scripts/lib/test-floors.json` · `scripts/lib/floors.test.mjs` · `scripts/lib/floorGate.test.mjs` |
| 소셜 state 쿠키의 **발행** 그물 · 운영 코드가 **시험 파일을 가져오는** 그물 신설 | 발행이 `src/lib/session.ts` 한 곳에서 발행 상수 그대로(`{...OAUTH_STATE_COOKIE_OPTIONS, secure}` · 상수 출처 · `secure` 는 파일 상단 환경 판정 하나)인지 — 펼친 뒤 `sameSite` 를 덮거나 옆에 더 심거나 지역 상수로 가리면 검사기가 읽는 값과 심는 값이 갈립니다. 시험 파일 면제는 운영 코드가 그것을 가져오지 않을 때만 섭니다 | `src/lib/guardWiring.test.ts` · `scripts/lib/floors.mjs` · `scripts/lib/test-floors.json`(하한 9) · `src/lib/zalkera.ts`(주석) · `AGENTS.md`(BFF 절 발행 규칙) |
| 주문·예약·리드에 **광고 유입**을 싣는다 | 광고로 들어온 요청의 `utm_*`·클릭 ID 를 쿠키에 두고 담기·예약·리드가 넘깁니다 — 빠져 있어 캠페인별 매출이 늘 0 이었습니다(광고비만 찼습니다). 픽셀·클라이언트 JS 없이 · 정적 페이지 캐시 그대로 | `src/lib/attribution.ts` · `src/lib/attribution.test.ts` · `src/middleware.ts` · `src/lib/session.ts` · `src/app/api/cart/items/route.ts` · `src/app/api/booking/route.ts` · `src/app/api/lead/route.ts` · `scripts/lib/floors.mjs` · `scripts/lib/test-floors.json` · `AGENTS.md` · `npm install @zalkera/client@^0.38.0`(담기 넷째 인자·`OrderAttribution`) |

옛 표대로 이미 파일을 지운 사이트는 지운 파일을 최신 zip 에서 되살리고, 옛 표가 함께 고치게 한
`src/lib/reservedSegments.ts`·`src/app/robots.ts` 도 원래대로 되돌린 뒤 입구를 닫으십시오 — 지운 채로는 검사가
red 입니다.

`AGENTS.md` 의 ③층 규칙도 바뀌었습니다 — 본문이 **필수인** 문에만 겁니다(필수 여부는 없을 때 400 응답에
`code: "INVALID_BODY"` 를 싣는가로 정합니다).
