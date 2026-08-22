# 핸드오프 — `fin-ticket-1.0.0.zip` 규약 위반 정정 요청

**이 문서는 기술 결함만 다룬다.** 아래 항목을 고치면 서빙 게이트를 통과한다.

## 어떻게 쟀나 (재현)

```bash
unzip -q fin-ticket-1.0.0.zip -d ft && cd ft
npx --package @zalkera/client zalkera-validate . --gate
```

결과: **rc=1 · 오류 5건 · 경고 0건.** 규범은 `spec/storefront-spec.md` 이고, 판정하는 것은 그 검사기다.

## 차단 결함 5건

### ① `[S2]` JSX 인라인 `style={{…}}` — 2곳

| 파일 | 줄 |
|---|---|
| `src/components/sections/HeroSection.tsx` | 28 · 32 · 36 · 60 |
| `src/components/sections/FaqAccordion.tsx` | 40 |

브랜드색·간격을 인라인 style 로 주면 콘솔의 "말로 색 바꾸기"가 그 자리를 못 덮는다.

**고치는 법** — Tailwind 유틸리티 클래스로 옮긴다. 애니메이션 지연처럼 런타임 계산이 정말 필요한
자리는 CSS 변수 주입 형태(`style={{"--delay": ms}}`)로 쓰면 **면제**다. 그래도 남으면 마커를 단다:

```tsx
// zalkera-allow-inline-style: 스크롤 위치로 계산해 클래스로 표현 불가
```

⚠ 마커는 **진짜 `//` 주석**이어야 하고 **사유가 같은 줄**에 있어야 한다. 문자열 안의 같은 글자나
다음 줄로 내린 사유는 면제되지 않는다.

### ② `[N4]` 계약에 없는 섹션 타입 `PROCESS_STEPS`

`content/pages/home.json` 의 `sections[1]`.

**렌더러가 조용히 건너뛴다** — 예외가 안 나므로 화면에서 그 블록만 사라지고 아무 로그도 안 남는다.

이 소스가 쓰는 7종 중 `PROCESS_STEPS` 하나만 계약 밖이다. 나머지 6종
(`HERO`·`FEATURE_GRID`·`TEXT_MEDIA`·`STATS_BAND`·`FAQ_LIST`·`LEAD_CTA`)은 정상이다.

**고치는 법 — 둘 중 하나.**

- **(권장) 자유 영역으로 옮긴다.** 섹션 어휘를 통하지 말고 컴포넌트를 페이지에서 직접 부른다.
  어휘는 보장의 바닥이지 천장이 아니라, 어휘 밖 화면은 얼마든지 만들어도 된다.
- **계약 어휘로 표현한다.** 단계 목록이면 `FEATURE_GRID` 로 대체할 수 있다.

살아 있는 어휘는 조회한다 — 목록을 문서에서 베끼지 마라:

```bash
node -p "require('@zalkera/client').SECTION_CONTRACT.map(s=>s.type).join('\n')"
```

### ③ `[N5]` 콘텐츠가 가리키는 이미지 실물 부재 — 2건

| 참조 | 적힌 곳 |
|---|---|
| `/images/hero.png` | `content/pages/home.json` `sections[0]` |
| `/images/about.png` | `content/pages/about.json` `sections[0]` |

**zip 에 `public/` 디렉터리가 아예 없다.** 이대로 개시하면 두 자리 모두 **깨진 이미지**가 나간다.

**고치는 법** — `public/images/` 에 실물을 넣어 같이 넘긴다. 경로는 레포 `public/` 루트 절대
경로여야 한다(`/images/hero.png`). 이미지를 안 쓸 거면 콘텐츠에서 `asset` 키를 지운다.

## 구조 결함 — 검사기가 안 잡지만 고쳐야 하는 것

검사기가 통과시켜도 실무에서 걸린다.

| 빠진 것 | 왜 필요한가 |
|---|---|
| **`package-lock.json`** | 없으면 `npm ci` 가 안 돈다. 빌드 재현성이 없어 우리 쪽 빌드와 그쪽 빌드가 다른 의존을 받는다. `package.json` 과 **같은 커밋**에 넣는다 |
| **`AGENTS.md`** (레포 루트) | codegen 이 가장 먼저 읽는 문서다. 없으면 이 소스를 AI 로 유지보수할 때 매번 전체 탐색을 한다 |
| **`README.md`** | 받는 사람이 무엇을 어떻게 돌리는지 알 자리 |
| **`seed.json` 이 두 곳에 있다** | 루트와 `.zalkera/` 양쪽에 있다. 정본은 `.zalkera/seed.json` 하나다 — 루트 사본을 지운다 |

## 이미 맞게 되어 있는 것 — 건드리지 마라

되돌리면 새 결함이 된다.

- `package.json` 의 `"zalkera": {"styling": "tailwind-tokens", "content": "source"}` 선언 — **있다.**
- `next.config.ts` 의 `output: "standalone"` — **있다.**
- 변이 라우트의 교차출처 가드, 그리고 `app/api/revalidate/route.ts` 의 면제 마커
  (사유: 시크릿 헤더가 없으면 401) — **형식이 맞다.**
- 콘텐츠가 `content/pages/*.json` 에 있고 매니페스트와 어긋나지 않는다.

⚠ **검사를 통과시키려고 `package.json` 의 `zalkera` 선언을 지우지 마라.** 지우면 위 `[S2]`·`[N4]`·`[N5]`
다섯 건이 **경고로 바뀌어 rc 가 0** 이 되지만 고쳐진 것은 아무것도 없다. 개시하면 이미지는 그대로
깨지고 섹션은 그대로 사라진다.

## 완료 판정

```bash
npm ci && npm run build
npx --package @zalkera/client zalkera-validate . --gate    # rc=0 이어야 한다
```

rc 가 **7** 이면 통과가 아니라 **"검사가 안 돌았다"**는 뜻이다 — 읽지 못한 파일이나 모르는 선언값을
고쳐 다시 재게 만들어야 한다.
