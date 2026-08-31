# 잘커라 스토어프론트 — 프론트엔드 구현 명세

이 문서는 **잘커라 위에서 도는 프론트엔드 소스를 새로 짜는 사람과 AI 에게 주는 규범**이다.
우리 시작 소스(팩)에서 출발하지 않아도 된다 — 빈 디렉터리에서 시작해 이 문서만 따라도 게이트를 통과한다.

**이 문서는 기술 규범만 담는다.** 사업·요금·법무·콘텐츠 정책은 여기 없다.

## 0. 이 문서의 위상 — 무엇이 정본인가

문서는 낡는다. 그래서 이 문서는 **판정하지 않는다.** 판정은 기계가 한다.

| 층        | 정본                             | 읽는 법                                 |
| --------- | -------------------------------- | --------------------------------------- |
| 계약 본문 | `@zalkera/client` 의 `llms.txt`  | `node_modules/@zalkera/client/llms.txt` |
| 섹션 어휘 | `SECTION_CONTRACT` (같은 패키지) | 아래 §5 의 조회 명령                    |
| 집행      | `validate-storefront.mjs`        | `npx zalkera-validate . --gate`         |

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
- **Tailwind CSS v4** + `@theme` 토큰. (Pages Router 도 돌지만 테마 주입 축 `[S8]` 이 성립하지 않는다 —
  App Router 를 쓸 것.)
- 도메인 데이터는 **`@zalkera/client`** 로 조회한다. 백엔드를 직접 `fetch` 하지 마라.

## 3. 레포 형상 — 최소 필수

```
package.json          zalkera 선언 + @zalkera/client 의존 (§4)
package-lock.json     같이 커밋한다 — 없으면 npm ci 가 안 돈다
next.config.ts        output: "standalone"  (§12)
src/app/layout.tsx    전역 CSS import + 테마 주입 배선 (§7)
src/app/page.tsx      홈
src/app/globals.css   스타일 진입점. @theme 토큰 정의 (§6)
src/app/sitemap.ts    · src/app/robots.ts   (기계가 요구하진 않는다 — AEO 검사가 본다)
content/index.ts      콘텐츠 매니페스트 — 정적 import (§5)
content/pages/*.json  페이지별 섹션 배열 (§5)
public/               콘텐츠가 가리키는 이미지 실물 (§5)
content/nav.json      헤더·푸터 메뉴 (배열 순서가 노출 순서)
AGENTS.md             레포 루트 (§13)
tsconfig.json         resolveJsonModule: true (§5)
postcss.config.mjs    @tailwindcss/postcss (아래 경고)
.zalkera/ASSETS-LICENSE.md   동봉 이미지가 있으면 **필수** (아래 경고)
src/components/sections/SectionRenderer.tsx   ← 경로가 고정이다 (§5)
```

⚠ **Tailwind 배선이 빠져도 검사기는 초록이다.** S 규칙군은 클래스 **이름**만 읽고 CSS 파이프라인은
안 본다. `postcss.config.mjs` 의 `@tailwindcss/postcss` 나 `globals.css` 첫 줄의
`@import "tailwindcss";` 가 없으면 **rc=0 인 채로 스타일 없는 사이트가 나간다.** 화면으로 확인해라.

⚠ **이미지를 실으면 `.zalkera/ASSETS-LICENSE.md` 를 같이 실어라.** 납품 검수는 이미지가 든 zip 에
그 파일이 없으면 반려한다. 파일별 출처와 라이선스를 적는다.

⚠ **`.zalkera/` 안에서 만들어도 되는 것은 `ASSETS-LICENSE.md` 뿐이다.**
아래 둘은 **잘커라 도구가 찍는 표식**이다. 만들지 마라.

| 파일 | 무엇 | 만들면 |
| --- | --- | --- |
| `.zalkera/provenance.json` | 「이 zip 이 어느 사이트에서 나왔다」는 **주장** | 들여올 때 떨어진다. 그리고 없는 정체성을 지어내는 것이다 |
| `.zalkera/source.json` | 그 폴더가 **어느 사이트 소속인가** | 들여올 때 떨어진다. 받은 사람의 편집기를 남의 사이트로 향하게 하려는 시도로 읽힌다 |

잘커라 확장의 들여오기·갱신은 둘을 **떨어뜨린다**(`EXCLUDED_PATHS`). 다만 범용 압축 도구로 풀면
남으므로, 「어차피 떨어지니 넣어도 그만」이 아니다 — **넣으려 한 것 자체가 잘못된 방향**이다.
납품 zip 은 출처가 없는 것이 **정상**이다(§15).

⚠ 이미 있는 `.zalkera/seed.json`·`ASSETS-LICENSE.md` 는 **건드리지 마라.** 위 표는 「네가 만들면
안 되는 것」을 말하는 것이지, 물려받은 파일을 지우라는 말이 아니다.

⚠ **`public/` 을 빼먹지 마라.** 콘텐츠의 `asset` 값이 가리키는 실물이 없으면 `[N5]` 에러이고,
고치지 않고 개시하면 **깨진 이미지**가 나간다. 업로드 검수에서 실제로 나온 결함이다.

## 4. 선언 — `package.json`

```json
{
    "zalkera": {"styling": "tailwind-tokens", "content": "source"},
    "dependencies": {
        "@zalkera/client": "^<발행판>",
        "next": "^15",
        "react": "^19",
        "react-dom": "^19"
    },
    "devDependencies": {
        "typescript": "^5",
        "tailwindcss": "^4",
        "@tailwindcss/postcss": "^4"
    }
}
```

판은 조회해서 쓴다: `npm view @zalkera/client version`.

⚠ **`tailwindcss` 를 빠뜨리면 S 규칙군이 통째로 안 돈다**(모드가 `none`). 검사기가 조용해지는 것이지
규약이 없어지는 것이 아니다 — 아래 선언 부재 판정도 그 축에서는 안 선다.

이 두 줄이 §6·§5 규약을 **이 레포에 한해** 계약으로 만든다(검사기가 이걸 읽어 위반을 error 로 격상).

- 값에 오타가 나면 규칙군이 **통째로 안 돈다.** 검사기가 `[S0]`/`[N0]` 으로 그 사실을 말하고
  게이트에서는 rc=7(못 잼)로 세운다 — rc=0(통과)이 아니다.
- **선언을 지워 경고로 낮추지 마라 — 관문이 막는다.**
  재현: `tailwindcss` 를 문 레포에서 `zalkera.styling` 한 줄을 지우고
  `npx zalkera-validate . --gate; echo rc=$?` → `[EDECL]` · rc=7
  (`tailwindcss` 가 없으면 스타일축 모드가 `none` 이라 이 축은 아예 안 선다 — 콘텐츠축은 무관하게 선다.)

  선언이 없는데 **코드가 우리 계약을 쓰고 있으면** 관문은 통과를 주지 않는다. 어느 잣대를 댈지
  정하지 못했다는 뜻이고, 처방은 선언 한 줄이다. 축마다 증거가 다르다.

  | 빠진 선언 | 관문이 보는 증거 | 결과 |
  |---|---|---|
  | `content` | `content/pages/*.json` 이 `SECTION_CONTRACT` 의 `type` 을 쓴다 | rc=7 |
  | `styling` | `globals.css` 가 우리 토큰 이름을 쓴다(정족수) **∧ `tailwindcss` 가 deps 에 있다** | rc=7 |

- 지워도 아래 축들은 **그대로 error 로 남는다**: 시크릿 노출(`E1`~`E3`) · 렌더 모드(`C1` 계열) ·
  섹션 렌더러 누락(`C2`). 어느 쪽으로도 선언 제거로 통과를 만들 수 없다.

## 5. 콘텐츠 계약 — `[N1]`~`[N5]`

**문구를 tsx 마크업에 굽지 마라.** 페이지 문구의 거처는 `content/pages/<slug>.json` 이다.
마크업에 박으면 "말로 고치기"가 파일 하나를 여는 대신 컴포넌트 트리를 뒤지게 된다.

```jsonc
// content/pages/home.json
{
    "seo": {"title": "…", "description": "…"},
    "sections": [{"type": "HERO", "config": {"title": "…", "asset": "/images/hero.png"}}],
}
```

- **배열 순서가 화면 순서다.** `sortOrder` 키를 쓰지 마라 — 있으면 `[N4]` 에러다.
- `config` 는 **객체**다. JSON 문자열을 넣지 마라.
- `content/index.ts` 가 모든 페이지를 **정적 import** 한다. 런타임 `fs` 읽기로 바꾸지 마라 —
  HMR 과 `next build` 트레이싱을 함께 잃는다. 매니페스트와 파일이 어긋나면 `[N3]`.

    ⚠ **경로 별칭을 쓰지 마라 — 지정자가 정확히 `./pages/<slug>.json` 이어야 한다.**
    검사기가 매니페스트를 그 형태로만 읽는다. `@/content/pages/home.json` 처럼 별칭으로 쓰면
    **한 장도 못 읽어** 모든 페이지가 「매니페스트가 import 하지 않는다」(`[N3]`)로 반려된다 —
    분명히 import 했는데 안 했다는 메시지가 나오는 자리다.

    ```ts
    // content/index.ts
    import home from "./pages/home.json";
    import about from "./pages/about.json";
    export const pages = {home, about};
    export const pageSlugs = () => Object.keys(pages);
    ```

    `tsconfig.json` 에 `"resolveJsonModule": true` 가 있어야 이 import 가 선다.

- **이미지 참조**: `"asset": "/images/hero.png"` — 레포 `public/` 루트 절대 경로만.
  `//` 시작 금지 · `\` 금지 · `..` 구간 금지. 실물이 없으면 `[N5]`.
- **id 형 키 금지**: `assetId`·`productId` 같은 키를 소스에 쓰지 마라(`[N5]`). 숫자 id 는 테넌트에
  묶여 있어 소스를 옮기면 뜻을 잃는다. 참조 형태로 쓴다 — 이미지는 경로, 상품은 `handle`.

### 섹션 어휘 — `type` 을 지어내지 마라

`type` 값은 계약 어휘에만 있는 것을 쓴다. **없는 이름을 쓰면 렌더러가 조용히 건너뛰어
화면에 아무것도 안 나온다** — 예외도 안 나므로 눈으로 찾아야 한다.

재현: 콘텐츠의 `type` 을 계약에 없는 이름으로 바꾸고 `npx zalkera-validate . --gate; echo rc=$?`
→ `❌ [N4] … 계약에 없는 섹션 타입` · rc=1

살아 있는 목록은 조회한다(이 문서에 옮겨 적으면 낡는다):

```bash
node -p "require('@zalkera/client').SECTION_CONTRACT.map(s=>s.type).join('\n')"
```

**어휘에 없는 화면이 필요하면 섹션이 아니라 자유 영역으로 만들어라** — 컴포넌트를 새로 쓰고
페이지에서 직접 부르면 된다. 어휘를 늘리려 하지 마라.

`SECTION_CONTRACT` 는 `type` 외에 `vertical`·`jsonLd`·`requiredRefs` 를 나른다.
`requiredRefs` 는 검사기가 `[N5]` 로 잰다. **각 타입의 `config` 키는 `llms.txt` 에 있다** —
검사기가 그 키를 재지는 않지만, 콘솔 폼·렌더러가 같은 키로 값을 주고받으므로 키를 지어내면
콘솔이 넣은 값이 화면에 안 읽힌다.

- 렌더러의 `switch` 는 **콘텐츠가 실제로 쓰는 모든 `type`** 에 `case` 가 있어야 한다(`[C2]`).
  ⚠ **파일 경로가 고정이다 — `src/components/sections/SectionRenderer.tsx`.** 다른 자리에 두면
  검사가 **조용히 건너뛴다**(오류가 아니라 무검사다). 보장이 걸린 검사가 안 도는 형상이다.
- `default:` 는 **조용히 null** 이다. 여기서 throw 하거나 에러를 내지 마라 — 섹션 하나가 페이지를
  죽이지 않는 것이 계약이다.
- `config` 파싱은 `@zalkera/client` 헬퍼로만(`readConfig`·`asString`·`asObjectArray`·`assetPath` …).
  파서 사본을 만들지 마라 — 사본이 갈라지면 그 계약이 조용히 깨진다.

### 진열(상품·갈래)은 섹션이 아니다

상품·가격·재고·갈래는 업무 DB 에 살고 화면은 비추기만 한다. 그래서 **선언이 아니라 소스의 직접 호출**이다.
조회는 **클라이언트 인스턴스의 메서드**다 — 모듈에서 바로 꺼내 쓰는 함수가 아니다:

```ts
const client = createZalkeraClient({...});   // 서버 전용 싱글턴
const products = await client.listProducts({...});
```

섹션 `config` 에 `product`·`products`·
`categorySlug` 를 적지 마라.

- **0건이면 `return null`.** 목록 JSON-LD 도 0건이면 내지 않는다 — 빈 `ItemList` 는 산출하지 않는다.

## 6. 색·스타일 계약 — `[S1]`~`[S6]`

원리: **어떤 토큰을 쓸지는 코드가 정하고, 그 토큰의 값은 테마가 정한다.** 그래야 콘솔의
"말로 색 바꾸기"가 코드 수정 없이 값만 바꿔 즉시 반영된다.

- 브랜드색은 **토큰 유틸리티**로: `bg-primary`·`text-primary`·`border-primary`.
- **리터럴 색 금지**(`[S4]`): `bg-[#3b82f6]` 같은 임의값 금지. 피할 수 없으면 `bg-[color:var(--color-primary)]`.
- **JSX 인라인 `style={{…}}` 금지**(`[S2]`). CSS 변수 주입(`style={{"--x": v}}`)은 면제다.
  정당한 동적 스타일이면 마커로 억제한다(아래).
- **CSS 는 한 장**(`[S5]`): 진입점 하나만 둔다. 자리는 어디든 좋고 root layout 이 싣기만 하면 된다.
  ⚠ `[S5]` 는 **선언 모드에서도 경고**다 — rc 를 올리지 않는다.
- **남의 토큰 어휘 금지**(`[S6]`): shadcn 을 발췌해 오면 `bg-card`·`text-muted-foreground` 같은 클래스가
  따라온다. 그 클래스는 우리 `@theme` 에 없어서 **Tailwind 가 아예 생성하지 않고 색이 조용히 사라진다.**
  자기 토큰으로 바꿔 쓴 뒤 커밋한다.
- 죽은 레거시 변수(`var(--oneq-*)`) 참조 금지(`[S1]`).

### 면제 마커 — 형식이 엄격하다

```ts
// zalkera-allow-inline-style: 스크롤 위치로 계산하는 높이라 클래스로 표현 불가
```

- **`//` 앵커가 있어야 한다.** 앵커 없는 맨몸 글자는 안 먹는다.
  (반대로 `//` 가 붙어 있으면 문자열 안이라도 먹는 규칙이 있다 — 면제를 숨기지 마라.)
- **사유가 필수이고 같은 줄에 있어야 한다.** 사유가 없거나 다음 줄에 있으면 안 먹는다.
- 인정되는 이름: `dynamic` · `inline-style` · `cross-origin`.
  ⚠ `custom-theme-inject` 는 **없어졌다**(0.28.0) — 그 검사(`[S8]`-b)가 걷혀 면제할 대상이 없다.
  옛 소스에 남아 있으면 지워라. 검사기는 모르는 이름을 조용히 무시한다.
- **`cross-origin` 마커는 파일 상단 — 첫 `export` 앞에만 듣는다.** 아래에 두면 무시된다.
  `dynamic` 은 **원인 파일**에 단다(페이지가 아니라 그 API 를 부르는 파일).
- **면제는 출구가 아니라 기록이다.** 다만 **목록으로 찍히는 것은 교차출처 면제뿐**이다 —
  `dynamic` 은 보통 경고 줄로 나오고, `inline-style` 억제는 아무것도 안 찍는다.
  마커를 달았다고 남이 알아본다고 여기지 마라.

## 7. 색 토큰 — `[S8]` · 정본은 이 파일 하나다

`globals.css` 의 `@theme` 블록이 **이 사이트의 색 정본**이다. 색을 바꾸는 일은 이 파일을 고치는
일이다.

⚠ **관문이 그것을 강제하지는 않는다.** 둘째 스타일시트를 `import` 해 거기서 색을 덮는 형태는
`[S5]`(단일 CSS)가 **경고로만** 잡는다 — declared 모드에서도 그렇다(실측: rc=0 · 경고 1).
그래서 이 문장은 규칙이 아니라 **약속**이다. 색을 두 자리에 두면 다음 「색 바꿔 주세요」가
전수 수색이 되고, 그 비용은 당신이 아니라 이 소스를 물려받는 사람이 문다.

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
    --color-primary: oklch(20.8% 0.042 265.755);
    --color-primary-foreground: #ffffff;
    /* … */
}
```

- 스타일 진입점에 `@theme` 과 `--color-primary:` 정의가 있을 것. 없으면 `bg-primary` 같은
  유틸리티가 **아예 생성되지 않는다**(에러도 안 난다) — 그것을 `[S8]` 이 센다.

⚠ **서버 값을 읽어 색을 덮어쓰는 배선을 만들지 마라.** 종전 판본은 root layout 이
`parseThemeColors(config?.themeColors)` 로 `<html>` 에 inline style 을 주입할 것을 요구했다.
**그 요구는 걷혔고 헬퍼도 없어졌다**(`@zalkera/client` `0.28.0`) — 색의 원천이 소스와 콘솔 둘로
갈려 어느 쪽이 이겼는지 화면에서 알 수 없었기 때문이다. 옛 소스를 참고하다 그 조각을 옮겨 오면
`import` 에서 바로 죽는다.

⚠ **`0.28.0` 이상을 쓴다.** 그 아래 판의 검사기는 아직 그 호출을 요구해서, 없으면 `[S8]` 로 잡는다.

## 8. 데이터 조회 · 시크릿 — `[E1]`~`[E3]`

`[E1]`~`[E3]` 은 **선언과 무관하게 재고, 게이트에서 error 다.**
(`[W1]` — 클라이언트 싱글턴을 못 찾음 — 은 어느 모드에서도 경고다.)

- 서버 전용 클라이언트 싱글턴을 하나 만들어 서버에서만 쓴다(`createZalkeraClient`).
- **`"use client"` 파일에서 `@zalkera/client` 나 그 싱글턴을 값으로 import 하지 마라**(`[E1]`·`[E2]`).
  타입만 필요하면 `import type` 을 쓴다. baseUrl·토큰이 브라우저 번들로 새는 경계다.
- **시크릿을 `NEXT_PUBLIC_*` 에 담지 마라.** (`[E3]` 이 이름으로 잡는 것은 그중
  `SECRET`·`PRIVATE_KEY`·`STOREFRONT_KEY` 를 담은 이름이다 — 안 잡힌다고 안전한 것이 아니다.) Next 가 계약상 브라우저 번들에 굽는다 —
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

⚠ **`assertSameOrigin` 은 `@zalkera/client` 가 주지 않는다 — 직접 쓴다.** 검사기는 그 **이름의 호출**이
본문 첫 구문에 있는지만 본다. `consumeOAuthState`(`[X3]`)도 마찬가지다.

판정 규칙은 이것이다. 네 줄이 각각 사고의 기록이라 임의로 완화하지 마라.

```
통과 ⇔ Origin 존재 ∧ Origin ≠ "null"
       ∧ Origin.host == (x-forwarded-host ?? host)
       ∧ (Sec-Fetch-Site 가 있으면 그 값이 "same-origin")
```

- **`Origin` 부재를 통과시키지 마라.** "없으면 통과"는 흔한 완화지만 그 구멍으로 폼 제출이 다시
  들어온다. 서버-대-서버 호출자는 자기 자격증명을 들고 오므로 이 가드가 필요 없다 —
  면제가 필요하면 그 라우트에 마커로 명시한다.
- **`Sec-Fetch-Site` 를 단독 판정에 쓰지 마라.** `!== "cross-site"` 관용구는 플랫폼 존이
  `{tenant}.{zone}` 이라 테넌트끼리 `same-site` 여서 테넌트-대-테넌트 위조를 연 채로 남는다.
  **있으면 `same-origin` 일 때만**이라는 보조 신호로만 쓴다(안 보내는 브라우저가 있어 부재는 통과).
- **스킴을 비교하지 마라.** 오케스트레이터가 `x-forwarded-proto: "http"` 를 넣는데 공개 스킴은
  https 다. 비교하면 전 사이트가 즉시 죽는다. **호스트만 본다.**
- **env 화이트리스트를 쓰지 마라.** 커스텀 도메인·미리보기 호스트 조합에서 드리프트해 장애가 된다.
  **요청이 실제로 도달한 호스트와 비교**하는 자기참조가 정석이다.

구현·시험 본보기는 예제 레포의 `src/lib/crossOrigin.ts`(판정)와 `src/lib/http.ts`(응답)에 있다.

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
- 대상: `getOrder`·`getShipment`·`cancelOrder`·`startPayment`·`confirmPayment`·`completeOrder`·
  `submitInquiry`·`submitLead`·`recordPostView`(`[I2]`).
- ⚠ **`[I1]`·`[I2]` 는 어느 모드에서도 경고다** — 기계가 막지 않는다. 지키는 것은 사람이다.
- 안 하면 그 사이트 방문자가 한 IP 로 뭉쳐 **남의 오입력이 내 429 가 된다**(문의는 60초 3건).
  조회수는 429 가 아니라 **게시글마다 하루 한 건**으로 접혀 집계가 조용히 죽는다.

## 12. 서빙 산출물 — `[O1]`

**잘커라가 서빙하는 소스는 빌드가 `.next/standalone` 자기완결 산출물을 내야 한다.**
서빙 박스는 `next start` 가 아니라 그 산출물을 `node server.js` 로 띄운다.

- `next.config.ts` 의 **`output: "standalone"`** 한 줄. 지우면 `next build` 는 성공하고
  **서빙 게이트만 반려**한다 — 빌드가 그린이라 눈에 안 띄는 종류의 고장이다.
- ⚠ **`[O1]` 은 `--gate` 에서도 경고다.** 설정 파일의 글자만 읽어서는 빌드가 실제로 무엇을 낼지
  증명할 수 없기 때문이다. **`zalkera-validate` 가 초록이어도 이 자리는 반려될 수 있다** —
  판정은 산출물을 읽는 쪽에서 난다.
- `output: "export"`·`distDir` 변경도 같은 결과다.
- **런타임 파일시스템은 읽기 전용이다.** 아티팩트가 `:ro` 로 마운트된다. 런타임에 파일을 쓰는 코드
  (업로드 저장·로그 파일·생성 캐시)를 두지 마라 — 빌드는 통과하고 **서빙 중에 죽는다.**
  저장이 필요하면 백엔드 API 를 쓴다.
- 자체 호스팅(BYO)이면 해당 없다. 이 요건의 근거는 **누가 서빙하는가**다.

## 13. 문서 좌표 — `[D1]`

레포 루트에 **`AGENTS.md`** 를 둔다. codegen 이 탐색 전에 읽는 문서다.

- 그 문서가 **없는 파일을 백틱으로 가리키면 `[D1]` 에러**다. 죽은 좌표는 곧 탐색 낭비다.
- 파일을 지웠으면 `AGENTS.md` 의 그 좌표도 같이 지운다.

## 14. 넘기기 전에 — 반드시 돌릴 것

```bash
npm ci                             # package-lock.json 이 있어야 돈다
npx tsc --noEmit                   # 타입
npm run build                      # 빌드가 .next/standalone 을 내는지
npx zalkera-validate . --gate      # ← 이것이 게이트가 돌리는 그 검사기다
```

검사기는 `@zalkera/client` 안에 실려 온다 — 따로 받을 것이 없다. 서빙 게이트가 쓰는 것도 레포에
설치된 그 사본이다(`node_modules/@zalkera/client/bin/validate-storefront.mjs`).

⚠ **로컬 초록은 필요조건이지 충분조건이 아니다.** 두 가지가 남는다.

- **설치본의 판이 곧 잣대다.** 락파일이 핀한 그 판의 규칙으로 재진다. 넘기기 전에
  `@zalkera/client` 를 발행판으로 올리고 다시 재라.
- **검사기가 못 재는 축이 있다.** 아래 `[O1]`·X 축이 그렇다 — 경고로만 나오고 rc 를 안 올리는데,
  실제 반려는 빌드 산출물을 읽는 자리에서 난다(§12).

**`--gate` 를 붙여서 재라.** 안 붙이면 서빙 판정 축(E·C·C2)이 경고로 나와 통과처럼 보인다.

### 종료코드

| rc  | 뜻          | 할 일                                                                   |
| --- | ----------- | ----------------------------------------------------------------------- |
| 0   | 통과        | —                                                                       |
| 1   | 규약 위반   | 출력된 `[규칙ID]` 를 고친다                                             |
| 2   | 도구 오류   | 경로가 맞는지 확인. 크래시면 그대로 신고                                |
| 7   | **못 쟀다** | 통과가 아니다. 읽지 못한 파일·모르는 선언값을 고쳐 **다시 재게** 만든다 |

⚠ **rc=7 을 통과로 세지 마라.** "위반이 없다"가 아니라 **"검사가 안 돌았다"**는 뜻이다.

## 15. 넘길 때 — 출처는 사람이 대조한다

받는 쪽 도구는 zip 을 갈아 끼우기 전에 **어느 사이트 것인지** 확인창에 적는다. 그런데 네가 만든
zip 에는 출처 표식이 없다(§3). 그래서 확인창은 이렇게 뜬다.

```
출처 표시 없거나 읽을 수 없음 — 이 zip 이 어느 사이트의 것인지 도구는 알 수 없습니다.
이 폴더의 사이트: nasiajai. 파일 이름과 보낸 곳으로 확인해 주세요.
```

**이것이 정상이다.** 도구는 모르는 것을 모른다고 말한다 — 표식을 지어내 「확인됨」이라고 쓰는
것보다 낫다. 대신 **사람이 대조할 재료**를 네가 줘야 한다. 안 주면 그 확인창은 무용하다.

| | 규약 |
| --- | --- |
| 파일 이름 | `<테넌트코드>-<YYYYMMDD>.zip` — 예: `nasiajai-20260823.zip` |
| 납품 쪽지 | ⑴ 어느 테넌트 ⑵ 어느 **시작 소스 판**에서 출발했는지 ⑶ 무엇을 고쳤는지 |
| 보내는 곳 | 매번 같은 경로(같은 메일 스레드·같은 채널). 받는 사람이 「보낸 곳」으로도 대조한다 |

**⑵ 를 어디서 아나.** `.zalkera/pack.json` 의 `version` 이 그 값이다(`{"rev":1,"code":"skeleton","version":"3.2.5"}`
꼴). 그 파일은 시작 소스 팩에 실려 오는데 **고객이 지워도 되는 파일**이라(`CUSTOMIZE.md`) 없을 수 있다 —
없으면 받은 zip 이름이나 보낸 사람에게 확인해 적어라. **빈 디렉터리에서 처음부터 짠 것이면 그렇게
적어라**(「시작 소스 없음 · 처음부터 작성」). 모르면서 지어내지 마라 — 그것이 이 절이 막으려는 것이다.

> 여기서 「판」은 **시작 소스 팩의 판**이다. §14 의 「설치본의 판」(`@zalkera/client` 의 npm 판)과
> 다른 것이다 — 둘 다 적어 주면 받는 쪽이 재현하기 쉽다.

⚠ **`site.zip`·`final.zip`·`수정본.zip` 으로 보내지 마라.** 확인창이 「파일 이름으로 확인해
주세요」라고 말하는데 이름이 아무것도 안 말하면, 받는 사람은 **확인할 방법이 없는 채로**
되돌릴 수 없는 갈아 끼우기를 누르게 된다.

⚠ **소스를 받아 고친 것이면 표식이 따라올 수 있다 — 그리고 그것이 더 위험하다.**
「소스 zip 다운로드」로 받은 zip 에는 표식이 있다. 그것을 **범용 압축 도구(`unzip`)로 풀면 표식이
그대로 남고**, 다시 묶으면 따라간다. 잘커라 확장의 「zip 으로 시작」·「zip 으로 교체」로 풀 때만
떨어진다.

```bash
# 재현 — 받은 zip 을 범용 도구로 풀고 표식이 남는지 본다
unzip -o 받은소스.zip -d ./풀린것 && cat ./풀린것/.zalkera/provenance.json
```

따라오면 받는 쪽 확인창은 **「일치」**라고 뜬다. 내용은 네가 통째로 바꿔 놓았는데도 그렇다 —
그 표식이 말하는 것은 「이 바이트가 검증됐다」가 아니라 **「어느 사이트에서 나온 소스에서
출발했다」**뿐이기 때문이다. 그러니 표식에 기대지 말고 **위 규약을 지켜라.** 무엇을 고쳤는지는
표식이 말해 주지 않는다.

## 16. AI 에게 이 작업을 시킬 때

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
  선언을 지우면 관문이 rc=7 로 막는다 — 오류가 사라진 것처럼 보여도 통과가 아니다.
- .zalkera/provenance.json 과 .zalkera/source.json 을 만들지 마라. 잘커라 도구가 찍는
  표식이고, 들여올 때 떨어진다. 납품 zip 은 출처가 없는 것이 정상이다.
- 넘길 zip 은 `<테넌트코드>-<YYYYMMDD>.zip` 으로 이름 짓고, 어느 테넌트·어느 판에서
  시작했는지·무엇을 고쳤는지를 쪽지로 함께 보내라. 받는 쪽은 그것으로 대조한다.
```

⚠ **AI 가 "검사기가 틀렸다"고 하면 의심하라.** 선언을 지우는 것이 가장 짧은 길처럼 보이는데,
그 길은 고쳐진 것 없이 오류만 사라지게 한다. 관문은 그 형상을 rc=7 로 되돌려준다(§4).
