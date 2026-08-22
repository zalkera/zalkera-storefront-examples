# 재납품 검토 — `fin-ticket-1.0.0.zip`

정정 사항을 받는 쪽에서 **재현해서** 확인했다. 결과부터 적는다.

## 통과한 것

| 항목                | 확인 방법                                       | 결과                                                                         |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| 규약 검사           | `npx zalkera-validate . --gate` (client 0.27.0) | **rc=0 · 오류 0 · 경고 0**                                                   |
| `[S2]` 인라인 style | 면제 마커 유무를 따로 확인                      | 마커로 우회하지 않았음. `{"--delay": v}` 변수 주입                           |
| `[N4]` FEATURE_GRID | 렌더러가 config 를 읽는지 확인                  | `readConfig`·`asObjectArray`·`asString` 으로 JSON 을 읽음. 번호는 배열 index |
| `[N5]` 이미지       | `asset` 키·`public/` 상태                       | 키째 삭제, 일관됨                                                            |
| 테마 주입           | 서명 대조                                       | `const {cssVars} = parseThemeColors(config?.themeColors)` — 정본 형태        |
| `FAQ_LIST` 보장     | `SectionRenderer` 경유 확인                     | `FaqListSection` 이 `FAQPage` JSON-LD 산출                                   |
| 매니페스트 정합     | 선언 ↔ 파일 대조                                | `about`·`consult`·`home` 정확히 일치                                         |
| 시크릿              | 이름·내용 패턴 스캔                             | 0건                                                                          |
| 방문자 IP 선언      | `inquiry`·`lead`                                | 둘 다 `visitorIp()` 로 선언(기계는 경고만 하는 축인데 지켰음)                |

디자인 동일성 주장은 우리가 판정할 자리가 아니라 그대로 받는다.

## 고칠 것 — 가드 회귀 시험

**`npx zalkera-validate --gate` 만으로는 안 보이는 축이다.** 납품 검수(`verify-zip`)가 여기서 반려한다.

```bash
node scripts/verify-zip.mjs <납품.zip>
# ❌ 가드 회귀 스위트 — 하한표를 못 읽었습니다 — scripts/lib/test-floors.json [ENOENT]
```

지금 트리에는 요구 19개 중 **8개만** 있고 하한표(`scripts/lib/test-floors.json`)도 없다.

### 왜 이게 문제인가

검사기 `X1` 은 「`assertSameOrigin` 을 **불렀는가**」만 본다. **그 가드가 옳은가**는 이 시험들만 잠근다.
지금 `safeUrl.ts`(저장형 XSS 방어)와 `previewGuard.ts`(미리보기 쓰기 차단)는 **본체가 남아 있는데
시험만 사라진** 상태다 — 회귀를 잡을 것이 없다.

### 어떻게 고치나

**시작 소스 팩(`skeleton` 3.2.1)에서 아래를 그대로 되살린다.**

```
scripts/lib/test-floors.json          ← 하한표

src/lib/safeUrl.test.ts
src/lib/reservedSegments.test.ts
src/lib/oauthState.test.ts            ← 아래 ⚠ 참고
scripts/lib/floors.test.mjs
scripts/lib/floorGate.test.mjs
scripts/lib/gateProbe.test.mjs
scripts/lib/junkEntries.test.mjs
scripts/lib/childEnv.test.mjs
scripts/lib/vendorSet.test.mjs
scripts/lib/contentRoutes.test.mjs
scripts/workflow-syntax.test.mjs
```

⚠ **`oauthState.test.ts` 는 `src/lib/oauthState.ts` 를 import 한다.** 그 본체를 지우셨다면 시험만
되살릴 수 없으므로 **본체도 같이 되살려야** 한다(로그인 화면이 없어도 그 파일 하나는 남는다).
지금 인수 게이트가 그 시험을 조건 없이 요구하기 때문이고, **이 요구가 과한지는 우리 쪽에서
검토 중**이다. 결론이 바뀌면 다시 알린다.

확인:

```bash
node scripts/lib/floor-gate.mjs; echo rc=$?     # rc=0 이어야 한다
```

## 고치지 마십시오 — `reservedSegments.ts`

검수가 이렇게 반려했다면 **그건 우리 검사기 결함이다.**

```
❌ sitemap 제외 목록 — 가려지는데 목록에 없습니다: contact policies
```

목록은 맞게 적혀 있다. 우리 파서가 **항목이 한 줄에 하나씩** 있어야 읽는 형태였고, 한 줄로 적은
`new Set(["contact", "policies"])` 를 한 개도 못 읽었다. **고쳤다** — 서식과 무관하게 읽는다.

그쪽 코드는 그대로 두면 된다. 옛 검사기로 재고 있다면 최신본으로 다시 받아 재라.

## 완료 판정

```bash
npm ci
npx tsc --noEmit
npm run build
npx --package @zalkera/client zalkera-validate . --gate   # rc=0
node scripts/verify-zip.mjs <납품.zip>                     # 반려 항목 0
```

`zalkera-validate` 만 통과한 것은 인수가 아니다 — **두 번째 명령까지** 통과해야 한다.
