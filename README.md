# 잘커라(Zalkera) 비즈니스 사이트 템플릿

**당신의 비즈니스 사이트를 직접 만드는 출발점.**

상품·결제·주문·배송·회원 같은 복잡한 뒷단은 전부 **잘커라가** 맡습니다.
당신은 **비즈니스 사이트의 얼굴 — 화면과 디자인**만 원하는 대로 꾸미면 됩니다.
말로 지시하면 AI가 이 골격 위에 페이지를 얹어 줍니다.

> 잘커라 **스택(Stack) 플랜** 사용자용 비즈니스 사이트 템플릿입니다.
> 개발이 익숙하면 아래 기술 문서를 그대로 따라가고, 처음이라면 AI에게 이 문서와 `llms.txt`를 건네주세요.
>
> **개시한 사이트의 소스를 받아 조금 고쳐 다시 올리려는 분**이라면 → [`CUSTOMIZE.md`](CUSTOMIZE.md)
> (무엇이 콘솔에서 무료로 되고, 소스의 어디를 고치고, 무엇을 깨뜨리면 안 되는지).
>
> **이 템플릿을 안 쓰고 프론트를 통째로 직접 만들 개발자**라면 → [`docs/byo-headless-guide.md`](docs/byo-headless-guide.md)
> (자기 레포·자기 호스팅으로 `@zalkera/client` 헤드리스 소비).
>
> **AI·LLM 에게 맡길 분**이라면 → **이 zip 을 통째로 주고**, 최소한 루트 `llms.txt` 를 컨텍스트에 넣으세요.
> 설치 없이 바로 읽히는 자리에 있습니다.
> (이 레포를 GitHub 에서 보고 계신다면 그 파일이 없는 것이 정상입니다 — 정본은 `@zalkera/client` 패키지이고
> 팩이 배송 시점에 그 사본을 zip 루트에 넣습니다. 레포에 사본을 두면 정본이 둘이 됩니다.)

이 문서 하나로 셋업 → 구조 → 규약 → 확장까지 볼 수 있습니다.

---

## 이게 뭔가

- **`@zalkera/client` SDK** 위에서 도는 Next.js(App Router) 비즈니스 사이트입니다. 상품·장바구니·결제·주문조회·소셜로그인이 이미 배선돼 있습니다.
- 데이터·인증·결제 확정은 전부 **잘커라 백엔드(헤드리스 API)** 가 합니다. 이 레포는 그 위의 **표현/화면 계층**만 담습니다.
- **완성품은 콘텐츠와 소스입니다. 데이터는 운영입니다.** zip 은 고객 DB 에 상품·갈래를 만들지 않습니다 — 그 이름(`리빙`·`시술`)은 사장이 정할 것이고, 카탈로그의 주인은 콘솔·MCP 입니다. 화면에 비추는 일은 소스가 `listProducts()`·`listProductCategories()` 를 **직접 불러서** 합니다(`src/components/ProductRail.tsx`). 그래서 개시 직후 진열이 비어 있는 것은 결함이 아니라 **개점 전 매장**입니다.
- 콘솔의 "이 템플릿으로 시작"은 이 소스에서 팩한 zip 을 고객 사이트에 **사본으로 인도**합니다. 개시한 뒤 그 소스는 고객 것이고, 이 레포와 물리적으로 이어져 있지 않습니다 — 상속이 아니라 배달입니다. 로컬에서 바로 실행·개발할 수도 있습니다.
- 그래서 이 레포는 두 가지를 동시에 배송합니다: **사진과 문구만 바꿔 쓰는 완성품**(`content/` + `public/` 에셋 · `.zalkera/seed.json` 은 테마 색만 나릅니다)과, **계약을 이렇게 소비한다는 본보기**(소스 코드 + [`AGENTS.md`](AGENTS.md)). 새 템플릿을 짓는 사람·AI 는 뒤쪽을 교본으로 읽으면 됩니다 — 규범이 어느 파일에 구현돼 있는지의 좌표표가 `AGENTS.md` 에 있습니다. 두 역할에 서열은 없습니다: 이 레포는 카탈로그에 오르는 상품이면서 동시에 교본입니다.

### 예제는 고를 유형이 아니라 **활용례**입니다

우리가 주는 예제(커머스·예약·기업소개)는 **분류표가 아닙니다.** 능력 — 기업 홈페이지·쇼핑몰·예약 — 은
**한 소스 안에서 자유롭게 조합**됩니다. 어떤 사이트는 소개만 쓰고, 어떤 사이트는 소개와 쇼핑몰을 같이
쓰고, 어떤 사이트는 셋을 다 씁니다. 그 조합을 우리가 미리 나눠 두거나 플래그로 신고받지 않습니다.

**사이트의 성격은 선언되지 않고 구성됩니다** — `@zalkera/client` 를 어떻게 부르는가가 그 사이트가
무엇인지를 정합니다. 상품·장바구니를 부르면 쇼핑몰이고, 안 부르면 아닙니다. 그러니 예제는
*"이 중에서 고르세요"* 가 아니라 *"이렇게도 쓸 수 있어요"* 입니다.

이 골격은 **최대 조합**으로 배선돼 있습니다(커머스·예약·소개 전부). 자기 조합을 만드는 방법은
**안 쓰는 것을 지우는 것**입니다 — 무엇을 지우면 되는지의 좌표는 [`AGENTS.md`](AGENTS.md) 의
"능력 ↔ 구현 좌표" 표에 있습니다. 헤더 같은 표현은 아예 자기 것으로 다시 쓰면 됩니다.

## 무엇이 들어 있나

상품 등록 → 구매 → 결제 → 배송조회의 **최소 동작 골격**이 이미 연결돼 있습니다:

| 경로 | 무엇 |
|---|---|
| `/` | 홈 — 시드 섹션이 있으면 그것이 홈, 없으면 상호·카테고리 골격 (RSC, 공개 조회) |
| `/[slug]` | **소스가 갖는 고정 페이지**(회사소개·이용안내 등) — `content/pages/<slug>.json` 의 섹션 배열로 그린다. 얼굴이 소스 정본이라 `force-static` 이고, 고치려면 재업로드한다 |
| `/products` | **상품 목록** — 카탈로그 허브(`ItemList`) |
| `/products/[slug]` | 상품 상세 + 장바구니 담기 (예약 상품이면 슬롯 선택) |
| `/blog`, `/blog/[slug]` | 글 목록·상세 (공지·블로그) |
| `/contact` | 문의 폼 (제출은 BFF 경유) |
| `/policies` | 구매 정책 — 반품·교환·배송·A/S 표시면 |
| `/cart` | 장바구니 (현재가 재계산) |
| `/checkout`, `/payment/widget`, `/payment/complete` | 결제 폼 → PG 결제창(위젯 또는 리다이렉트) → 복귀 |
| `/orders/[orderNo]?phone=…` | 게스트 주문·배송 조회 |
| `/mypage`, `/login`, `/auth/callback/[provider]` | 회원 마이페이지·소셜 로그인(카카오·네이버·구글) |
| `/media/[id]` | 미디어 안정 URL — 백엔드 302 만 넘긴다(바이트는 스토리지→브라우저 직행) |
| `/sitemap.xml`, `/robots.txt` | 크롤러용 — `src/app/sitemap.ts`·`robots.ts` 가 만든다 |
| `/api/cart/*`, `/api/checkout`, `/api/auth/*` | BFF route handler (토큰·세션키는 서버가 httpOnly 쿠키로 관리) |

> `/[slug]` 는 루트 동적 세그먼트라 위 고정 경로(`products`·`blog`·`cart` …)가 **우선**합니다.
> 그 이름과 같은 slug 로 페이지를 만들면 가려지고, `sitemap.ts` 도 그런 slug 는 조용히 뺍니다.

## 빠른 시작

```bash
cp .env.example .env.local     # ZALKERA_API_BASE·ZALKERA_TENANT 채우기
npm install
npm run dev                    # http://localhost:3000
```

필요한 환경변수(`.env.example` 참고):

| 변수 | 설명 |
|---|---|
| `ZALKERA_API_BASE` | 잘커라 백엔드 URL (`/api` 는 붙이지 않음). 로컬 기본 `http://localhost:8100` |
| `ZALKERA_TENANT` | 이 사이트의 테넌트 코드 (잘커라 콘솔에서 발급) |
| `ZALKERA_SITE_URL` | 이 사이트의 공개 URL (SEO·sitemap·JSON-LD 용) |
| `NEXT_PUBLIC_{KAKAO,NAVER,GOOGLE}_CLIENT_ID` | 소셜 로그인 사용 시 각 제공자 클라이언트 ID |
| `ZALKERA_REVALIDATE_SECRET` | ISR 재검증 웹훅 공유 시크릿(잘커라 콘솔과 동일 값) |

백엔드가 떠 있어야 하고, `ZALKERA_TENANT` 에 이 사이트의 테넌트 코드를 넣어야 합니다.

> ⚠ **`ZALKERA_API_BASE`·`ZALKERA_TENANT` 는 구 `ONEQUE_` 접두를 더 이상 받지 않습니다.** 폴백을
> "그대로 동작한다"고 적어 뒀는데 거짓이었고, 그 말을 믿은 BYO 배포는 기동에 실패합니다.
>
> 다만 **`NEXT_PUBLIC_ONEQUE_PREVIEW` 는 지금도 받습니다**(`src/lib/preview.ts` — 구 프리뷰 러너 호환).
> "구 접두는 전부 죽었다"로 넓혀 읽지 마십시오. 새로 쓸 때는 `ZALKERA_` 로 쓰십시오.

## AI 매뉴얼 — `llms.txt`

핵심 규약과 API 사용법은 **이 zip 루트의 `llms.txt`** 에 전부 있습니다. 설치 없이 바로 열립니다.

**AI 로 사이트를 키울 때 이 zip 을 통째로, 또는 최소한 `llms.txt` 를 컨텍스트로 주세요.**

이 파일은 `@zalkera/client` 가 나르는 정본을 팩 시점에 **바이트 그대로** 복사한 것입니다 — 정본은
그 패키지 하나이고 여기 있는 것은 운반본입니다. 버전은 `package-lock.json` 이 고정한 client 버전과
같습니다. `npm ci` 뒤 `node_modules/@zalkera/client/llms.txt` 와 대조하면 동일합니다.

## 렌더링 전략 — 정적/ISR 우선

읽기 중심 페이지는 요청마다 서버 렌더(SSR)하지 않고 **ISR**(정적 프리렌더 + 주기 재검증)로 둡니다. 세션/쓰기 페이지만 동적으로 남깁니다. 서버 동적 렌더는 상시 런타임 원가라 최소화합니다.

| 경로 | 렌더링 | 이유 |
|---|---|---|
| `/` (홈) | **ISR** (`revalidate=600`) | 사이트 설정·카테고리 = 세션 무관 공개 데이터 |
| `/[slug]` (고정 페이지) | **정적 프리렌더** (`force-static`) | **소스가 갖는 콘텐츠**라 재검증할 것이 없다 — 고치면 재업로드하고, 그때 새로 구워진다. (빌드 표에는 `●` 로 나온다 — 프리렌더된 경로가 있다는 뜻이고, 옆의 재검증 값은 Next 기본값이다) |
| `/products` (상품 목록) | **ISR** (`revalidate=300`) | 카탈로그 허브. **`searchParams` 를 안 받는 것이 의도** — 정렬·필터를 쿼리로 받으면 동적 렌더로 강등된다 |
| `/products/[slug]` (상품 상세) | **ISR** (`revalidate=300`) | 카탈로그 = 공개 읽기. 재고·가격은 결제 시점에 백엔드가 재검증하므로 stale 안전 |
| `/blog`·`/blog/[slug]` (글) | **ISR** (`revalidate=300`) | 발행글 = 세션 무관 공개 읽기 |
| `/contact`·`/policies` | **ISR/static** | 폼 셸·정책 표시면. 제출만 아일랜드→BFF |
| `/cart`·`/mypage`·`/login`·`/orders/[orderNo]` | **동적(ƒ)** | 쿠키(세션 토큰·게스트 카트키)를 읽음 → 요청별 렌더 필수 |
| `/checkout`·`/payment/widget`·`/payment/complete` | **정적(○)** | 정적 셸 + 클라이언트 폼. 값은 브라우저에서 채운다 |
| `/auth/callback/[provider]` | **동적(ƒ)** | 동적 세그먼트 |
| `/api/**` (BFF) | **동적(ƒ)** | route handler |

- ISR 전환은 페이지 상단 두 줄입니다: `export const dynamic = "force-static"` + `export const revalidate = N`.
  (Next 16 은 fetch 를 기본 no-store 로 두어 `revalidate` 만으론 동적으로 남습니다 — `force-static` 이 세그먼트 fetch 를 캐시로 돌려 ISR 을 성립시킵니다.)
- `npm run build` 의 라우트 표에서 `○`(정적)·`●`(정적 프리렌더)·`ƒ`(동적) 중 무엇인지 확인하세요.
  **이 표보다 그 산출물이 정본입니다** — 어긋나면 산출물이 맞고 이 표가 낡은 것이니 표를 고치세요.
- 새 **읽기 페이지**(게시글 목록/상세 등)를 추가하면 같은 두 줄로 ISR 로 만들고, **세션/쓰기 페이지**는 쿠키를 읽거나 클라이언트 fetch 로 두어 동적으로 남깁니다.
- **Tailwind 는 빌드타임 CSS 라 렌더링 전략과 무관합니다.** `next build` 중 산출된 정적 `.css` 를 런타임엔 `<link>` 하나로 실을 뿐, 서버 fetch·동적 렌더를 유발하지 않습니다(아래 스타일 규약 참조).

## 스타일 규약 — Tailwind v4 + 테마 토큰

스타일은 **Tailwind v4 유틸리티 클래스**로만 표현합니다. 색·폰트는 `src/app/globals.css` 의 `@theme` 토큰이 1급 시민이고, **테넌트 브랜드색은 잘커라 콘솔에서 말로 바뀝니다("버튼색 바꿔줘") — 코드 수정이 필요 없습니다.**

- **테넌트 색은 토큰 경유로만.** `SiteConfig.themeColors`(콘솔 `primary`·`secondary`·`background`·`text`) → 루트 `layout.tsx` 가 `<html>` 의 CSS 변수로 주입 → 아래 유틸리티가 그 색으로 바뀝니다. **이 배선(`src/lib/theme.ts` + layout)을 유지하세요.** 지우거나 우회하면 콘솔에서 색을 바꾸는 무료·즉시 경로가 이 사이트에서 안 삽니다 — 색 하나 바꾸는 데 코드 수정과 재업로드가 필요해집니다. 코드는 당신 것이니 포기해도 되지만, 포기하는 것이 무엇인지는 분명히 적습니다(`docs/byo-headless-guide.md` §7 과 같은 이야기입니다).

| 토큰 유틸리티 | 쓰임 |
|---|---|
| `bg-primary` · `text-primary` · `border-primary` | 테넌트 액센트(CTA·가격·강조). primary 위 글자는 `text-primary-foreground` |
| `bg-background` · `text-foreground` | 페이지 배경·본문 글자 |
| `text-muted` | 보조 텍스트(설명·라벨) |
| `border-border` · `bg-surface` | 경계선·카드/필드 배경 |
| `text-danger` | 오류 문구 |

- **인라인 `style={{}}` 금지** — CSS 변수 주입(`style={{"--…"}}`)만 예외. 스타일은 클래스로 표현하세요(validator S2).
- **색 하드코딩 금지** — `bg-[#e91e63]` 같은 임의 hex 는 콘솔의 "말로 색 바꾸기"를 무력화합니다(validator S4). 브랜드색은 `primary` 토큰으로 씁니다. 여기까지가 계약입니다.
- 중립 명도를 **`slate` 스케일 하나로** 통일한 것은 계약이 아니라 **이 템플릿의 선택**입니다(gray·zinc·stone 을 섞지 않았습니다). 이유는 중립 스케일이 하나면 화면에 남는 유일한 색이 테넌트 액센트가 되어 같은 코드로도 테넌트마다 인상이 갈리기 때문입니다. 다른 판단이면 다른 스케일을 써도 됩니다.
- **CSS 파일은 `src/app/globals.css` 하나뿐** — 다른 `.css` 파일이나 CSS-in-JS·CSS Modules 를 추가하지 마세요(validator S3·S5). 웹폰트는 시스템 스택을 씁니다(외부 폰트 CDN 금지).
- **절제** — 이 템플릿은 `animate-*`·그라데이션·`backdrop-*` 을 쓰지 않고 그림자를 `shadow-sm` 까지만 씁니다. 금지 규칙이 아니라 **이 예시의 선택**이고, 이유는 두 가지입니다: ① 기업 홍보 사이트의 첫인상은 장식보다 정보 밀도와 로딩 속도에서 갈립니다. ② 장식이 적을수록 테넌트 색 하나로 인상이 갈리는 폭이 커집니다. 다른 판단이면 다르게 해도 되고, 그래도 계약은 그대로 삽니다.
- 버튼은 `ui/Button`(링크는 `buttonClasses`), 카드는 `ui/Card`, 폼 필드는 base 가 스타일을 입히므로 맨 `<input>` 을 씁니다 — 이건 이 레포 안의 일관성 규약입니다.
- 레거시 죽은 토큰 `var(--oneq-*)` 참조는 금지입니다(validator S1). `--oneq-primary` → `text-primary`/`bg-primary`, `--oneq-bg` → `text-primary-foreground`.

## 설계 규약 (지켜야 하는 것)

- **`@zalkera/client` 와 `src/lib/zalkera.ts` 는 서버에서만** import (RSC·route handler). 클라이언트 컴포넌트에서 쓰면 `baseUrl` 이 노출됩니다 — 타입만 필요하면 `import type` 으로.
- **장바구니·결제는 BFF route handler** 를 거칩니다. 토큰·게스트 카트키는 httpOnly 쿠키(`src/lib/session.ts`)로 서버가 관리합니다.
- **결제 확정은 백엔드 웹훅이 합니다.** returnUrl 의 "성공"을 믿지 말고 `/orders/[orderNo]` 로 상태를 확인하세요.
- **variant 가 판매 단위** — 담기·주문은 항상 `variant.id`.
- **미디어는 `/media/{id}` 안정 URL** 로 렌더합니다(presigned URL 직접 사용 금지, `next/image` 대신 `<img>`).
- **공개 페이지는 JSON-LD 를 냅니다** — 홈 `Organization`, 상품 상세 `Product`+`Offer`, 목록(`/products`·`/blog`) `ItemList`, 고정 페이지 `WebPage`, 글 상세 `BlogPosting`, 그리고 `BreadcrumbList`. 규범 정본은 `llms.txt` §5.1 이고 **어느 파일이 어느 규범을 구현하는지는 [`AGENTS.md`](AGENTS.md) 의 좌표표**에 있습니다(여기서 사본을 만들지 않습니다). 규율은 하나입니다 — **페이지에 없는 것을 그래프에 쓰지 않습니다**: 후기 0건이면 평점을, 항목 0건이면 `ItemList` 를 아예 내지 않고, 빈 목록은 `sitemap` 에도 싣지 않습니다.

## 검사기 — 소스 하나, 산출물 하나

두 검사기가 **서로 다른 것**을 잽니다. 소스가 규약대로여도 개시된 페이지에 그래프가 안 나갈 수 있고, 그 반대도 가능합니다.

### ① 소스 검사 — `npm run validate`

만들거나 고친 비즈니스 사이트가 위 규약을 어기지 않았는지 정적으로 검사합니다(CI 권장):

```bash
npm run validate            # ./src 스캔. 위반 있으면 exit 1
```

- `use client` 파일이 `@zalkera/client` 를 값으로 import(baseUrl 노출)하면 오류(E1/E2).
- SEO 라우트가 per-page 동적 SSR 을 강제하면 오류(C1/C1b — ISR-우선 게이트).
- 스타일 규약(위 섹션): 죽은 토큰 `var(--oneq-*)` 참조(S1)·globals.css 배선 소실(S3)은 오류.
  인라인 `style={{}}`(S2)·색 하드코딩(S4)은 **이 레포에서 오류**입니다 — `package.json` 의 `zalkera.styling`
  을 선언한 레포는 그 둘이 error 로 격상됩니다(선언 안 한 레포에서만 경고). 정당한 동적 스타일은
  `// zalkera-allow-inline-style: <이유>` 마커로 억제합니다.
- 콘텐츠 규약(N1~N5)과 문서 좌표(D1)는 **오류**입니다.
- **교차사이트 위조 가드(X1~X3)는 경고입니다 — 기계가 막지 않습니다.** 이 축은 "우리 심볼
  `assertSameOrigin` 을 썼는가"를 재지 "교차 오리진을 실제로 막았는가"를 재지 못하므로, 통과가
  안전을 뜻하지 않습니다. **경고가 보이면 사람이 고쳐야 합니다.**
  재현: 변이 라우트에서 `assertSameOrigin` 두 줄을 지우고 `npm run validate` → `⚠️ [X1] …` 에 rc 0.

### ② 산출물 검사 — `npm run check:aeo`

개시된 사이트를 **크롤해서** 위 JSON-LD 규범이 실제로 나오는지 잽니다. 소스를 읽지 않는 것이 요점입니다 — "이 섹션을 써라"는 디자인 자유를 깎지만 "개시된 페이지에서 이 그래프가 나오는가"는 아무것도 깎지 않으므로, 어떤 스택으로 짰든 같은 잣대가 적용됩니다.

```bash
npm run check:aeo -- https://개시된사이트 --category BOOKING --out out/aeo-snapshot.json
```

- 잣대는 잘커라 백엔드의 보장표 정본(`doc/contracts/aeo-surface-guarantees.json`)이고, 이 스크립트는 그 **집행자**입니다 — 규범을 여기서 새로 만들지 않습니다. 찾는 순서는 ① `--guarantees <경로>` ② 설치된 `@zalkera/client` 안의 운반본(= `npm install` 로 따라오는 기본 경로) ③ 형제 체크아웃(`../backend`)의 정본이고, 실행할 때 어느 출처로 쟀는지 찍습니다. 셋 다 없으면 **아무 판정도 하지 않고 멈춥니다**(exit 2) — 없는 잣대로 통과시키지 않습니다. 잣대 해석만 확인: `npm run check:aeo -- --print-guarantees`.
- `--category` 는 보장표에 등재된 이름입니다(`MARKETING`·`PORTFOLIO`·`EVENT`·`BOOKING`·`BLOG`·`COMMERCE` — `COMMERCE` 는 2026-08-01 해제됐습니다). 표에 없는 이름은 순수 라벨이라 잴 것이 없습니다.
- 보장 주장이 없는 사이트는 `--category` 대신 **`--site-wide-only`** — robots·sitemap·JSON-LD 절대 URL 만 재고 유형별 요구는 판정하지 않습니다.
- 종료코드 0=required 전부 통과 · 1=보장 미충족 · 2=실행 불가(인자·네트워크·표 부재).
- 검사기 본체는 `@zalkera/client` 가 배송하는 bin(`zalkera-aeo-check`)이고 `scripts/check-aeo-surfaces.mjs` 는 그것을 부르는 wrapper 입니다 — 발행 직후 자동 검사(서빙단)와 **같은 검사기**를 쓰려고 정본을 하나로 뒀습니다.

## AI 로 키우기

이 골격 + `llms.txt`(위 참조)를 AI 에게 주고, 예를 들어

> "카테고리별 상품 목록 페이지, 상품 카드 그리드, 로그인(카카오), 마이페이지 주문목록을 이 규약대로 추가해줘"

라고 하면 됩니다. 추가 후 `npm run validate` 와 `npm run build` 로 검증하세요.

---

**잘커라(Zalkera)** — 헤드리스 커머스 플랫폼. 비즈니스 사이트는 당신이, 나머지는 잘커라가.

### Speak it. Ship it.
