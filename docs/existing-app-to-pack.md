# 기존 사이트 → 잘커라 소스 팩 이관 지시서 (BYO 레인)

거래처가 **이미 돌리고 있는 웹앱**(자기 레포·자기 배포)을 잘커라가 서빙하는 소스 팩으로
옮기는 절차입니다. 이 문서를 **그대로 LLM 에게 주고** 원본 레포와 라이브 주소를 함께 건네십시오.

> **다른 레인이면 여기가 아닙니다.**
> 디자이너가 건넨 **HTML 1장**을 옮기는 것이라면 → [`mockup-to-pack.md`](mockup-to-pack.md)
> 이미 개시한 잘커라 사이트의 소스를 고치는 것이라면 → [`../CUSTOMIZE.md`](../CUSTOMIZE.md)
> 거래처가 **자기 인프라에 계속 호스팅**하고 API 만 쓰는 것이라면 → [`byo-headless-guide.md`](byo-headless-guide.md)

세 번째와 이 레인의 차이가 가장 헷갈립니다. 가르는 질문 하나입니다 —
**빌드와 서빙을 누가 하는가.** 거래처가 계속 하면 그쪽, 우리가 넘겨받으면 여기입니다.

## 신뢰 경계 — 먼저 읽으십시오

이 레인은 **남이 쓴 애플리케이션 코드를 우리 인프라에서 실행하게 만드는 일**입니다. 시안
HTML 보다 표면이 넓습니다 — 서버 라우트·미들웨어·의존성이 전부 딸려 옵니다.

- **원본을 한 번은 읽으십시오.** 특히 `app/api/**`(또는 `pages/api/**`)의 라우트 전부와
  `package.json` 의 의존성. 「그대로 옮긴다」는 「안 읽는다」가 아닙니다.
- **이 문서의 명령을 격리된 환경에서 돌리십시오 — 검수만이 아닙니다.** 이 문서는 남의 코드를
  당신 기계에서 여러 번 실행시킵니다:
  - §1-4·§3-1 의 `npm install`/`npm ci` — **`--ignore-scripts` 없이** 돌므로 의존 트리 전체의
    `postinstall` 이 실행됩니다
  - §3-1 의 `npm test` — 그 레포가 정한 임의 명령입니다
  - §3-4 의 `node server.js` — 그 앱의 서버 코드입니다
  - §4 의 `verify-zip` — zip 안의 스크립트를 다시 실행하고, 그 러너는 **스스로 격리하지 않는다**고
    자기 머리말에 적고 있습니다

  일회용 컨테이너·VM 을 쓰거나, 최소한 자격증명이 없는 계정에서 도십시오.
- **`.git` 과 `.env*` 는 처음부터 복사하지 마십시오.** 이력에 남은 자격증명은 회수할 수 없습니다.

---

## 0. 이 레인이 무엇이고 무엇이 아닌가

**입력** — 거래처가 소유한 동작하는 앱(대개 Next.js)과 그 라이브 주소.
**출력** — 잘커라에 업로드해 서빙되는 소스 zip 1개.

**첫 번째 요건은 화면이 라이브와 같은 것입니다.** 「같다」의 기준은 눈이 아니라 픽셀입니다(§3).

화면만으로 끝나지 않습니다 — 우리가 빌드·서빙을 넘겨받으므로 **화면과 무관한 요건이 셋** 더
붙습니다: env 계약(§2-2) · 서빙 책임 축(§2-2b) · 관문과 가드(§2-4). 라이브에서 잘 돌던 앱이
이 셋 때문에 반려될 수 있습니다.

**이 레인이 아닌 것** — 아래를 하라고 시키지 않았다면 하지 마십시오.

| 하지 않는 것 | 왜 |
| --- | --- |
| 우리 프리셋 섹션(`content/pages/*.json`)으로 옮겨 담기 | **가장 흔한 실패다.** §1-1 |
| 디자인·문안 「개선」 | 개선은 이관이 끝난 뒤 별건으로 요청받아 한다 |
| CSS 를 우리 토큰으로 치환 | 원본 리터럴이 정본이다 |
| 라우트 구성 바꾸기 | 라이브에 있는 주소는 그대로, 없는 주소는 만들지 않는다 |
| 우리 시작 소스 파일을 복사해 넣기 | §1-3 |

---

## 1. 절대 하지 말 것

### 1-1. 프리셋으로 「번역」하지 마라

원본 섹션을 우리 어휘(`HERO`·`FEATURE_GRID`·`LOGO_WALL`…)로 옮겨 담고 싶어집니다. **그 결과물은
이관물이 아니라 다른 사이트입니다.**

실제로 그렇게 만들어 반려된 팩의 대조표입니다:

| 라이브 | 프리셋 번역판 |
| --- | --- |
| 포트폴리오 — 서비스 3종 **카드** | `LOGO_WALL` (로고 나열로 격하) |
| 서비스 **6개** | `FEATURE_GRID` **4개** (2개 소실) |
| About — Mission/Vision/Values | `TEXT_MEDIA` — **원문에 없는 문장**으로 대체 |
| Technology 섹션 | **통째 누락** |
| 문의 폼 | `LEAD_CTA` (폼 소실) |
| 라우트 3개 | 커머스 라우트 17개(`cart`·`checkout`·`products`…) |

**원본 컴포넌트를 그대로 가져오십시오.** 손으로 쓴 `components/sections/*.tsx` 가 있으면 그것이
정본입니다. 우리 `SectionList`·`content/` 배선은 이 레인에 **넣지 않습니다**.

### 1-2. `package.json` 에 `zalkera` 선언을 달지 마라

`zalkera: {styling, content}` 는 **혈통 표식**입니다. 달면 `verify-zip --byo` 가 「템플릿 혈통인데
BYO 라고 선언했다」로 보고 **rc 2(실행 불가)** 를 냅니다.

선언이 없으면 스타일 규약(S1~S8)은 **경고로만** 나옵니다. 원본의 인라인 스타일·색 리터럴은
그 경고를 받은 채로 통과하는 것이 정상입니다 — 고치면 화면이 달라집니다.

### 1-3. 우리 시작 소스 파일을 복사해 넣지 마라

아래가 트리에 있으면 `--byo` 가 거부합니다:

```
src/components/sections/SectionRenderer.tsx   content/index.ts
scripts/lib/test-floors.json                  scripts/lib/gate-behavior.mjs
src/lib/crossOrigin.ts   src/lib/previewGuard.ts
src/lib/safeUrl.ts       src/lib/oauthState.ts
```

§2-4 에서 관문·가드를 **더하라**고 하는데, 그것은 이 파일들을 복사하라는 뜻이 아닙니다.
같은 판정을 이 앱의 구조에 맞게 **직접 쓰십시오**(그쪽에 규칙이 적혀 있습니다).

> ⚠ **판정은 내용이 아니라 경로로 합니다.** `lineageEvidence` 는 위 **경로가 존재하는지만** 봅니다 —
> 파일 안을 안 읽습니다. 그래서 자기 손으로 새로 쓴 파일이어도 경로가 같으면 rc 2 입니다.
>
> 걸리는 것은 **디렉터리까지 포함한 전체 경로**입니다. 그래서:
>
> | 레이아웃 | 관문 판정을 둘 자리 | |
> | --- | --- | --- |
> | 루트 `app/`(src 없음) | `lib/previewGuard.ts` | 안전 — 표식은 `src/lib/…` 다 |
> | `src/app/` | `src/lib/previewGuard.ts` | 🔴 **표식과 같다** |
> | `src/app/` | `src/lib/preview-gate.ts` · `src/app/_guards/preview.ts` | 안전 |
>
> `src/` 레이아웃이면 이름을 바꾸십시오. §2-4⑴ 의 예시는 루트 `app/` 레이아웃 기준입니다.

### 1-4. 안 쓰는 것을 「혹시 몰라」 남기지 마라

원본 `package.json` 에는 대개 import 되지 않는 의존성이 쌓여 있습니다. 실제 import 를 세어
빼십시오 — 화면은 안 바뀌고 설치 시간과 공급망 표면만 줄어듭니다.

**대상 디렉터리를 자기 레이아웃에 맞추십시오** — 아래는 루트 `app/` 기준입니다. Pages Router 면
`app` 을 `pages` 로, src 레이아웃이면 `src` 를 붙이십시오. **틀린 디렉터리를 주면 결과가 비어
나오고, 그러면 쓰는 의존 전부가 「뺄 후보」가 됩니다.**

```bash
grep -rhoE "from ['\"][^'\"./][^'\"]*['\"]" app components lib hooks \
  | sed "s/from ['\"]//;s/['\"]$//" \
  | sed 's|^\(@[^/]*/[^/]*\).*|\1|; s|^\([^@/][^/]*\).*|\1|' \
  | grep -Ev '^(node:|@/)' | sort -u
```

> ⚠ **이 그물은 성깁니다. 결과를 「안 쓰는 것 목록」으로 읽지 마십시오** — 목록에 **없는데
> `package.json` 에 있는 것**이 «뺄 후보»일 뿐이고, 후보마다 아래를 확인한 뒤에 빼십시오.
>
> 못 보는 것 넷입니다:
> - `from` 이 없는 부수효과 import(`import "some-polyfill"`)
> - 직접 import 되지 않지만 필수인 의존(`react-dom`·`typescript`·`autoprefixer`)
> - 설정 파일에서만 쓰이는 플러그인(`tailwind.config`·`postcss.config`·`eslint`)
> - 다른 의존이 peer 로 요구하는 것
>
> 뺀 뒤에는 반드시 `rm -rf node_modules && npm install && npm run build` 로 되짚으십시오.

배포 인프라 파일도 뺍니다 — `Dockerfile*`·`docker-compose*`·`amplify.yml`·`.github/`·
`*.tsbuildinfo`. 잘커라 서빙은 이것들을 안 읽고, 남으면 다음 사람이 어느 쪽이 정본인지 헷갈립니다.

---

## 2. 옮기는 것 · 바꾸는 것 · 더하는 것

### 2-1. 그대로 옮기는 것

소스·에셋·빌드 설정 전부입니다. **한 글자도 고치지 않는 것이 기본값이고**, §2-2·§2-2b·§2-4 에
해당하는 자리만 예외입니다.

**레이아웃을 먼저 확인하십시오** — 이 문서의 예시 경로는 루트 `app/` 기준이라 그대로 안 맞을 수
있습니다.

| 레이아웃 | 소스 디렉터리 |
| --- | --- |
| App Router, src 없음 | `app/` `components/` `hooks/` `lib/` |
| App Router, src 있음 | `src/app/` `src/components/` … (§1-3 의 경로 충돌 주의) |
| **Pages Router** | `pages/` `components/` … — 옛 앱은 대개 여기다(§2-2b) |

어느 쪽이든 `public/`·`tailwind.config.*`·`postcss.config.*`·`tsconfig.json`·전역 CSS 는 같이 옵니다.

> Next 는 루트 `app/` 을 `src/app` 보다 **먼저** 고릅니다. 둘 다 있는 트리를 물려받았다면 어느
> 쪽이 실제로 빌드되는지 확인하십시오 — 안 쓰는 쪽을 고치고 있을 수 있습니다.

Tailwind 판을 올리지 마십시오. v3 프로젝트는 v3 로 두십시오 — v4 는 preflight 와 레이어 규칙이
달라 화면이 어긋납니다.

### 2-2. 반드시 바꾸는 것 — env 이름과 클라이언트

거래처 앱은 자기 이름으로 env 를 읽습니다. 잘커라 서빙이 주입하는 이름은 정해져 있습니다.

| 원본에 흔한 이름 | 바꿀 이름 | 성질 |
| --- | --- | --- |
| `API_BASE_URL`·`BACKEND_URL` | `ZALKERA_API_BASE` | 런타임. 기본 `http://localhost:8100` |
| `TENANT`·`SITE_CODE` | `ZALKERA_TENANT` | 런타임. **폴백을 두지 마라** — 없으면 던진다 |
| — | `ZALKERA_STOREFRONT_KEY` | 런타임. 없으면 미전송(하위호환) |

`ZALKERA_TENANT` 에 폴백을 두면 값이 빠졌을 때 **남의 테넌트 데이터**를 그립니다. 빈 화면보다
나쁩니다. 없으면 기동 시점에 크게 실패하는 것이 맞습니다.

```ts
const TENANT = process.env.ZALKERA_TENANT
if (!TENANT) throw new Error('ZALKERA_TENANT 가 설정되지 않았습니다 — 서빙 env 를 확인하세요.')
```

> 이 이름들은 **예약 프리픽스**라 콘솔의 사이트 환경변수에 넣을 수 없습니다(400
> `RESERVED_ENV_KEY`). 서빙이 기동 때 주입합니다.

구 클라이언트(`@oneque/client`)를 쓰고 있으면 `@zalkera/client` 로 바꿉니다. 이름만 바뀌고
호출부는 그대로인 경우가 많습니다 — `createOnequeClient`→`createZalkeraClient`,
`OnequeError`→`ZalkeraError`.

### 2-2b. 서빙 책임 축 — **선언이 없어도 반려하는 규칙이 있습니다**

§1-2 는 「선언을 달지 마라, 그러면 스타일 규약은 경고로만 나온다」였습니다. **스타일 축(S)만
그렇습니다.** 아래 축은 선언과 무관하게 rc 1 로 반려합니다.

> ⚠ **직접 `zalkera-validate` 를 돌려 보고 「경고뿐이네」 하지 마십시오.** C·E 는 평상시엔 경고이고,
> **관문 모드(`--gate`)에서만 error 로 올라갑니다.** `verify-zip` 은 항상 `--gate` 로 부르므로
> (`verify-zip.mjs:1018` — 「우리가 서빙 책임을 지는 자리라 C·E 를 error 로 올린다」) 검수에서는
> 반려입니다. 두 명령의 결과가 다른 것이 정상입니다.

| 축 | 무엇을 보나 | 기존 앱에서 흔히 걸리는 자리 |
| --- | --- | --- |
| **C1** | SEO 라우트 `page` 가 동적 SSR 을 강제 | 페이지에 `export const dynamic = 'force-dynamic'` |
| **C1b** | `layout`/`template` 이 **import 로 도달하는** 서버 모듈의 동적 API | 루트 레이아웃이 무는 모듈 어딘가의 `cookies()`·`headers()` |
| **C1p** | Pages Router 의 `getServerSideProps` | 옛 앱은 대개 여기 |
| **C1pa** | `_app`/`_document` 의 `getInitialProps` | 사이트 전체가 동적이 된다 |
| **E1~E3** | 시크릿 노출 | 클라이언트 번들에 서버 키가 들어감 |

C 축은 **성능이 아니라 서빙 원가**입니다. 전 페이지가 요청마다 서버 렌더되면 그 사이트는
캐시를 못 씁니다.

**정당한 이유가 있으면 마커로 강등하십시오** — 지우거나 우회하지 말고 이유를 적습니다.

```ts
// zalkera-allow-dynamic: 로그인 상태에 따라 헤더가 갈려 정적화가 불가능하다
export const dynamic = 'force-dynamic'
```

마커가 있으면 error 가 warning 으로 내려갑니다. **이유 칸을 비우지 마십시오** — 빈 사유는
면제가 안 됩니다.

> 이것이 §2-1 「한 글자도 고치지 않는 것이 기본값」의 **세 번째 예외**입니다(앞 둘은 §2-2·§2-4).
> 원본이 동적 SSR 로 돌고 있었다고 해서 그대로 통과하지 않습니다.

### 2-3. 빼는 것 — `.env` 는 팩에 실리지 않는다

**vsix·CLI 로 발행하면** 포장기가 `.env` 로 시작하는 모든 것을 뺍니다(`.envrc`·`.env~` 포함).
`.env.example` 만 예외이고, 그것도 값이 들어 있으면 도로 뺍니다.

> 🔴 **손으로 zip 을 싸면 그 배제가 없습니다.** §3-0 이 만들게 하는 `.env.local` 이 그대로 실리고
> 검수가 시크릿으로 반려합니다. §2-5 의 포장 스크립트에 배제가 들어 있으니 그것을 쓰십시오 —
> 다른 방법으로 싸신다면 직접 빼야 합니다.

로컬과 서버의 env 는 어느 경로로도 **자동 동기화되지 않습니다.** 어디에 무엇을 넣는지 팩의
`README.md` 에 표로 남기십시오 — 이관한 사람 말고는 아무도 모릅니다. **어느 값이 빌드 시점에
구워지는지**(`NEXT_PUBLIC_*`)를 표에 반드시 표시하십시오. 그 값은 나중에 서버에 넣어도
재빌드 전까지 반영되지 않습니다.

### 2-4. **더하는 것 — 관문과 가드**

여기가 이 레인에만 있는 일입니다. 거래처 앱은 우리 미리보기·서빙을 전제로 쓰이지 않았으므로
아래 장치가 **없는 것이 정상**이고, 그대로 두면 구멍으로 남습니다.

**변이 라우트(`POST`·`PUT`·`PATCH`·`DELETE`)가 하나라도 있으면 ⑴⑵ 가 필요합니다.**
읽기 전용 사이트면 ⑴⑵ 를 넘어가십시오 — **⑶⑷ 는 그래도 봐야 합니다**(⑶ 은 GET 만 있는 앱의
레이트리밋에도 걸리고, ⑷ 는 이미지가 있으면 무조건 필수입니다).

> 🔴 **넘어가기 전에 `GET` 핸들러가 상태를 바꾸는지 확인하십시오.** 관문 판정은 **메서드로만**
> 가릅니다 — 우리 템플릿은 「GET = 읽기」를 자기 코드로 보증하지만 **이 레인의 대상은 남의 앱**
> 입니다. 구독 해지 링크 · `GET /logout` · 이메일 확인 링크처럼 GET 에 쓰기를 숨긴 라우트는
> 흔하고, 그런 라우트는 **관문에도 안 걸리고**(미리보기가 상용 데이터에 씁니다) CSRF 가드의
> 처방 대상도 아닙니다(GET 에는 `Origin` 을 강제할 수 없습니다).
> 찾으면 **POST 로 고치는 것**이 정석입니다. 못 고치면 관문 판정에 그 경로를 이름으로 더하고
> 왜 그랬는지 적으십시오.

#### ⑴ 미리보기 쓰기 관문 — `middleware.ts`

**왜**: vsix 미리보기는 화면만 로컬이고 **백엔드는 상용에 붙습니다**(확장이 `.env.local` 에
상용 값을 씁니다). 관문이 없으면 미리보기에서 폼을 제출한 것이 **실제 데이터**가 됩니다.

**판정 근거**: `NEXT_PUBLIC_ZALKERA_PREVIEW` 는 확장이 미리보기에만 넣고, 서빙 오케스트레이터는
그 이름을 전 경로에서 지웁니다(예약 프리픽스라 커스텀 env 로도 못 넣습니다). 그래서 「있으면 곧
미리보기」가 구성상 참입니다.

**라우트 안의 `if` 로 때우지 마십시오.** 지금 라우트가 하나여도, 다음에 폼을 하나 더 만들면
그때 가드를 다시 부르는 것을 기억해야 합니다. 요청 경로에서 끊으면 새 라우트가 자동으로
덮입니다.

```ts
// middleware.ts — 집행. 판정은 lib/previewGuard.ts 에 순수 함수로 둔다(시험 가능하도록).
export function middleware(req: NextRequest) {
  if (!isPreview()) return NextResponse.next()
  if (!isPreviewBlockedWrite(req.method, req.nextUrl.pathname)) return NextResponse.next()
  return NextResponse.json({ok: false, error: '미리보기에서는 쓰기가 비활성화됩니다.'}, {status: 403})
}
export const config = {matcher: ['/((?!_next/static|_next/image).*)']}
```

> ⚠ **matcher 를 확장자로 가르지 마십시오.** `.*\.[A-Za-z0-9]+$` 로 빼면 동적 세그먼트에 점이
> 든 쓰기 경로가 통째로 관문 밖이 됩니다.
> 재현: `node -e 'console.log(/^\/((?!.*\.[A-Za-z0-9]+$).*)$/.test("/api/x/7.0"))'` → `false`

> ⚠ **면제 목록을 미리 만들지 마십시오.** 과하게 막히면 403 이 눈에 띄지만, 조용히 새는 쪽은
> 안 보입니다. 면제가 실제로 필요해질 때 사유와 함께 추가하십시오.

#### ⑴-b 판정을 순수 함수로 빼고 **시험을 쓰십시오**

관문의 값어치는 판정 한 줄에 있고, 그 한 줄이 틀리면 **두 방향으로** 아픕니다 — 느슨하면
미리보기가 상용 원장에 쓰고, 빡빡하면 사이트가 안 뜹니다. 그래서 판정을 `next/server` 를 안 무는
순수 함수로 빼고(그래야 러너 없이 시험이 돕니다) 최소한 아래를 잠그십시오:

- 변이 메서드 넷이 전부 막히는가
- 읽기 메서드(`GET`·`HEAD`·`OPTIONS`)가 전부 통과하는가
- 소문자 메서드도 같게 보는가
- 경로와 무관하게 메서드로만 가르는가(**새로 만든 라우트도 자동으로 덮인다**는 성질)
- 미리보기 판정이 값을 비교하지 않는가(`=1` 이 아닌 값도 미리보기)

`package.json` 에 `test` 스크립트를 두십시오. 원본 레포에는 대개 없습니다 — §3-1·§4 가 이
시험의 존재를 전제합니다.

```json
"test": "node --experimental-strip-types --test \"lib/*.test.mts\""
```

**시험이 살아 있는지는 §3-5 에서 변이로 확인합니다.** 판정 한 줄을 일부러 틀리게 고쳐 빨개지지
않으면, 그 시험은 통과를 세는 장식입니다.

#### ⑵ 교차사이트 위조 가드 — `assertSameOrigin`

**왜**: 남의 사이트의 자동 제출 `<form>` 이 방문자 브라우저를 우리 라우트로 직접 보냅니다.
그때 이 사이트의 JS 는 한 줄도 안 돌아 클라이언트 장치로는 못 막습니다.

```
통과 ⇔ Origin 존재 ∧ Origin ≠ "null"
       ∧ Origin.host == (x-forwarded-host ?? host)
       ∧ (Sec-Fetch-Site 가 있으면 그 값이 "same-origin")
```

- `Sec-Fetch-Site !== 'cross-site'` 로 쓰지 마십시오 — 같은 상위 도메인의 다른 사이트가 통과합니다.
  **있을 때만 `same-origin` 을 요구**하는 보조 신호로만 쓰십시오(헤더를 안 보내는 브라우저가 있습니다).
- **스킴을 비교하지 마십시오** — 프록시가 `x-forwarded-proto: http` 를 넣는데 공개 스킴은 https 라
  사이트가 통째로 죽습니다. 호스트만 봅니다.
- **`Origin` 부재를 통과시키지 마십시오** — 그 구멍으로 폼 제출이 다시 들어옵니다.
- **허용 호스트 목록(env)을 쓰지 마십시오** — 커스텀 도메인·프리뷰 호스트에서 드리프트합니다.

> ⚠ **가드는 핸들러 본문의 첫 구문이어야 합니다.** 검사기가 이 자리를 **구조로** 봅니다(앞의
> 코드가 무해한지 기계는 못 읽습니다). 미리보기 관문의 이중 방어를 라우트 안에도 둔다면 이
> 가드 **뒤에** 놓으십시오.

#### ⑶ 방문자 IP — `visitorIp(headers)`

원본이 `x-forwarded-for` 의 **첫 엔트리**를 쓰고 있으면 고치십시오. 그 값은 방문자가 헤더에 넣어
보낼 수 있어 레이트리밋 우회와 IP 기록 오염이 열립니다.

```ts
import {visitorIp} from '@zalkera/client'
const ip = visitorIp(req.headers)   // 신뢰 홉 기준으로 뒤에서부터 센다. 기본 1
```

**이 레인에서는 홉을 고민할 필요가 없습니다.** 잘커라 서빙 프록시가 `x-forwarded-for` 를
방문자 IP **단일 엔트리로 덮어쓰므로**(`x-real-ip`·`cf-connecting-ip` 도 같이 정규화합니다)
홉 1 이 구성상 참이고, 그것이 기본값입니다.

> ⚠ **`ZALKERA_TRUSTED_PROXY_HOPS` 를 올리려 하지 마십시오.** 이 레인에서는 두 겹으로 막힙니다 —
> ⑴ `ZALKERA_` 는 예약 접두라 콘솔 env 로 넣을 수 없고(400), ⑵ 넣을 수 있었어도 엔트리가 하나뿐인
> 헤더에서 홉 2 를 세면 방문자 IP 가 `undefined` 가 됩니다. 이 변수는 **자기 인프라로 호스팅하는
> 레인**의 것입니다(자기 프록시 단 수를 자기가 압니다). 거기서는 **실제보다 크게 선언하면 위조가
> 조용히 관통한다**는 비대칭이 그대로 적용됩니다 — 과소 선언은 IP 뭉침으로 눈에 띄지만 과대
> 선언은 안 보입니다. 규칙 전문은 `@zalkera/client` 의 `visitorIp` 타이핑 주석에 있습니다.

정할 수 없으면 `undefined` 를 그대로 흘리십시오. `'unknown'` 같은 문자열을 지어내면 IP 를 못 정한
방문자 전원이 한 버킷으로 뭉쳐 서로의 레이트리밋을 소모합니다.

#### ⑷ 에셋 라이선스 매니페스트 — `.zalkera/ASSETS-LICENSE.md`

이미지가 하나라도 있으면 **필수**입니다(없으면 검수 반려). 기계는 **존재만** 보고 내용 대조는
사람이 합니다 — 그러니 **확인한 것과 확인하지 않은 것을 갈라** 적으십시오.

기계로 잴 수 있는 것은 재고 재현 명령을 같이 적으십시오:

```bash
# SVG 안의 폰트·래스터 임베드. `public/**/*.svg` 로 쓰지 마십시오 — globstar 를 안 켠 bash 에서
# `**` 가 `*` 한 단계로 줄어 깊은 곳을 못 봅니다(zsh 에서만 의도대로 됩니다).
find public app -name '*.svg' -exec grep -cH 'base64\|@font-face' {} +
python3 -c "import struct,sys;d=open(sys.argv[1],'rb').read();i=8
while i<len(d)-8:
    ln=struct.unpack('>I',d[i:i+4])[0];t=d[i+4:i+8].decode('latin1')
    print(t) if t in ('tEXt','iTXt','zTXt') else None
    i+=12+ln" public/logo.png                          # PNG 저작자 메타
```

### 2-5. 포장 — 무엇을 빼고 싸는가

```bash
cd <소스루트>
rm -rf .next node_modules .git *.tsbuildinfo

python3 - <<'EOF'
import os, zipfile
SKIP_DIRS = {'node_modules', '.next', '.git'}

def excluded(name):
    low = name.lower()
    # `.env` 로 **시작**하는 것 전부 — `.envrc`(direnv)·`.env~`(편집기 백업)도 자격증명이다.
    # `.env.example` 만 남기되, 값이 들어 있으면 그것도 자격증명이므로 손으로 확인하라.
    if low.startswith('.env'):
        return low != '.env.example'
    return False

with zipfile.ZipFile('../<이름>-<판>.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk('.'):
        # 심링크 디렉터리를 따라가지 않는다.
        dirs[:] = [d for d in dirs
                   if d not in SKIP_DIRS and not os.path.islink(os.path.join(root, d))]
        for n in sorted(files):
            p = os.path.join(root, n)
            if os.path.islink(p):
                print(f'건너뜀(심링크): {p}')
                continue
            if excluded(n):
                print(f'건너뜀(자격증명): {p}')
                continue
            z.write(p, os.path.relpath(p, '.'))
EOF
```

> ⚠ **`.env.example` 은 남기지만, 값이 들어 있으면 그것도 자격증명입니다.** 열어서 확인하십시오 —
> 이 스크립트는 이름만 봅니다.

> 🔴 **심링크를 반드시 빼십시오.** `zipfile.write` 는 심링크를 **따라가 대상의 내용을 일반 파일로
> 묻습니다.** 원본 레포에 `docs/x.md → ~/.netrc` 같은 링크가 하나 있으면 **작업자 기계의 파일이
> 납품 zip 에 조용히 실려** 거래처로 갑니다. 묻힌 뒤에는 일반 파일이라 시크릿 스캔의 내용 패턴에
> 안 걸리는 종류(`.netrc`·임의 사문서)는 그대로 통과합니다.
>
> 재현:
> ```bash
> mkdir -p /tmp/t/src && cd /tmp/t && echo 'SECRET=abc' > outside.txt
> ln -s /tmp/t/outside.txt src/innocent.md
> python3 -c "import os,zipfile
> z=zipfile.ZipFile('t.zip','w')
> [z.write(os.path.join(r,n)) for r,_,f in os.walk('src') for n in f]
> z.close(); print(zipfile.ZipFile('t.zip').read('src/innocent.md'))"
> # → b'SECRET=abc\n'  (배제 줄이 없으면 이렇게 실린다)
> ```
>
> 정본 도구는 셋 다 이걸 막습니다 — 포장기는 `isFile()` 인 것만 싣고, 검수기의 시크릿 스캔은
> 심링크를 거부해 「읽지 못한 자리」로 적으며, 혈통 판정은 `lstat` 을 씁니다.

파일은 **zip 최상위**에 둡니다(단일 폴더로 감싸도 검수기가 풀어 읽지만, 최상위가 단순합니다).

---

## 3. 검증 — 라이브와 대조한다

시안 레인과 달리 **비교 대상이 실물로 떠 있습니다.** 그것을 쓰십시오.

### 3-0. env 를 먼저 넣으십시오

`ZALKERA_TENANT` 없이는 빌드가 섭니다(§2-2 의 throw). `.env.local` 에 넣으십시오.

### 3-1. 명령

```bash
npm ci
npx tsc --noEmit                                  # rc 0
npm test                                          # 관문·가드 판정 시험(§2-4)
ZALKERA_TENANT=<code> npm run build               # rc 0
ls .next/standalone/server.js                     # 있어야 한다
```

### 3-2. 문안 대조 — `diff` 가 0줄이어야 한다

`document.body.innerText` 를 양쪽에서 받아 그대로 견줍니다. 글자수만 세면 **같은 수의 다른 글자**를
못 잡습니다.

차이가 나면 **원본 레포가 라이브보다 뒤처져 있는지** 먼저 의심하십시오. 조건부 렌더(`{KEY && …}`)가
env 때문에 한쪽에서만 그려지는 경우도 흔합니다 — 그때는 **라이브와 같은 env 로 다시 구워** 견줍니다.

### 3-3. 픽셀 대조 — 촬영 조건을 맞춘 뒤에

양쪽 다 같은 뷰포트, 끝까지 스크롤, `document.fonts.ready` 대기 후 `fullPage` 촬영.
조건을 안 맞추면 폰트 로딩 시점 차이가 높이 차로 나와 오진합니다.

**제3자 위젯은 가리고 재십시오.** reCAPTCHA 배지처럼 도메인에 묶인 것은 로컬에서 오류 상태로
그려집니다 — 그것은 사이트가 아니라 그 위젯입니다. 가린 영역을 **몇 픽셀인지 함께 보고**하십시오.

### 3-4. 관문을 깨뜨려 확인 — 통과만 보지 마십시오

「막힌다」와 「안 막힌다」를 **둘 다** 재야 합니다. 한쪽만 재면 상용에서 폼이 죽는 것을 못 봅니다.

```bash
# ── 미리보기 판: 변수를 **넣고 구운 뒤** 그 산출물을 띄운다 ──
#    `NEXT_PUBLIC_*` 는 빌드 시점에 번들로 구워지므로, 변수 없이 구운 산출물에 런타임으로
#    얹는 것에 기대지 마십시오. 굽는 자리와 띄우는 자리 양쪽에 넣는 것이 확실합니다.
NEXT_PUBLIC_ZALKERA_PREVIEW=1 ZALKERA_TENANT=<code> npx next build
NEXT_PUBLIC_ZALKERA_PREVIEW=1 ZALKERA_TENANT=<code> PORT=3400 node .next/standalone/server.js &
for m in POST PUT PATCH DELETE; do
  curl -s -o /dev/null -w "$m %{http_code}\n" -X $m -H 'Origin: http://127.0.0.1:3400' \
    -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3400/<변이경로>
done                                            # 전부 403
curl -s -o /dev/null -w "GET %{http_code}\n" http://127.0.0.1:3400/    # 200 — 화면은 떠야 한다

# ── 상용 판: 변수 **없이 다시 구워** 같은 POST 가 통과해야 한다 ──
rm -rf .next && ZALKERA_TENANT=<code> npx next build
```

관문이 실제로 실렸는지는 산출물로 봅니다:

```bash
python3 -c "import json;d=json.load(open('.next/server/middleware-manifest.json'));print(list((d.get('middleware') or {}).keys()) or '관문 없음')"
```

동일출처 가드는 위조 변종을 넣어 봅니다: `Origin` 없음 · 다른 호스트 · `null` ·
`Sec-Fetch-Site: cross-site` · `same-site` → 전부 403, 정상 Origin → 통과.

### 3-5. 시험이 **살아 있는지** 변이로 확인

판정 함수의 한 줄을 일부러 틀리게 고쳐 시험이 빨개지는지 보십시오. 안 빨개지면 그 시험은
통과를 세는 장식입니다.

---

## 4. 검수 — `--byo` 를 **붙입니다**

### 4-0. 검수기는 이 트리 안에 없습니다

시안 레인은 시작 소스 팩 zip 이 `scripts/verify-zip.mjs` 를 **싣고 오지만**, 이 레인은 그 팩에서
출발하지 않으므로 러너가 손에 없습니다. `@zalkera/client` 의 bin 에도 없습니다
(거기 있는 것은 `zalkera-validate`·`zalkera-aeo-check` 둘뿐입니다).

**공개 레포를 검수 대상 트리 **밖에** 받아 거기서 돌리십시오.**

```bash
git clone https://github.com/zalkera/zalkera-storefront-examples ~/zalkera-verify
cd ~/zalkera-verify && npm ci
node scripts/verify-zip.mjs /절대경로/<납품>.zip --byo
```

> ⚠ **러너를 이관 트리 안으로 복사하지 마십시오.** `scripts/lib/gate-behavior.mjs` 가 혈통
> 표식이라 그 zip 은 rc 2 가 됩니다(§1-3).

> ⚠ **격리된 환경에서 돌리십시오.** 이 러너는 zip 안의 스크립트를 검수자 기계에서 실행합니다 —
> 그 러너 자신이 「나는 격리하지 않는다」고 머리말에 적고 있습니다.

### 4-1. 판정

```bash
node scripts/verify-zip.mjs <납품.zip> --byo
```

`--byo` 는 「이 zip 은 우리 템플릿 혈통이 아니다」는 **호출자의 선언**입니다. 자동 감지가
아니므로, 틀리게 선언하면 rc 2 로 멈춥니다(§1-2·§1-3).

**두 검사가 건너뛰어집니다. 통과가 아니라 미검사입니다.**

| 건너뛴 것 | 그러면 사람이 무엇을 하나 |
| --- | --- |
| 가드 회귀 스위트 | 하한표는 우리 시작 소스의 것이라 이관물에 없다. **§2-4 의 판정 시험을 직접 실어** 그 자리를 메운다 |
| 미리보기 관문 등재 | **모드로 건너뛰므로 관문을 실었어도 안 잽니다.** §3-4 로 사람이 확인한다 |

> ⚠ 두 번째 줄을 오해하기 쉽습니다 — 관문을 넣으면 그 검사가 초록이 되는 것이 **아닙니다.**
> `--byo` 는 관문의 존재와 무관하게 건너뜁니다. 기계는 여기서 아무 말도 하지 않습니다.

스타일 경고(S1~S8)는 선언이 없으면 **경고로만** 나옵니다. 원본 디자인에서 온 것은 그대로
두고, **무엇을 왜 안 고쳤는지 납품 시 적으십시오**.

---

## 5. 반려·경고 읽는 법

### 5-1. 멈추는 것 (rc ≠ 0)

| 메시지 | 원인 | 절 |
| --- | --- | --- |
| `--byo 선언이 zip 과 맞지 않습니다` (rc 2) | `zalkera` 선언이나 템플릿 **경로 이름**이 남음 | §1-2·§1-3 |
| `이미지 N개인데 .zalkera/ASSETS-LICENSE.md 가 없습니다` | 매니페스트 미작성 | §2-4⑷ |
| `[C1] … 동적 렌더` · `[C1b] …` · `[C1p] getServerSideProps` | 서빙 책임 축 — 선언과 무관하게 error | §2-2b |
| `[E1~E3] …` | 클라이언트 번들에 시크릿 | §2-2b |
| `npm lockfile 없음` | yarn·pnpm 프로젝트 | `npm install` 로 `package-lock.json` 생성 |
| `시크릿 …` | `.env*`·`.git` 이 zip 에 실림 | §2-3·§2-5 |
| 빌드는 rc 0 인데 서빙에서 404 | `output: 'standalone'` 누락 | `next.config` 확인 |

### 5-2. **경고로만 나오는 것 — 기계가 안 막습니다**

아래는 rc 0 인 채로 지나갑니다. **기계가 잡아 준다고 믿지 마십시오.**

| 경고 | 뜻 | 절 |
| --- | --- | --- |
| `[X1] … assertSameOrigin 호출이 없습니다` / `… 본문의 첫 구문이 아닙니다` | 교차사이트 위조가 열려 있음 | §2-4⑵ |
| `[I1] … 첫 엔트리는 방문자가 위조할 수 있습니다` | 레이트리밋 우회·IP 기록 오염 | §2-4⑶ |
| `[S1~S8] …` | 스타일 규약. **원본 디자인에서 온 것은 그대로 둔다** | §1-2 |

**X 축은 `--gate` 를 줘도 안 올라갑니다.** 검사기 쪽에서 X 를 error 로 만드는 것은 영구 금지이고
논거도 옳습니다 — X1 은 「교차 오리진을 막았는가」가 아니라 **「우리 심볼을 썼는가」**를 재므로,
통과가 안전을 뜻하지 않습니다. 자기 방식으로 제대로 막은 앱이 이 검사에 걸릴 수 있고, 반대로
심볼만 부르고 판정이 틀린 앱은 통과합니다.

`verify-zip` 이 X 를 반려로 올리는 것은 카탈로그 팩(`--pack`) 모드뿐입니다(`verify-zip.mjs:1077`).
이 레인에서는 **사람이 읽고 고쳐야 합니다.** 러너가 성공 줄 밑에 「이 모드는 안 막는다」를 다시
찍어 주긴 하는데, **X 지적이 있을 때만·X 에 대해서만** 찍습니다(`verify-zip.mjs:1419`).

> ⚠ **I1 은 오늘 어느 모드에서도 error 가 아니고, 재고지 줄도 안 나옵니다.** I1 만 있는 zip 은
> 경고 목록 안에 한 줄로 지나갈 뿐이니 **경고 목록을 끝까지 읽으십시오.**
> 다만 X 와 달리 I1 의 경고 유지는 영구가 아닙니다 — 검사기 소스가 「자산 일소 뒤 승격한다」고
> 승격 지점을 적어 두었습니다. 지금 안 고치면 나중에 반려로 돌아옵니다.

---

## 6. 납품물

- 소스 zip 1개 (`node_modules`·`.next`·`.git`·`.env*` 없이)
- `README.md` — 라우트 표 · env 표(어느 값이 **빌드 시점**인지 표시) · 배포 시 확인할 것
- `NOTE.md` — **안 고친 경고와 그 이유**(§4-1 의 S·X·I 경고 중 원본 디자인·구조에서 온 것).
  적을 곳이 없으면 다음 사람이 「검수 통과했으니 깨끗하다」로 읽습니다
- `.zalkera/ASSETS-LICENSE.md`
- 검증 결과: `verify-zip --byo` rc · 문안 diff 줄수 · 픽셀 차이(가린 영역 포함) · 관문 실측표

**기계 통과는 인수가 아닙니다.** 라이선스 출처·행위 안전·개시 후 화면은 사람이 봅니다.
