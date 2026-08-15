# AGENTS.md — 잘커라 스토어프론트 (에이전트용 스택·규약 안내)

이 레포를 수정하는 AI 에이전트는 **탐색 전에 이 문서를 먼저 읽어라.** 여기엔 이 코드베이스의 스택·스타일 규약·구조가 있다.

착수 절차·브랜치·시크릿·백엔드 직접 fetch 금지 같은 **안전 규칙은 이 문서가 아니라 작업 지시 프롬프트가 단일 출처**다 — 여기서 중복하지 않는다. 이 문서는 "이 코드가 무슨 규약을 쓰나"(코드 사실)만 말한다.

이 레포는 두 가지를 동시에 배송한다. ① 사진과 문구만 바꿔 그대로 쓰는 **판매 완성품** — 실물은 `content/`(사이트의 얼굴)·`public/`(이미지)·`src/`(호출 구성)이고, `.zalkera/seed.json` 은 **테마 색**만 나른다. ② 레시피(`@zalkera/client` 의 `llms.txt`)를 이렇게 따른다는 **본보기** — 실물은 소스 코드와 이 문서다. 뒤쪽은 앞쪽의 격하가 아니라 **역할 추가**다: 이 레포는 카탈로그에 오르고 팩 게이트·진열 게이트를 똑같이 통과하는 상품이면서, 새 템플릿을 짓는 사람·AI 가 읽는 교본이기도 하다.

**분담**: 사이트의 **얼굴**(페이지·섹션·정적 문구·섹션 이미지·내비)의 정본은 **이 레포의 `content/`** 이고, `.zalkera/seed.json` 은 **테마 색**만 나른다. **업무 데이터(상품·갈래)는 배송물이 만들지 않는다** — 주인은 콘솔·MCP 이고(계약 rev 6·memo142 §1), 화면에 비추는 일은 소스가 `listProducts()`·`listProductCategories()` 를 직접 불러서 한다(`src/components/ProductRail.tsx`). 콘텐츠의 인명·후기·문구는 실감을 위해 지어낸 것이지 규범이 아니다.

**문구를 tsx 마크업에 굽지 마라.** 이 규범은 사라지지 않았고 **거처만 바뀌었다** — 굽지 말아야 할 곳은 그대로 JSX 이고, 있어야 할 곳이 DB 에서 `content/pages/*.json` 으로 왔다. 마크업에 박은 문구는 "말로 고치기"가 파일 하나를 여는 대신 컴포넌트 트리를 탐색하게 만든다.

그래서 아래는 금지 목록이 아니라, **무엇이 계약이라 반드시 따라야 하는 것이고 무엇이 이 템플릿의 선택이라 다르게 해도 되는 것인지**를 갈라 적는다.

## 콘텐츠 좌표 — 무엇을 고치려면 어느 파일을 여는가

**탐색하지 말고 여기서 바로 파일을 열어라.** 이 표가 이 문서에서 가장 먼저 오는 이유는 원가가 파일 크기가 아니라 **여는 파일의 개수·탐색 경로**에 있기 때문이다(실측: 콘텐츠를 tsx 에서 json 으로 옮겼을 때 파일은 2.5배 작아졌는데 토큰은 1.34배만 줄었다).

| 고치려는 것 | 여는 파일 | 비고 |
|---|---|---|
| 페이지의 문구(제목·본문·버튼 라벨·FAQ 문답·후기 인용·통계 수치) | `content/pages/<slug>.json` — 해당 섹션의 `config` | 홈은 `home.json` 이다(루트가 집어 온다) |
| 섹션 순서("후기를 특징 소개 위로") | 같은 파일 `sections` **배열 재배열** | `sortOrder` 키는 없다 — 배열이 곧 순서다 |
| 섹션 추가·삭제 | 같은 파일 `sections` 에 `{"type": …, "config": {…}}` 삽입·제거 | `type` 은 어휘 10종에서만(§섹션 렌더) |
| 섹션 이미지 교체 | 같은 파일의 `asset`/`*Asset` 값 = `"/images/hero.png"` | 값은 **레포 루트 절대 경로만**. 실물 파일은 레포 루트 `public/` 아래(템플릿 기본에는 `public/` 이 없고 팩이 프리셋 이미지를 거기로 병합한다) |
| **상품 진열**("여기에 상품 목록 보여줘") | `src/components/ProductRail.tsx` — 또는 그것을 조합하는 `src/app/page.tsx` | **콘텐츠 파일이 아니다.** 상품·갈래의 정본 값은 업무 DB 에 살고 화면은 비추기만 하므로, 조회는 선언이 아니라 **소스의 직접 호출**이다(§경계 규칙). 섹션 config 에 `product`·`products`·`categorySlug` 를 적으면 팩이 막는다 |
| 그 페이지의 SEO 제목·설명 | 같은 파일의 `seo` | 없으면 페이지 제목·사이트 기본값으로 강하한다 |
| **페이지 신설** | `content/pages/<slug>.json` **+ `content/index.ts` 두 줄**(import 1 · 맵 1) | **라우트를 새로 짜지 마라** — `src/app/[slug]/page.tsx` 가 이미 그리고 `src/app/sitemap.ts` 가 `pageSlugs()` 로 자동 등재한다. 라우트를 새로 짜면 그 페이지만 계약 밖으로 나가 "말로 고치기"가 다시 tsx 탐색이 된다 |
| 헤더·푸터 메뉴 | `content/nav.json` | 배열 순서가 노출 순서. `href` 는 로더가 소독한다 |
| 섹션의 마크업·레이아웃·클래스 | `src/components/sections/` 의 해당 `*Section.tsx` | 문구가 아니라 **모양**을 바꿀 때만 |
| 헤더·푸터의 마크업 | `src/components/SiteHeader.tsx` · `src/components/SiteFooter.tsx` | |
| 계약 밖 새 화면(자유 영역) | `src/app/<경로>/page.tsx` | 어휘 10종은 보장의 **바닥이지 천장이 아니다** |

**소스에 없는 것 — 여기서 찾지 마라.** 아래는 DB 에 살고 콘솔·`@zalkera/client` 가 다룬다. 소스는 그것을 **가리킬 뿐**이다.

| 고치려는 것 | 실제 거처 |
|---|---|
| 브랜드 색·폰트·모서리·밀도 | DB 사이트 설정 — 콘솔의 "말로 색 바꾸기"가 **값만** 바꾼다. 소스 쪽에 있는 것은 `src/app/globals.css` 의 `@theme` **기본값**과 `src/app/layout.tsx` 의 주입 배선뿐이다(§테마 주입 배선) |
| 회사명·연락처·주소·사이트 기본 SEO | DB — `getSiteConfig()` |
| 상품·가격·재고·카테고리·후기·예약 슬롯 | DB — 콘솔·`@zalkera/client`. 소스는 **handle 로 가리킬 뿐** |
| 게시글(블로그) | DB — `listPosts`/`getPost` |

**확인은 `next dev` 로 한다.** `content/**` 의 json 은 `content/index.ts` 가 정적 import 하므로 파일을 고치면 HMR 로 화면이 바로 바뀐다. 런타임 `fs` 읽기로 바꾸지 마라 — HMR 도 `next build`(standalone) 트레이싱도 함께 잃는다.

**콘텐츠 계약을 안 지킨 레포도 정상으로 돈다.** 문구를 tsx 에 직접 든 레포도 개시·발행·"말로 고치기"가 전부 동작한다 — 위 표는 강제가 아니라 **이 레포가 그렇게 지어져 있다는 사실**이고, 검사(`npm run validate` 의 N 규칙)는 `package.json` 의 `"zalkera": {"content": "source"}` 를 **스스로 선언했을 때만** 에러로 격상된다.

## 스택

- **Next.js App Router**(React 19 · TypeScript). 서버 컴포넌트 우선, 공개 페이지는 ISR/static.
- **Tailwind CSS v4 + `@theme` 테마 토큰.** 스타일은 유틸리티 클래스로만 표현한다.
- 도메인 데이터는 전부 **`@zalkera/client`** 로 조회한다(직접 fetch·하드코딩 금지 — 이 규칙의 근거·범위는 프롬프트).
- 기계가독 선언: `package.json` 의 `"zalkera": {"styling": "tailwind-tokens", "content": "source"}`. 이 두 줄이 아래 색 규약과 위 콘텐츠 좌표를 **이 레포에 한해** 계약으로 만든다(validator 가 이걸 읽어 규약 위반을 에러로 막는다 — 선언하지 않은 레포에는 안 들이댄다).

## 색·스타일 규약 (tailwind-tokens 계약)

원리(memo65 §3): **요소가 "어떤 토큰"을 쓸지는 코드가 정하고, 그 토큰의 "값"은 config(테마)가 정한다.** 그래야 콘솔의 '말로 색 바꾸기'가 코드 수정 없이 값만 바꿔 즉시 반영된다. 리터럴 색을 코드에 박으면 이 계약이 깨진다.

- 브랜드색은 **토큰 유틸리티**로: `bg-primary`·`text-primary`·`border-primary` 등. 테마 토큰 키는 `primary`/`secondary`/`background`/`text`.
- 중립색은 이 템플릿에서 **slate 스케일**로 통일했다(`text-slate-600`·`bg-slate-50` 등). 이건 계약이 아니라 **이 예시의 선택**이고, 이유는 중립 스케일을 하나로 고정해 두면 화면에 남는 유일한 색이 테넌트의 액센트(`primary`) 하나가 되어 테넌트마다 인상이 갈리기 때문이다. 다른 판단이면 다른 스케일을 써도 된다 — 계약이 요구하는 것은 "브랜드색이 토큰을 경유한다"는 것뿐이다.
- **리터럴 색 금지**: `bg-[#3b82f6]` 같은 className 임의값이나 JSX 인라인 `style={{color:"#..."}}` 로 브랜드색을 하드코딩하지 마라. 리터럴 색·폰트 값은 오직 `src/app/globals.css` 의 `@theme` 안에서 토큰 정의로만 산다.
- 죽은 레거시 CSS 변수(`var(--oneq-*)` 등) 참조 금지 — 대응 유틸리티(`bg-primary` 등)로 대체하라.
- 정당한 **동적** 스타일(런타임 계산 위치·크기 등)은 CSS 변수 주입(`style={{"--x": v}}`) 또는 파일에 `// zalkera-allow-inline-style: <이유>` 마커로 억제한다(색 하드코딩 회피 목적 아님).

## 구조

- 홈 = `src/app/page.tsx`. 라우트 = `src/app/**/page.tsx`(App Router 규칙).
- **단일 CSS**: `src/app/globals.css`(`@import "tailwindcss"` + `@theme` 토큰) **하나만** 둔다. root layout(`src/app/layout.tsx`)이 이 파일을 import 한다. 다른 `.css` 파일을 만들지 마라.
- 세션·쓰기·개인화 UI 는 클라이언트 컴포넌트(아일랜드)로 내리고, 공개 SEO 페이지(홈·목록·상세·콘텐츠)는 ISR/static 으로 유지한다(요청마다 동적 SSR 금지).
- `"use client"` 파일에서 `@zalkera/client` 나 서버 클라이언트 싱글턴을 **값으로** import 하지 마라(타입만 `import type` 으로). baseUrl·토큰 노출을 막는 경계다.

## BFF 라우트 — 교차사이트 위조 가드 (지우지 마라)

**변이 메서드(`POST`·`PUT`·`PATCH`·`DELETE`)를 export 하는 라우트 핸들러는 본문의 첫 구문이 가드여야 한다.**
막는 것은 `evil.example` 의 자동제출 `<form>` 이 브라우저를 `POST https://이사이트/api/...` 로 **직접**
보내는 경로다. 그 경로에서는 우리 클라이언트 번들이 **한 줄도 실행되지 않으므로** `sessionStorage` 로는
못 막는다 — 서버가 볼 수 있는 증거는 요청 헤더뿐이다. 실제로 실행으로 증명된 공격이다.

```ts
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);      // ① 첫 구문. 앞에 아무것도 두지 마라
    if (blocked) return blocked;
    const badType = assertJsonContentType(req); // ③ 본문을 읽는 라우트만
    if (badType) return badType;
    ...
}
```

- **왜 "첫 구문"인가**: `cookies()` 변이는 뒤에 만드는 `NextResponse` 에 그대로 합류한다. 가드보다 앞에
  쿠키를 쓰면 **403 차단 응답에 `Set-Cookie` 가 실려** 방어가 무의미해진다(실측 재현됨).
- **가드를 감싸지 마라.** 헬퍼로 한 겹 두르거나(`const guard = (r) => assertSameOrigin(r)`) 중첩 함수 안에
  넣으면 검사기가 못 따라가 **error 로 막는다**(안전한 방향의 실패다). 부르는 자리에서 직접 불러라.
  `try { … }` 로 감싼 본문은 괜찮다 — 가드가 여전히 먼저 돈다.
- **읽기 `GET` 은 면제**다. 단 그 근거가 "이 코드베이스에 CORS 헤더가 0건이라 교차 오리진 JS 가 응답을
  못 읽는다"이므로 — **`Access-Control-Allow-Origin` 을 추가하지 마라.** 면제의 전제가 무너진다.
- **정당한 예외**는 파일 **상단**에 `// zalkera-allow-cross-origin: <이유 한 줄>`. 검사기가 면제 목록을
  항상 출력한다(조용히 늘지 않게). 이유가 두 줄이면 목록에 잘려 찍히니 한 줄로 쓰고 부연은 마커 밖에.
- **`Sec-Fetch-Site` 를 `!== "cross-site"` 로 쓰지 마라.** 플랫폼 존이 `{tenant}.{zone}` 이라 **테넌트끼리
  서로 `same-site`** 다 — 그 관용구는 테넌트-대-테넌트 위조를 열어 둔 채 "고쳤다"고 기록된다.
- **스킴을 비교하지 마라.** 서빙 오케스트레이터가 `x-forwarded-proto: "http"` 를 넣는데 공개 스킴은
  https 다. 비교하면 전 사이트가 즉시 죽는다. 호스트만 본다.
- **프리뷰 모드는 쓰기를 막는다 — 그리고 그 판정은 `src/middleware.ts` 한 곳에 있다.**
  새 라우트는 **아무것도 안 해도 덮인다**(선언 형태·경로·파일명과 무관하다). 라우트 안의
  `if (isPreview())` 는 이중 방어로 남겨 둔 것이지 그것이 집행 지점은 아니다.
  막으면 안 되는 사정이 있으면 **두 곳**을 같이 고쳐라 — `src/lib/previewGuard.ts` 의
  `PREVIEW_WRITE_ALLOW` 에 경로를 넣고, 그 라우트 파일 **상단**에
  `// zalkera-allow-preview-write: <이유 한 줄>`(위 교차출처 마커와 같은 형태). 둘이 어긋나면
  `previewGuard.test.ts` 가 빨개진다.
  **면제는 출구가 아니라 기록이다** — "운영 데이터를 써도 좋다"고 적는 일이니, 그 라우트가 **누구의**
  데이터를 건드리는지 확인하고 사유를 사람이 읽을 수 있게 남겨라.
  ⚠ 종전에는 이 규약을 소스를 **텍스트로 파싱**해 재는 시험이 있었고 **네 판 연속 뚫렸다.**
  그 이력은 `src/lib/previewGuard.ts` 머리말에 있다 — 파싱으로 되돌리지 마라.
- 소셜 로그인은 **서버 `state` 쿠키 대조**가 한 겹 더 있다(`/api/auth/social/start` 발행 → 교환에서 대조 →
  즉시 소각). `CallbackHandler` 의 `sessionStorage` 대조는 **UX 지 방어가 아니다** — 그걸 방어로 세지 마라.
  state 쿠키는 `sameSite: "lax"` 여야 한다(`strict` 면 authorize 복귀에서 안 실려 로그인이 깨진다).
- `readJsonBody` 는 **형식 가드**다. `Content-Type` 을 보지 않으므로 CSRF 방어로 쓰지 마라.

판정 규칙의 근거는 `src/lib/crossOrigin.ts` 주석에, 관용구는 `src/lib/http.ts` 에 있다.

## 방문자 IP 선언 — 서버에서 주문·문의 API 를 부를 때 (지우지 마라)

**서버 사이드(RSC·route handler)에서 부르면 백엔드가 보는 IP 는 방문자가 아니라 이 서버다.** 그래서
`@zalkera/client` 의 IP 민감 호출 9종(`getOrder`·`getShipment`·`cancelOrder`·`startPayment`·`confirmPayment`·
`completeOrder`·`submitInquiry`·`submitLead`·`recordPostView`)에는 **원 방문자 IP 를 선언**해야 한다.

```ts
import {visitorIp} from "@zalkera/client";
import {headers} from "next/headers";

const access = {accessToken, phone, context: {clientIp: visitorIp(await headers())}};
```

- **값은 반드시 `visitorIp()` 로 뽑아라.** `x-forwarded-for` 첫 홉을 직접 쓰면 **방문자가 위조할 수 있다**
  — 선언이 있는 척하면서 값이 거짓이면 없느니만 못하다(로그·rate-limit 이 공격자가 고른 값을 믿는다).
- 변수 경유도 정상이다: `const ip = visitorIp(await headers()); … context: {clientIp: ip}`.
- 안 하면 무엇이 나빠지나 — **축마다 결과가 다르다.**
  - **주문 인가**(`getOrder`·`getShipment`·`cancelOrder`·결제·완료): 백엔드가 **실패만** 센다.
    그래서 이 사이트 게스트가 한 IP 로 뭉치면, 남의 오입력이 쌓인 뒤 내가 오타 한 번에 403 대신
    **429** 를 받는다(**IP 축**은 성공을 막지 않는다). 그리고 스캐너 탐지가 주문번호 축 하나로 줄어든다.
  - **문의·리드**(`submitInquiry`·`submitLead`): **모든 호출을 센다**(성공도). 한도가 **각각 다르다** —
    문의 60초 3건 · 리드 60초 30건. 뭉치면 **그 사이트의 4번째 문의 제출이 429** 다 — 이쪽이 훨씬 날카롭다.
  - **게시글 조회수**(`recordPostView`): 레이트리밋이 아니라 **조회 dedup** 이다. 키가
    `sha256(IP|User-Agent)` 이고 **게시글별 · UTC 달력 하루** 단위다. 그 UA 는 **방문자 것이 아니다** —
    서버가 백엔드를 부르므로 브라우저 UA 는 안 넘어가고 Node fetch 기본값은 상수다. 그래서 뭉치면
    429 가 아니라 **게시글마다 하루 한 건**으로 접힌다(서빙 인스턴스 수만큼) — 집계가 조용히 죽는다.

> ⚠ **선언과 무관하게 429 가 날 수 있는 축이 하나 더 있다** — 위 목록과 **별개**라 여기 따로 적는다.
> 주문번호 축은 그 주문번호로 실패가 5회 쌓이면 **연락처가 맞는 구매자도 10분간 429** 로 **선차단**한다
> (백엔드가 인정한 표적 잠금 비용이다). 방문자 IP 를 선언해도 이 축은 **안 사라진다.**
> 단 **게스트 한정**이다 — 로그인 회원은 이 게이트를 통째로 건너뛰고, 조회 성공 시 카운터를 지운다.
> 그러니 **성공 경로의 429 처리를 걷어내지 마라** — "우리는 선언했으니 성공은 429 가 안 난다"는 거짓이다.

> ⚠ **지금은 아직 실효하지 않는다.** 백엔드는 스토어프론트 키로 인증된 요청에서만 이 선언을 승격하는데,
> 상용 스토어프론트는 컷오버 전이라 무키다(백엔드 `DeclaredClientIp` 가 그렇게 적고 있다). **그래도 지금
> 넣어 둔다** — 컷오버 날 코드 변경 0 으로 자동 실효하고, 소스는 그때 고칠 수 없는 자리에 가 있다.

> 이 규칙을 검사하는 도구는 **잘커라 레포 전용**이라 이 소스에는 들어 있지 않다(있었던 적이 있는데,
> 정규식 판정이 **정상 코드를 실패시키는** 형태를 다 못 막아 걷었다 — 남의 빌드를 막는 쪽이 못 잡는
> 쪽보다 비싸다). 그러니 이 절이 곧 규칙이다: **IP 민감 호출 9종에는 `visitorIp()` 로 뽑은 `clientIp` 를
> 넘긴다.** 값을 헬퍼로 빼도 되고 조건부로 채워도 된다 — **출처가 `visitorIp()` 이면 된다.**

## 능력 ↔ 구현 좌표 — **안 쓰는 것을 지우는 법**

이 골격은 **최대 조합**으로 배선돼 있습니다(기업 홈페이지 + 쇼핑몰 + 예약). 사이트의 성격은 선언이 아니라
**`@zalkera/client` 를 어떻게 부르는가**로 구성되므로, 자기 조합을 만드는 방법은 **안 쓰는 능력의 파일을
지우는 것**입니다. 지워도 플랫폼 계약은 안 깨집니다 — 아래 "중립 배선"만 건드리지 마십시오.

| 능력 | 지우면 되는 것 | 남는 client 호출 |
|---|---|---|
| **기업 홈페이지** (항상 필요) | — | `getSiteConfig` · `content/` 로더 |
| **쇼핑몰** | `src/app/{cart,checkout,payment,orders,mypage,login,auth}/` · `src/app/api/{cart,checkout,orders,payment,auth,reviews,consents}/` · `src/app/products/` · `src/app/c/` · `src/components/{Review*,LogoutButton,MarketingConsent}.tsx` · `src/lib/{oauth,oauthState,session,authHint,useAuthHint}.ts` · 헤더의 장바구니·로그인 | `listProducts` · `getProduct` · `listProductCategories` · 장바구니·주문 계열 |
| **예약** | `src/app/api/booking/` · `src/components/ProductRail.tsx`(시술 진열) | 예약 슬롯 계열 |
| **게시판·블로그** | `src/app/blog/` · `src/app/api/posts/` | `listPosts` · `getPost` |
| **문의·리드** | `src/app/contact/` · `src/app/api/{inquiry,lead}/` · `src/components/LeadForm.tsx` | 리드 제출 |

**중립 배선 — 지우지 마십시오** (능력이 아니라 플랫폼 계약입니다):
`src/lib/theme.ts` + layout 의 테마 주입 · `src/app/media/[id]/` 프록시 · `src/app/api/revalidate/` ·
`src/lib/{crossOrigin,safeUrl,env,buildEnv}.ts` · `robots.ts`·`sitemap.ts` · `src/lib/content.ts`.
이 절 아래 "테마 주입 배선 — 지우지 마라"와 "BFF 라우트 — 교차사이트 위조 가드"가 그 상세입니다.

**표현은 지우는 게 아니라 다시 씁니다.** 헤더·푸터는 사이트가 소유하는 외양이라, 반응형 드로어든
스티키든 메가메뉴든 자기 것으로 새로 쓰면 됩니다 — 데이터로 표현되지 않는 자리라 **하드코딩이 정답**입니다.
어떤 선언도 레이아웃을 강제하지 않습니다. (우리 예제 계보를 만드는 쪽이라면: 팩은 각자 **자기 소스를
온전히** 가지므로 팩끼리 얼굴이 갈리는 것이 의도이고, 전송·인증 배선만 바이트 동일로 잠깁니다 —
그 판정기와 목록은 예제 레포 쪽에 있고 이 zip 에는 안 실립니다.)

## 레시피 ↔ 이 레포의 구현 좌표 (교본으로 읽을 때)

레시피는 `@zalkera/client` 의 **`llms.txt` §5.1(산출물 규범)** 이다(`npm install` 후 `node_modules/@zalkera/client/llms.txt`). 아래는 그 규범이 **이 레포 어디에 구현돼 있는지**의 좌표다 — 규범을 새로 만드는 자리가 아니라 찾아가는 자리이고, 규범의 정본은 llms.txt 와 그것이 운반하는 백엔드 `doc/contracts/aeo-surface-guarantees.json` 이다(사본을 여기 늘리지 않는다).

왜 이 표가 필요한가: 규범만 읽으면 "그래서 어디에 쓰나"가 안 잡히고, 코드만 읽으면 "이게 계약인지 이 템플릿의 취향인지"가 안 갈린다. 둘을 잇는 좌표가 있어야 새 템플릿을 짓는 사람·AI 가 **베끼지 않고 이해해서 옮길** 수 있다.

| §5.1 규범 | 이 레포의 구현 |
|---|---|
| JSON-LD 삽입 자체(안전 직렬화·헬퍼 — 재발명 금지) | `src/components/JsonLd.tsx` |
| 상품 상세 = `Product` + variant 마다 `Offer`(+후기 있으면 `AggregateRating`) | `src/app/products/[slug]/page.tsx` · `productJsonLd` |
| 홈 = `Organization`(점포면 `LocalBusiness`·뷰티샵이면 `BeautySalon`) | `src/app/page.tsx` · `organizationJsonLd`(`config.businessType` 으로 좁힌다) |
| 목록·상세엔 `BreadcrumbList` | `breadcrumbJsonLd` + 각 라우트 `page.tsx` |
| 목록 라우트의 `ItemList`(그리는 그 순서·그 항목 · 0건이면 미산출) | `src/app/products/page.tsx` · `src/app/blog/page.tsx` · `itemListJsonLd` |
| 예약 유형의 목록 보장 = 개시된 페이지 어딘가의 `ItemList`(운반체는 소스가 정한다) | `src/app/products/page.tsx` · `src/components/ProductRail.tsx` |
| CMS 고정 페이지 = `WebPage` + `BreadcrumbList` | `src/app/[slug]/page.tsx` · `webPageJsonLd` |
| `FAQ_LIST` 섹션 = `FAQPage` 직접 산출 | `src/components/sections/FaqListSection.tsx` |
| `sitemap.ts`·`robots.ts` 필수 · 목록 라우트 등재 · 빈 목록 미등재 | `src/app/sitemap.ts` · `src/app/robots.ts` |
| 절대 URL(JSON-LD·sitemap·robots) | `src/lib/site.ts` 의 `siteUrl()` — 모든 그래프가 이걸 통과한다 |
| ISR 유지(그래프를 넣는다고 동적으로 만들지 않는다) | 각 공개 `page.tsx` 의 `force-static` + `revalidate` · validator **C1/C1b** 가 회귀를 막는다 |
| 이미지는 `/media/{id}` 안정 URL · presigned 금지 | `src/app/media/[id]/route.ts`(302 Location 만 넘긴다 — 바이트를 런타임에 안 태운다) |
| `Review`·루트 `AggregateRating` **부정 보장**(내면 안 된다) | `src/components/sections/TestimonialsSection.tsx` — 그래프를 안 내는 것이 정답이다 |
| 카테고리 목록 = `CollectionPage`(`mainEntity` 로 `ItemList`) + `BreadcrumbList` | `src/app/c/[slug]/page.tsx` · `collectionPageJsonLd` |

**아직 안 나가는 것도 적어 둔다**(교본이 실물보다 앞서면 그것도 갈라짐이다): 영업시간(`openingHours`)은 백엔드에 **저장 자리만** 섰고 이 템플릿의 렌더 소비는 아직 없다 — llms.txt §5.1 에도 규범으로 안 실려 있다(본보기가 못 지키는 규범은 공표하지 않는다).

반대 방향의 시차도 적어 둔다: 카테고리 라우트(`/c/{slug}`)는 **이 레포에 실재하고** 위 표에 좌표가 있지만, llms.txt **§5.1 의 규범 문구로는 아직 안 실려 있다**(레시피는 §4.1-a 에 있다). 실물이 먼저 서고 공표가 뒤따르는 순서라 갈라짐이 아니다 — 순서가 반대면 그때가 갈라짐이다.

## UI 프리미티브·아이콘

- `cn()`(`src/lib/cn.ts`) = `twMerge(clsx(...))`. 조건부 클래스 + **덮어쓰기**를 둘 다 처리한다
  (`cn("px-4", className)` 에서 호출부의 `px-6` 이 이긴다). 문자열 이어붙이기로 되돌리지 마라 — 덮어쓰기가
  조용히 안 먹는다.
- 변형은 **cva** 로 선언한다(`src/components/ui/Button.tsx` 가 본보기). 조건문으로 클래스 문자열을 조립하지 마라.
- 있는 것(전부 `src/components/ui/` 아래): `Button.tsx`(버튼) · `buttonClasses(variant)`(`<Link>`·`<a>` 용
  문자열) · `Card.tsx` · `Icon.tsx`.
- 아이콘은 `src/components/ui/Icon.tsx` 의 **큐레이션 맵(32키)** 만 그린다. 미지 이름은 아이콘 영역을 생략한다(fail-soft).
  임의 문자열·전체 lucide 동적 로딩은 하지 않는다. 아이콘은 `currentColor` 를 상속하므로 색·크기는
  className(`size-5 text-primary`)으로만 준다 — 그래야 테넌트 색이 아이콘까지 관통한다.
- 새 프리미티브가 필요하면 shadcn/ui 에서 **발췌**한다(CLI 상시 설치 아님). 발췌물은 아래 재작성 표를 적용하고
  `asChild`/`Slot` 을 제거해 **Radix 의존 0** 을 유지한 뒤 `src/components/ui/` 에 커밋한다.

### shadcn 발췌 재작성 표

shadcn 소스는 자기 변수층(`--card`·`--muted-foreground` …)을 전제한다. **그 층은 반입하지 않는다** — 토큰
레이어가 둘이 되면 `<html>` inline 주입(테넌트 색)의 우선순위 추론이 사람 머리에 얹히고, 색 변경이 조용히 죽는
표면이 된다. 발췌 시 좌변을 우변으로 기계적으로 바꾼다. validator **S6** 가 좌변 잔존을 error 로 막는다.

| shadcn | 우리 |
|---|---|
| `bg-card` · `bg-popover` · `bg-muted` · `bg-accent` | `bg-surface` |
| `text-card-foreground` · `text-popover-foreground` · `text-accent-foreground` | `text-foreground` |
| `text-muted-foreground` | `text-muted` |
| `bg-destructive` / `text-destructive` | `bg-danger` / `text-danger` |
| `ring-ring` · `focus-visible:ring-*` | `ring-primary` |
| `border-input` | `border-border` |

우리 `muted` 는 **글자색**이고 shadcn 의 `muted` 는 배경이다 — 그래서 `bg-muted`/`text-muted-foreground` 가
서로 다른 토큰으로 갈라진다.

## 섹션 렌더

고정 페이지는 **섹션 배열**로 그린다 — 그 배열의 정본이 `content/pages/<slug>.json` 이고(§콘텐츠 좌표),
페이지당 1파일·배열 순서가 화면 순서·`config` 는 **객체**다. 콘텐츠가 마크업이 아니라 계약 데이터로
오므로 "말로 고치기"가 편집 대상을 파일 하나로 좁힌다. **마크업에 문구를 하드코딩하면 이 경로가 죽는다.**

- 어휘 정본은 **백엔드 레포의 `doc/contracts/section-vocabulary.json`** 이고, `@zalkera/client` 의
  `SECTION_CONTRACT` 는 그것을 npm 으로 실어 나르는 **운반체**다. 그 KDoc 은 설치본
  `node_modules/@zalkera/client/dist/index.d.ts` 에서 읽는다 — 패키지는 소스(`sections.ts`)를 배송하지
  않으므로 여기서 그 파일을 찾지 마라(선언 파일이 KDoc 을 그대로 싣고 온다).
  계약은 `contractRev` 로 자란다 — 현재 **rev 7**(`SECTION_CONTRACT_REV`). 오른 자국은 이렇다:
  rev 2·3·5 는 조회형 섹션(`SERVICE_MENU`·`BOOKING_CTA`)의 산출과 필수 참조를 조이던 세대이고,
  rev 4 는 참조 방언(`dialects`)과 콘텐츠 파일(`contentFile`)을 1급으로 올렸다.
  rev 6 = 그 조회형 섹션 둘을 **어휘에서 삭제**(진열은 소스가 직접 호출한다 · memo142) ·
  rev 7 = **DB 방언 소거**(그 거처인 `page_section` 계열이 퇴역했다 · memo144).
  **rev 6 = 그 조회형 둘을 어휘에서 삭제 — 12종 → 10종.**

  **경계 규칙**(memo142 §1): *값이 콘텐츠 파일에 사는 저작물 = 선언 섹션 / 값이 업무 DB 에 살고 화면이
  비추기만 하는 조회 = 소스가 `@zalkera/client` 를 직접 호출.* rev 3·5 가 "조회형 섹션은 참조를 반드시
  실어라"로 조이던 잣대가 **"조회형 섹션을 싣지 마라"로 반전**됐다. 절반 선언(`{ categorySlug }`)은
  "어디에"만 선언에 두고 "어떻게"(카드 그리드·필드·개수)를 공유 렌더러에 얼려 버렸는데, 그것이
  **자연어로 다양한 디자인을 만든다**는 방향과 반대였다. 따름정리로 **배송물은 상품 handle 이든 갈래
  slug 든 업무 축의 고유명사를 어디에도 박지 않는다**(`리빙`·`시술`은 사장이 정할 이름이다).
  자기 소스가 자기 카탈로그를 tsx 안에서 가리키는 것은 정당하다 — 금지되는 것은 배송물의 선언이다.
- **표기는 하나다 — 거처가 하나만 남았기 때문이다(rev 7).** 종전에는 방언이 둘이었다: DB
  (`page_section.config`)가 자기가 발급한 숫자 id 를, 소스가 사람이 읽는 참조를 썼다. **그 DB 거처가
  퇴역했다**(memo144 — `page`·`page_section`·`menu` 계열 삭제). 남은 표기는 소스 것 하나다.
  ⚠ 그래도 **옮겨 적기는 계속 필요하다.** 아래 §어휘 표(그리고 `SECTION_CONTRACT`)의 `config` 선언은
  여전히 `assetId` 같은 **컬럼 시절 키 이름**을 쓴다 — 그 이름이 계약의 식별자라 안 바꿨다. 콘텐츠
  파일에는 `dialects.reference` 의 대응대로 `asset`(= `public/` 루트 절대 경로)으로 적는다.
  키의 **의미**는 같다. 상품 참조는 rev 6 에서 **금지 키 형상**이 됐다(위 경계 규칙).
- **계약 영역 — 어휘에 있는 섹션 타입의 `config` 키는 지어내지 마라.** 이 표면에는 유형별 AEO/SEO 최소
  보장이 걸려 있고, 콘솔 폼·시드·렌더러가 같은 키를 읽어 데이터를 주고받는다. 키를 지어내면 콘솔이 넣은
  값이 렌더러에 안 읽히고 그 보장도 함께 죽는다.
- **자유 영역 — 그 밖의 컴포넌트·라우트를 새로 만드는 것은 정상 경로다.** Next.js 라우트도 컴포넌트도 수에
  제한이 없고, 어휘 10종은 보장의 **바닥이지 천장이 아니다**. **진열이 그 실물이다** — `ProductRail` 은
  계약 표면이 아니라 자유 영역의 컴포넌트이고, 그래서 마음대로 뜯어고칠 수 있다. 경계 판정은 하나다 — **여기에 보장이 걸려
  있나.** 걸린 표면이면 계약을 그대로 따르고, 아니면 자유롭게 짜라.
- `config` 파싱은 **`@zalkera/client` 헬퍼로만**(`readConfig`·`asString`·`asObjectArray`·`asHandle`·
  `asHandleArray`·`assetPath`). 이 레포에 파서 사본을 새로 만들지 마라 — 사본이 갈라지면 '섹션 하나가
  사이트를 죽이지 않는다'는 계약이 조용히 깨진다(종전 `sections/` 아래 사본이 그렇게 갈라져 회수했다).
  **절대 throw 하지 않는다** — 필수 필드가 없으면 그 섹션만 안 그리고 페이지는 산다.
- `SectionRenderer` 의 `default:` 는 **조용히 null** 이다. 계약이 스큐 내성이라 타입이 늘어도 옛 사이트가
  안 깨지고, **타입이 빠져도**(rev 6) 그 값을 적어 둔 옛 콘텐츠 파일이 페이지를 죽이지 않는다.
  여기서 에러·경고를 내지 마라.
- **섹션 이미지**는 레포 `public/` 루트 절대 경로(`"asset": "/images/hero.png"` → `assetPath()`),
  **상품 커버**는 DB 가 발급한 `coverAssetId` → `mediaSrc()` 프록시다(카탈로그는 레인 B).
  모든 href 는 `src/lib/safeUrl.ts` 를 태운다(저장형 XSS 방어).
- `LEAD_CTA` 섹션은 `id="lead"` 앵커를 갖는다 — 원페이지 랜딩의 히어로 CTA(`ctaHref: "#lead"`)가 여기를 가리킨다.
  이 id 를 지우면 간판 버튼이 **조용히 아무 데도 안 간다**.
- `FAQ_LIST` 는 네이티브 `<details>/<summary>` 다 — JS 0·접근성 내장·**닫힌 답변도 SSR 마크업에 실린다**.
  아코디언 라이브러리로 바꾸지 마라. `FAQPage` JSON-LD 를 함께 낸다.
- **진열(상품 목록·예약 CTA)은 섹션이 아니다.** `ProductRail`(또는 그것을 본뜬 자기 컴포넌트)이
  `listProducts()`·`listProductCategories()` 를 직접 부르고, **화면과 같은 배열**에서 `itemListJsonLd` 를
  만들어 함께 낸다(그래프가 두 벌이 되면 갈라진다 — `FAQ_LIST` 와 같은 원리). **0건이면 `return null`**:
  빈 진열대는 방문자에게 거짓이고, "상품을 등록하면 여기 표시됩니다" 같은 안내도 넣지 마라 — 그 문장의
  독자는 사장이고 사장의 표면은 콘솔이다.
- `TESTIMONIALS` 에 `Review`·`AggregateRating` 을 내지 않는다 — 자사 후기 별점은 정책 위반이다. 누락이 아니라 결정이다.

## 테마 주입 배선 — 지우지 마라 (L1 의 심장)

root layout(`src/app/layout.tsx`)이 `parseThemeColors(...)` 로 테넌트 색을 읽어 **`<html>` 의 inline style 로
주입**한다. `globals.css` 의 `@theme` 토큰(`--color-primary` 등)이 그 기본값이고, inline style 이 그걸 덮는다.

**이 두 조각이 L1("말로 색 바꾸기")의 전부다.** 하나라도 지우면 콘솔에서 색을 바꿔도 **성공 보고만 나오고
화면은 그대로**인 거짓성공이 된다 — 사용자는 무엇이 고장났는지 알 길이 없다. validator **S8** 이 이걸 센다
(declared 레포 전용·error).

자체 헬퍼로 직접 배선했다면 `// zalkera-allow-custom-theme-inject: <이유>` 마커로 사유를 남긴다(warning 강등).
마커는 검사를 면제할 뿐 **동작을 보장하지 않는다** — 실제 반영은 사람이 한 번 확인해야 한다.

## 서빙 산출물 계약 — `next.config` 를 다시 쓸 때 (memo145)

**잘커라가 서빙하는 소스는 빌드가 `.next/standalone` 자기완결 산출물을 내야 한다.** 우리 서빙 박스는 `next start` 가 아니라 그 산출물을 `node server.js` 로 띄운다(:ro 마운트).

- 실무적으로는 `next.config.ts` 의 **`output: "standalone"`** 한 줄이다. **지우지 마라** — 지우면 `next build` 는 성공하고 서빙 게이트만 반려한다(exit 4). 빌드가 그린이라 눈에 안 띄는 종류의 고장이다.
- `output: 'export'`(정적 export)·`distDir` 변경도 같은 결과다.
- **이 파일 자체는 잠겨 있지 않다.** 이미지 도메인·리라이트·헤더는 정당한 편집이고 우리는 키 단위로 검사하지 않는다 — 재는 것은 파일이 아니라 **빌드가 실제로 낸 것**이다(`verify-zip` ⑧ · CI · 서빙 박스 exit 4).
- **자체 호스팅(BYO)이면 해당 없다.** 이 요건의 근거는 어휘가 아니라 **누가 서빙하는가**다.

**런타임 파일시스템은 읽기 전용이다.** 아티팩트는 `:ro` 로 마운트되고 쓰기 가능한 곳은 `.next/cache`(tmpfs·컨테이너별 휘발)뿐이다. 런타임에 파일을 쓰는 코드(업로드 저장·로그 파일·생성 캐시)를 두지 마라 — 빌드는 통과하고 서빙 중에 죽는다. 저장이 필요하면 백엔드 API 를 쓴다.

## 코드 포맷 — 네 기본값이 아니라 이 레포의 값을 써라

고치고 나서 **`npm run format`** 한 줄을 돌려라. 그게 전부다. 아래 표는 왜 그래야 하는지의 근거이고, 값을 외워 손으로 맞추라는 뜻이 아니다.

| 항목 | 이 레포 | 흔한 기본값 |
| --- | --- | --- |
| 들여쓰기 | **4칸** | 2칸 |
| 객체 중괄호 안 공백 | **없음** `{a, b}` | 있음 `{ a, b }` |
| 줄 길이 | **120** | 80 |
| 따옴표 | **큰따옴표** | 작은따옴표 |

정본은 `.prettierrc.json` 이다. 값이 궁금하면 그 파일을 읽어라 — 이 표는 사본이라 언젠가 낡는다.

**왜 적어 두는가.** 네 기본 포맷이 위 값과 다르다. 그대로 저장하면 **고친 줄이 아니라 파일 전체가 바뀐 것으로 보이고**, 사람이 diff 에서 무엇이 실제로 바뀌었는지 못 읽는다. 그러면 검수는 눈으로 넘어가고, 그 위에 얹힌 규약 검사(위 X·N·C 축)는 사람이 못 본 것을 대신 봐 주지 않는다.

⚠ **이 규약은 CI 가 재지 않는다 — 네가 돌려야 한다.** 재게 하지 않는 것이 의도다: 이 저장소의 CI 는 백엔드 배포 게이트가 결과를 읽으므로, 포맷 하나가 어긋났다고 사이트 배포를 막으면 대가가 이득보다 크다. 그래서 집행을 기계가 아니라 **너**에게 맡긴다. 확인만 하려면 `npm run format:check`, 고치려면 `npm run format`.

두 스크립트 다 `--cache` 를 쓴다. **범위**(무엇을 재는가)는 설정(`.prettierignore`·`.gitignore`)이 정하고, **건너뛰기**(지난번과 안 바뀐 파일)는 그 `--cache` 플래그가 정한다. 스크립트가 정확히 무엇인지는 **`package.json` 을 읽어라**(여기 옮겨 적으면 낡는다).

⚠ **`--cache` 없이 prettier 를 부르면 캐시 파일이 지워진다**(실측 — `--check`·`--list-different`·`--write` 전부). 그러면 다음 `npm run format` 이 전 파일을 다시 읽는다(배송 트리 267ms → 910ms · 사진 쌓인 트리 285ms → 2429ms). 직접 부를 일이 있으면 `--cache` 를 같이 주라.

**무엇이 바뀔지는 세지 말고 물어봐라.** 무시 규칙이 한 파일에만 있는 게 아니라서(`.prettierignore` 도, `.gitignore` 도 본다) 문서로 세면 틀린다.

```bash
npx prettier --list-different --cache .   # 아무것도 안 나오면 바꿀 것이 없다는 뜻이다
```

**`npm run format` 이 실패하면 네 편집이 원인이 아닐 수 있다.** 이 명령은 `src/` 밖도 보므로, **이 명령이 보는 자리에**(무시 목록 밖에) 문법이 깨진 파일이 하나 있으면 명령 전체가 `rc 2` 로 선다 — 무시되는 자리의 깨진 파일은 `rc 0` 이다(둘 다 실측). 그때는 위 조회 명령으로 **어느 파일인지 먼저 확인해라** — 오류 줄이 파일명을 말해 준다.

⚠ **이 절은 세 판 연속 틀린 채로 심의에 걸렸다.** ⑴ "CI 가 잰다" — CI 는 안 쟀다. ⑵ "루트 실행이 워크플로·문서까지 재포맷한다" — 무시 목록이 이미 막고 있었다. ⑶ "범위의 정본은 한 곳" — prettier 는 `.gitignore` 도 본다. 셋 다 **도구 동작을 절대문으로 단정**한 문장이었고, 셋 다 명령 한 줄로 반증됐다. 그래서 이 절은 범위를 세지 않는다 — 세는 일은 기계가 더 잘한다.

## 검증

검사기가 **둘**이고, 재는 대상이 다르다. 하나로 합치지 마라 — 소스가 규약대로여도 산출물에 그래프가 안 나갈 수 있고, 그 반대도 가능하다.

**① 소스 검사 — `npm run validate`**(`scripts/validate-storefront.mjs`, CI 게이트). 어휘 사본이 여러 레포에 흩어져 있어 사람 주석 규약으로는 갈라짐을 못 막으므로, 기계가 센다 — **C2** 는 렌더러 switch 가 `SECTION_CONTRACT` 를 덮는지, **S6** 는 남의 토큰 어휘가 섞였는지, **N1~N5** 는 위 콘텐츠 좌표의 형상(매니페스트·섹션 형상·참조 무결·`sortOrder` 잔존·id 형 직기입)을 본다. **X1** 은 변이 라우트 핸들러마다 교차사이트 가드가 **본문 첫 구문**에 있고 반환값이 차단에 쓰이는지(위 BFF 절), **X2** 는 읽기 GET 면제의 전제인 "CORS 헤더 0건"이 유지되는지, **X3** 는 OAuth state 쿠키의 1회용 소각과 `sameSite` 를 본다 — X1 은 파일이 아니라 **핸들러 본문 단위**로 재므로 화살표 export·`GET` 에만 건 가드·반환값 버리기·가드를 뒤로 미루기·주석이나 문자열로 위장한 가드가 전부 걸린다. 이 레포는 `tailwind-tokens`·`content=source` 둘 다 선언한 레포라 그 위반이 **에러**로 막힌다. 최종 판정은 push 후 CI(GitHub Actions) 결과다.

**이 문서 자신도 검사 대상이다 — `D1`.** validator 가 이 파일의 백틱 경로가 실재하는지 센다. 죽은 좌표는 문서 위생 문제가 아니라 **토큰 원가**이기 때문이다: codegen 이 이 문서를 가장 먼저 읽으므로, 없는 파일을 가리키면 에이전트가 찾다가 제 좌표를 짜 버린다(2026-07-30 실측에서 실제로 났다 — 페이지 신설 지시에서 콘텐츠 계약 대신 라우트를 새로 짰다). **좌표를 고칠 때는 파일을 옮긴 커밋과 같은 커밋에서 고쳐라.** `D2` 는 짝 방향으로, `llms.txt` 가 본보기로 지목한 경로가 이 레포에 있는지 센다(본보기 레포 전용).

**② 산출물 검사 — `npm run check:aeo`**(`scripts/check-aeo-surfaces.mjs` — **얇은 wrapper 다.** 검사기 정본은 `@zalkera/client` 의 bin `zalkera-aeo-check` 로 옮겼다(memo123 §6.1): serving-orchestrator 가 발행 직후 같은 검사기를 자동으로 돌려야 하는데, 그쪽은 "외부 의존 0" 속성 때문에 툴킷에서 spawn 하므로 사본을 두면 두 검사기가 갈라진다). **개시된 사이트를 크롤해** 위 좌표표의 그래프가 실제로 나오는지 잰다. 소스를 읽지 않는 것이 요점이다: "이 섹션을 써라"는 디자인 자유를 깎지만 "개시된 페이지에서 이 그래프가 나오는가"는 아무것도 깎지 않는다 — 그래서 어떤 스택으로 짰든·어떤 섹션을 썼든 묻지 않고 나온 HTML 만 본다. 잣대는 백엔드 정본 `doc/contracts/aeo-surface-guarantees.json` 이고 이 스크립트는 그 집행자다(규범을 여기서 새로 만들지 않는다).

```bash
npm run check:aeo -- https://개시된사이트 --category BOOKING --out out/aeo-snapshot.json
```

보장 주장이 없는 사이트(외주가 자기 스택으로 짜 왔거나 업로드 태생)는 `--category` 대신 **`--site-wide-only`** 를 준다 — robots·sitemap·JSON-LD 절대 URL 만 재고 카테고리 required 는 **아예 판정하지 않는다**(어휘 준수를 주장한 적 없는 사이트에 그 잣대를 대지 않는다 — 전제 A). 발행 직후 자동 검사가 전 사이트에 쓰는 모드가 이것이다.

보장표(잣대)는 **① `--guarantees <경로>` → ② 설치된 `@zalkera/client` 안의 운반본 → ③ 형제 체크아웃(`../backend`)의 정본** 순으로 찾는다. ②가 고객 기계의 기본 경로다 — 잣대를 npm 으로 배송하기 전에는 고객 zip 에서 이 검사기가 exit 2 로 죽어 있었다(memo122 §1.3). 실행하면 어느 출처로 쟀는지 찍고, ②로 재는 자리에 ③도 있으면 둘을 대조해 갈라짐을 경고한다(운반본이 낡았다 = client 발행이 밀렸다). 잣대 해석만 확인하려면 `npm run check:aeo -- --print-guarantees`(크롤 없음·네트워크 불요) — `verify-zip.mjs` 가 zip 안에서 이걸 돌려 검사기 실행성을 기계로 센다. 종료코드 0=required 전부 통과 · 1=보장 미충족 · 2=실행 불가(인자·네트워크·표 부재). `planned`(표가 목표로 적어 뒀지만 아직 우리도 못 내는 표면)와 `conditional`(섹션을 썼을 때만 성립 — 크롤한 HTML 만으로는 "안 썼다"와 "썼는데 그래프가 없다"를 구분 못 한다)은 **실패로 세지 않는다**. 못 세는 것을 센 척하지 않는 것이 이 검사기의 규율이다.
