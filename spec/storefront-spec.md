# 잘커라 스토어프론트 — 프론트엔드 구현 명세

이 문서는 **잘커라 위에서 도는 프론트엔드 소스를 새로 짜는 사람과 AI 에게 주는 규범**이다.
우리 시작 소스(팩)에서 출발하지 않아도 된다 — 빈 디렉터리에서 시작해 이 문서만 따라도 게이트를 통과한다.

**이 문서는 기술 규범만 담는다.** 사업·요금·법무·콘텐츠 정책은 여기 없다.

## 0. 이 문서의 위상 — 무엇이 정본인가

문서는 낡는다. 그래서 이 문서는 **판정하지 않는다.** 판정은 기계가 한다.

| 층 | 정본 | 읽는 법 |
|---|---|---|
| 계약 본문 | `@zalkera/client` 의 `llms.txt` | `node_modules/@zalkera/client/llms.txt` |
| 섹션 어휘 | `SECTION_CONTRACT` (같은 패키지) | 아래 §5 의 조회 명령 |
| 집행 | `validate-storefront.mjs` | `npx zalkera-validate . --gate` |

이 문서가 기계와 어긋나면 **기계가 옳다.** 여기 적힌 규칙마다 검사기의 규칙 ID(`[S2]`·`[N4]` …)를
같이 적어 둔 이유가 그것이다 — 규칙을 의심할 때 무엇을 돌려 확인할지 알려 주기 위해서다.

**종수·판번호를 이 문서에서 세지 마라.** 어휘가 늘거나 줄면 그 숫자가 거짓이 된다. 세야 하면 조회한다.

## 1. 계약과 자유의 경계

판정 기준은 하나다 — **여기에 보장이 걸려 있나.**

- **계약 영역**: 섹션 어휘의 `type` 과 그 `config` 키 · 테마 토큰 배선 · 데이터 조회 경로 ·
  라우트 렌더 모드 · 변이 라우트 가드 · 서빙 산출물. 이것들엔 AEO/SEO 보장과 "말로 고치기"가 얹혀 있다.
- **자유 영역**: 그 밖의 전부. 라우트를 몇 개 만들든, 컴포넌트를 어떻게 쪼개든, 레이아웃을 어떻게
  짜든 묻지 않는다. 섹션 어휘는 보장의 **바닥이지 천장이 아니다** — 어휘 밖 화면을 자유롭게 만들어라.

**디자인은 전부 자유 영역이다.** 이 명세는 어떤 화면이어야 한다고 말하지 않는다.

## 2. 스택 요건

- **Next.js App Router** · React · TypeScript. 서버 컴포넌트 우선.
- **Tailwind CSS v4** + `@theme` 토큰. (Pages Router 도 돌지만 테마 주입 축 `[S8-b]` 이 성립하지 않는다 —
  App Router 를 쓸 것.)
- 도메인 데이터는 **`@zalkera/client`** 로만 조회한다. 백엔드를 직접 `fetch` 하지 마라.

## 3. 레포 형상 — 최소 필수

```
package.json          zalkera 선언 + @zalkera/client 의존 (§4)
package-lock.json     같이 커밋한다 — 없으면 npm ci 가 안 돈다
next.config.ts        output: "standalone"  (§12)
src/app/layout.tsx    전역 CSS import + 테마 주입 배선 (§7)
src/app/page.tsx      홈
src/app/globals.css   유일한 CSS. @theme 토큰 정의 (§6)
src/app/sitemap.ts    · src/app/robots.ts
content/index.ts      콘텐츠 매니페스트 — 정적 import (§5)
content/pages/*.json  페이지별 섹션 배열 (§5)
public/               콘텐츠가 가리키는 이미지 실물 (§5)
AGENTS.md             레포 루트 (§13)
```

⚠ **`public/` 을 빼먹지 마라.** 콘텐츠의 `asset` 값이 가리키는 실물이 없으면 `[N5]` 에러이고,
고치지 않고 개시하면 **깨진 이미지**가 나간다. 실제 업로드에서 가장 흔한 결함이다.

## 4. 선언 — `package.json`

```json
{
  "zalkera": {"styling": "tailwind-tokens", "content": "source"},
  "dependencies": {"@zalkera/client": "^<발행판>"}
}
```

이 두 줄이 §6·§5 규약을 **이 레포에 한해** 계약으로 만든다(검사기가 이걸 읽어 위반을 error 로 격상).

- 값에 오타가 나면 규칙군이 **통째로 안 돈다.** 검사기가 `[S0]`/`[N0]` 으로 그 사실을 말하고
  게이트에서는 rc=7(못 잼)로 세운다 — rc=0(통과)이 아니다.
- **선언을 지워 경고로 낮추지 마라.** 그건 규약을 지킨 것이 아니라 검사를 끈 것이다.
  그리고 지워도 아래 축들은 **그대로 error 로 남는다**: 시크릿 노출(`E1`~`E3`) · 렌더 모드(`C1` 계열) ·
  섹션 렌더러 누락(`C2`). 선언 제거로 통과를 만들 수 없다.

## 5. 콘텐츠 계약 — `[N1]`~`[N5]`

**문구를 tsx 마크업에 굽지 마라.** 페이지 문구의 거처는 `content/pages/<slug>.json` 이다.
마크업에 박으면 "말로 고치기"가 파일 하나를 여는 대신 컴포넌트 트리를 뒤지게 된다.

```jsonc
// content/pages/home.json
{
  "seo": {"title": "…", "description": "…"},
  "sections": [
    {"type": "HERO", "config": {"title": "…", "asset": "/images/hero.png"}}
  ]
}
```

- **배열 순서가 화면 순서다.** `sortOrder` 키를 쓰지 마라 — 있으면 `[N4]` 에러다.
- `config` 는 **객체**다. JSON 문자열을 넣지 마라.
- `content/index.ts` 가 모든 페이지를 **정적 import** 한다. 런타임 `fs` 읽기로 바꾸지 마라 —
  HMR 과 `next build` 트레이싱을 함께 잃는다. 매니페스트와 파일이 어긋나면 `[N3]`.
- **이미지 참조**: `"asset": "/images/hero.png"` — 레포 `public/` 루트 절대 경로만.
  `//` 시작 금지 · `\` 금지 · `..` 구간 금지. 실물이 없으면 `[N5]`.
- **id 형 키 금지**: `assetId`·`productId` 같은 키를 소스에 쓰지 마라(`[N5]`). 숫자 id 는 테넌트에
  묶여 있어 소스를 옮기면 뜻을 잃는다. 참조 형태로 쓴다 — 이미지는 경로, 상품은 `handle`.

### 섹션 어휘 — `type` 을 지어내지 마라

`type` 값은 계약 어휘에만 있는 것을 쓴다. **없는 이름을 쓰면 렌더러가 조용히 건너뛰어
화면에 아무것도 안 나온다** — 예외도 안 나므로 눈으로 찾아야 한다. 검사기가 `[N4]` 로 잡는다.

살아 있는 목록은 조회한다(이 문서에 옮겨 적으면 낡는다):

```bash
node -p "require('@zalkera/client').SECTION_CONTRACT.map(s=>s.type).join('\n')"
```

**어휘에 없는 화면이 필요하면 섹션이 아니라 자유 영역으로 만들어라** — 컴포넌트를 새로 쓰고
페이지에서 직접 부르면 된다. 어휘를 늘리려 하지 마라.

- 렌더러(`SectionRenderer`)의 `switch` 는 **콘텐츠가 실제로 쓰는 모든 `type`** 에 `case` 가 있어야 한다(`[C2]`).
- `default:` 는 **조용히 null** 이다. 여기서 throw 하거나 에러를 내지 마라 — 섹션 하나가 페이지를
  죽이지 않는 것이 계약이다.
- `config` 파싱은 `@zalkera/client` 헬퍼로만(`readConfig`·`asString`·`asObjectArray`·`assetPath` …).
  파서 사본을 만들지 마라 — 사본이 갈라지면 그 계약이 조용히 깨진다.

### 진열(상품·갈래)은 섹션이 아니다

상품·가격·재고·갈래는 업무 DB 에 살고 화면은 비추기만 한다. 그래서 **선언이 아니라 소스의 직접 호출**이다 —
`listProducts()`·`listProductCategories()` 를 컴포넌트에서 부른다. 섹션 `config` 에 `product`·`products`·
`categorySlug` 를 적지 마라.

- **0건이면 `return null`.** 빈 진열대는 방문자에게 거짓이고, "상품을 등록하면 여기 표시됩니다" 같은
  안내도 넣지 마라 — 그 문장의 독자는 사장이고 사장의 표면은 콘솔이다.

## 6. 색·스타일 계약 — `[S1]`~`[S6]`

원리: **어떤 토큰을 쓸지는 코드가 정하고, 그 토큰의 값은 테마가 정한다.** 그래야 콘솔의
"말로 색 바꾸기"가 코드 수정 없이 값만 바꿔 즉시 반영된다.

- 브랜드색은 **토큰 유틸리티**로: `bg-primary`·`text-primary`·`border-primary`.
- **리터럴 색 금지**(`[S4]`): `bg-[#3b82f6]` 같은 임의값 금지. 피할 수 없으면 `bg-[color:var(--color-primary)]`.
- **JSX 인라인 `style={{…}}` 금지**(`[S2]`). CSS 변수 주입(`style={{"--x": v}}`)은 면제다.
  정당한 동적 스타일이면 마커로 억제한다(아래).
- **CSS 는 한 장**(`[S5]`): `src/app/globals.css` 하나만 둔다.
- **남의 토큰 어휘 금지**(`[S6]`): shadcn 을 발췌해 오면 `bg-card`·`text-muted-foreground` 같은 클래스가
  따라온다. 그 클래스는 우리 `@theme` 에 없어서 **Tailwind 가 아예 생성하지 않고 색이 조용히 사라진다.**
  자기 토큰으로 바꿔 쓴 뒤 커밋한다.
- 죽은 레거시 변수(`var(--oneq-*)`) 참조 금지(`[S1]`).

### 면제 마커 — 형식이 엄격하다

```ts
// zalkera-allow-inline-style: 스크롤 위치로 계산하는 높이라 클래스로 표현 불가
```

- **진짜 `//` 주석이어야 한다.** 문자열 리터럴 안의 같은 글자는 면제되지 않는다.
- **사유가 필수이고 같은 줄에 있어야 한다.** 사유가 없거나 다음 줄에 있으면 안 먹는다.
- 인정되는 이름: `dynamic` · `inline-style` · `cross-origin` · `custom-theme-inject`.
- **면제는 출구가 아니라 기록이다** — 검사기가 면제 목록을 항상 출력한다(조용히 늘지 않게).

## 7. 테마 주입 배선 — `[S8]` · 지우지 마라

root layout 이 테넌트 색을 읽어 `<html>` 의 inline style 로 주입한다. `globals.css` 의 `@theme` 토큰이
기본값이고 inline style 이 그걸 덮는다.

```tsx
// src/app/layout.tsx
import {parseThemeColors} from "@zalkera/client";
const style = parseThemeColors(config);
return <html style={style}>…</html>;
```

**이 두 조각이 "말로 색 바꾸기"의 전부다.** 하나라도 없으면 콘솔에서 색을 바꿔도 **성공 보고만 나오고
화면은 그대로**인 거짓성공이 된다 — 사용자는 무엇이 고장났는지 알 길이 없다.

- `globals.css` 에 `@theme` 과 `--color-primary:` 정의가 있어야 한다(`[S8-a]`).
- root layout 에 `parseThemeColors(` **호출**과 `<html … style=>` 이 있어야 한다(`[S8-b]`).
  주석이 아니라 **코드**에서 찾는다.
- 자기 헬퍼로 직접 배선했으면 `// zalkera-allow-custom-theme-inject: <이유>` 로 사유를 남긴다.
  **마커는 검사를 면제할 뿐 동작을 보장하지 않는다** — 반영은 사람이 한 번 확인해야 한다.

## 8. 데이터 조회 · 시크릿 — `[E1]`~`[E3]` · `[W1]`

이 축은 **선언과 무관하게 항상 재고, 게이트에서 error 다.**

- 서버 전용 클라이언트 싱글턴을 하나 만들어 서버에서만 쓴다(`createZalkeraClient`).
- **`"use client"` 파일에서 `@zalkera/client` 나 그 싱글턴을 값으로 import 하지 마라**(`[E1]`·`[E2]`).
  타입만 필요하면 `import type` 을 쓴다. baseUrl·토큰이 브라우저 번들로 새는 경계다.
- **시크릿을 `NEXT_PUBLIC_*` 에 담지 마라**(`[E3]`). Next 가 계약상 브라우저 번들에 굽는다 —
  "샐 수 있다"가 아니라 **이미 샌 것**으로 판정한다.
- 스토어프론트 키(`oqsk_…`)를 소스나 `.env` 에 박지 마라(`[E3]`).

## 9. 렌더 모드 — `[C1]` 계열

공개 SEO 페이지(홈·목록·상세·콘텐츠)는 **ISR/static** 을 유지한다. 요청마다 도는 동적 SSR 로 만들지 마라.

- 그 페이지(또는 그것이 import 하는 서버 모듈)에서 `cookies()`·`headers()`·`draftMode()`·
  `unstable_noStore()` 를 부르거나 `export const dynamic = "force-dynamic"`·`revalidate = 0`·
  `cache: "no-store"` 를 두면 걸린다.
- layout 에서 저지르면 **그 아래 전 라우트**가 같이 동적이 된다(`[C1b]`).
- 세션·쓰기·개인화 UI 는 **클라이언트 컴포넌트(아일랜드)로 내린다.**
- 정당하면 그 원인 파일에 `// zalkera-allow-dynamic: <이유>`.

## 10. 변이 라우트 가드 — `[X1]`~`[X3]`

**변이 메서드(`POST`·`PUT`·`PATCH`·`DELETE`)를 export 하는 라우트 핸들러는 본문의 첫 구문이 가드여야 한다.**

```ts
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);   // ① 첫 구문. 앞에 아무것도 두지 마라
    if (blocked) return blocked;
    …
}
```

막는 것은 남의 사이트의 자동제출 `<form>` 이 브라우저를 `POST https://이사이트/api/...` 로 직접
보내는 경로다. 그 경로에서는 우리 번들이 **한 줄도 실행되지 않으므로** `sessionStorage` 로는 못 막는다.

- **왜 첫 구문인가**: 가드보다 앞에 쿠키를 쓰면 403 차단 응답에 `Set-Cookie` 가 실려 방어가 무의미해진다.
- **가드를 헬퍼로 감싸지 마라.** 부르는 자리에서 직접 부른다.
- **`Sec-Fetch-Site !== "cross-site"` 로 판정하지 마라.** 플랫폼 존이 `{tenant}.{zone}` 이라 테넌트끼리
  서로 `same-site` 다 — 그 관용구는 테넌트-대-테넌트 위조를 열어 둔 채 "고쳤다"고 기록된다.
- **스킴을 비교하지 마라.** 오케스트레이터가 `x-forwarded-proto: "http"` 를 넣는데 공개 스킴은 https 다.
  비교하면 전 사이트가 즉시 죽는다. **호스트만 본다.**
- **읽기 `GET` 은 면제**다. 근거는 "이 코드베이스에 CORS 헤더가 0건이라 교차 오리진 JS 가 응답을 못
  읽는다"이므로 — **`Access-Control-Allow-Origin` 을 추가하지 마라**(`[X2]`). 전제가 무너진다.
- ⚠ **면제는 «읽기» 에만 붙는다 — 상태를 바꾸는 `GET` 을 만들지 마라.** 근거는 *응답을 못 읽는다*이지
  *요청이 안 간다*가 아니다. 교차 오리진 최상위 이동 한 번이면 요청은 그대로 도달한다.
  **검사기는 이것을 아예 못 본다** — 지키는 것은 사람뿐이다.
- OAuth `state` 쿠키는 **1회용으로 소각**한다(`[X3]`). `sameSite` 는 `lax` 여야 한다 —
  `strict` 면 authorize 복귀에서 안 실려 로그인이 깨진다.

⚠ **X 축은 어느 모드에서도 경고다 — 기계가 막지 않는다.** "우리 심볼을 썼는가"를 잴 뿐
"교차 오리진을 실제로 막았는가"를 못 재기 때문이다. **통과가 안전을 뜻하지 않는다.**

## 11. 방문자 IP — `[I1]`·`[I2]`

서버에서 부르면 백엔드가 보는 IP 는 방문자가 아니라 이 서버다. IP 민감 호출에는 원 방문자 IP 를 선언한다.

```ts
import {visitorIp} from "@zalkera/client";
const access = {accessToken, phone, context: {clientIp: visitorIp(await headers())}};
```

- **값은 반드시 `visitorIp()` 로 뽑아라**(`[I1]`). `x-forwarded-for` 첫 홉을 직접 쓰면
  **방문자가 위조할 수 있다** — 선언이 있는 척하면서 값이 거짓이면 없느니만 못하다.
- 대상 9종: `getOrder`·`getShipment`·`cancelOrder`·`startPayment`·`confirmPayment`·`completeOrder`·
  `submitInquiry`·`submitLead`·`recordPostView`(`[I2]`).
- 안 하면 그 사이트 방문자가 한 IP 로 뭉쳐 **남의 오입력이 내 429 가 된다**(문의는 60초 3건).
  조회수는 429 가 아니라 **게시글마다 하루 한 건**으로 접혀 집계가 조용히 죽는다.

## 12. 서빙 산출물 — `[O1]`

**잘커라가 서빙하는 소스는 빌드가 `.next/standalone` 자기완결 산출물을 내야 한다.**
서빙 박스는 `next start` 가 아니라 그 산출물을 `node server.js` 로 띄운다.

- `next.config.ts` 의 **`output: "standalone"`** 한 줄. 지우면 `next build` 는 성공하고
  **서빙 게이트만 반려**한다 — 빌드가 그린이라 눈에 안 띄는 종류의 고장이다.
- `output: "export"`·`distDir` 변경도 같은 결과다.
- **런타임 파일시스템은 읽기 전용이다.** 아티팩트가 `:ro` 로 마운트된다. 런타임에 파일을 쓰는 코드
  (업로드 저장·로그 파일·생성 캐시)를 두지 마라 — 빌드는 통과하고 **서빙 중에 죽는다.**
  저장이 필요하면 백엔드 API 를 쓴다.
- 자체 호스팅(BYO)이면 해당 없다. 이 요건의 근거는 **누가 서빙하는가**다.

## 13. 문서 좌표 — `[D1]`

레포 루트에 **`AGENTS.md`** 를 둔다. codegen 이 가장 먼저 읽는 문서다.

- 그 문서가 **없는 파일을 백틱으로 가리키면 `[D1]` 에러**다. 죽은 좌표는 곧 탐색 낭비다.
- 파일을 지웠으면 `AGENTS.md` 의 그 좌표도 같이 지운다.

## 14. 넘기기 전에 — 반드시 돌릴 것

```bash
npm ci                             # package-lock.json 이 있어야 돈다
npx tsc --noEmit                   # 타입
npm run build                      # 빌드가 .next/standalone 을 내는지
npx zalkera-validate . --gate      # ← 이것이 게이트가 돌리는 그 검사기다
```

검사기는 `@zalkera/client` 안에 실려 온다 — 따로 받을 것이 없다. 게이트도 **레포에 설치된 그 사본**을
부른다(`node_modules/@zalkera/client/bin/validate-storefront.mjs`). 그러니 위 명령이 초록이면
게이트도 같은 판정을 낸다.

**`--gate` 를 붙여서 재라.** 안 붙이면 서빙 판정 축(E·C·C2)이 경고로 나와 통과처럼 보인다.

### 종료코드

| rc | 뜻 | 할 일 |
|---|---|---|
| 0 | 통과 | — |
| 1 | 규약 위반 | 출력된 `[규칙ID]` 를 고친다 |
| 2 | 도구 오류 | 경로가 맞는지 확인. 크래시면 그대로 신고 |
| 7 | **못 쟀다** | 통과가 아니다. 읽지 못한 파일·모르는 선언값을 고쳐 **다시 재게** 만든다 |

⚠ **rc=7 을 통과로 세지 마라.** "위반이 없다"가 아니라 **"검사가 안 돌았다"**는 뜻이다.

## 15. AI 에게 이 작업을 시킬 때

이 명세를 그대로 주고, 아래를 프롬프트에 함께 넣는다.

```
- 이 명세(spec/storefront-spec.md)와 node_modules/@zalkera/client/llms.txt 를 먼저 읽어라.
- 섹션 type 은 지어내지 말고 SECTION_CONTRACT 에서 조회해 그 안의 값만 써라.
- 페이지 문구는 tsx 가 아니라 content/pages/*.json 에 넣어라.
- content 가 가리키는 이미지는 public/ 아래에 실물을 같이 넣어라.
- 색은 토큰 유틸리티로만 쓰고 리터럴 색과 JSX 인라인 style 을 쓰지 마라.
- 끝내기 전에 `npx zalkera-validate . --gate` 를 돌려 rc=0 을 확인하고,
  rc 가 0 이 아니면 출력된 규칙 ID 를 고친 뒤 다시 돌려라.
- 검사를 통과시키려고 package.json 의 zalkera 선언을 지우거나 검사기를 고치지 마라.
```

⚠ **AI 가 "검사기가 틀렸다"고 하면 의심하라.** 실제로 가장 흔한 우회는 선언 두 줄을 지우는 것이고,
그러면 오류가 경고로 바뀌어 rc 가 0 이 된다 — 고쳐진 것은 아무것도 없다.
