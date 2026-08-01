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
- 소셜 로그인은 **서버 `state` 쿠키 대조**가 한 겹 더 있다(`/api/auth/social/start` 발행 → 교환에서 대조 →
  즉시 소각). `CallbackHandler` 의 `sessionStorage` 대조는 **UX 지 방어가 아니다** — 그걸 방어로 세지 마라.
  state 쿠키는 `sameSite: "lax"` 여야 한다(`strict` 면 authorize 복귀에서 안 실려 로그인이 깨진다).
- `readJsonBody` 는 **형식 가드**다. `Content-Type` 을 보지 않으므로 CSRF 방어로 쓰지 마라.

판정 규칙의 근거는 `src/lib/crossOrigin.ts` 주석에, 관용구는 `src/lib/http.ts` 에 있다.

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
  계약은 `contractRev` 로 자란다 — 현재 **rev 6**(`SECTION_CONTRACT_REV`). 오른 자국은 이렇다:
  rev 2·3·5 는 조회형 섹션(`SERVICE_MENU`·`BOOKING_CTA`)의 산출과 필수 참조를 조이던 세대이고,
  rev 4 는 참조 방언(`dialects`)과 콘텐츠 파일(`contentFile`)을 1급으로 올렸다.
  **rev 6 = 그 조회형 둘을 어휘에서 삭제 — 12종 → 10종.**

  **경계 규칙**(memo142 §1): *값이 콘텐츠 파일에 사는 저작물 = 선언 섹션 / 값이 업무 DB 에 살고 화면이
  비추기만 하는 조회 = 소스가 `@zalkera/client` 를 직접 호출.* rev 3·5 가 "조회형 섹션은 참조를 반드시
  실어라"로 조이던 잣대가 **"조회형 섹션을 싣지 마라"로 반전**됐다. 절반 선언(`{ categorySlug }`)은
  "어디에"만 선언에 두고 "어떻게"(카드 그리드·필드·개수)를 공유 렌더러에 얼려 버렸는데, 그것이
  **자연어로 다양한 디자인을 만든다**는 방향과 반대였다. 따름정리로 **배송물은 상품 handle 이든 갈래
  slug 든 업무 축의 고유명사를 어디에도 박지 않는다**(`리빙`·`시술`은 사장이 정할 이름이다).
  자기 소스가 자기 카탈로그를 tsx 안에서 가리키는 것은 정당하다 — 금지되는 것은 배송물의 선언이다.
- **방언이 둘이다. 거처가 방언을 정한다.** DB(`page_section.config`)는 자기가 발급한 숫자 id 를 쓰고
  (`assetId`), **소스는 그 id 를 알 수 없으므로** 사람이 읽고 쓰는 참조를 쓴다
  (`asset` = `public/` 루트 절대 경로). 이 레포는 **소스 방언**이다. rev 6 에서 상품 참조 방언은
  **금지 키 형상**이 됐다(위 경계 규칙).
  아래 §어휘 표(그리고 `SECTION_CONTRACT`)의 `config` 선언은 **id 방언 표기**이므로, 콘텐츠 파일에 적을
  때는 `dialects` 의 대응을 따라 참조 방언으로 옮겨 적는다. 키의 **의미**는 두 방언이 같다.
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
  모든 href 는 `lib/safeUrl` 을 태운다(저장형 XSS 방어).
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
