# BYO(Bring Your Own) 헤드리스 가이드 — 개발자용

당신이 **개발자(또는 개발팀 보유)**라면, 잘커라가 주는 템플릿을 쓰지 않고 **당신의 프론트엔드를
처음부터 직접** 만들 수 있습니다. 잘커라 백엔드는 헤드리스 API이고, 프론트는 전적으로 당신 것입니다.

> 이 문서는 **자기 레포·자기 호스팅**(C-1) 경로입니다. "말로 만들고 AI가 키우는" 무개발 경로가
> 필요하면 이 문서 말고 잘커라 **스택 플랜**(콘솔·이 템플릿)을 쓰세요.
>
> **빌드·서빙을 잘커라에 넘기는** 것이라면(기존 앱을 소스 zip 으로 올려 우리가 돌린다) 이 문서가
> 아니라 → [`existing-app-to-pack.md`](existing-app-to-pack.md). 두 경로를 가르는 질문은 하나입니다 —
> **빌드와 서빙을 누가 하는가.**

---

## 1. 무엇을 당신이, 무엇을 잘커라가

- **잘커라**: 상품·주문·결제·배송·회원·CMS·재고 — 전부 헤드리스 API. 관리자 콘솔도 잘커라가 제공.
- **당신**: 공개 사이트(프론트엔드)의 화면·디자인·배포. 원하는 프레임워크로, 원하는 곳에 호스팅.

잘커라 서버에서 **당신 코드가 도는 게 아닙니다** — 당신은 API 소비자일 뿐입니다. 그래서 이 경로는
격리 인프라를 기다릴 필요 없이 **오늘 바로** 됩니다.

## 2. 클라이언트 — `@zalkera/client`

공개 npm 패키지입니다(MIT).

```bash
npm i @zalkera/client
```

```ts
// lib/zalkera.ts — 서버 전용 싱글턴
import { createZalkeraClient } from "@zalkera/client";

export const zalkera = createZalkeraClient({
  baseUrl: process.env.ZALKERA_API_BASE!,  // 잘커라 백엔드 URL (뒤에 /api 붙이지 않음)
  tenant:  process.env.ZALKERA_TENANT!,     // 콘솔에서 발급받은 당신의 테넌트 코드
  secretKey: process.env.ZALKERA_STOREFRONT_KEY, // (선택) 콘솔에서 발급 — 서버 전용
});
```

- **서버 사이드에서만 호출하세요**(RSC·route handler·server action). 브라우저에서 직접 부르면
  `baseUrl`이 노출됩니다. 장바구니·결제처럼 사용자별 상태는 BFF(route handler) 뒤에 두고 토큰은
  httpOnly 쿠키로 관리하세요.
- **전체 API 계약·레시피는 `llms.txt`에 있습니다**: `node_modules/@zalkera/client/llms.txt`.
  AI로 화면을 만들 때 이 파일을 컨텍스트로 주세요.

## 3. 최소 규약 (지키면 사이트가 안 깨집니다)

`llms.txt`에 전부 있지만 핵심만:

- **variant가 판매 단위** — 담기·주문은 항상 `variant.id`.
- **결제 확정은 백엔드 웹훅** — returnUrl의 "성공"을 믿지 말고 `getOrder`로 확인.
- **읽기 페이지는 ISR/정적** — SEO 페이지(홈·목록·상세)를 요청마다 SSR하지 마세요(런타임 원가).
- **발견되는 사이트** — SEO 페이지에 JSON-LD(schema.org)·`sitemap`·`robots` 필수. AI 크롤러를
  막지 마세요. 상세는 `@zalkera/client`가 주는 실데이터로(하드코딩 금지).

## 4. 인증·회원

고객 인증은 **소셜 로그인 전용 + JIT 가입**입니다(카카오·네이버·구글). 최초 소셜 로그인 시 약관
동의와 함께 계정이 생깁니다. 별도 이메일/비번 가입은 없습니다. 소셜 앱(client_id)은 잘커라 콘솔에서
당신 테넌트에 등록하고, 프론트엔드 env(`NEXT_PUBLIC_*_CLIENT_ID`)에 public client_id를 넣습니다.

## 5. 도메인 — 자기 호스팅이면 잘커라 서빙을 안 탑니다

**중요(오해 방지)**: 당신이 자기 인프라(Vercel·자기 서버 등)에 배포하면, 트래픽은 당신 호스팅으로
직접 갑니다. 잘커라 콘솔의 **도메인 등록은 콘솔 표시·SEO 링크(sitemap·JSON-LD 절대 URL) 용도일
뿐, 서빙 라우팅과 무관**합니다. DNS·TLS·CDN은 당신 호스팅 쪽에서 설정하세요.

## 6. 훗날 "잘커라가 호스팅"으로 가고 싶다면 (C-1h 대비)

지금은 자기 호스팅이지만, 나중에 잘커라가 당신 코드를 대신 호스팅하는 옵션(C-1h)이 열립니다.
그때 매끄럽게 넘어가려면 지금부터:

- **빌드가 `.next/standalone` 자기완결 산출물을 내게** 하세요 — 실무적으로는 `next.config` 에
  `output: 'standalone'` 한 줄입니다. 잘커라 호스팅은 `next start` 가 아니라 그 산출물을
  `node server.js` 로 띄우므로, 없으면 빌드가 성공해도 서빙 게이트가 반려합니다.
  **자기 호스팅을 계속한다면 이 요건은 해당 없습니다** — 이 요건은 우리가 서빙 책임을 질 때만 붙습니다
  (Vercel·자기 컨테이너·정적 export 무엇이든 당신 자유입니다).
- 서버가 필요로 하는 시크릿을 코드/빌드에 박지 마세요 — 런타임은 당신 테넌트의 공개 API 접근만
  있으면 되게 설계하세요.

## 7. "말로 색 바꾸기"는 우리 템플릿에서만 삽니다 (정직 고지)

잘커라 콘솔의 테마 설정("버튼색 바꿔줘", "폰트 바꿔줘")은 잘커라 **디자인 시스템 계약**(테마 토큰
배선·`theme.ts`)을 유지한 스토어프론트에서만 반영됩니다. 당신이 그 배선 없이 프론트를 직접
만들면, **콘솔의 테마/폰트 설정은 당신 사이트에 반영되지 않습니다**(L1 미보장). 이건 숨기지 않고
분명히 말합니다 — 당신 코드는 당신 것이고, 대신 그 편의 하나를 포기하는 것뿐입니다. 계약을
유지하고 싶으면 이 예제(`zalkera-storefront-examples`)를 받아서 시작하세요.

---

## 셋업 요약

```bash
npm i @zalkera/client
# lib/zalkera.ts 에 서버 전용 싱글턴 (2절)
# ZALKERA_API_BASE, ZALKERA_TENANT, ZALKERA_SITE_URL 을 env 에
#   ⚠ ZALKERA_SITE_URL 은 이 사이트의 **공개 절대 주소**다(예: https://shop.example.com).
#     sitemap·robots·JSON-LD 가 절대 URL 을 요구하는데(아래 절), 안 주면 http://localhost:3000 이
#     박힌 채로 배포된다. robots.txt 는 revalidate 가 없어 그대로 굳는다.
#   (선택) ZALKERA_STOREFRONT_KEY — 서버 전용 시크릿. 브라우저에 노출 금지.
# llms.txt 를 읽고(또는 AI 에게 주고) 화면을 만든다
```

막히면 계약에 없는 걸 하드코딩으로 때우지 말고 **그 사실을 보고**하세요 — 하드코딩한 데이터는
미리보기·실사이트에서 실데이터와 갈라져 첫인상을 죽입니다.
