# 시안 HTML → 잘커라 소스 팩 변환 지시서

디자이너·대행사가 **완성해 건넨 HTML 1장**을 잘커라에 올릴 수 있는 Next.js 소스 팩으로
옮기는 절차입니다. 이 문서를 **그대로 LLM 에게 주고** 시안 HTML 과 시작 소스 팩 zip 을
함께 건네십시오.

> **다른 레인이면 여기가 아닙니다.**
> 이미 개시한 사이트의 소스를 고치는 것이라면 → [`../CUSTOMIZE.md`](../CUSTOMIZE.md)
> 자기 스택으로 프론트를 통째로 짓는 것이라면 → [`byo-headless-guide.md`](byo-headless-guide.md)

## 시작 소스 팩은 어디서 받나

**잘커라 콘솔에서 받은 시작 팩 zip 에서 출발하십시오.** 랜딩 한 장짜리 시안이면
**커머스 라우트가 없는 팩**을 고르십시오 — 상담·문의형 사이트에 장바구니·결제·주문조회가
딸려 가면 안 됩니다.

> ⚠ **이 레포를 클론해서 출발하지 마십시오.** 여기 실린 프리셋은 커머스 표면을 전부
> 갖고 있습니다(`cart`·`checkout`·`products`·`orders`·`mypage`·`payment`·`login`·`blog`).
> 랜딩 시안을 그 위에 얹으면 쓰지 않는 상거래 페이지가 같이 배포됩니다.
> 그리고 그 라우트들은 **마음대로 지울 수 없습니다**(§1-2).
> 이 레포는 **계약의 교본**이지 이 레인의 출발점이 아닙니다.

---

## 0. 이 레인이 무엇이고 무엇이 아닌가

**입력** — 고객이 완성해 건넨 HTML 1장. 스타일은 인라인 `<style>`, 동작은 인라인 `<script>`.
**출력** — 잘커라에 업로드해 서빙되는 Next.js 소스 zip 1개.

**이 레인이 아닌 것** — 아래를 하라고 시키지 않았다면 하지 마십시오.

| 하지 않는 것 | 왜 |
| --- | --- |
| 섹션 어휘로 분해(`content/pages/*.json`) | 그건 「콘솔에서 말로 고치기」 레인이다. 디자인이 프리셋 번역판이 되어 원본과 달라진다 |
| 시안 CSS 를 Tailwind 로 재작성 | 원본 그대로가 요건이다. 재작성은 반드시 어긋난다 |
| 색을 토큰으로 바꾸기 | 시안 CSS 의 리터럴이 정본이다 |
| 없던 페이지·문구·이미지 추가 | 시안에 없으면 팩에도 없다 |

**결과물의 성질을 정직하게 알고 시작하십시오.** 이 팩은 **소스를 LLM 으로 고치는** 팩입니다.
콘솔에서 말로 색·문구를 바꾸는 동선은 **없습니다**. 그 동선을 흉내 내는 배선을 남기면
콘솔이 성공 보고를 내고 화면은 안 움직이는 **거짓성공**이 됩니다(§1-3, §1-4).

---

## 1. 절대 하지 말 것

아래는 전부 **실제로 깨진 자리**입니다. 이유까지 읽으십시오 — 이유를 모르면 다시 밟습니다.

### 1-1. 처음부터 새로 만들지 마라

`create-next-app` 으로 시작하면 미리보기 쓰기 관문·소독기·가드 스위트가 통째로 없어
검수에서 반려됩니다. **잘커라가 준 시작 소스 팩 zip 을 풀어 그 위에 얹으십시오.**

### 1-2. 랜딩이 안 쓴다고 라우트를 지우지 마라

`src/app/contact/`·`src/app/policies/`·`src/app/[slug]/`·`sitemap.ts`·`media/[id]` 는
랜딩에서 링크되지 않아도 **남깁니다**.

지우면 `src/lib/reservedSegments.test.ts` 가 반려합니다. 그 시험은
`RESERVED_SEGMENTS` 가 **«실제 라우트» ∪ «robots.txt 의 disallow»** 와 정확히 같은지
양방향으로 못 박고, 게다가 **둘 다 1건 이상**일 것을 요구합니다(공회전 방지).
`/` 하나만 남기면 만족시킬 방법이 없습니다.

부득이 지우려면 **셋을 같이** 움직이십시오:
라우트 디렉터리 · `src/lib/reservedSegments.ts` 의 `RESERVED_SEGMENTS` · `src/app/robots.ts` 의 `disallow`.

같은 이유로 `src/lib/` 의 `content.ts`·`routeParam.ts`·`reservedSegments.ts`·`mediaCache.ts`
와 그 `*.test.ts` 도 남깁니다. 하한표가 그 시험을 요구합니다.

### 1-3. `package.json` 에 `zalkera` 선언을 붙이지 마라

```jsonc
// ❌ 이 팩에 넣으면 안 된다
"zalkera": { "styling": "tailwind-tokens", "content": "source" }
```

선언은 「색이 토큰이고 문구가 `content/` 에 있다」는 **약속**입니다. 이 팩은 둘 다 아닙니다.
붙이면 `[S8]`·N 규칙이 error 로 격상돼 반려되거나, 통과하더라도 콘솔이 거짓성공을 냅니다.

### 1-4. 테마 주입 배선을 남기지 마라

시작 소스의 `src/app/layout.tsx` 에 있는 `parseThemeColors` → `cssVars` → `<html style={cssVars}>`
를 **지웁니다**. §1-3 과 한 몸입니다 — 배선만 남기면 콘솔에서 색을 바꿔도 화면이 안 움직입니다.
검사기도 같은 사유로 「토큰 계약을 따르는 것이 아니면 그 주입 배선을 쓰지 마십시오」라고 안내합니다.

### 1-5. 시안 `<script>` 를 TSX 문자열에 넣지 마라

시안 안에 JS 템플릿 리터럴(백틱·`${}`)이 있으면 이스케이프가 **두 번 깨집니다**:

| 시도 | 결과 |
| --- | --- |
| `String.raw\`...\`` | 백슬래시가 살아남아 주입 시 `SyntaxError: Invalid or unexpected token` |
| 일반 템플릿 리터럴 `` `...` `` | SWC 가 `Expected unicode escape` 로 **빌드 반려** |

**`public/mockup.js` 에 한 글자도 안 고치고 넣고 `<script src>` 로 실으십시오**(§2-4).
별도 `.js` 파일이면 이스케이프가 한 겹도 없어 이 버그 종류가 사라집니다.

### 1-6. 외부 링크를 남기지 마라

Google Fonts·CDN·트래커·분석 비콘은 전부 팩 안으로 내리거나 지웁니다(§2-5).
테넌트 사이트가 남의 호스트에 의존하면 그 호스트가 죽을 때 같이 죽습니다.

---

## 2. 절차

### 2-1. 시작 소스 준비

```bash
unzip -q <시작소스팩>.zip -d pack && cd pack
```

지우는 것은 **그 팩의 얼굴뿐**입니다 — `content/pages/*.json`, `public/images/*`,
`src/components/sections/` 안의 프리셋 전용 섹션. 라우트·`src/lib`·`scripts/` 는 그대로 둡니다.

`content/index.ts` 는 **남기되 비웁니다**(`src/lib/content.ts` 가 이 모듈을 읽습니다):

```ts
import nav from "./nav.json";
/** slug → 페이지 콘텐츠. **키가 곧 URL 경로**다. */
export const pages: Record<string, unknown> = {};
export {nav};
export const pageSlugs = () => Object.keys(pages);
```

> ⚠ 맵을 축약(`{home}`)으로 적지 마십시오 — 검사기가 `"<slug>": <이름>` 표기로만 읽습니다.

`content/nav.json` 은 남은 템플릿 페이지(`/contact`·`/policies`)가 읽으므로
브랜드명과 링크를 채웁니다. 시안 랜딩은 이 파일을 안 읽습니다.

> ⚠ **같은 주소를 가리키는 링크가 둘 이상이면 렌더 쪽 `key` 를 확인하십시오.**
> 「이용약관」과 「개인정보처리방침」이 둘 다 `/policies` 로 가는 것은 **정상**인데,
> `SiteHeader`·`SiteFooter` 가 `key={it.href}` 로 잡고 있으면 React 가 중복 키로 경고하고
> 항목을 빠뜨릴 수 있습니다. 이 목록은 순서가 곧 화면이므로 **인덱스가 안정된 키**입니다.

### 2-2. 마크업 — `<body>` → `src/app/page.tsx`

**구조·클래스·문구를 한 글자도 바꾸지 마십시오.** 바꾸는 것은 JSX 문법상 불가피한 것뿐입니다.

| HTML | JSX | 비고 |
| --- | --- | --- |
| `class=` | `className=` | |
| `for=` | `htmlFor=` | |
| `tabindex=` | `tabIndex=` | 다른 속성도 camelCase |
| `viewbox=` `strokewidth=` | `viewBox=` `strokeWidth=` | **SVG 속성은 대소문자를 가린다** — 소문자로 두면 조용히 안 먹는다 |
| `<br>` `<img>` `<input>` | `<br />` `<img />` `<input />` | void 요소는 자기닫힘 |
| `<!-- 주석 -->` | `{/* 주석 */}` | |
| `style="a:b;c:d"` | `style={{a: "b", c: "d"}}` | 속성명 camelCase |
| `onclick="f()"` | `data-onclick="f()"` | **JSX 는 문자열 이벤트 핸들러를 안 받는다.** §2-4 가 위임으로 잇는다 |

속성값에 따옴표가 섞이면 문자열 리터럴이 깨집니다 — **값을 전부 JSON 인코딩**해서 넣으십시오.
손으로 하지 말고 변환 스크립트를 쓰십시오.

`<head>` 의 `<title>`·`<meta name="description">` 은 `src/app/layout.tsx` 의 `metadata` 로 옮깁니다.

### 2-3. 스타일 — `<style>` → `src/app/globals.css`

**시안 CSS 를 한 글자도 고치지 말고** `@import "tailwindcss";` **아래에** 통째로 붙입니다.

두 가지만 예외입니다.

**⑴ 시안 안의 `@import url(...)` 은 지웁니다.**
CSS 는 `@import` 가 모든 규칙보다 앞서야 합니다. 시안 CSS 를 통째로 붙이면 그 `@import` 가
규칙 뒤로 밀려 `next dev` 가 **못 뜹니다**. 폰트는 §2-5 로 내려 `@font-face` 가 대신합니다.

> ⚠ **`next build` 는 이것을 경고로만 찍고 rc=0 을 냅니다.** 종료 코드만 보면 못 잡습니다.
> 반드시 `npm run dev` 로 확인하십시오(§3).

**⑵ 파서를 죽이는 오타는 «브라우저가 어떻게 처리하는지 재고» 걷어냅니다.**
시안에 문법 오류가 있을 수 있습니다(실제 사례: `@media` 안에서 `.wrap{padding:0 16px` 가
안 닫혀 다음 규칙까지 삼킴). Lightning CSS 는 하드 에러, 브라우저는 조용히 버립니다.

**고치기 전에 먼저 재십시오.** 브라우저에서 그 규칙이 실제로 적용되는지 계산값으로 확인합니다:

```js
// 시안을 브라우저로 열고
getComputedStyle(document.querySelector('.wrap')).padding
```

- **적용 안 됨(=죽은 규칙)** → 지웁니다. 화면이 안 바뀝니다. 지운 사실을 `NOTE.md` 에 적습니다.
- **적용됨** → 오타를 고칩니다. 화면이 바뀔 수 있으니 **오너에게 확인**하십시오.

### 2-4. 스크립트 — `<script>` → `public/mockup.js`

`src=` 없는 `<script>` 의 **안쪽 전부**를 이어붙여 `public/mockup.js` 에 **바이트 그대로** 씁니다.

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

`page.tsx` 끝에서 `<MockupBehavior />` 를 한 번 렌더합니다.

> **고전 스크립트로 실어야 합니다**(`type="module"` 금지). 시안이 `function f(){}` 을
> 전역으로 선언하고 마크업이 그 이름을 부르기 때문입니다.

### 2-5. 폰트·이미지 — 팩 안으로 내린다

`<link href="https://fonts.googleapis.com/...">` 를 지우고, 그 CSS 를 받아
woff2 를 `public/fonts/` 로 내린 뒤 `@font-face` 를 `globals.css` 앞머리에 붙입니다.

받을 때 밟는 함정 셋:

| 함정 | 조치 |
| --- | --- |
| UA 없이 받으면 빈 응답이거나 구형 포맷 | 브라우저 UA 를 붙인다 |
| URL 을 통째로 퍼센트 인코딩하면 HTTP 400 | **경로만** 인코딩한다. 질의문자열(`css2?family=...:wght@300;400`)은 건드리지 않는다 |
| CSS 안 상대 `url()` 을 원점 기준으로 풀면 폰트가 사라짐 | **그 CSS 파일의 URL 기준**으로 푼다 |

한글 폰트는 유니코드 서브셋으로 쪼개져 파일이 수백 개일 수 있습니다. 정상입니다 —
브라우저가 필요한 조각만 받습니다. 가변폰트는 여러 `font-weight` 가 **같은 파일**을 가리키는데
그것도 정상입니다(원본 CSS 가 그렇습니다).

이미지는 `public/` 에 넣습니다. 파일명이 한글이면 참조도 같이 퍼센트 인코딩하십시오.
`foo.jpg` 와 `foo.jpg.webp` 가 같이 있으면 **접두 충돌**에 주의하십시오 —
치환할 때 `(?![A-Za-z0-9._~%-])` 같은 경계를 걸지 않으면 참조가 통째로 깨집니다.

`.zalkera/ASSETS-LICENSE.md` 에 동봉 자산의 출처와 라이선스를 적습니다
(Google Fonts 자가호스팅은 대개 **SIL OFL 1.1** — 재배포 허용).

### 2-6. 문서 3종

| 파일 | 무엇을 적나 |
| --- | --- |
| `NOTE.md` | 시안 대비 **고친 것 전부**(§2-3 ⑴⑵ 포함) · 자리표시자 목록 · 검증 결과 |
| `AGENTS.md` | 다음 LLM 이 고칠 좌표와 **금지사항**(§1 을 요약) |
| `.zalkera/ASSETS-LICENSE.md` | 동봉 자산 출처·라이선스 |

**자리표시자는 반드시 목록으로 뽑아 적으십시오.** `href=` 만 훑으면 스크립트 안의 것을 놓칩니다.
`page.tsx` 와 `public/mockup.js` **양쪽**에서 찾으십시오:

```bash
grep -ohE 'tel:[0-9+-]+|https://pf\.kakao\.com/[A-Za-z0-9_-]+|YOUR_[A-Z_]+' \
  src/app/page.tsx public/mockup.js | sort -u
```

---

## 3. 검증 — 이 순서로, 전부 통과해야 한다

```bash
npm ci
npm run typecheck                      # rc 0
npm run validate -- --gate             # rc 0
npm run build                          # rc 0 — 다만 이것만으로는 부족하다(아래)
```

### ⚠ `npm run build` 의 rc 0 을 믿지 마십시오

CSS 파싱 실패를 **경고로 찍고 rc 0** 을 냅니다. 반드시 개발 서버로 확인하십시오:

```bash
npm run dev &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/    # 200 이어야 한다
```

**500 이면 CSS 나 모듈이 깨진 것입니다.** 서버 로그에 이유가 있습니다.

### 브라우저 콘솔도 보십시오 — **모든 주소를, 개발 모드로**

서버가 200 이어도 **클라이언트에서만 터지는 오류**는 안 보입니다(§1-5 가 그 자리였습니다).
브라우저로 열어 콘솔을 확인하십시오 — `pageerror` 와 `console.error` 가 **0건**이어야 합니다.
페이지를 끝까지 스크롤해서 지연 실행되는 스크립트까지 깨우십시오.

두 가지를 반드시 지키십시오. 둘 다 **실제로 결함을 놓친 자리**입니다.

**⑴ `/` 만 보지 마십시오.** 팩이 내놓는 주소를 전부 보십시오 —
최소한 `/` · `/contact` · `/policies`, 그리고 `content/pages/*.json` 이 만든 주소 전부.
랜딩만 보고 넘겼다가 `/policies` 에만 있던 React 중복 키 오류를 놓쳤습니다.

**⑵ 상용 빌드가 아니라 `npm run dev` 로 보십시오.**
React 의 개발 경고(중복 키·잘못된 prop 등)는 **상용 빌드에서 통째로 제거됩니다.**
`next build` 산출물로 콘솔을 재면 그 부류가 **구조적으로 안 보입니다.**

### 시안과 대조

| 무엇 | 기준 |
| --- | --- |
| 본문 글자수 | 시안과 같아야 한다(`document.body.innerText` 길이) |
| 전체 높이 | 시안과 근사(수십 px 차이는 폰트 로딩 시점 차이) |
| 외부 호스트 요청 | **0건** — 실패만 세지 말고 **호스트별로** 세십시오 |

> 스크린샷만 비교하면 **부가 연출이 죽어도 못 잡습니다** — 높이·글자수가 거의 안 변하기 때문입니다.
> 콘솔 오류 감시가 그 자리를 봅니다.

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
            if name.endswith(".tsbuildinfo"):
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
| `[EDECL]` rc=7 | `zalkera` 선언 + 미준수 | §1-3 |
| `pages 맵을 못 읽었습니다` | `content/index.ts` 를 축약 표기로 씀 | §2-1 |
| `--byo 선언이 zip 과 맞지 않습니다` | 템플릿 파생인데 `--byo` 를 붙임 | §3 |
| SVG 가 안 보임 | `viewbox` 를 소문자로 둠 | §2-2 |
| `Encountered two children with the same key` | 같은 주소를 가리키는 내비 항목 + `key={it.href}` | §2-1 |
| 상용 빌드에서는 안 보이던 콘솔 경고 | React 개발 경고는 상용 빌드에서 제거된다 | §3 |

---

## 5. 납품물

zip 1개 + 그 안의 `NOTE.md`·`AGENTS.md`·`.zalkera/ASSETS-LICENSE.md`.

**검증 결과를 숫자로 보고하십시오** — 「됐습니다」는 보고가 아닙니다:
`typecheck` rc · `validate` rc · `build` rc · `dev GET /` 상태코드 ·
**주소별** 콘솔 오류 건수(어느 주소를 봤는지 같이) · 외부 호스트 건수 ·
본문 글자수(시안 대 팩) · `verify-zip` rc.

**기계 검사 통과는 인수가 아닙니다.** 사람이 볼 것이 남습니다 —
자산 출처 실제 대조 · 자리표시자 연락처 · 개시 후 화면 확인.
