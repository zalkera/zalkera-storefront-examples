# 시안 HTML → 잘커라 소스 팩 변환 지시서

디자이너·대행사가 **완성해 건넨 HTML 1장**을 잘커라에 올릴 수 있는 Next.js 소스 팩으로
옮기는 절차입니다. 이 문서를 **그대로 LLM 에게 주고** 시안 HTML 과 시작 소스 팩 zip 을
함께 건네십시오.

> **다른 레인이면 여기가 아닙니다.**
> 거래처가 **이미 돌리고 있는 앱**을 통째로 옮기는 것이라면 → [`existing-app-to-pack.md`](existing-app-to-pack.md)
> 이미 개시한 사이트의 소스를 고치는 것이라면 → [`../CUSTOMIZE.md`](../CUSTOMIZE.md)
> 자기 스택으로 프론트를 통째로 짓는 것이라면 → [`byo-headless-guide.md`](byo-headless-guide.md)

## 시작 소스 팩은 **참고물**입니다 — 얹을 바닥이 아닙니다

만들 것은 **고객 시안 그대로의 사이트**입니다. 시작 팩(`skeleton` 등)은 그 사이트를 잘커라가
받아 줄 수 있게 만드는 데 **무엇이 필요한지 보여 주는 교본**입니다.

읽는 방법은 이렇습니다 — *「미리보기 관문이 이렇게 구현돼 있네? 그러면 이 파일을 가져와야
겠구나」* · *「라우트 이름이 `robots.ts` 와 짝지어져 있네? 그 규율을 지켜야겠구나」*.

**이렇게 하지 마십시오:**

| ❌ | 왜 |
| --- | --- |
| 시작 팩을 풀고 그 위에 시안을 얹는다 | 쓰지 않는 커머스 표면 여덟(`cart`·`checkout`·`products`·`orders`·`mypage`·`payment`·`login`·`blog`)이 딸려 배포됩니다. 시안에 없는 것은 팩에도 없어야 합니다 |
| 시작 팩의 얼굴(`content/pages/*.json`·프리셋 섹션·이미지)을 지워 가며 맞춘다 | 지우는 작업이 만드는 작업보다 커지고, 무엇이 남았는지 아무도 모르게 됩니다 |
| 레포 트리(`presets/` + 루트 `src/`)를 손으로 합친다 | `scripts/lib/test-floors.json` 이 배송본이 아니라 **레포본**으로 실려(레포본은 정본 전용 스위트까지 들어 있어 항목이 더 많습니다) 팩이 자기 검수에서 죽습니다 |

**이렇게 하십시오:** 시안이 요구하는 화면을 만들고, 잘커라가 요구하는 것만 시작 팩에서
**골라 가져옵니다.** 선은 **얼굴이냐 기능이냐**로 긋습니다.

| | 어디서 오나 | 무엇 |
| --- | --- | --- |
| **얼굴** | **시안** | `src/app/(landing)/page.tsx` · `(landing)/landing.css` · `(landing)/layout.tsx` 의 `metadata`·`viewport`(시안 `<head>` 의 값 + `metadataBase`·canonical 배선, §2-2 ⑴) · 홈 `Organization` JSON-LD(시안에 보이는 정체성, §2-2 ⑵) · `public/` 의 이미지·폰트 |
| **기능** | 시작 팩에서 가져옴 | `src/lib/**`(가드) · `scripts/**`(검수) · `src/middleware.ts` · `robots.ts`·`sitemap.ts`·`not-found.tsx` · `JsonLd.tsx`(안전 직렬화) · `next.config.ts`·`package.json`·`tsconfig.json` · `llms.txt` |
| **템플릿 페이지** | 시작 팩 얼굴 **그대로** | `src/app/(template)/` 아래 `layout.tsx`·`globals.css`·`contact/`·`policies/` · `src/components/` 는 `sections/` 만 빼고 그대로 · `content/nav.json` |
| 🔴 **안 가져옴** | — | `src/components/sections/**` · `content/pages/*.json` · `public/images/**` · 프리셋의 색·폰트·레이아웃 |

**넷째 줄이 이 레인의 존재 이유입니다.** 고객은 자기 디자인을 들고 왔습니다. 거기에 프리셋의
히어로·특징그리드·후기 섹션이 섞이면 **고객이 만든 것이 아닌 사이트**가 됩니다.

**셋째 줄은 그 반대 방향의 규율입니다.** `/contact`·`/policies` 는 시안에 없는 화면이라 시작 팩
얼굴로 서빙됩니다. 그 화면에 시안 CSS 가 닿으면 여백·입력칸이 밀려 깨지고, 반대로 시작 팩의
Tailwind 가 랜딩에 닿으면 시안이 어긋납니다. 그래서 둘을 **루트 레이아웃 둘**로 가릅니다(§2-1 ⑵).

> ⚠ **이 자리는 게이트가 안 잡습니다.** 프리셋 섹션 컴포넌트
> (`HeroSection`·`FeatureGridSection`·`TestimonialsSection` 등)를 가져오면, 시안의 `page.tsx` 가
> 그것을 한 번도 안 써도 `src/app/[slug]/page.tsx` 가 `SectionRenderer` 를 불러 **타입 검사는
> 통과합니다.** 즉 쓰지 않는 프리셋 얼굴이 조용히 실려 나갑니다 — 눈으로 확인하십시오.
> 랜딩 한 장짜리 시안이면 `[slug]` 로 갈 페이지도 없습니다. 지울 때는 §1-2 대로
> 라우트·`RESERVED_SEGMENTS`·`robots.ts` 셋을 같이 움직이십시오.

무엇이 필수인지는 §1-2(가드·`src/lib`)와 §3(검수)이 말합니다.

> 📦 **참고물은 어디서 받나**
> 잘커라 **콘솔에서 시작 팩 zip** 을 받으십시오. 랜딩 시안이면 `skeleton` 이 읽기 가장
> 쉽습니다 — 커머스 프리셋 셋은 얼굴이 붙어 있어 기능만 보기 어렵습니다.
>
> 이 레포를 체크아웃해 두셨다면 `node scripts/pack-preset.mjs --version <x.y.z> <프리셋>` 으로
> 같은 zip 을 구울 수 있습니다(`dist-presets/` 에 나옵니다 — `.gitignore` 라 GitHub 에는
> 없습니다). 어느 쪽이든 **구운 zip** 을 보십시오. 레포 트리를 손으로 합치면 안 됩니다.

## 신뢰 경계 — 먼저 읽으십시오

이 레인은 **제3자가 준 HTML·CSS·JS 를 우리가 서빙할 소스로 옮기는 일**입니다.
시안의 스크립트는 그대로 고객 사이트에서 돕니다.

- **시안의 출처를 확인하십시오.** 누가 만들었고 어디서 받았는지 모르면 시작하지 마십시오.
- **바이트 그대로 옮기더라도 시안 JS 를 한 번은 읽으십시오.** 무엇을 부르는지, 외부로 무엇을
  보내는지. 「그대로 옮긴다」는 「안 읽는다」가 아닙니다.
- **검수는 격리된 환경에서 돌리십시오.** `verify-zip` 은 zip 안의 스크립트를 검수자 기계에서
  실행합니다 — 그 러너는 스스로 격리하지 않는다고 자기 머리말에 적고 있습니다.

---

## 0. 이 레인이 무엇이고 무엇이 아닌가

**입력** — 고객이 완성해 건넨 HTML 1장. 스타일은 인라인 `<style>`, 동작은 인라인 `<script>`.
**출력** — 잘커라에 업로드해 서빙되는 Next.js 소스 zip 1개.
**성질** — 랜딩은 **정적**입니다. 마크업·CSS·스크립트가 소스에 하드코딩되고 **랜딩 페이지는** 백엔드를
부르지 않습니다(메타의 절대 URL·검색엔진 인증값만 env 로 들어옵니다). 백엔드 연동은 템플릿 페이지(문의·정책)와
`sitemap.ts` 의 몫이고, 상품·글·콘텐츠 페이지 같은 동적 콘텐츠가 생기는 날부터 헤드리스 연동이 들어옵니다.

**이 레인이 아닌 것** — 아래를 하라고 시키지 않았다면 하지 마십시오.

| 하지 않는 것 | 왜 |
| --- | --- |
| 섹션 어휘로 분해(`content/pages/*.json`) | 그건 「콘솔에서 말로 고치기」 레인이다. 디자인이 프리셋 번역판이 되어 원본과 달라진다 |
| 시안 CSS 를 Tailwind 로 재작성 | 원본 그대로가 요건이다. 재작성은 반드시 어긋난다 |
| 색을 토큰으로 바꾸기 | 시안 CSS 의 리터럴이 정본이다 |
| 없던 페이지·문구·이미지 추가 | 시안에 없으면 팩에도 없다. 파비콘도 이미지다(§2-5) |
| 시안이 가리키는데 안 준 파일을 추정으로 채우기 | 폰트·이미지 파일은 발주처에서 받는다(§2-5) |

**결과물의 성질을 정직하게 알고 시작하십시오.** 이 팩은 **소스를 LLM 으로 고치는** 팩입니다.
콘솔에서 말로 색·문구를 바꾸는 동선은 **없습니다**. 그 동선을 흉내 내는 배선을 남기면
콘솔이 성공 보고를 내고 화면은 안 움직이는 **거짓성공**이 됩니다(§1-3, §1-4).

---

## 1. 절대 하지 말 것

아래는 전부 **실제로 깨진 자리**입니다. 이유까지 읽으십시오 — 이유를 모르면 다시 밟습니다.

### 1-1. 맨바닥에서 짓지 마라 — 그렇다고 시작 팩 위에 얹지도 마라

`create-next-app` 으로 시작하면 미리보기 쓰기 관문·소독기·가드 스위트가 통째로 없어
검수에서 반려됩니다.

**시작 팩을 열어 두고, 잘커라가 요구하는 것만 골라 가져오십시오.** 그 목록은 아래 §1-2 가
말합니다 — `src/lib/` 와 `scripts/` 는 통째로, 라우트는 `robots.ts`·`RESERVED_SEGMENTS` 와
짝을 맞춰서.

⚠ **반대로 시작 팩을 풀어 그 위에 시안을 얹지도 마십시오.** 그러면 쓰지 않는 커머스 표면
여덟이 딸려 배포되고, 지우는 작업이 만드는 작업보다 커집니다. **만들 것은 시안 그대로의
사이트**이고, 시작 팩은 그것을 잘커라가 받아 줄 수 있게 하는 **부품 창고**입니다.

### 1-2. 랜딩이 안 쓴다고 라우트를 지우지 마라

`contact/`·`policies/`(§2-1 뒤에는 `src/app/(template)/` 아래) · `sitemap.ts` · `media/[id]` ·
`not-found.tsx` 는 랜딩에서 링크되지 않아도 **남깁니다**.

`contact`·`policies` 를 지우면 `src/lib/reservedSegments.test.ts` 가 반려합니다. 그 시험은
`RESERVED_SEGMENTS` 가 **«실제 라우트» ∪ «robots.txt 의 disallow»** 와 정확히 같은지
양방향으로 못 박고, 게다가 **둘 다 1건 이상**일 것을 요구합니다(공회전 방지).
`api/` 는 하위에만 `route.ts` 가 있어 라우트로 세지 않으므로 `/` 하나만 남기면 만족시킬 방법이
없습니다. 라우트 그룹 안쪽은 그 시험이 세 겹까지 내려가 봅니다 — `(template)/contact` 도 `contact` 로 셉니다.

두 페이지는 시험 때문에만 남는 것이 아닙니다. `/contact` 는 문의 접점(BFF `/api/inquiry`),
`/policies` 는 콘솔에서 채우는 정책·사업자 정보 화면입니다. **시작 팩 얼굴 그대로** 서빙되어야
하고, 그래서 §2-1 ⑵ 가 랜딩과 다른 루트 레이아웃에 둡니다.

⚠ **그 시험이 전부를 보지는 않습니다.** `sitemap.ts`·`media/[id]`·`not-found.tsx` 를 지워도
`npm test`·`verify-zip` 은 말이 없고, `validate` 도 §1-3 대로 `name` 을 바꾼 뒤에는 조용합니다
(`[D2]` 는 본보기 레포에서만 돕니다) — 그래서 남기는 것을 여기서 규칙으로 못 박습니다.

부득이 지우려면 **셋을 같이** 움직이십시오:
라우트 디렉터리 · `src/lib/reservedSegments.ts` 의 `RESERVED_SEGMENTS` · `src/app/robots.ts` 의 `disallow`.

**`src/lib/` 와 `scripts/` 는 통째로 남기십시오.** 파일 단위로 고르지 마십시오 —
하한표(`scripts/lib/floors.mjs` 의 `REQUIRED_FLOORS`)가 스위트별 시험 수를 요구하고,
그 요구는 **검사기 자신의 표**로 집행되므로 zip 안의 표를 고쳐서 낮출 수 없습니다.

덫이 있습니다.

- **`src/middleware.ts`** — 미리보기 쓰기 관문입니다. 「미리보기 관문 등재」 검사가 빌드
  산출물에서 이것을 찾습니다.

### 1-3. `package.json` 의 `zalkera` 선언을 **지워라**

시작 팩에는 **이미 들어 있습니다.**

```jsonc
// 시작 팩의 package.json — 이 두 줄을 지운다
"zalkera": { "styling": "tailwind-tokens", "content": "source" }
```

선언은 「색이 토큰이고 문구가 `content/` 에 있다」는 **약속**입니다. 시안 CSS 를 그대로 쓰는
이 팩은 둘 다 아닙니다. 남겨 두면 `[S2]`·`[S4]`·`[S8]`·N 규칙이 **error 로 격상**돼 반려됩니다.

> 시안 문구를 `content/pages/*.json` 으로 분해했다면 `"content": "source"` 만 남기십시오.
> 지우는 것은 **지키지 못하는 약속뿐**입니다.

확인: `node -e 'console.log(JSON.parse(require("fs").readFileSync("package.json")).zalkera)'`

**`name` 도 사이트 이름으로 바꾸십시오.** `@zalkera/storefront-examples` 그대로 두면 검사기가 이 트리를
본보기 레포로 보고 본보기 전용 검사(`[D2]` — `llms.txt` 가 지목한 `src/app/[slug]/page.tsx`·`src/app/page.tsx`
등의 부재를 경고)를 돌립니다. 이름은 이 사이트의 신원입니다.

확인: `node -e 'console.log(JSON.parse(require("fs").readFileSync("package.json")).name)'`

### 1-4. 테마 주입 배선을 남기지 마라

시작 소스에는 이제 그 배선이 **없습니다**(색의 정본이 `globals.css` 의 `@theme` 하나입니다).
옛 소스를 참고하다 `parseThemeColors` → `<html style={cssVars}>` 를 옮겨 오지 마십시오 —
읽을 값이 없어 아무 일도 안 하는 배선이 됩니다.

### 1-5. 시안 `<script>` 를 TSX 문자열에 넣지 마라

시안 안에 JS 템플릿 리터럴(백틱·`${}`)이 있으면 이스케이프가 **두 번 깨집니다**:

| 시도 | 결과 |
| --- | --- |
| **String.raw** 템플릿 | 백슬래시가 살아남아 주입 시 `SyntaxError: Invalid or unexpected token` |
| 일반 템플릿 리터럴 `` `...` `` | SWC 가 `Expected unicode escape` 로 **빌드 반려** |

**`public/mockup.js` 에 한 글자도 안 고치고 넣고 `<script src>` 로 실으십시오**(§2-4).
별도 `.js` 파일이면 이스케이프가 한 겹도 없어 이 버그 종류가 사라집니다.

### 1-6. 외부 링크를 남기지 마라

Google Fonts·CDN·트래커·분석 비콘은 전부 팩 안으로 내리거나 지웁니다(§2-5).
테넌트 사이트가 남의 호스트에 의존하면 그 호스트가 죽을 때 같이 죽습니다.

**예외는 하나 — 발주처가 측정 ID 를 준 분석 태그.** 시안에 박혀 온 GTM·GA 로더 스니펫은 걷고(§2-4 ⑷),
그 대신 시작 팩의 `src/components/Analytics.tsx` 를 랜딩 레이아웃에 렌더합니다(§2-1 ⑵). 그 컴포넌트는
`NEXT_PUBLIC_GA4_ID` 가 있을 때만 GA4 로더를 싣고 없으면 아무것도 내지 않습니다. ID 는 **소스에 박지 않습니다**
— 관리형은 콘솔 「사이트 환경변수」, 자체 배포는 `.env.local` 에 둡니다. 시안 스크립트에서 발견한 컨테이너·측정
ID 는 자리표시자 표에 올려 발주처에 확인하고, 확인된 **GA4 측정 ID(`G-…`)** 를 그 자리에 넣습니다. GTM 컨테이너
ID(`GTM-…`)는 그 자리에 안 들어갑니다(§2-4 ⑷).

---

## 2. 절차

### 2-1. 시작 소스 준비 — **기능은 남기고 얼굴은 통째로 버린다**

시작 팩을 풀고, **프리셋의 얼굴을 한 조각도 남기지 않은 뒤** 그 자리에 시안을 놓습니다.
「그 위에 얹기」와 다른 점은 이것입니다 — 디자인은 **시안 100%** 이고, 프리셋에서 살아남는
것은 잘커라가 요구하는 **기능·배선뿐**입니다.

```bash
unzip -q <시작소스팩>.zip -d ref     # 참고물 원본. 손대지 않습니다
cp -r ref pack && cd pack
```

**⑴ 시안이 안 쓰는 표면을 걷습니다.**

```bash
rm -rf src/app/{cart,checkout,products,orders,mypage,payment,login,blog,auth,c}   # 커머스 표면
rm -rf src/components/sections content/pages                                      # 프리셋 얼굴
rm -rf docs CUSTOMIZE.md README.md AGENTS.md                                      # 참고 문서
rm -rf src/app/'[slug]'                                                           # content/pages 가 비면 못 씀
```

**⑵ 랜딩과 템플릿 페이지를 루트 레이아웃 둘로 가릅니다.**

시안 CSS 는 전역 리셋·배경·타이포를 담고, 시작 팩의 `/contact`·`/policies` 는 Tailwind
유틸리티와 `@theme` 토큰으로 그려집니다. 한 문서에 두면 어느 한쪽이 깨집니다 — 시안 CSS 의
`* {margin:0}` 같은 리셋이 템플릿 페이지의 여백·입력칸을 밀어 버리거나, Tailwind 의 preflight 가
랜딩에 스며듭니다. Next 의 라우트 그룹으로 **루트 레이아웃을 둘** 두면 문서가 갈라져 서로의
스타일시트가 닿지 않고, 그룹 사이 이동은 전체 페이지 로드가 됩니다.

```bash
mkdir -p 'src/app/(landing)' 'src/app/(template)'
mv src/app/layout.tsx src/app/globals.css src/app/contact src/app/policies 'src/app/(template)/'
rm src/app/page.tsx                                   # 시작 팩 홈 — 시안이 대신한다
```

`(template)/` 아래 파일은 고치지 않습니다. `layout.tsx` 의 `import "./globals.css"` 는 같이 옮겼으므로
그대로 풀리고, `SiteHeader`·`SiteFooter`·컨테이너·`generateMetadata()` 도 그 안에서 그대로 삽니다 —
그 화면은 시작 팩 얼굴이 정본입니다. 예외는 둘입니다.

- `globals.css` 머리말 주석의 「레포의 유일한 CSS 파일 … 다른 CSS 파일을 추가하지 않는다」 두 문장은
  지웁니다 — 이 팩은 `landing.css` 를 따로 쓰므로 거짓이 되고, 다음 LLM 이 그것을 지우라는 지시로 읽습니다.
- **`SiteHeader`·`SiteFooter` 에 ⑴ 이 지운 라우트로 가는 링크가 있으면 그 줄만 지웁니다.** 커머스
  프리셋(`beauty-nail`·`shop-goods`)의 헤더는 `/cart`·`/login`·`/mypage` 를 하드코딩합니다 — 그대로 두면
  `/contact` 헤더가 404 링크를 싣고 나가는데, §3 의 어느 검사도 링크를 눌러 보지 않습니다.
  `skeleton`·`biz-standard` 의 헤더는 `/` 와 `nav.json` 만 씁니다.

랜딩 쪽은 새로 씁니다.

```tsx
// src/app/(landing)/layout.tsx — 랜딩의 루트 레이아웃. 얼굴은 시안이 든다.
import "./landing.css";
import type {Metadata, Viewport} from "next";
import type {ReactNode} from "react";
import {metadataBaseUrl} from "@/lib/site";
import {Analytics} from "@/components/Analytics";   // env 에 GA4 측정 ID 가 있을 때만 로더를 싣는다(§1-6)

export const metadata: Metadata = {
    metadataBase: metadataBaseUrl(),
    alternates: {canonical: "./"},
    title: "<시안의 <title>>",
    description: "<시안의 <meta name=\"description\">>",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover", // 시안 <meta name="viewport"> 에 viewport-fit=cover 가 있을 때만. 없으면 이 키를 뺀다
    themeColor: "<시안의 <meta name=\"theme-color\">>", // 둘 이상이면 첫 값(브라우저가 첫 값을 쓴다). 없으면 이 키를 뺀다
};

// <html lang> 은 시안 값 그대로. 시안에 없을 때만 "ko". <body> 클래스도 시안 <body class> 그대로(§2-2).
export default function LandingLayout({children}: {children: ReactNode}) {
    return (
        <html lang="ko">
            <body>
                {children}
                <Analytics />
            </body>
        </html>
    );
}
```

`src/app/(landing)/page.tsx` 에 시안 `<body>` 를(§2-2), `src/app/(landing)/landing.css` 에 시안
`<style>` 을(§2-3) 놓습니다.

`src/app/not-found.tsx` 는 루트에 그대로 두고 첫 줄에 `import "./(template)/globals.css";` 를 더합니다.
루트 레이아웃이 없는 자리라 Next 가 자기 기본 `<html><body>` 로 감싸므로 스타일시트는 스스로 실어야
하고, `SiteHeader`·`SiteFooter` 는 붙지 않습니다 — 404 는 템플릿 톤이되 헤더·푸터 없는 한 장입니다.
그 파일 머리말 주석의 「레이아웃 안에서 그려지므로 헤더·푸터가 붙고」와 「`notFound()` 를 부르는 자리가
넷」 문장은 이 팩에서 거짓이 되므로 지웁니다(그 자리들은 ⑴ 이 지웠습니다).

> ⚠ **루트 `src/app/layout.tsx` 를 남기지 마십시오.** 그 파일이 있으면 그룹의 `layout.tsx` 는 중첩
> 레이아웃이 되어 `<html>` 이 겹치고, 두 CSS 가 한 문서에 실려 위의 깨짐이 그대로 돌아옵니다.
> 라우트 그룹은 `reservedSegments.test.ts` 와 `verify-zip` 의 라우트 도출이 둘 다 이해합니다.

**⑶ 라우트를 지웠으면 셋을 같이 움직입니다**(§1-2). 남은 라우트가 `contact`·`policies` 뿐이면:

```ts
// src/lib/reservedSegments.ts
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set(["contact", "policies", "api"]);
```

```ts
// src/app/robots.ts — ⚠ 끝 슬래시를 떼십시오
disallow: ["/api"],
```

> ⚠ **`"/api/"` 로 두면 시험이 죽습니다.** 끝에 `/` 가 붙은 항목은 **하위만** 막는 것이라
> `reservedSegments.test.ts` 가 근거로 안 셉니다. 그 시험은 「가려짐」과 「robots 근거」가
> **둘 다 1건 이상**일 것을 요구하므로(공회전 방지), 근거가 0이 되면
> `robots 의 disallow 를 하나도 못 찾았다` 로 반려합니다.

**⑷ `content/index.ts` 는 남기되 비웁니다**(`src/lib/content.ts` 가 이 모듈을 읽습니다):

```ts
import nav from "./nav.json";

/** slug → 페이지 콘텐츠. **키가 곧 URL 경로**다. */
export const pages: Record<string, unknown> = {};

export {nav};

export const pageSlugs = () => Object.keys(pages);
```

**⑸ `.zalkera/pack.json` 을 지웁니다.** 카탈로그 팩의 신원이라 남기면 이 사이트가 남의 팩
이름으로 적재됩니다.

`content/nav.json` 은 템플릿 페이지의 `SiteHeader`·`SiteFooter` 가 읽으므로 `header`·`footer` 의
`{label, href}` 목록을 채웁니다(`/policies`·`/contact` 링크 정도). 랜딩 시안은 이 파일을 안 읽습니다.

> ⚠ **같은 주소를 가리키는 링크가 둘 이상이면 렌더 쪽 `key` 를 확인하십시오.**
> 「이용약관」과 「개인정보처리방침」이 둘 다 `/policies` 로 가는 것은 **정상**인데,
> `SiteHeader`·`SiteFooter` 가 `key={it.href}` 로 잡고 있으면 React 가 중복 키로 경고하고
> 항목을 빠뜨릴 수 있습니다. 이 목록은 순서가 곧 화면이므로 **인덱스가 안정된 키**입니다.

**⑹ 여기서 `npx tsc --noEmit` 과 `npm test` 를 돌리십시오.** 둘 다 rc 0 이어야 합니다(`(landing)/page.tsx` 는
아직 없어도 오류가 아닙니다). `npm test` 가 ⑶ 의 `RESERVED_SEGMENTS`·`disallow` 어긋남을 이름을 대고
잡습니다. 오류가 있으면 지운 것과 남긴 것이 어긋난 것입니다.

### 2-2. 마크업 — `<body>` → `src/app/(landing)/page.tsx`

**구조·클래스·문구를 한 글자도 바꾸지 마십시오.** 바꾸는 것은 JSX 문법상 불가피한 것뿐입니다.

> 랜딩의 루트 레이아웃은 `<html lang><body className>` 껍데기입니다(§2-1 ⑵). 시안이 자기
> 헤더·푸터·레이아웃을 갖고 있으므로 거기에 시작 팩의 `SiteHeader`·`SiteFooter`·폭 제한 컨테이너를
> 얹지 마십시오 — 두 벌이 되고, 폭 제한이 전폭 히어로를 자릅니다. 시안 `<body>` 에 클래스가 있으면
> 그 클래스는 랜딩 레이아웃의 `<body className>` 으로 옮깁니다.

| HTML | JSX | 비고 |
| --- | --- | --- |
| `class=` | `className=` | |
| `for=` | `htmlFor=` | |
| `tabindex=` | `tabIndex=` | 다른 속성도 camelCase |
| `viewbox=` `stddeviation=` | `viewBox=` `stdDeviation=` | SVG 속성은 대소문자를 가린다 — `tsc` 가 잡아 준다 |
| `stop-color=` `stroke-width=` | `stopColor=` `strokeWidth=` | **하이픈 표기는 `tsc` 가 안 잡는다**(아래) |
| `tabindex="0"` | `tabIndex={0}` | 숫자를 요구하는 속성은 `{0}` 으로 |
| `hidden=""` `disabled=""` | `hidden` `disabled` | 빈 문자열 불리언은 맨 속성으로 |
| `<br>` `<img>` `<input>` | `<br />` `<img />` `<input />` | void 요소는 자기닫힘 |
| `<!-- 주석 -->` | `{/* 주석 */}` | |
| `style="a:b;c:d"` | `style={{a: "b", c: "d"}}` | 속성명 camelCase |
| `onclick="f()"` | `data-onclick="f()"` | **JSX 는 문자열 이벤트 핸들러를 안 받는다.** §2-4 가 위임으로 잇는다 |

속성값에 따옴표가 섞이면 문자열 리터럴이 깨집니다 — **값을 전부 JSON 인코딩**해서 넣으십시오.
손으로 하지 말고 변환 스크립트를 쓰십시오.

#### ⚠ 하이픈 SVG 속성은 타입 검사를 그냥 통과합니다

`stop-color`·`stroke-width`·`text-anchor`·`font-family`·`letter-spacing`·`pointer-events` 같은
표기는 JSX 에서 **식별자가 될 수 없어 TypeScript 가 임의 속성으로 허용**합니다. `tsc` 가 조용하고,
브라우저에서만 «Invalid DOM property `stop-color`. Did you mean `stopColor`?» 가 뜹니다.
(소문자 `stddeviation` 은 반대로 `tsc` 가 잡습니다 — 그래서 하나는 잡히고 하나는 새는 일이 생깁니다.)

찾는 법:

```bash
grep -oE '\s(stop|stroke|fill|flood|clip|marker|text|dominant|color|font|letter|pointer)-[a-z-]+=\{' 'src/app/(landing)/page.tsx' | sort -u
```

#### ⚠ 텍스트 노드 둘

**⑴ 개행이 든 텍스트는 문자열로 감싸십시오.** JSX 는 텍스트 노드의 개행을 공백 하나로 접는데,
시안이 `white-space: pre-line` 을 쓰면 그 개행이 **줄바꿈**입니다. 접히면 문단이 한 줄로 붙습니다.

```jsx
<p className="lede">{"휴대폰만 있다면\n24시간 365일 어디서든"}</p>
```

감쌀 때 **HTML 엔티티를 먼저 푸십시오.** JSX 텍스트 노드는 `&nbsp;` 를 해석하지만 문자열
리터럴은 안 합니다 — 안 풀면 화면에 `&nbsp;` 가 글자 그대로 찍힙니다.

**⑵ 공백만 있는 노드는 감싸지 마십시오.** HTML 파서는 태그 사이 공백을 버리는데 문자열
리터럴은 **진짜 텍스트 노드**가 됩니다. `<table>`·`<thead>`·`<tbody>`·`<tfoot>`·`<tr>`·
`<colgroup>` 밑에서는 그것이 금지라 React 가 하이드레이션 오류를 냅니다.
(`<ul>`·`<select>` 는 텍스트 자식을 허용하므로 해당 없습니다.)

#### ⚠ 렌더된 DOM 을 떠 온 시안이면 런타임 잔재가 섞입니다

`<div hidden></div>`(Next 포털 루트)·`<next-route-announcer>` 같은 것은 **디자인이 아닙니다.**
빌드를 깨뜨리므로 걷어내십시오. 디자이너가 손으로 쓴 시안에는 없고, 라이브 사이트를 떠 온
시안에만 나옵니다.

#### SEO·AEO 메타 — 시안의 것을 옮기고, 기계용 그래프 하나를 얹는다

화면은 시안 그대로입니다. SEO·AEO 로 **이 레인이 새로 쓰는** 자리는 `<head>` 메타와 JSON-LD 입니다
(robots·sitemap 은 시작 팩 것을 그대로 씁니다). 값은 **시안에 있던 것**(문구·연락처)이고, 예외는 아래
블록에 주석으로 적힌 기본값뿐입니다. 랜딩은 백엔드를 부르지 않습니다(§0) — 콘솔의 사업자 정보는
템플릿 페이지가 쓰는 것이고 여기로 끌어오지 않습니다. 플랫폼의 AEO 보장표
(`@zalkera/client/contracts/aeo-surface-guarantees.json`)가 재는 사이트 축은 robots · sitemap · sitemap 의 보장
라우트 포함 · JSON-LD 의 절대 URL 이고, 「비즈니스 홍보(MARKETING)」 카테고리는 홈에 `Organization`
(업종에 따라 `LocalBusiness`·`BeautySalon` 으로 좁혀도 통과) JSON-LD 를 요구합니다. 판정 지점은 소스가
아니라 **개시된 산출물**입니다.

**⑴ `<head>` → §2-1 ⑵ 에서 만든 `(landing)/layout.tsx` 의 `metadata` 를 이것으로 대체합니다**(`import` 와
`viewport` 는 §2-1 ⑵ 그대로, `icons` 는 §2-5 가 여기에 더합니다). 값은 시안 `<head>` 에서 그대로 옮깁니다.

```ts
// src/app/(landing)/layout.tsx — §2-1 ⑵ 의 metadata 를 이것으로 바꾼다(import 는 그대로)
export const metadata: Metadata = {
    metadataBase: metadataBaseUrl(),
    alternates: {canonical: "./"},                 // 두 호스트(플랫폼 서브도메인·커스텀 도메인)를 정본 하나로 모은다
    title: "<시안 <title> 그대로>",
    description: "<시안 <meta name=description> 그대로>",
    keywords: ["<시안 <meta name=keywords> 를 쉼표로 나눈 그대로>"],   // 시안에 있을 때만
    openGraph: {                                    // 시안에 og:* 가 있을 때만, 값은 그대로
        type: "website",                            // og:type·og:locale 은 시안에 있으면 그 값, 없으면 이 기본값(문서 언어와 같다)
        locale: "ko_KR",
        url: "./",                                  // 시안의 자리표시자 호스트(https://….example.com/) 대신 canonical 과 같은 상대경로
        siteName: "<og:site_name 그대로>",           // 있을 때만
        title: "<og:title 그대로>",
        description: "<og:description 그대로>",
        // images: 시안의 og:image 가 없는 파일(자리표시자 호스트)을 가리키면 넣지 않는다 — 자리표시자 표에 올린다.
    },
    // twitter:card 는 summary·summary_large_image 만 그대로 옮긴다. 그 밖의 값이면 twitter 를 통째로 빼고 NOTE 에 적는다.
    twitter: {card: "<twitter:card 그대로>", title: "<twitter:title>", description: "<twitter:description>"},   // 있을 때만
    // 검색엔진 소유 확인 메타 — 콘솔 「사이트 환경변수」 값이 env 로 들어온다. 비어 있으면 태그를 안 낸다(빈 content 는 검증 실패).
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ||
    process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim()
        ? {
              verification: {
                  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
                      ? {google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.trim()}
                      : {}),
                  ...(process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim()
                      ? {other: {"naver-site-verification": process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION.trim()}}
                      : {}),
              },
          }
        : {}),
};
```

`verification.google` 은 `<meta name="google-site-verification">` 로, `other` 는 `<meta name="naver-site-verification">` 으로
나갑니다. 값은 Search Console·서치어드바이저가 주는 확인 문자열이고 **소스에 박지 않습니다** — 두 콘솔에서 사이트를 등록해
`/sitemap.xml` 을 제출하는 일은 개시 뒤 오너 몫입니다(§5).

넣지 않는 것 — `robots: {index: false}`(발견 경로를 우리 손으로 닫는 일) · 시안에 없던 문구·키워드 · 없는
이미지 · `authors`·`publisher` 같은 창작 필드. 본문 쪽(제목 태그 구조·`alt`·문구)은 손대지 않습니다 —
문제가 보이면 고치지 말고 NOTE 의 발주처 확인 항목에 적습니다.

**⑵ 홈 JSON-LD — `Organization` 하나, 시안에 보이는 정체성으로 하드코딩.** `(landing)/page.tsx` 에 객체
리터럴로 둡니다. 백엔드·콘솔을 부르지 않으므로 페이지는 정적 그대로이고 `ZALKERA_TENANT` 도 필요 없습니다.
시작 팩 홈의 `getSiteConfig`·`generateMetadata()`·`organizationJsonLd` 는 **옮기지 않습니다**(아래 ⚠).

```tsx
import {siteUrl} from "@/lib/site";
import {JsonLd} from "@/components/JsonLd";                    // 안전 직렬화(`</script>` 이스케이프)만 빌려 쓴다
import {MockupBehavior} from "@/components/MockupBehavior";   // 실행 스크립트가 있는 팩만(§2-4)

/** 시안에 보이는 정체성만 — 시안에 없는 필드는 넣지 않는다. */
const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",                                   // 주소가 시안에 없으므로 LocalBusiness 로 좁히지 않는다
    name: "<시안의 og:site_name, 없으면 <title> 에서 구분자(-·—·|) 앞의 브랜드 토막>",
    url: siteUrl(),                                            // ZALKERA_SITE_URL 로 만든 절대 URL — 보장표 「절대 URL」
    telephone: "<시안 tel: 링크의 번호 — 있을 때만, 표기 그대로>",
};

export default function Home() {
    return (
        <>
            {/* … 시안 <body> 그대로 … */}
            <JsonLd data={organization} />
            <MockupBehavior />
        </>
    );
}
```

- `siteUrl()` 은 env 만 읽습니다(`robots.ts`·`sitemap.ts` 와 같은 값). 빌드 때 박히므로 §3-0 의
  `ZALKERA_SITE_URL` 이 없으면 `http://localhost:3000` 이 그래프에 남습니다.
- 시안의 `tel:` 번호는 자리표시자일 수 있습니다(§2-6). 자리표시자 표에 올린 번호를 여기에도 같은 값으로
  두고, 발주처가 바꾸면 둘을 같이 바꿉니다.
- 이 팩은 「비즈니스 홍보」 **간판은 못 겁니다** — 그 카테고리는 CMS 페이지 라우트(`/{slug}`)의 SSR 도
  요구하는데 §2-1 ⑴ 이 그 라우트를 지웁니다(콘텐츠 페이지가 없으므로). 간판과 무관하게 `Organization`
  그래프는 답변 엔진이 사이트 주체를 읽는 자리라 넣습니다. 보장표대로 「못 거는 것은 간판뿐」입니다.
- **만들지 않는 것**: 시안의 후기·별점·처리 건수는 시뮬레이션입니다 — `Review`·`AggregateRating` 을 내지
  않습니다(보장표의 의도적 부정 보장). `Product`·`Offer` 도 내지 않습니다 — 이 팩은 상품을 팔지 않고, 그 둘은
  쇼핑몰 칸의 required 표면이라 팔 것이 없는 사이트에서는 거짓 진술이 됩니다. 카카오 오픈채팅 주소는
  `sameAs` 가 아닙니다(소셜 프로필이 아닙니다). 시안에 없는 주소·이메일을 채우지 않습니다.
- 선택: 시안에 FAQ 섹션이 있으면 `FAQPage` 를 더할 수 있습니다. 화면에 **정적으로 보이는** 질문·답을 한
  글자도 바꾸지 않고 옮기고, 스크립트가 나중에 그리는 항목은 넣지 않으며, 팩당 하나입니다. 문구를 고칠 때
  둘을 같이 고쳐야 하는 부담이 생기므로 발주처가 원치 않으면 생략합니다.

> ⚠ **랜딩 레이아웃에는 정적 `metadata` 만 두십시오.** 시작 팩 루트 레이아웃의 `generateMetadata()`
> 를 여기로 옮겨 오면 Next 는 그것만 읽고 정적 `metadata` 를 **아예 안 읽습니다.** 시안 제목이 안
> 뜨는데도 화면은 멀쩡해 보여서 — 본문 글자수·높이·콘솔 오류 어느 것도 `<title>` 을 안 보므로 —
> 검증을 그대로 통과합니다. §3 에서 제목을 눈으로 대조하십시오.
> 랜딩 **페이지**에도 `generateMetadata()`(시작 팩 홈의 `pageMetadata`)를 두지 마십시오 — `openGraph` 는
> 얕은 교체라 ⑴ 로 옮긴 시안 `og:*` 가 통째로 콘솔 회사명으로 바뀌고, `<title>` 은 멀쩡해서 눈에 안 띕니다.
> 시작 팩 홈의 `getSiteConfig()`·`organizationJsonLd()` 도 옮기지 마십시오 — 랜딩이 백엔드를 물게 되고
> 정적이 아니게 됩니다(§0).
> `(template)/layout.tsx` 의 `generateMetadata()` 는 그대로입니다 — 그 문서의 제목은 콘솔의
> 회사명이 정본입니다.

- **`theme-color` 가 둘 이상이면 첫 값을 씁니다.** 브라우저는 문서 순서에서 첫 `theme-color` 를
  읽습니다.
- **`<title>`·`<meta>` 가 `<body>` 안에 있는 시안이 있습니다.** 브라우저는 그대로 두므로 화면에는
  안 보이지만, 옮기지 않으면 레이아웃의 제목과 두 벌이 됩니다. `<head>` 에 있던 것과 똑같이
  레이아웃으로 옮기고 본문에서는 뺍니다. §3 의 본문 글자수 대조에서 시안 쪽에만 그 문구가 섞이니
  제외하고 견주십시오.

### 2-3. 스타일 — `<style>` → `src/app/(landing)/landing.css`

**시안 CSS 를 한 글자도 고치지 마십시오.** 예외는 아래 두 곳(⑴⑵)과 §2-5 의 `data:` 추출뿐입니다.

`landing.css` 는 **§2-5 의 `@font-face` + 시안 CSS 원문**입니다. Tailwind 는 한 줄도 들이지
마십시오.

| `landing.css` 에 | 왜 안 되나 |
| --- | --- |
| `@import "tailwindcss";` | **preflight**(브라우저 기본값 리셋)가 딸려 와 여백·글꼴 기본값이 밀린다. 시안에 없던 규칙이다 |
| `@import "tailwindcss/theme.css"`·`utilities.css` | 랜딩은 유틸리티를 안 쓴다. 템플릿 페이지의 유틸리티는 `(template)/globals.css` 가 **자기 문서**에서 싣는다(§2-1 ⑵) |

시안 CSS 자체가 Tailwind 빌드여도 같습니다 — 라이브 사이트에서 뜬 시안이 그렇습니다(`@layer` 가
들어 있고 수백 KB). 그것도 시안 CSS 원문이므로 그대로 놓고 아무것도 얹지 않습니다.
판별: `grep -c '@layer' <시안>.html` 이 0 이 아니고 `<style>` 이 수백 KB 면 그쪽입니다.

#### 시안 CSS 에서 손대는 두 곳

**⑴ `@import url(...)` 은 지웁니다.**
CSS 는 `@import` 가 모든 규칙보다 앞서야 합니다. 앞에 `@font-face` 가 놓이면 그 `@import` 는
규칙 뒤로 밀려 `next dev` 가 **못 뜹니다**. 폰트는 §2-5 로 내려 `@font-face` 가 대신합니다.

> ⚠ **`next build` 는 이것을 경고로만 찍고 rc=0 을 냅니다.** 종료 코드만 보면 못 잡습니다.

**⑵ 파서를 죽이는 오타는 «브라우저가 어떻게 처리하는지 재고» 걷어냅니다.**
시안에 문법 오류가 있을 수 있습니다(실제 사례: `@media` 안에서 `.wrap{padding:0 16px` 가
안 닫혀 다음 규칙까지 삼킴). Lightning CSS 는 하드 에러, 브라우저는 조용히 버립니다.

**고치기 전에 먼저 재십시오.**

```js
// 시안을 브라우저로 열고
getComputedStyle(document.querySelector('.wrap')).padding
```

- **적용 안 됨(=죽은 규칙)** → 지웁니다. 화면이 안 바뀝니다. 지운 사실을 `NOTE.md` 에 적습니다.
- **적용됨** → 오타를 고칩니다. 화면이 바뀔 수 있으니 **발주처에 확인**하십시오.

### 2-4. 스크립트 — `<script>` → `public/mockup.js`

`src=` 없는 `<script>` 중 **실행되는 것만** 골라 `public/mockup.js` 에 **바이트 그대로** 씁니다.

#### 무엇을 골라 어떻게 잇나

**⑴ `type` 을 보십시오.** `type="application/json"` 같은 블록은 실행 코드가 아니라 **데이터**이고,
시안 스크립트가 `document.getElementById('...').textContent` 로 읽습니다. 실행 스크립트에 이어
붙이면 세미콜론 자동 삽입(ASI)이 깨져 앞뒤가 한 문장으로 합쳐집니다.

```js
[{"n":"조시우", …}]        ← JSON 배열이 세미콜론 없이 끝남
(function(){ … })();       ← 다음 블록
```

→ JS 가 **배열을 함수로 호출**하는 것으로 읽습니다: `[{…}] is not a function`.

데이터 섬은 **마크업에 남깁니다.** JSX 에서는 텍스트 자식으로 두면 중괄호 이스케이프가 JSON 을
망가뜨리므로 `dangerouslySetInnerHTML` 로 넣으십시오.

```tsx
<script type="application/json" id="rvPool" dangerouslySetInnerHTML={{__html: "[{…}]"}} />
```

**⑵ 블록은 `;` 로 이으십시오.** 개행만으로 이으면 위와 같은 ASI 사고가 납니다.
빈 문장 `;` 은 어디에 놓아도 안전합니다.

```python
js = "\n;\n".join(blocks)
```

이었으면 세어 보십시오 — `grep -c '^;$' public/mockup.js` 가 0 이면 개행으로만 이은 것입니다
(블록 안에 `;` 단독 줄이 없다면 블록 수 − 1 이 나옵니다).

**⑶ 렌더된 DOM 을 떠 온 시안이면 런타임 데이터가 섞여 옵니다.** `self.__next_f.push(...)`
(Next 의 RSC 플라이트 페이로드) 같은 것은 서버 없이는 뜻이 없고, 편집 과정에서 따옴표가 깨져
**스크립트 전체를 실행 불가**로 만듭니다. `__next_f`·`__next_s` 가 든 블록은 통째로 버리십시오.
실제 사례에서 10블록을 걷어내니 시안의 진짜 스크립트는 **389B** 였습니다.

**⑷ 광고·분석 스니펫도 여기서 걷습니다.** Google Tag Manager 로더가 흔히 섞여 있고, 컨테이너
주소가 상대경로로 바뀐 채라 **매 방문마다 404** 를 냅니다(`dataLayer`·`developer_id` 로 찾으십시오).
거기 든 컨테이너·측정 ID(`GTM-…`·`G-…`)는 버리지 말고 자리표시자 표에 적습니다 — 발주처가 확인해 준
**GA4 측정 ID(`G-` 로 시작)만** `NEXT_PUBLIC_GA4_ID` 로 들어갑니다. GTM 컨테이너(`GTM-`)는 이 자리로 안
들어갑니다(형식이 달라 무시됩니다) — 필요하면 AGENTS.md 「분석 태그」 절대로 컴포넌트를 따로 둡니다(§1-6).

**⑸ 다 이었으면 구문을 검사하십시오.**

```bash
node --check public/mockup.js    # rc 0 이어야 한다
```

> ⚠ 구문이 유효해도 **의미가 합쳐졌을 수** 있습니다(⑴ 의 ASI 사고가 그렇습니다).
> `node --check` 는 그것을 통과시킵니다 — 브라우저로 열어 콘솔을 보는 것이 그 자리의 그물입니다.

`src/components/MockupBehavior.tsx`:

```tsx
"use client";

import Script from "next/script";
import {useEffect} from "react";

export function MockupBehavior() {
    useEffect(() => {
        // 시안이 `onclick="f()"` 로 걸던 것을 위임으로 잇는다(변환기가 `data-onclick` 으로 남겼다).
        const onClick = (ev: MouseEvent) => {
            const t = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-onclick]");
            const code = t?.getAttribute("data-onclick");
            if (!t || !code) return;
            ev.preventDefault();
            new Function("event", code).call(t, ev);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    // `afterInteractive` — 시안이 `</body>` 직전에 두던 자리와 같다(DOM 이 선 뒤에 돈다).
    return <Script src="/mockup.js" strategy="afterInteractive" />;
}
```

`(landing)/page.tsx` 끝에서 `<MockupBehavior />` 를 한 번 렌더합니다(§2-2 ⑵ 의 본보기 자리). 실행
스크립트가 0개로 남았다면(트래커·런타임 잔재만 있던 시안) `mockup.js` 도 `MockupBehavior` 도 만들지 않습니다.

> **고전 스크립트로 실어야 합니다**(`type="module"` 금지). 시안이 `function f(){}` 을
> 전역으로 선언하고 마크업이 그 이름을 부르기 때문입니다.

#### ⚠ 이 배선은 **디자이너가 준 정적 마크업 전용**입니다

`new Function(...)` 이 `data-onclick` 속성값을 **실행**합니다. 그 값이 시안에서 온 고정
문자열인 동안에는 원래의 인라인 `onclick` 과 위험이 같습니다. 아래 셋 중 하나라도 해당되면
**즉시 걷어내고** 필요한 동작만 보통의 `onClick` 핸들러로 다시 쓰십시오.

1. **런타임 값이 이 페이지에 들어온다** — 후기·문의·게시글·`content/*.json` 등 소스 밖에서 온
   문자열이 속성으로 렌더되는 순간, 그 자리가 임의 JS 실행 지점이 됩니다.
   리스너는 `document` 전역이고 `closest("[data-onclick]")` 로 **아무 조상**이나 잡습니다.
2. **`layout.tsx` 로 올렸다** — 그 레이아웃 아래 라우트 전체로 퍼집니다. `page.tsx` 에 두십시오.
3. **CSP 를 켤 계획이 있다** — `unsafe-eval` 없이는 이 배선이 조용히 죽습니다.

또 하나: 위 리스너는 `[data-onclick]` 조상을 가진 **모든 클릭**에 `preventDefault()` 를 겁니다.
그 안에 정상 `<a href>` 가 들어 있으면 링크가 죽습니다 — 시안에 그런 구조가 있으면 확인하십시오.

### 2-5. 폰트·이미지 — 팩 안으로 내린다

`<link href="https://fonts.googleapis.com/...">` 를 지우고, 그 CSS 를 받아
woff2 를 `public/fonts/` 로 내린 뒤 `@font-face` 를 `landing.css` 의 **맨 앞**(시안 CSS 앞)에
붙입니다. 시안 CSS 의 `@import` 는 §2-3 ⑴ 로 이미 지웠으므로 순서 문제가 없습니다.

> ⚠ **내려받기에 울타리를 치십시오.** 입력은 **남이 준 HTML** 입니다. 그대로 구현하면
> 시안이 가리키는 아무 주소나 따라가고, 파일명을 URL 경로에서 따면 `..` 로 소스 트리에
> 덮어쓸 수 있습니다. 최소한 넷:
>
> - `https:` 만 따라간다(`http:`·`file:`·`data:` 금지)
> - 호스트를 **허용 목록**으로 죈다(`fonts.googleapis.com`·`fonts.gstatic.com`)
> - 저장 이름은 URL 경로가 아니라 **basename 또는 해시**로 짓는다 — `..` 를 살리지 않는다
> - 리다이렉트 횟수·응답 크기·타임아웃에 상한을 둔다

받을 때 밟는 함정 셋:

| 함정 | 조치 |
| --- | --- |
| UA 없이 받으면 빈 응답이거나 구형 포맷 | 브라우저 UA 를 붙인다 |
| URL 을 통째로 퍼센트 인코딩하면 HTTP 400 | **경로만** 인코딩한다. 질의문자열(`css2?family=...:wght@300;400`)은 건드리지 않는다 |
| CSS 안 상대 `url()` 을 원점 기준으로 풀면 폰트가 사라짐 | **그 CSS 파일의 URL 기준**으로 푼다 |

한글 폰트는 유니코드 서브셋으로 쪼개져 파일이 수백 개일 수 있습니다. 정상입니다 —
브라우저가 필요한 조각만 받습니다. 가변폰트는 여러 `font-weight` 가 **같은 파일**을 가리키는데
그것도 정상입니다(원본 CSS 가 그렇습니다).

**시안이 가리키는데 시안에 없는 폰트 파일은 만들어 채우지 마십시오.** 라이브 사이트를 떠 온
시안은 `url(/fonts/….woff2)` 처럼 자기 서버의 파일을 가리키면서 파일은 안 줍니다. 유니코드 범위가
맞는 Google Fonts 서브셋으로 채우는 것은 **추정**이고, 시안 옆에 그 파일이 없으니 §3 의 대조는
그 추정을 검증하지 못합니다(시안 쪽은 대체 글꼴로 찍힙니다). 발주처에서 파일을 받으십시오.
개시가 막혀 부득이 채웠다면 NOTE 의 「추가한 것」과 자리표시자 표에 적고 발주처 확인을 받습니다.

이미지는 `public/` 에 넣습니다. 파일명이 한글이면 참조도 같이 퍼센트 인코딩하십시오.
`foo.jpg` 와 `foo.jpg.webp` 가 같이 있으면 **접두 충돌**에 주의하십시오 —
치환할 때 `(?![A-Za-z0-9._~%-])` 같은 경계를 걸지 않으면 참조가 통째로 깨집니다.

시안이 이미지·폰트를 `data:` URI 로 안고 있으면 파일로 뽑아 `public/assets/` 에 두고 참조를
바꿔도 됩니다 — 바이트가 같은 자산의 자리만 옮긴 것입니다. 뽑은 개수와 자리를 NOTE 에 적습니다.

**파비콘은 시안·발주처 자산입니다.** 시안에 `<link rel="icon">` 과 그 파일이 있으면 파일을 `public/` 에
두고 `(landing)/layout.tsx` 의 `metadata.icons` 로 잇습니다. 없으면 **만들지 않습니다** — 색 하나로
그린 마크도 시안에 없던 이미지입니다.
자리표시자 표에 「파비콘 — 발주처」 행을 두고, §3 의 콘솔 집계에서 `/favicon.ico` 404 한 건은 뺍니다.

`.zalkera/ASSETS-LICENSE.md` 에 동봉 자산의 출처와 라이선스를 적습니다
(Google Fonts 자가호스팅은 대개 **SIL OFL 1.1** — 재배포 허용).

### 2-6. 문서 3종

| 파일 | 무엇을 적나 |
| --- | --- |
| `NOTE.md` | 시안 대비 **고친 것 전부**(§2-3 ⑴⑵·`data:` 추출 포함) · **「추가한 것」**(시안에 없던 파일이 하나라도 있으면 그 절을 둔다 — §2-5 의 폰트 추정이 여기 온다) · 자리표시자 목록 · 검증 결과 |
| `AGENTS.md` | 다음 LLM 이 고칠 좌표와 **금지사항** — §1 의 요약에 더해 「루트 레이아웃은 둘이다, 루트 `layout.tsx` 를 만들지 마라」(§2-1 ⑵)와 「`landing.css` 에 Tailwind 를 들이지 마라」(§2-3), 그리고 「분석 태그는 `NEXT_PUBLIC_GA4_ID` 로만 — 콘솔 `analyticsConfig` 를 잇지 마라」(§1-6) |
| `.zalkera/ASSETS-LICENSE.md` | 동봉 자산 출처·라이선스 |

**시안 스크립트의 키·토큰을 눈으로 훑으십시오.** `public/mockup.js` 는 **공개 서빙되는 자리**라
거기 박힌 것은 전부 공개됩니다. 대행사 시안에는 카카오 JS 앱키·GA 측정 ID·EmailJS·Firebase
설정이 흔히 들어 있습니다. 검수기의 시크릿 스캔은 몇 가지 모양만 알고 **완전하지 않습니다** —
자동 검사가 덮는다고 여기지 마십시오. 발견하면 발주처에 **도메인 제한이 걸려 있는지** 확인하십시오.

**자리표시자는 반드시 목록으로 뽑아 적으십시오.** `href=` 만 훑으면 스크립트 안의 것을 놓칩니다.
`page.tsx` 와 `public/mockup.js` **양쪽**에서 찾으십시오:

```bash
grep -ohE 'tel:[0-9+-]+|https://pf\.kakao\.com/[A-Za-z0-9_-]+|YOUR_[A-Z_]+' \
  'src/app/(landing)/page.tsx' public/mockup.js | sort -u
```

---

## 3. 검증 — 이 순서로, 전부 통과해야 한다

### 3-0. **환경변수를 먼저 넣으십시오** — 안 넣으면 첫 명령부터 섭니다

소스가 시동 시점에 테넌트 코드를 읽고, 없으면 **던집니다**. 그 모듈을 `(template)/layout.tsx`·BFF
라우트·`sitemap.ts` 가 물기 때문에 그쪽이 500 이 됩니다 — **CSS 와 아무 상관 없는 500 입니다.**

```bash
cp .env.example .env.local
```

| 변수 | 안 넣으면 |
| --- | --- |
| `ZALKERA_TENANT` | `/contact`·`/policies`·`/sitemap.xml`·BFF 가 500 이고 `npm run build` 도 실패한다(「CSS 가 깨졌다」로 오진하기 쉬운 자리). 랜딩은 이 값을 안 읽어 200 이다 |
| `ZALKERA_API_BASE` | 백엔드 왕복이 실패. fail-soft 라 화면은 서지만 `/policies` 본문이 비고 `/contact` 전송이 실패하며 `sitemap.xml` 에 상품·글 URL 이 안 실린다. 랜딩 화면은 무관하다 |
| `ZALKERA_SITE_URL` | `robots.txt`·`sitemap.xml`·JSON-LD 에 `http://localhost:3000` 이 **박힌 채로 배포**됩니다 |
| `NEXT_PUBLIC_GA4_ID` | 비어 있으면 분석 태그가 안 실립니다 — 발주처가 ID 를 주기 전까지는 **비어 있는 것이 정상**입니다(§1-6) |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | 비어 있으면 `<meta name="google-site-verification">` 이 안 나갑니다 — Search Console 소유 확인을 HTML 태그로 할 때만 필요하고, DNS 로 확인하면 비워 둡니다 |
| `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | 비어 있으면 `<meta name="naver-site-verification">` 이 안 나갑니다 — 서치어드바이저 소유 확인을 HTML 태그로 할 때만 필요합니다 |

> ⚠ **`.env.local` 을 zip 에 넣지 마십시오.** 검수가 시크릿으로 반려합니다.
> 아래 `pack.py` 가 걸러 주지만, 트리 밖에 두는 편이 안전합니다.

### 3-1. 명령

```bash
npm ci
npm run typecheck                      # rc 0
npm run validate -- --gate             # rc 0 (개발 중에는 `--gate` 없이 권고로 볼 수도 있다)
npm test                               # rc 0 — reservedSegments 등 가드 시험
npm run build                          # rc 0 — 다만 이것만으로는 부족하다(아래)
```

`validate` 는 이 형상에서 경고를 찍고 rc 0 을 냅니다 — 선언을 지운 트리라 S 규칙군이 경고입니다.
정상인 경고는 이것들입니다(문면은 검사기 `@zalkera/client` 0.28.1 의 것).

```
⚠️  [S3] app/layout.* · pages/_app.* 을 찾지 못했습니다 — 전역 CSS 를 실을 자리가 없습니다. …
⚠️  [S5] src/app/(landing)/landing.css — 루트가 싣는 CSS 외의 CSS 파일. …
⚠️  [S5] src/app/(template)/globals.css — 루트가 싣는 CSS 외의 CSS 파일. …
```

- `[S3]`·`[S5]` — 검사기가 라우트 그룹 안의 루트 레이아웃을 읽지 않아서 납니다. **루트 `layout.tsx` 를
  만들어 경고를 없애려 하지 마십시오**(§2-1 ⑵).
- `(landing)/page.tsx` 를 지목하는 `[S2]`(인라인 `style`)·`[S4]`(색 리터럴 클래스)·`[S6]`(남의 토큰 어휘) —
  시안 마크업이 그런 것이므로 이 레인에서는 정상입니다. **시안을 고쳐 없애지 마십시오**(§2-2).

그 밖의 경고가 나면 봐야 합니다.

> ⚠ 이 통과는 검사기가 그룹 안 루트 레이아웃을 **읽지 않는 데** 기댑니다. `(template)/globals.css` 는 우리
> 토큰 어휘(`--radius-knob`·`--color-surface` 등)를 그대로 갖고 있으므로, 검사기가 그것을 읽게 되면
> `[EDECL]`(rc=7 — 선언 없이 우리 토큰을 쓴다)이 설 수 있습니다. 그때의 처방은 이 문서에 없습니다 —
> 선언을 되살리면 S 규칙군이 error 로 올라오고, 토큰을 개명하면 시작 팩 파일을 고치는 일입니다.
> 그 자리는 팩이 아니라 검사기가 풀 문제입니다.

### 3-2. ⚠ `npm run build` 의 rc 0 을 믿지 마십시오

CSS 파싱 실패를 **경고로 찍고 rc 0** 을 냅니다. 개발 서버로 확인하십시오:

```bash
npm run dev >/tmp/dev.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/          # 200 이어야 한다
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/contact   # 200 — 템플릿 쪽도 산다
kill %1
```

> 뜰 때까지 기다리는 줄이 없으면 아직 안 뜬 서버에 물어 `000` 이 나옵니다.

**`/contact` 가 500 이면** ⑴ `ZALKERA_TENANT` 를 넣었는지(§3-0) ⑵ 모듈이 깨졌는지 순으로,
**`/` 가 500 이면** 랜딩 CSS·`(landing)/layout.tsx`·`page.tsx` 가 깨진 것입니다. `/tmp/dev.log` 에 이유가 있습니다.

**200 이어도 로그를 보십시오.** React 는 개발 빌드에서만 렌더 진단을 냅니다 — 상용 빌드에서는
그 문구가 통째로 사라질 뿐 결함은 남습니다.

```bash
grep -nE "Invalid DOM property|Invalid event handler property|does not recognize the|non-boolean attribute|Unsupported style property|invalid value for the|ARIA attribute|aria prop|unique \"key\"|not valid as a React child|selected. on <option>|onChange. handler" /tmp/dev.log
```

한 줄이라도 나오면 고쳐야 합니다. 손이관에서 가장 흔한 것은 **`onclick=` 을 그대로 옮긴 것**(`Invalid event handler property`)과
**하이픈 SVG 속성**(`stop-color` → `stopColor`)입니다.

둘의 성질이 다릅니다 — `onclick` 은 `tsc` 가 **잡습니다**(TS2322 「Did you mean 'onClick'?」).
하이픈 표기는 **안 잡힙니다**(§2-2) — JSX 에서 식별자가 될 수 없어 임의 속성으로 허용되기
때문입니다. 그래서 타입 검사를 지나고도 이 로그에서 처음 드러나는 것은 후자입니다.

> 검수기(`verify-zip`)도 이 둘(상태 코드 + 렌더 진단)을 한 번 더 잽니다 — 다만 `/` 한 장만
> 프로브하므로 `/contact` 쪽은 여기서 본 것이 유일한 확인입니다. 여기서 미리 보는
> 이유는 **몇 분짜리 검수를 돌리기 전에** 알기 위해서입니다.
>
> ⚠ **검수기가 못 보는 것이 있습니다.** 하이드레이션 오류(`whitespace text nodes cannot be a
> child of <table>`·`Hydration failed`)와 스크립트의 `Uncaught …` 는 **브라우저에서만** 찍힙니다.
> 검수기는 `curl` 만 쓰므로 그 자리는 **아래 브라우저 확인이 유일한 그물**입니다.

### 3-3. 메타·JSON-LD 확인

개발 서버를 다시 띄우고 `<head>` 와 홈 그래프를 봅니다(§2-2 의 SEO·AEO 절).

```bash
npm run dev >/tmp/dev.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -s http://localhost:3000/ | grep -oE '<title>[^<]*</title>|<meta name="description"[^>]*>|<link rel="canonical"[^>]*>|<meta property="og:[a-z_:]+"[^>]*>'
# 시안 <head> 의 값 그대로 · canonical 과 og:url 은 ZALKERA_SITE_URL 로 시작해야 한다
curl -s http://localhost:3000/ | grep -oE '<script type="application/ld\+json">[^<]*</script>' | sed -E 's/<[^>]+>//g'
# Organization 그래프 한 덩어리 — @type·name·url(절대 URL)·telephone(시안에 있을 때만). 백엔드 없이도 나와야 한다(하드코딩)
ZALKERA_AEO_ALLOW_LOCAL=1 npm run check:aeo -- http://localhost:3000 --site-wide-only
# ✅ siteWide/robots · ✅ siteWide/sitemap · ⏭️ siteWide/sitemap-covers-required-routes(무주장이라 SKIPPED) · ✅ siteWide/absolute-urls → rc 0
curl -s http://localhost:3000/ | grep -c 'googletagmanager\.com/gtag/js'   # 0 이어야 한다(ID 미설정)
curl -s http://localhost:3000/ | grep -c 'site-verification'                # 0 이어야 한다(env 미설정)
kill %1
NEXT_PUBLIC_GA4_ID=G-TEST1234 NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=gtest NEXT_PUBLIC_NAVER_SITE_VERIFICATION=ntest npm run dev >/tmp/dev-ga.log 2>&1 &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -s http://localhost:3000/ | grep -c 'googletagmanager\.com/gtag/js'   # 1 이상이어야 한다
# 둘 다 봐야 배선이 산 것이다. 0→0 이면 <Analytics /> 가 레이아웃에 없다
curl -s http://localhost:3000/ | grep -oE '<meta name="(google|naver)-site-verification"[^>]*>'
# 두 줄(content="gtest"·content="ntest")이어야 한다. 위 미설정 실행에서 0 → 여기서 2 여야 배선이 산 것이다
kill %1
```

`ZALKERA_AEO_ALLOW_LOCAL=1` 이 없으면 검사기가 `내부 주소는 검사하지 않습니다` 로 rc=2 를 내고 멈춥니다 —
로컬 주소를 여러 번 부르는 도구라 기본으로 막아 둔 것입니다.

`--category MARKETING` 은 개시 후 스모크용입니다. 이 레인의 팩에서는 `required/cms-page-ssr: MISSING_ROUTE`
가 나오고 판정은 FAIL·rc 1 입니다(§2-2 ⑵ — 간판은 못 겁니다). 이 레인에서는 예상된 결과이고, 그 스냅샷을
promote 입력으로 넘기지 마십시오. 그 출력에서 볼 것은 `required/home-organization` 이 PASS 인지
(그래프는 하드코딩이라 백엔드 없이도 나옵니다 — 그래도 `NOT_SSR` 이면 시안에 글자 있는 `<h1>` 이 없는
것입니다. 본문은 고치지 말고 NOTE 의 발주처 확인 항목에 적으십시오), `negative/no-Review`·`no-AggregateRating`
이 PASS 인지입니다.

### 브라우저 콘솔도 보십시오 — **모든 주소를, 개발 모드로**

서버가 200 이어도 **클라이언트에서만 터지는 오류**는 안 보입니다(§1-5 가 그 자리였습니다).
브라우저로 열어 콘솔을 확인하십시오 — `pageerror` 와 `console.error` 가 **0건**이어야 합니다.
페이지를 끝까지 스크롤해서 지연 실행되는 스크립트까지 깨우십시오.
`/favicon.ico` 404 한 건은 집계에서 뺍니다(§2-5 — 파비콘은 발주처 자산). 그 외 404 는 결함입니다.

두 가지를 반드시 지키십시오. 둘 다 **실제로 결함을 놓친 자리**입니다.

**⑴ `/` 만 보지 마십시오.** 팩이 내놓는 주소를 전부 보십시오 —
최소한 `/` · `/contact` · `/policies`, 그리고 `content/pages/*.json` 이 만든 주소 전부.
랜딩만 보고 넘겼다가 `/policies` 에만 있던 React 중복 키 오류를 놓쳤습니다.

**⑵ 상용 빌드가 아니라 `npm run dev` 로 보십시오.**
React 의 개발 경고(중복 키·잘못된 prop 등)는 **상용 빌드에서 통째로 제거됩니다.**
`next build` 산출물로 콘솔을 재면 그 부류가 **구조적으로 안 보입니다.**

**⑶ `/contact` 에서 헤더의 홈 링크를 눌러 `/` 로 돌아와 보십시오**(`npm run dev` 에서). 두 루트
레이아웃이 살아 있으면 전체 페이지 로드가 일어나고, 그 뒤 콘솔에서
`document.querySelectorAll('link[rel=stylesheet]').length` 가 1 입니다. 2 이상이면 템플릿 CSS 가 같이
실린 것 — 루트 레이아웃이 하나로 합쳐졌습니다(§2-1 ⑵).

### 시안과 대조

| 무엇 | 기준 |
| --- | --- |
| **`<title>`** | 시안의 제목과 같아야 한다 — 자동 검사가 안 보는 자리다(§2-2) |
| 본문 글자수 | 시안과 같아야 한다(`document.body.innerText` 길이). 시안이 `<title>`·`<meta>` 를 `<body>` 에 두었으면 그 문구를 빼고 견준다(§2-2) |
| 전체 높이 | 시안과 같아야 한다 — **아래 촬영 조건을 맞춘 뒤에** 견주십시오 |
| 외부 호스트 요청 | **0건** — 실패만 세지 말고 **호스트별로** 세십시오. `NEXT_PUBLIC_GA4_ID` 를 넣고 잰 경우에만 `googletagmanager.com`·`google-analytics.com` 이 허용이고, 그 사실을 보고에 적습니다(§1-6) |
| 시안 `<html>` 에 `lang` 이 없을 때 | 대조용 **사본**에만 `lang="ko"` 를 보태 찍고 NOTE 에 적는다. Chrome 은 언어 정보가 없으면 공백 글자 폭을 달리 그려 줄바꿈·높이가 어긋난다 |

> 스크린샷만 비교하면 **부가 연출이 죽어도 못 잡습니다** — 높이·글자수가 거의 안 변하기 때문입니다.
> 콘솔 오류 감시가 그 자리를 봅니다.

#### 촬영 조건 — 이걸 맞추면 **픽셀이 정확히 일치합니다**

Playwright 기준입니다. **양쪽(시안·팩)을 같은 조건으로** 찍으십시오.

```js
const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
await page.goto(url, {waitUntil: "networkidle"});
// ⑴ 끝까지 굴렸다가 맨 위로 — 지연 로드 자산과 한글 폰트 서브셋을 깨웁니다.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
// ⑵ 그다음에 폰트를 기다립니다. 순서가 중요합니다 — 아래 설명.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2000);
// ⑶ 애니메이션을 종료 상태로 고정합니다.
await page.screenshot({path: out, fullPage: true, animations: "disabled"});
```

#### ⚠ 시안에 **타이머로 도는 위젯**이 있으면 JS 를 끄고 찍으십시오

「실시간 입금 목록」처럼 `setTimeout` 으로 DOM 을 바꾸는 연출이 흔합니다. `animations: "disabled"`
는 CSS 애니메이션만 멈추지 타이머는 못 멈춥니다 — 촬영 시점마다 행 수가 달라 높이가 흔들립니다.

```js
const ctx = await browser.newContext({viewport: {width: 1280, height: 1000}, javaScriptEnabled: false});
```

JS 를 끄면 **마크업·CSS 이관이 옳은지만** 남습니다. 실측으로 시안과 팩이 **0.000%** 로 일치했습니다
(8개 팩 전부, 높이도 정확히 같음). 켠 채로 재면 같은 팩이 실행마다 흔들립니다.

> 위젯이 **실제로 도는지**는 픽셀이 아니라 §3-2 의 콘솔·로그 확인이 봅니다.
> 실제로 스크립트가 통째로 안 도는데 픽셀이 0.000% 였던 사례가 있습니다 — 연출이 죽어도
> 레이아웃은 그대로이기 때문입니다.

**⑴ 이 ⑵ 보다 먼저여야 합니다.** `document.fonts.ready` 는 **부른 시점의 적재 사이클**만
보장합니다. 한글 폰트는 유니코드 서브셋으로 쪼개져 있어(§2-5) **그 글자가 실제로 그려질 때**
조각이 요청되므로, 스크롤로 아래 문단을 먼저 그려 두지 않으면 새 사이클이 나중에 시작되고
기다린 값이 그것을 못 덮습니다.

> ⚠ `font-display: optional` 인 폰트는 짧은 블록 구간을 놓치면 그 로드에서 **대체 글꼴이
> 그대로 굳습니다.** 기다려도 안 바뀌므로 그 경우는 다시 여십시오.

두 조건이 각각 얼마나 기여하는지 실측했습니다(같은 팩, 1280px 폭, 전체 5,369px):

| 폰트 대기 | `animations` | 원본과 다른 픽셀 |
| --- | --- | --- |
| 안 함 | 켬 | 28,349 (0.413%) |
| 안 함 | `disabled` | 15,964 (0.232%) |
| **함** | 켬 | 4,904 (0.071%) |
| **함** | **`disabled`** | **0 (0.000%)** |

**둘 다 적용하면 정확히 0 입니다.** 그래서 이 대조의 기준은 「근사」가 아니라 **일치**입니다.

⚠ 애니메이션을 켠 채로 잰 값은 **실행마다 흔들립니다** — 같은 팩을 반복 측정했을 때
0.07% ~ 6.1% 범위였습니다. 프레임 위상이 매번 달라서입니다. 그 상태로 나온 숫자를
「거의 같으니 통과」로도, 「6% 나 다르니 결함」으로도 읽지 마십시오. **먼저 조건을 맞추십시오.**

재현: 위 스크립트로 시안·팩을 각각 찍고 두 PNG 의 픽셀을 비교하십시오
(`sharp` 로 `raw()` 버퍼를 떠서 채널차 16 초과를 세면 됩니다).

**높이나 픽셀이 어긋나면 팩을 고치기 전에 촬영 조건을 먼저 의심하십시오** — 뷰포트 폭,
스크롤바 유무, 같은 브라우저인지, 위 세 단계를 양쪽에 똑같이 적용했는지.

> 이 숫자는 **촬영이 제대로 됐는지의 지표**입니다. 팩의 합격선이 아닙니다 —
> 위 인용문대로 픽셀이 같아도 부가 연출이 죽어 있을 수 있습니다.

### 마지막 — 납품 검수

`pack.py` 를 트리 밖에 두고 돌립니다(`zip` 명령이 없는 기계가 많습니다):

```python
#!/usr/bin/env python3
"""소스 트리를 납품 zip 으로 묶는다.  사용: python3 pack.py <소스디렉터리> <나올zip>"""
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
SKIP = {".git", "node_modules", ".next"}
n = 0
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for name in sorted(filenames):
            # .env.local 은 시크릿 · next-env.d.ts 는 Next 가 만드는 파일(.gitignore 와 같은 판단)
            if name.endswith(".tsbuildinfo") or name in {".env.local", "next-env.d.ts"}:
                continue
            full = os.path.join(dirpath, name)
            z.write(full, os.path.relpath(full, src))
            n += 1
print(f"{dst}  {os.path.getsize(dst)/1048576:.1f}MB  {n} files")
```

```bash
python3 pack.py . ../pack-<이름>-<날짜>.zip
node scripts/verify-zip.mjs ../pack-<이름>-<날짜>.zip     # rc 0
```

> `node_modules`·`.next`·`.git` 이 들어가면 **풀기 전에** 반려됩니다.
> `verify-zip` 은 엔트리 목록만 보고 거기서 끊습니다(수백 MB 를 풀지 않으려고).

**`--byo` 를 붙이지 마십시오.** 시작 소스 팩에서 나온 트리는 혈통 표식이 있어 거부됩니다.
그게 맞습니다 — 템플릿에서 왔으면 가드 회귀 스위트를 **돌려야** 합니다.

---

## 4. 자주 나는 반려와 원인

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| `Parsing CSS source code failed … @import rules must precede all rules` | 시안 `@import` 가 규칙 뒤로 밀림 | §2-3 ⑴ |
| `Expected unicode escape` (빌드 반려) | 시안 스크립트를 TSX 템플릿 리터럴에 넣음 | §1-5 |
| `Invalid or unexpected token` (런타임) | `String.raw` 로 넣음 | §1-5 |
| `근거 없는 이름은 목록에 없다` | 라우트를 지움 | §1-2 |
| `<파일> 가 없습니다 — 가드를 재는 자리입니다` | `src/lib/*.ts` 를 지움 | §1-2 |
| `[EDECL]` rc=7 | 선언은 **없는데** 루트가 싣는 CSS 가 우리 토큰 이름을 쓴다(`--radius-knob`·`--color-surface` 등 다섯 중 둘 이상). 두 루트 레이아웃 형상에서는 검사기가 그 CSS 를 읽지 않아 서지 않는다 | §1-3 · §3-1 |
| `[S2]`·`[S4]`·`[S8]`·N 이 error | `zalkera` 선언을 **안 지웠다** | §1-3 |
| `content/pages 가 없는데 매니페스트가 그 안을 가져옵니다` | ⑴ 로 `content/pages` 를 지우고 `content/index.ts` 의 `import … from "./pages/…"` 를 남겼다 | §2-1 ⑷ |
| 시안 제목이 안 뜬다(오류 없음) · 시안 `og:*` 가 회사명으로 바뀐다 | 랜딩 레이아웃 또는 페이지에 `generateMetadata()` 를 두었다 | §2-2 |
| `/contact`·`/policies` 가 왼쪽에 붙고 여백·입력칸 테두리가 없다 | 루트 레이아웃이 하나다 — 시안 CSS 가 템플릿 페이지에 닿는다 | §2-1 ⑵ |
| `[S3] app/layout.* … 을 찾지 못했습니다`(경고) | 두 루트 레이아웃 형상 — 정상. 루트 `layout.tsx` 를 만들지 않는다 | §3-1 |
| `[D2] llms.txt 가 본보기로 지목한 …`(경고) | `package.json` 의 `name` 을 안 바꿨다 | §1-3 |
| 콘솔에 `favicon.ico` 404 | 파비콘은 발주처 자산 — 집계에서 빼고 자리표시자로 | §2-5 |
| `theme-color` 가 시안과 다르다 | 시안에 둘일 때 뒤의 값을 골랐다 — 브라우저는 첫 값을 쓴다 | §2-2 |
| `/contact`·`/policies` 가 500 인데 CSS 는 멀쩡 | `ZALKERA_TENANT` 미설정 | §3 |
| 홈에 JSON-LD 가 안 나온다 | `(landing)/page.tsx` 에 `<JsonLd data={organization} />` 를 안 넣었다 | §2-2 ⑵ |
| 홈 JSON-LD 의 `url` 이 `http://localhost:3000` | 빌드 때 `ZALKERA_SITE_URL` 이 없었다 | §3-0 |
| 콘솔에 ID 를 넣었는데 GA 태그가 안 실린다 | 랜딩 레이아웃에 `<Analytics />` 가 없거나, 값이 `G-…` 형식이 아니거나, 값 변경 뒤 재빌드가 안 됐다 | §1-6 · §2-1 ⑵ |
| Search Console·서치어드바이저가 소유 확인 태그를 못 찾는다 | 랜딩 `metadata.verification` 배선이 없거나 env 가 비었거나 값 변경 뒤 재빌드 전이다. 다른 루트 레이아웃(`/contact` 등)이 아니라 `/` 를 확인시켜야 한다 | §2-2 ⑴ · §3-0 |
| 외부 호스트 요청에 `googletagmanager.com` 이 잡힌다 | `NEXT_PUBLIC_GA4_ID` 가 들어간 상태 — 발주처가 준 ID 면 정상, 아니면 env 를 비운다 | §1-6 |
| `check:aeo` 가 `내부 주소는 검사하지 않습니다` 로 rc=2 | 로컬 주소 — `ZALKERA_AEO_ALLOW_LOCAL=1` 을 준다 | §3-3 |
| `--byo 선언이 zip 과 맞지 않습니다` | 템플릿 파생인데 `--byo` 를 붙임 | §3 |
| SVG 가 안 보임 | `viewbox` 를 소문자로 둠 | §2-2 |
| **Invalid DOM property** `stop-color` | 하이픈 SVG 속성 — `tsc` 가 안 잡는다 | §2-2 |
| `[{…}] is not a function` | 데이터 섬을 실행 스크립트에 이어 붙임(ASI) | §2-4 |
| `Uncaught SyntaxError` (스크립트 전체가 안 돎) | RSC 페이로드(`__next_f`)가 섞임 | §2-4 |
| 화면이 시안과 미묘하게 다름(높이·여백) | `landing.css` 에 Tailwind 를 들였다(preflight) | §2-3 |
| 문단이 2줄→1줄 | `pre-line` 개행을 JSX 가 접음 | §2-2 |
| 화면에 `&nbsp;` 가 글자로 보임 | 문자열로 감쌀 때 엔티티를 안 풂 | §2-2 |
| `Encountered two children with the same key` | 내비 목록의 `key` 를 `href` 로 잡았다 | §2-1 |
| 상용 빌드에서는 안 보이던 콘솔 경고 | React 개발 경고는 상용 빌드에서 제거된다 | §3 |

---

## 5. 납품물

zip 1개 + 그 안의 `NOTE.md`·`AGENTS.md`·`.zalkera/ASSETS-LICENSE.md`.

**검증 결과를 숫자로 보고하십시오** — 「됐습니다」는 보고가 아닙니다:
`typecheck` rc · `validate` rc(경고 종류별 건수) · `npm test` rc · `build` rc ·
`dev GET /`·`/contact` 상태코드 · `/contact`→`/` 이동 뒤 `link[rel=stylesheet]` 수 ·
**주소별** 콘솔 오류 건수(어느 주소를 봤는지 같이) · 외부 호스트 건수 ·
본문 글자수(시안 대 팩) · `<title>`·canonical·og 유무 · 홈 JSON-LD `@type`·`url` ·
`check:aeo --site-wide-only` rc · `verify-zip` rc.

**기계 검사 통과는 인수가 아닙니다.** 사람이 볼 것이 남습니다 —
자산 출처 실제 대조 · 자리표시자 연락처·파비콘 · NOTE 「추가한 것」의 발주처 확인 ·
콘솔에서 `/policies` 의 정책·사업자 정보를 채웠는지 · 개시 후 화면 확인 ·
개시 후 Search Console·네이버 서치어드바이저에 사이트를 등록하고 `https://<사이트URL>/sitemap.xml` 을 제출(소유
확인은 §3-0 의 `*_SITE_VERIFICATION` env — Search Console 은 DNS 레코드로도 된다. GA4 는 스트림 추가로 끝이고
사이트맵을 받지 않는다).
