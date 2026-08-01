# 검수 적재 키트 (memo142 §4 T3-⑵)

**배송물이 아닙니다.** 이 디렉터리는 zip 에 안 실리고 고객에게 가지 않습니다 — 팩을 **측정**할 때
시험 테넌트에 넣는 견본 카탈로그입니다.

## 왜 있나

팩 시드는 고객 DB 에 상품·갈래를 만들지 않습니다(memo142 §1 경계 규칙). 그런데 AEO 보장 중
**목록형 표면**(`ItemList`·`CollectionPage`)은 원소가 있어야 잴 수 있습니다 — 빈 테넌트에서 나온
"통과"는 형상만 본 가짜입니다(실제로 원소 0개짜리 `CollectionPage` 가 통과한 적이 있습니다).

그래서 측정 재료를 **배송물이 아니라 여기**에 둡니다. 이름(`리빙`·`시술`)은 자리표시자이고, 고객
사이트의 갈래 이름은 사장이 정합니다 — 그것이 이 파일들이 zip 에서 빠진 이유입니다.

## 무엇이 있나

```
qa/fixtures/<pack>/
  catalog.json     # { categories: [{slug, name}], products: [{handle, type, name, price, stock?, categories, description, imageAsset}] }
  assets/*.png     # 상품 커버. `catalog.json` 의 imageAsset 이 가리키는 파일명이다.
```

`scripts/gen-preset-assets.mjs` 가 커버 이미지를 여기로 씁니다 — 정본은 `catalog.json` 의
`imageAsset` 값이고, 거기 없는 이름은 섹션 이미지로 보고 `presets/<code>/public/images/` 로 갑니다.

## 어떻게 쓰나

**콘솔과 같은 파트너 API 로 적재합니다.** 새 콘솔 UI 도 새 백엔드 API 도 만들지 않습니다 —
그것이 "업무 데이터의 입구는 콘솔·MCP 하나"라는 판정의 집행입니다.

promote 전 절차는 이 순서입니다:

```
① 시험 테넌트에 그 팩으로 개시
② 이 키트를 파트너 API 로 적재 (갈래 → 상품 → 커버 이미지)
③ 사이트를 크롤 (npm run check:aeo)
④ 통과 스냅샷을 근거로 promote
```

②를 건너뛰면 목록형 표면의 원소가 0이라 **측정 재료가 없는 것**이지 통과가 아닙니다. 검사기가
그것을 스스로 잡는 축(`EMPTY_SURFACE` FAIL)은 memo142 T3 의 잔여 작업이라, 그때까지는 스냅샷의
원소 유무를 **사람 눈으로 재확인**하십시오.

## 고칠 때

- 상품을 늘리고 줄이는 것은 자유입니다 — 이 파일은 계약이 아니라 측정 재료입니다.
- 다만 **팩에 되돌려 넣지 마십시오.** `presets/<code>/seed.json` 에 `products`·`categories` 를 적으면
  팩 게이트(`SEED_BUSINESS_DATA`)가 막고, 뚫려도 백엔드 개시가 strict 파싱에서 중단됩니다.
- 커버 이미지를 늘렸다면 `catalog.json` 의 `imageAsset` 을 함께 고치십시오 — 그 값이 생성기의 배치
  정본입니다(안 맞으면 새 이미지가 `presets/<code>/public/` 으로 새어 나가 팩이 "아무도 안 쓰는
  이미지"로 죽습니다).
