# 명세 — 임플란(플란치과 서울본점) 시안 → 소스 팩

| | |
| --- | --- |
| 테넌트 | 25 · `implan` · 플란치과 (ACTIVE · 사이트 0 · 도메인 0) |
| 입력 | 시안 HTML 1장 (8,294,799자 · 작업 디렉터리 `fin-ticket-12variants/downloaded/`) |
| 참고물 | `dist-presets/skeleton-3.2.6.zip` (175파일) |
| 산출 | `pack-implan-<YYYYMMDD>.zip` (작업 디렉터리 `fin-ticket-12variants/rebuilt/`) |
| 절차 정본 | [`docs/mockup-to-pack.md`](../../docs/mockup-to-pack.md) |

## 0. 이 팩이 무엇인가

**고객 시안 그대로의 사이트**입니다. 시작 팩은 **참고물**이지 바닥이 아닙니다 — 얼굴은 전부
시안에서 오고, 시작 팩에서는 잘커라가 요구하는 **기능·배선만** 골라 옵니다.

| | 어디서 | 무엇 |
| --- | --- | --- |
| **얼굴** | **전부 시안** | `src/app/page.tsx` · `globals.css` · `layout.tsx` 의 `metadata` · `public/` 이미지·폰트 · `content/nav.json` |
| **기능** | 시작 팩 | `src/lib/**` · `scripts/**` · `middleware.ts` · `robots.ts`·`sitemap.ts` · `next.config.ts`·`package.json`·`tsconfig.json` · `llms.txt` |
| 🔴 **안 가져옴** | — | `src/components/sections/**` · `content/pages/*.json` · `public/images/**` · 프리셋 색·폰트·레이아웃 |

⚠ 셋째 줄은 **게이트가 안 잡습니다.** 섹션 컴포넌트를 가져오면 `page.tsx` 가 한 번도 안 써도
`[slug]/page.tsx` 가 `SectionRenderer` 를 불러 타입 검사가 통과합니다 — 눈으로 확인합니다.

## 1. 시안 실측

재현: `python3 tools/mockup2pack.py <시안.html> <팩>` · `grep -c 'onsubmit=' <시안.html>`

```bash
python3 tools/mockup2pack.py <시안.html> <팩 디렉터리>
#   자산 N개 · style N개(N자) · script N개(N자)
#   남은 외부 참조 N종: ...
grep -c 'onsubmit=' <시안.html>     # 인라인 제출 핸들러
grep -c 'onclick='  <시안.html>     # 인라인 클릭 핸들러
```

| 축 | 값 |
| --- | --- |
| 전체 / `<body>` | 8,294,799자 / 8,247,726자 |
| `<style>` | 1개 · 43,889자 |
| `<script>` | 1개 · 1,459자 · 전역 함수 `submitPlan` 하나 |
| 인라인 핸들러 | `onsubmit` **2개** (`onclick` 0) |
| `data:` 이미지 | **19개** — 8MB 의 대부분. `<link rel="icon">` 파비콘 포함 |
| 외부 호스트 | **1곳** — `cdn.jsdelivr.net` (Pretendard v1.3.9 가변 서브셋) |
| `<img>` / `<svg>` | 18 / 0 |
| `<form>` | 2 (본문 카드 · 하단 고정바) — 둘 다 `submitPlan` |
| 링크 | 6개 **전부 `#` 앵커** — 외부 이동 없음 |
| 섹션 | `event` · `doctors` · `principles` · `visit` |
| `@import` / 백틱 | 0 / 0 |

**없는 함정**: `@import`(§2-3 ⑴ 무관) · 백틱(§1-5 무관) · `onclick`(§2-2 위임 무관).
**있는 함정**: `onsubmit` 2개 · `data:` 19개 · 외부 폰트 1곳 · 파일명 NFD(자모 분리).

## 2. 🔴 결정이 필요한 자리 — 리드 전송

시안의 `submitPlan` 이 **전송을 안 합니다.** `console.log` 뒤에 「접수되었습니다」를 띄우고
끝납니다(`fetch` 는 TODO 주석). 그대로 옮기면 **환자가 접수됐다고 믿는데 아무 데도 안 갑니다.**

`/api/lead` 로 잇는 것이 자연스러운데 **시안 폼이 이름을 안 받습니다.**

| | 시안 폼이 받는 것 | `LeadInput` 이 요구하는 것 |
| --- | --- | --- |
| 이름 | **없음** | `name` — **필수**(`@NotBlank`) |
| 연락처 | `tel1`-`tel2`-`tel3` | `phone` — 필수 |
| 임플란트 개수 | `num`/`enum`/`snum` | `interest`(선택)로 실을 수 있음 |
| 유입 페이지 | `page: 'implant-49-event'` | `message` 또는 `tracking`(선택) |
| 동의 | `agree` 체크박스 | `consentMarketing`(선택) |

즉 **잇는 것만으로는 안 됩니다** — `name` 을 어디서 채울지 정해야 합니다.

| 안 | 무엇 | 대가 |
| --- | --- | --- |
| **A. 폼에 이름 칸을 더한다** | 시안에 없던 입력 하나 추가 | 「구조·문구 무변경」의 예외. **디자인이 바뀝니다** — 오너·고객 확인 필요 |
| **B. `name` 에 고정 문자열** (예: `"상담신청"`) | 시안 그대로 | **없는 정보를 지어냅니다.** 리드 목록이 전부 같은 이름이 되어 원장이 쓸모없어집니다 |
| **C. 폼을 막고 전화·카톡으로** | 접수 문구를 지우고 연락 수단만 | 시안의 전환 동선이 바뀝니다 |
| **D. TODO 그대로** | 시안 그대로 | **거짓 성공이 상용에 섭니다** |

**어느 것도 「시안 그대로」가 아닙니다.** 시안이 완성되지 않은 상태로 왔기 때문입니다 —
이 결정은 기술 판단이 아니라 **고객과 합의할 자리**입니다. 합의 전까지 팩은 D 상태로 두되
`NOTE.md` 에 「상담 폼이 아직 아무 데도 안 보낸다」를 **첫 줄에** 적습니다.

## 3. 무엇이 어디로

| 시안 | 팩 |
| --- | --- |
| `<body>` 마크업 | `src/app/page.tsx` — 기계 변환(`class`→`className` · void 자기닫힘 · `style` 객체화) |
| `onsubmit="return submitPlan(this)"` | `data-onsubmit` 로 남기고 `MockupBehavior` 가 위임으로 잇습니다(§2-4 의 `onclick` 처리와 같은 사상) |
| `<style>` 43,889자 | `src/app/globals.css` — 시안 CSS 그대로 + `@font-face` 를 앞에 |
| `<script>` 1,459자 | `public/mockup.js` — **바이트 그대로**(A 안이면 `fetch` 한 줄만 예외) |
| `<title>`·`<meta description>` | `src/app/layout.tsx` 의 `metadata` |
| `data:` 19개 | `public/assets/<sha10>.<ext>` — 파비콘 포함 |
| Pretendard | `public/fonts/` 자가호스팅 + `@font-face`. **외부 요청 0** |
| 시작 팩 | `src/lib/**` · `scripts/**` · `middleware.ts` · 골격 · `llms.txt` |

## 4. 라우트 표면

시안은 **랜딩 한 장**이고 링크가 전부 `#` 앵커입니다. 시작 팩의 라우트는 §1-2 규율대로
**남깁니다** — 지우려면 라우트·`RESERVED_SEGMENTS`·`robots.ts` 셋을 같이 움직여야 하고,
이 건에서 그럴 이유가 없습니다.

⚠ 다만 **`src/components/sections/**` 는 안 가져옵니다**(§0 셋째 줄). `[slug]/page.tsx` 가
`SectionRenderer` 를 부르므로 그 라우트도 같이 정리하거나, 섹션을 남기려면 그 판단과 이유를
`NOTE.md` 에 적습니다.

## 5. 검수 — 숫자로 보고한다

| 축 | 기준 |
| --- | --- |
| `npm run typecheck` · `validate --gate` · `build` | rc 0 |
| `npm run dev` → `GET /` | **200** (build rc 0 만으로는 부족 — CSS 파싱 실패를 경고로 찍습니다) |
| 브라우저 콘솔 | **주소별** `pageerror`·`console.error` **0건**. `/` · `/contact` · `/policies` 전부. **개발 모드**로(상용 빌드는 React 경고를 지웁니다) |
| 외부 호스트 요청 | **0건** — 호스트별로 셉니다 |
| 본문 글자수 | 시안 대 팩 (`document.body.innerText.length`) |
| `verify-zip` | rc 0. **`--byo` 안 붙임** |

## 6. 사람이 볼 것 (기계 통과 ≠ 인수)

- 자산 출처 실제 대조(`.zalkera/ASSETS-LICENSE.md` — Pretendard 는 SIL OFL 1.1)
- **리드 전송 결정**(§2)과 그 문구
- 개시 후 실제 화면
