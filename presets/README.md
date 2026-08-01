# 프리셋 (memo102 §3 · §8)

콘솔의 "이 프리셋으로 시작"이 고르는 **시작 테마**입니다. 테마 하나 = ① 이 정본 소스에 프리셋 디렉터리를
병합해 팩 시점에 뜬 zip + ② 레지스트리 카드 메타(백엔드 설정).

> **팩 v2(memo129 §3) 이후 "시드"의 뜻이 좁아졌습니다.** 사이트의 **얼굴**(페이지·섹션·문구·이미지 선택·
> 내비)은 이제 zip 안의 `content/` 에 파일로 삽니다 — 소스가 정본입니다(memo128 §3). `.zalkera/seed.json`
> 에 남은 것은 **업무 데이터**(상품·갈래·테마색)뿐이고, 그것은 개시할 때 백엔드 DB 로 들어갑니다.
> 이 문서에서 "시드"는 그 좁은 뜻입니다. seed.json 에 `pages`·`menus` 를 다시 넣으면 팩이 막습니다.

**우리 계보 테마군은 테마마다 소스를 포크하지 않습니다.** 이 디렉터리의 테마들은 마크업 한 벌을 공유하고
다름은 데이터·토큰·카피·이미지에 둡니다 — 그래야 렌더러·안전 가드·검증기·계약 사본이 테마 수만큼 복제되지
않고, 결함 하나를 수리하면 그 뒤의 모든 개시분이 함께 낫습니다.

포크는 아니지만 **파일 단위로 정본을 가리는 길은 열려 있습니다** — `presets/<code>/src/**` 오버레이(아래
"소스 오버레이"). 사이트의 성격은 선언이 아니라 `@zalkera/client` 를 **어떻게 부르는가**로 구성되기
때문입니다(오너 확정 2026-08-01). 오버레이는 가리는 파일이 유한하고 팩이 매번 목록을 찍어서, 전면
포크의 비가시 드리프트와 다릅니다.

이건 **우리 내부 제작 공정이지 시스템의 전제가 아닙니다**(memo107 §2 — 1계보의 독점이 풀렸습니다).
이 계보 밖에서 만든 템플릿 — 외주·독립 zip·창작자 소스 — 도 정상 경로이고, 시스템은 어느 가지에게도
"본류를 따라오라"고 하지 않고 **"계약을 지켰는가"만** 묻습니다(memo107 §4 — L1 자격 판정이 계보에서
스택 선언으로 옮겨졌습니다).

## 지금 있는 테마

| code | 콘솔 노출명 | 성격 | 구성 | 소스 오버레이 |
|---|---|---|---|---|
| `skeleton` | 출발 골격 | **골격** — "명세대로 짜면 이 배선이 나온다". 업무 데이터 참조 섹션 없음 | home(4섹션) · 상품 0 · 갈래 0 | 없음 |
| `shop-goods` | 재화 판매형 | **커머스** — 물건을 진열하고 장바구니·결제로 보낸다 | home(7섹션) · shipping · 상품 5종 · 갈래 `living` | 없음 |
| `beauty-nail` | 네일샵형 | **예약** — 시술을 보여주고 예약으로 보낸다 | home(10섹션) · about · visit · 시술 5종 · 갈래 `care` | 없음 |
| `biz-standard` | 기업 소개형 | **기업소개** — 회사·서비스를 설명하고 상담으로 보낸다 | home(8섹션) · about · consult · 상품 0 | `src/components/SiteHeader.tsx` |

넷 중 셋은 **같은 코드**로 돌고 색·knob·카피·구성만 다릅니다. 토큰만으로 인상이 갈리는지 확인하는 최소
실험 단위가 2종이었고(§8), `beauty-nail` 이 **같은 코드로 업종이 갈리는지**를 보는 세 번째 단위였습니다.

`biz-standard` 만 헤더 하나를 가립니다 — 상품·장바구니·주문을 하나도 안 부르는 소개 사이트라서, 골격이
기본으로 주는 장바구니·로그인 표면이 남으면 **사이트가 자기 정체를 잘못 말합니다**(눌러도 늘 비어 있는
장바구니는 사용자에게 참이 아닙니다). `commerce: false` 같은 **선언으로 끄는 길은 기각됐습니다** — 그건
우리가 정한 유형 중에서 고르게 하는 것이라 자유가 아니라 메뉴가 됩니다(memo125 요건 1).

### 왜 갈래로 가리키나 (memo138 §4 I-1 · memo139)

상품 진열 섹션을 가진 둘(`shop-goods`·`beauty-nail`)의 상품 참조는 **`categorySlug` 하나**다. 특정 상품 handle 을 박지 않는다 —
**외양은 어디서든 구해 와서 올리는 물건**이라(memo138 §3.1) 그 안에 박힌 handle 은 만든 사람의 것이고,
받은 사람 카탈로그에는 없기 때문이다. 그러면 상품을 아무리 등록해도 그 섹션은 **영구히** 빈다.

갈래로 가리키면 자기 상품을 그 갈래에 넣는 대로 채워진다. 판정 기준은 두 문장이다:

> **데이터가 없어서 비는 것 = 정상**(아직 콘솔에 안 넣었을 뿐).
> **데이터를 넣어도 영영 안 채워지는 것 = 결함.**

명시 handle(큐레이션)은 계약·렌더러에 그대로 있다 — 사이트 소유자가 자기 카탈로그에서 상품을 집어
넣는 것은 그 카탈로그 안에서만 참이므로 정당하다. **배송물에서만 안 쓴다.**

### 왜 이 넷인가 — 요건 6 의 실물입니다

[memo125](../../backend/doc/design/memos/125-moat-criteria.md) §1 **요건 명세 6**("예시 소스코드 몇 개를
완성품으로 제공 — 커스텀 제작 교본")이 본보기 셋을 **커머스·예약·기업소개**로 지정했고([memo135](../../backend/doc/design/memos/135-storefront-template-disposition.md) T9),
이 표가 그 실물입니다. 셋은 우리가 파는 유형 축을 덮으면서 **서로 다른 전환 목표**를 갖습니다 —
장바구니 / 예약 / 문의. 같은 골격으로 세 목표가 다 되는 것이 이 예시들의 주장입니다.

넷째 `skeleton` 은 그 셋과 성격이 다릅니다 — **본보기가 아니라 골격**입니다. 업무 데이터를 참조하는
섹션이 하나도 없어서 "명세대로 짜면 이 배선이 나온다"만 보여 주고, 받은 사람이 자기 콘텐츠로 채우는
출발점입니다. 그래서 `public/`·`assets/`·`thumbnail.png` 가 전부 없습니다(전부 선택입니다).

종전 `biz-lead`(상담 전환형 원페이지)는 **`shop-goods` 로 재편되며 물러났습니다.** 성격이
`biz-standard` 와 겹쳐(둘 다 문의로 보내는 정보형) 셋 중 한 칸을 쓰면서도 축을 하나 더 덮지 못했고,
정작 **커머스가 비어 있었습니다** — 재화 판매는 우리 커머스 범위의 절반인데 본보기가 없었습니다.

### `beauty-nail` 의 시술 메뉴 — 시드가 상품까지 만듭니다 (memo119 §2)

**한동안 뷰티 어휘 4종 중 `SERVICE_MENU`·`BOOKING_CTA` 두 개가 빠져 있었습니다.** 둘 다 config 가 실제
`product.id` 를 참조하는데 시드 매니페스트가 페이지·섹션·메뉴·테마색만 만들 수 있어 상품을 못 만들었고,
id 없이 넣으면 렌더러가 `return null` 하므로 **개시 직후 시술 메뉴와 예약 버튼이 조용히 사라진 사이트**가
됐기 때문입니다. 그래서 예약 동선을 `#lead`(상담 폼) 앵커로 우회했습니다.

memo119 가 그 벽을 걷었습니다. 지금은 시드에 **`products`** 가 있고, 소스는 숫자 id 를 안 씁니다 —
개시할 때 백엔드가 상품을 만들고 발급된 id 로 바꿔 넣습니다(에셋 참조와 같은 방식). 두 섹션이 복원됐고
예약 동선이 `/products/<handle>` 상세의 슬롯 선택으로 이어집니다.

**둘은 다른 파일에 삽니다** — 상품은 업무 데이터라 시드에, 섹션은 사이트의 얼굴이라 콘텐츠에:

```jsonc
// presets/beauty-nail/seed.json — 업무 데이터(DB 로 들어간다)
{"products": [
  {"handle": "gel-onecolor", "type": "SERVICE", "name": "젤 원컬러", "price": "50000",
   "description": "…", "imageAsset": "menu-onecolor.png", "categories": ["care"]}
]}
```

```jsonc
// presets/beauty-nail/content/pages/home.json — 얼굴(레포에 파일로 남는다)
{"title": "홈", "sections": [
  {"type": "SERVICE_MENU", "config": {"categorySlug": "care"}},
  {"type": "BOOKING_CTA",  "config": {"label": "시술 예약하기", "categorySlug": "care"}}
]}
```

배송물에서 진열은 handle 이 아니라 **갈래**(`categorySlug`)로 가리킵니다 — 위 "왜 갈래로 가리키나".

- `type` 은 **`SERVICE`·`PHYSICAL`** 이 열려 있습니다(memo137 에서 `PHYSICAL` 이 재고 표현과 함께
  열렸습니다 — `shop-goods` 가 그 실물). `DIGITAL` 은 이행 엔진 자체가 후속이라 팩이 막습니다.
- `PHYSICAL` 은 **초기 재고 `stock` 명시가 필수**입니다(정수·1~999). 안 적으면 재고추적이 켜진 채
  onHand 0 으로 태어나 **전 상품이 품절로 진열**되고 JSON-LD 도 `OutOfStock` 이 됩니다. 반대로
  `SERVICE` 는 무한재고라 `stock` 을 적으면 개시가 중단됩니다.
- `price` 는 **문자열**입니다(부동소수 회피 — 정수 10자리·소수 2자리 이하). 숫자로 적으면 백엔드
  strict 파싱이 개시를 중단합니다.
- 상품은 **20종**·갈래는 **10개**(상품당 3개)까지입니다. 넘으면 그건 템플릿이 아니라 데이터 이관이고,
  입구는 콘솔·업로드입니다.
- `imageAsset` 은 에셋 참조 규칙 그대로 **파일명**입니다(`assets/` 안). 콘텐츠 쪽 이미지와 규칙이
  다릅니다 — 그쪽은 public 루트 절대 경로입니다.
- **상품 0 은 정상**이고(`skeleton`·`biz-standard`), 아무 섹션도 안 가리키는 상품도 정상입니다 —
  상품은 목록·검색으로 독립 노출되는 실체입니다. 반대 방향만 막습니다("쓰겠다고 선언해 놓고 안 가리킴").

**시드는 예약 캘린더를 만들지 않습니다.** 자원·직원·슬롯·영업시간·예약금은 매장의 사실이라 제작자가
발명하면 그럴듯해서 더 위험합니다 — 경계는 **카탈로그까지가 시드, 캘린더부터는 운영**입니다. 그래서 개시
직후 상품 상세는 "예약 준비 중"을 정직하게 표시하고(`BookingPanel`), 원장이 콘솔에서 시간표를 세우면
그 자리에 실제 슬롯이 뜹니다. 메뉴는 뜨는데 슬롯이 없는 것은 결함이 아니라 **개점 전 매장**입니다.

`/products` 목록 라우트는 있습니다(memo119 T6-ⓑ) — 메뉴에 `/products` 를 걸 수 있고, 이 프리셋의
`content/nav.json` 이 "시술 메뉴"로 그렇게 걸어 둡니다.

## 디렉터리

**변환기가 없습니다.** 프리셋 디렉터리가 처음부터 최종 형상을 갖고 있고 팩은 그것을 정본 소스 트리에
병합하기만 합니다 — 중간 변환 코드를 두면 그 변환기가 계약의 숨은 두 번째 정본이 됩니다.

```
presets/<code>/
  content/pages/*.json   # **필수** — 이 사이트의 페이지·섹션·문구.   → zip 의 content/pages/
  content/nav.json       # 선택 — 헤더·푸터 내비.                    → zip 의 content/nav.json
  public/**              # 선택 — 섹션 이미지(레포 상주).            → zip 의 public/
  src/**                 # 선택 — **정본 소스 오버레이**(아래).       → zip 의 src/ (파일 단위로 가림)
  seed.json              # **필수** — 업무 데이터: 상품·갈래·테마색.  → zip 의 .zalkera/seed.json
  assets/*.png           # 선택 — 상품 이미지(개시 시 S3 media 로).   → zip 의 .zalkera/assets/
  ASSETS-LICENSE.md      # **필수** — 파일별 출처·라이선스.           → zip 의 .zalkera/ASSETS-LICENSE.md
  thumbnail.png          # 선택 — 콘솔 카드 썸네일. **zip 밖**(고객 소스가 아니라 우리 카탈로그 자산)
```

`presets/` 자체는 zip 에 **안 들어갑니다**(팩 입력이지 고객 소스가 아님). 정본 `content/`(빈 매니페스트)도
zip 에서 빠지고 **프리셋 것이 대신 실립니다** — 아니면 두 벌이 겹칩니다. `content/index.ts`(정적 import
매니페스트)는 팩이 프리셋 페이지 목록으로 **생성**하므로 프리셋 쪽에 두지 않습니다.
`.zalkera/` 는 dot 디렉터리라 `next build` 가 건드리지 않습니다.

zip 루트에는 `llms.txt` 도 실립니다 — 설치된 `@zalkera/client` 의 것을 **바이트 그대로** 복사합니다
(레포에 사본을 두면 두 번째 정본이 되어 드리프트합니다). 그래서 `npm ci` 가 팩의 선행 조건입니다.

### 소스 오버레이 (`presets/<code>/src/**`)

정본 `src/` 를 **파일 단위로 가립니다**(같은 경로면 프리셋 것이 이깁니다). 추가·교체만 되고 삭제는
없습니다. 팩이 매번 가린 목록과 신규 목록을 찍으므로, 정본 패치가 가려진 파일을 건드릴 때 사람이 압니다.

세 가지를 팩이 막습니다:

- **git 추적 파일만 실립니다**(`git ls-files`). `readdirSync` 로 걸으면 `.gitignore` 에 걸린 파일이
  `git status` 가 깨끗한 채로 zip 에 실립니다 — 실측으로 `presets/<code>/src/.env.local` 이 그랬습니다.
- **심링크 금지.** 레포 밖 파일이 `.tsx` 이름을 쓰고 실릴 수 있습니다.
- **중립 배선은 못 가립니다.** `src/lib/crossOrigin.ts`·`http.ts`·`session.ts`·`oauth.ts`·`safeUrl.ts`·
  `oauthState.ts`·`env.ts`·`buildEnv.ts`·`theme.ts`·`zalkera.ts`·`src/app/api/revalidate/`·
  `src/app/media/`·`robots.ts`·`sitemap.ts` 는 능력 구성이 아니라 **플랫폼 계약**입니다(memo140 §3).
  실측: `http.ts` 의 `assertSameOrigin` 을 `return null` 스텁으로 가리면 변이 라우트 18개의 가드가 전부
  죽은 zip 이 팩·validate 를 그린으로 통과했습니다. 표현을 바꾸려면 그 파일이 아니라 화면 컴포넌트를
  가리십시오.

## 작업 순서

```bash
npm ci                                        # 팩 전 1회 — 계약·llms.txt 를 @zalkera/client 에서 읽는다
node scripts/gen-preset-assets.mjs            # 에셋·썸네일 (재)생성 — 결정론적
git commit …                                  # 미커밋 변경이 있으면 팩이 막는다(부득이하면 --allow-dirty)
node scripts/pack-preset.mjs --version 2.8.0  # 게이트 통과 시 dist-presets/*.zip + sha256 출력
```

`--version` 을 빼면 `1.0.0` 으로 찍힙니다 — **적재용으로 팩할 때는 반드시 주십시오.** 특정 테마만 팩하려면
`node scripts/pack-preset.mjs shop-goods` 처럼 code 를 붙입니다. zip 은 결정론적입니다(고정 타임스탬프·
경로 정렬) — 같은 입력이면 같은 sha 가 나옵니다.

게이트가 하나라도 걸리면 **zip 을 하나도 쓰지 않습니다**(부분 산출물 금지). 계약을 못 읽으면 건너뛰지 않고
실패합니다 — 조용히 꺼지는 게이트는 게이트가 아닙니다.

에셋을 바꿨으면 `ASSETS-LICENSE.md` 도 함께 고칩니다 — 매니페스트에 없는 이미지가 있으면 팩이 실패합니다.
오버레이에 둔 이미지도 셉니다.

### 납품물 검수

팩한 zip 이 **받아도 되는 물건인지**는 별도 러너가 봅니다(외주 zip 에도 같은 것을 씁니다):

```bash
node scripts/verify-zip.mjs dist-presets/shop-goods-2.8.0.zip
```

시크릿 스캔 · 소스 규약 검사(`zalkera-validate`) · `npm ci` · `npm run build` 까지 돌립니다. 기계 검사가
통과해도 **인수 확정은 아닙니다** — 라이선스 대조·오픈 리다이렉트·개시 후 화면 확인은 사람 몫이라고
러너가 끝에 다시 적어 줍니다.

### 팩 게이트

캡 초과·계약 위반은 **팩에서 먼저 실패합니다**. 백엔드 개시 경로가 같은 규칙으로 fail-closed 라서
(memo102 §3.2-a), 상한을 넘긴 프리셋은 어차피 개시가 안 됩니다 — 그걸 고객 개시 순간이 아니라 여기서 봅니다.

| 게이트 | 내용 |
|---|---|
| 캡 | 에셋 24개·개별 20MB·총 20MB · seed.json 256KB · **상품 20** · **갈래 10**(상품당 3) · 페이지 10 · 내비 링크 30 · 페이지당 섹션 50 · config 64KB · 텍스트 컬럼 255자 |
| 형식 | 래스터만(png·jpg·webp) + **매직 바이트** 대조. svg·영상 불가 |
| 시드 v1 잔재 | `seed.json` 에 `pages`·`menus` 가 있으면 **실패**. 조용히 무시하면 "페이지를 넣었는데 사이트에 안 나오는" 상태로 나가고, 원인이 파일 어디에도 안 적힙니다 |
| 콘텐츠 형상 | `content/pages/` 부재·`title` 없음·`sections` 가 배열 아님·`config` 가 객체 아님 — 전부 실패 |
| 상품 | handle 형식(`^[a-z0-9-]+$`)·중복 · `SERVICE`·`PHYSICAL` 외 타입 · price 는 문자열(정수 10·소수 2 이하) · `PHYSICAL` 은 `stock` 정수 1~999 필수, `SERVICE` 는 `stock` 금지 — 백엔드 개시 규칙과 같은 값 |
| 갈래 | slug·name 필수·slug 형식·중복 · 상품이 미정의 갈래를 가리키면 실패 · **아무 상품도 안 드는 갈래도 실패**(데모의 빈 진열대는 거짓입니다) |
| 상품 참조 | 섹션이 가리킨 handle 이 `products[]` 에 있어야 함(**실패**). 섹션의 `categorySlug` 가 시드에 없는 갈래면 **실패** — 페이지가 시드 밖이라 백엔드 Planner 가 구조적으로 못 보는, 유일한 검출 지점입니다 |
| 필수 참조 | 계약이 필수로 선언한 참조(`requiredRefs`)를 안 가리키면 **실패**. 그룹 축(`requiredRefsAnyOf`)은 그룹마다 **하나 이상**이 채워져야 합니다. 렌더러가 그 섹션을 통째로 건너뛰므로 개시 직후 조용히 사라집니다 |
| 이미지 참조 | 콘텐츠의 `asset`/`*Asset` 은 **public 루트 절대 경로**(`/images/hero.png`)이고 `presets/<code>/public` 에 실재해야 함. 시드 상품의 `imageAsset` 은 `assets/` 안의 **파일명**. 양쪽 다 **안 쓰는 이미지가 있어도 실패** |
| 숫자 id | `assetId`·`productId(s)` 같은 **id 형 키가 있으면 실패**(시드·콘텐츠 양쪽). 숫자 id 는 테넌트 스코프라 이 소스가 다른 테넌트에서 의미를 잃습니다 — 참조형(파일명·경로·handle)이 정규형입니다 |
| 계약 | 섹션 타입이 `SECTION_CONTRACT` 에 있어야 함(client 를 못 읽으면 **팩 실패** — `npm ci` 선행). `requiredRefs`·`requiredRefsAnyOf` 가 없는 **구버전 client(contractRev 5 미만)로도 팩하지 않습니다** — 있는 줄 알았던 게이트가 꺼져 있는 것이 가장 나쁜 상태입니다 |
| 아이콘 | `icon` 값이 큐레이션 맵(`src/components/ui/Icon.tsx`)의 키여야 함 |
| 내비 | `nav.json` 은 없어도 정상(내비가 빕니다). 있으면 `header`·`footer` 가 배열이고 항목이 `{label, href}` 문자열이어야 함 |
| 라이선스 | `assets/`·`public/`·**오버레이**의 모든 이미지가 `ASSETS-LICENSE.md` 에 있어야 함 |
| slug 그림자 | `content/pages/<slug>.json` 의 slug 가 정적 라우트(`src/app/<seg>/`)와 겹치면 실패 — Next 는 정적 세그먼트를 먼저 잡아 **그 페이지가 조용히 안 그려진다**(`home` 만 예외: 루트가 명시적으로 집어 온다) |
| 오버레이 | git 미추적(**실패**) · 심링크(**실패**) · 중립 배선 가림(**실패**) — 위 "소스 오버레이" |
| 커밋 | 워킹 트리에 미커밋 변경이 있으면 **실패**(`--allow-dirty` 로만 우회). zip 이 어느 커밋의 산출물인지 말할 수 없게 되기 때문입니다 |
| OAuth | 소셜 콜백의 state 대조가 fail-open(`if (saved && …)`)이면 **실패**. 검사가 있는 것처럼 보이지만 사실상 없는 형태입니다 |
| llms.txt | 설치된 `@zalkera/client` 가 `llms.txt` 를 안 나르면 **팩 실패** — 그 버전으로는 명세 없는 zip 이 나갑니다 |

캡 숫자 중 `seedJsonBytes`·`assets`·`assetTotalBytes`·`assetFileBytes`·`products`·`categories` 는 백엔드
`SiteSeedCaps` 와 **같은 값**이어야 합니다. 갈라지면 팩은 통과하는데 개시가 중단되는, 가장 늦게 발견되는
종류의 결함이 됩니다. 나머지(`pages`·`navLinks`·`sectionsPerPage`·`configBytes`)는 콘텐츠가 레포 파일로
가면서 백엔드를 안 타므로 **우리만의 위생**입니다 — 상한이 아니라 정의입니다(섹션 50개짜리 "템플릿"은
템플릿이 아니라 데이터 이관입니다).

## 적재·등록 (운영)

zip 은 커밋하지 않습니다(`dist-presets/` 는 gitignore). 정본 기록은 **DB 레지스트리**(`theme` +
`theme_artifact`)이고, 본사 콘솔·API 로 올립니다.

> **이전 절차는 은퇴했습니다.** `aws s3 cp` 로 `platform/site-presets/` 에 직접 넣고 백엔드 `site.presets`
> yaml 에 sha256 을 박던 방식은 memo105 T3 에서 걷혔습니다(`SitePresetProperties`·`site.presets` 는 코드·yml
> 에 더 이상 없습니다). 그 절차를 따르면 등록이 되지 않습니다.

적재(업로드)와 공개(노출 전환)는 **분리돼 있습니다** — 잘못 올린 팩이 즉시 개시 대상이 되지 않게 하려는
것입니다. 업로드만으로는 아무도 그 버전으로 시작하지 않습니다.

팩이 끝나면 **이 두 명령을 테마별로 그대로 출력해 줍니다**(sha256 이 채워진 채로). 아래는 그 형태입니다:

```bash
# ① 업로드 — 본사(SUPER_ADMIN) 권한. zip·썸네일·기대 sha256 을 한 번에 보낸다.
curl -X POST "$API/api/system/themes/beauty-nail/artifacts" \
  -H "Authorization: Bearer $TOKEN" \
  -F "version=2.8.0" \
  -F "file=@dist-presets/beauty-nail-2.8.0.zip" \
  -F "thumbnail=@presets/beauty-nail/thumbnail.png" \
  -F "expectedSha256=<팩 출력값>"

# ② 공개 — 이 버전을 카드가 가리키게 한다.
curl -X POST "$API/api/system/themes/beauty-nail/artifacts/2.8.0/promote" \
  -H "Authorization: Bearer $TOKEN"
```

`thumbnail` 은 그 테마에 `thumbnail.png` 가 있을 때만 붙습니다(`skeleton` 은 없어서 팩이 그 줄을 빼고
찍습니다).

`expectedSha256` 은 백엔드가 받은 바이트로 다시 계산해 대조합니다 — 안 맞으면 적재가 거부됩니다
(오적재·전송 손상 fail-closed). 넣지 않아도 적재는 되지만, **넣으십시오**: 팩이 출력한 값과 서버가 저장한
값이 같다는 것을 그 자리에서 확인하는 유일한 지점입니다.

`theme` 행(코드·노출명·설명·카테고리·가격) 자체는 본사 콘솔의 테마 관리에서 만듭니다. 아티팩트는 그
행에 딸린 버전입니다.

**문서도 소스입니다** — `AGENTS.md`·루트 `README.md` 한 줄만 고쳐도 zip sha256 이 바뀝니다(이 `presets/`
디렉터리는 zip 밖이라 무관합니다). 적재 직전에 팩을 다시 돌리십시오.

**버전은 시드나 소스가 바뀌면 올립니다.** 이미 개시한 사이트의 소스는 고객 것이라 소급 갱신이 없습니다.

## 고칠 때 — 어디를 여는가

**고칠 곳이 파일로 갈립니다.** 팩 v2 이후 "시드 고치기"라는 하나의 작업은 없습니다.

### 얼굴 (`presets/<code>/content/`)

- **카피는 `content/pages/<slug>.json` 의 문자열입니다.** 어조를 바꾸려면 여기만 고칩니다
  (`seed.json` 에는 문구가 없습니다).
- 페이지를 늘리려면 `content/pages/<slug>.json` 을 하나 더 두면 됩니다 — 매니페스트(`content/index.ts`)는
  팩이 생성하고, 라우팅은 `src/app/[slug]` 가 이미 합니다.
- **`title` 은 필수**이고 `sections` 는 배열입니다. **배열 순서가 곧 화면 순서**라 `sortOrder` 같은 키는
  두지 않습니다(순서 축이 둘이 되면 "순서를 바꿔"가 고칠 자리가 둘이 됩니다).
- 섹션을 늘리려면 어휘 정본(`backend/doc/contracts/section-vocabulary.json` — 배송본은
  `@zalkera/client` 의 `SECTION_CONTRACT`)에 있는 타입만 씁니다. 콘솔 폼·백엔드·렌더러가 같은 어휘로
  주고받는 계약 데이터라, 없는 타입을 쓰면 팩이 막고 뚫려도 렌더러가 조용히 건너뜁니다.
  **이 게이트는 우리 팩 산출물에만 걸립니다** — 어휘 밖 템플릿이 이탈이라는 뜻이 아닙니다
  (위 "우리 계보 테마군" 참고).
- 계약 밖의 화면이 필요하면 섹션이 아니라 **자유 영역**(별도 라우트·컴포넌트)에 짓습니다. 그쪽은 이
  게이트를 타지 않고 수에 제한도 없습니다 — 어휘는 보장의 바닥이지 표현의 천장이 아닙니다.
- slug(= 파일명)는 `src/app/` 의 정적 라우트 이름(`contact`·`blog`·`products`·`cart` …)을 피합니다.
  겹치면 팩이 막습니다(`home` 만 예외 — 루트가 명시적으로 집어 옵니다).
- **이미지 참조는 public 루트 절대 경로**입니다: `"asset": "/images/hero.png"`. 그 파일은
  `presets/<code>/public/images/hero.png` 에 있어야 하고, 아무도 안 쓰는 이미지가 남아도 팩이 막습니다.
- 상품 진열은 **갈래**로 가리킵니다: `"categorySlug": "care"`. 특정 handle 을 박는 큐레이션은 계약에
  그대로 있지만 **배송물에서는 안 씁니다**(위 "왜 갈래로 가리키나").

### 업무 데이터 (`presets/<code>/seed.json`)

- 남은 최상위 키는 `themeColors`·`categories`·`products` 뿐입니다. `pages`·`menus` 를 넣으면 팩이 막습니다.
- 상품 이미지는 `"imageAsset": "menu-onecolor.png"` 처럼 **파일명**입니다(`assets/` 안). 개시할 때 백엔드가
  업로드하고 `"assetId": 123` 으로 바꿔 넣습니다 — 시드를 쓰는 사람은 id 를 알 필요가 없습니다.
- **id 를 직접 적으면 팩이 막습니다** — 그 숫자는 만든 사람의 테넌트에서만 뜻이 있어서, 다른 사이트에
  개시되는 순간 엉뚱한 상품을 가리키거나 아무것도 못 가리킵니다.

### 코드 (`presets/<code>/src/`)

- 정본 `src/` 로 고칠 수 있으면 **정본을 고치십시오** — 오버레이는 전 팩 공유의 이득을 그 파일에서만
  포기하는 선택입니다. 그 사이트의 **정체**가 달라서 정본이 줄 수 없는 화면일 때만 씁니다.
- 중립 배선은 못 가립니다(위 "소스 오버레이"). 표현을 바꾸려면 그 파일이 아니라 화면 컴포넌트를 가리십시오.
