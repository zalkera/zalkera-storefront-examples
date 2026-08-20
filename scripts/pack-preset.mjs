#!/usr/bin/env node
/**
 * 프리셋 zip 팩 (memo102 §3.1 "1계보 N팩" · §3.2 시드 매니페스트 · §7 라이선스 게이트).
 *
 * **정본 template 체크아웃 1개 + 테마별 프리셋 디렉터리 → N개의 zip.** 테마마다 소스를 포크하지 않는
 * 것이 이 설계의 요점이라(§3.1), 코드 패치가 나가면 이 스크립트를 다시 돌려 전 테마를 재팩한다.
 * 유지보수는 여전히 1계보다.
 *
 * ── 팩 v2 (memo129 §3) ──────────────────────────────────────────────────────
 * **사이트의 얼굴은 소스가 정본이다**(memo128 §3). 그래서 프리셋이 무엇을 어디로 싣는지가 갈렸다:
 *
 *   presets/<code>/content/       → zip 의 `content/` (레포 상주 · 페이지·섹션·문구·내비)
 *   presets/<code>/public/        → zip 의 `public/`  (섹션 이미지 · 레포 상주)
 *   presets/<code>/src/           → zip 의 `src/`     (**이 팩의 소스 전량** — 팩 v4)
 *   presets/<code>/seed.json      → zip 의 `.zalkera/seed.json` (**테마색만**)
 *   presets/<code>/assets/        → zip 의 `.zalkera/assets/`   (섹션 config 가 참조하는 전송 이미지)
 *
 * ── 팩 v3 (memo142) — **배송물은 업무 데이터를 만들지 않는다** ────────────────
 * 시드가 고객 DB 에 상품·갈래를 만들던 경로가 닫혔다. `seed.json` 에 남는 최상위 키는 `themeColors`
 * 하나이고, 콘텐츠 섹션은 업무 축(상품·갈래)을 **가리키지 않는다**.
 *
 * 경계는 **정본 값의 거처**로 긋는다(memo142 §1): 값이 콘텐츠 파일에 사는 저작물은 **선언 섹션**의
 * 소관이고, 값이 업무 DB 에 살고 화면이 비추기만 하는 조회는 **소스가 `@zalkera/client` 를 직접 호출**해
 * 그린다. 따름정리 — 배송물은 handle 이든 갈래 slug 든 **업무 축의 고유명사를 어디에도 박지 않는다**
 * (`리빙`·`시술`은 사장이 정할 이름이다). 직접 호출이 배송 가능한 이유가 정확히 이것이다:
 * `listProducts()` 는 이름을 하나도 안 박고 그 사장의 카탈로그가 있는 대로 내놓는다.
 *
 * 그래서 아래 게이트가 **타입 이름이 아니라 키 형상**으로 건다(BUSINESS_REF) — 어휘에서 조회형 타입
 * 둘이 삭제됐지만, 같은 형태의 타입이 미래에 다시 생겨도 같은 자리에서 잡힌다.
 *
 * **변환기가 없다.** 프리셋 디렉터리가 처음부터 최종 형상을 갖고 있고 팩은 그것을 소스 트리에
 * 병합하기만 한다 — seed→content 변환 코드를 두면 그 변환기가 계약의 숨은 두 번째 정본이 된다.
 * seed v2 는 **빼기만** 했다(pages·menus 탈락): 백엔드 매퍼가 strict 라 키 추가는 개시를 중단시키지만
 * 빼기는 기본값으로 통과하므로 **백엔드 개시 코드는 한 줄도 안 바뀐다.**
 *
 * 그래서 프리셋 개시가 자기 정의 그대로가 된다 — *"플랫폼이 대신 올려주는 업로드"*(memo97 §3).
 * 소스가 얼굴의 정본이고, `.zalkera/` 는 업무 데이터의 전송 포맷이다.
 *
 * 게이트는 **팩 시점에 미리 실패한다** — 백엔드 개시 경로(memo102 §3.2-a)가 같은 캡·같은 규칙으로
 * fail-closed 라서, 상한을 넘긴 프리셋은 애초에 적재조차 안 되는 게 맞다. 여기서 막으면 팩 결함이
 * 고객 개시 순간이 아니라 우리 터미널에서 드러난다.
 *
 * ── 팩 v4 (오너 확정 2026-08-01) — **팩마다 자기 소스** ──────────────────────
 * **오버레이가 없어졌다.** 종전에는 정본 `src/` 한 벌을 전 팩이 공유하고 `presets/<code>/src/**` 가
 * 파일 단위로 그것을 가렸는데, 그 기계가 개념째 걷혔다 — 실측하면 팩 둘의 오버레이 55줄 중 실차이가
 * **카피 한 줄**이었고(제목·더보기 문구), 그런 것은 애초에 `content/` 의 몫이다. 더 근본적으로는
 * 수많은 개발자·사용자가 LLM 으로 **자기 얼굴 프론트엔드**를 갖게 되므로, 우리 소스는 최초 기준일 뿐
 * "정본 한 벌 + 가림"이라는 구성 자체가 거추장스럽다.
 *
 * 그래서 `presets/<code>/src/**` 가 **그 팩의 소스 전부**다(zip 의 `src/` 는 여기서만 온다 — 병합이
 * 없으므로 어느 줄이 어디서 왔는지 묻는 일도 없다). 레포 루트의 `src/` 는 **새 팩이 복사해 가는 원본**
 * 이자 CI(`validate`·`typecheck`·`test`·`build`)가 무는 대상이고, **zip 에는 안 실린다.**
 *
 * 정본이 넷이 되는 비용은 오너가 받아들였다(파괴적 변경은 오픈 전에 몰아 끝낸다). 대신 **틀리면 사고가
 * 나는 배선**만 바이트로 잠근다 — `scripts/lib/wiring-parity.mjs`. 얼굴(홈·헤더·섹션 렌더·카피)이
 * 갈리는 것은 **의도**라 방어 대상이 아니다.
 *
 * ── 산출물 검수 (memo145 · 오너 확정 2026-08-01) ─────────────────────────────
 * 팩은 **자기 zip 을 재고 끝낸다**: 산출 직후 `verify-zip.mjs` 가 각 zip 을 풀어 실제로 빌드하고
 * `.next/standalone/server.js` 가 나오는지 본다(기본 on · `--no-verify` 로만 끈다). 이 배선이 없던
 * 동안 소스 게이트를 전부 통과한 zip 이 서빙 박스에서 반려됐다 — 이 파일의 게이트는 전부 **소스**를
 * 재고, 서빙 요건은 **산출물**에만 나타나기 때문이다.
 *
 * 사용:
 *   node scripts/pack-preset.mjs --version <x.y.z>  # 전체 테마 (--version 은 필수다)
 *   node scripts/pack-preset.mjs --version <x.y.z> shop-goods    # 특정 테마만
 *   node scripts/pack-preset.mjs --version <x.y.z> --no-verify   # 산출물 검수 생략(권장하지 않음)
 *
 * `--version` 은 **모든 호출에 필요하다.** 없으면 rc=1 로 멈춘다 — 위 예시에서 그것을 빼면 죽는다.
 *
 * ── 팩 신원 (memo150 §8.1) — **버전은 파일이 말한다** ──────────────────────────
 * zip 마다 `.zalkera/pack.json`(`{rev, code, version}`)을 싣는다. 종전에는 팩 버전이 사는 곳이
 * **파일명뿐**이라, 적재 폼에 사람이 버전을 쳤고 그 거짓이 INSERT 전용 원장과 S3 키에 영구히 박혔다.
 * 이제 신원이 바이트 안에 있으므로 서버가 스스로 읽고(백엔드 `PackManifestReader`), 폼 입력이 사라져
 * **틀릴 자리가 없다.** 덤으로 **다른 버전 = 반드시 다른 바이트**가 구조적 참이 된다 — 종전에는 같은
 * 소스를 3.0.4·3.0.5 로 팩하면 바이트가 동일했다(원장의 1:1 이 반쪽이었다는 뜻이다).
 *
 * 매니페스트에 **sha·타임스탬프·git head 는 넣지 않는다**(memo150 §3.1): 자기 해시는 순환이고, 시각·head 는
 * 결정론을 깨서 *"내용이 같은데 바이트가 달라 같은 버전이 거부되는"* 반대편 결함을 만든다.
 *
 * 출력: dist-presets/{code}-{version}.zip + sha256(적재 API 의 `expectedSha256` 로 그대로 보낸다).
 * zip 은 결정론적이다(고정 타임스탬프·경로 정렬) — 같은 입력이면 같은 sha 가 나온다.
 */
import {execFileSync, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {deflateRawSync} from "node:zlib";
import {crc32} from "./preset-canvas.mjs";
import {checkWiringParity} from "./lib/wiring-parity.mjs";
import {readThemeEnums as readThemeEnumsFrom} from "./lib/themeEnums.mjs";
import {checkVisitorIp} from "./lib/visitor-ip-parity.mjs";
import {contentManifest} from "./lib/contentManifest.mjs";
import {clientMismatch, cmpVersion, ledgerShapeError, mergeCodes, packGateDecision} from "./lib/pack-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRESETS_DIR = join(ROOT, "presets");
const OUT_DIR = join(ROOT, "dist-presets");

/**
 * 캡. **두 종류가 섞여 있다** — 갈라지면 안 되는 쪽과 우리만의 위생인 쪽.
 *
 *  - `seedJsonBytes`·`assets`·`assetTotalBytes`·`assetFileBytes`·`products` : 백엔드 `SiteSeedCaps`
 *    (memo102 §3.2-a-5)와 **같은 수여야 한다.** 갈라지면 팩은 통과하는데 개시가 중단되는, 가장 늦게
 *    발견되는 종류의 결함이 된다.
 *  - `pages`·`navLinks`·`sectionsPerPage`·`configBytes` : **팩 v2 부터 우리만의 위생이다.** 콘텐츠가
 *    레포 파일로 가면서 백엔드를 안 타므로 대응하는 백엔드 캡이 없다. 그래도 남기는 이유는 상한이
 *    아니라 **정의**다 — 섹션 50개짜리 "템플릿"은 템플릿이 아니라 데이터 이관이다.
 */
const CAPS = {
    seedJsonBytes: 256 * 1024,
    assets: 24,
    assetTotalBytes: 20 * 1024 * 1024,
    // 백엔드는 이 값을 `storage.max-file-size` 설정에서 읽는다(기본 20MB). 운영이 그걸 낮추면 이 상수와
    // 조용히 갈라지므로, 설정을 바꿀 때 여기도 같이 본다.
    assetFileBytes: 20 * 1024 * 1024,
    pages: 10,
    navLinks: 30,
    sectionsPerPage: 50,
    configBytes: 64 * 1024,
    // ⚠ 상품·갈래 캡(products·categories·categoriesPerProduct·재고·텍스트 길이)은 memo142 에서
    //    **축 자체가 사라져** 백엔드 `SiteSeedCaps` 와 함께 은퇴했다. 시드는 업무 데이터를 만들지 않는다.
};

/** 백엔드 `StorageFileService.putMediaObject` 의 화이트리스트와 같다 — 래스터만, svg·영상 없음. */
const RASTER = {
    png: {type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]},
    jpg: {type: "image/jpeg", magic: [0xff, 0xd8, 0xff]},
    jpeg: {type: "image/jpeg", magic: [0xff, 0xd8, 0xff]},
    webp: {type: "image/webp", magic: [0x52, 0x49, 0x46, 0x46], tag: {offset: 8, bytes: [0x57, 0x45, 0x42, 0x50]}},
};

/** zip 에 넣지 않는 것 — 팩 도구·시드 원본·산출물은 고객 소스가 아니다(시드는 `.zalkera/` 로 따로 들어간다). */
const SOURCE_EXCLUDES = [
    "presets/",
    // 템플릿 기본 콘텐츠(빈 매니페스트)는 빼고 **프리셋 것을 싣는다** — 아니면 두 벌이 겹친다.
    "content/",
    // 팩 v4: zip 의 `src/` 는 **그 팩 것만** 온다. 루트 `src/` 는 새 팩이 복사해 가는 원본이자
    // CI 대상이지 배송물이 아니다 — 실으면 두 벌이 겹쳐 어느 쪽이 그 사이트인지 말할 수 없게 된다.
    "src/",
    "dist-presets/",
    "scripts/pack-preset.mjs",
    // 그 도구의 버전 관문 시험 — 도구가 없는 트리에서 돌면 「모듈 없음」으로 죽는다.
    // 고객 트리의 가드 회귀 스위트가 그 실패를 자기 결함으로 읽는다.
    "scripts/pack-version.test.mjs",
    // 그 도구의 **판정부와 그 시험**도 같은 이유로 뺀다 — 고객이 부를 표면이 아니고,
    // 부르는 쪽(`pack-preset.mjs`)이 배송본에 없어서 트리에 있어도 아무것도 안 한다.
    "scripts/lib/pack-gate.mjs",
    "scripts/lib/packGate.test.mjs",
    "scripts/gen-preset-assets.mjs",
    "scripts/preset-canvas.mjs",
    // ⚠ **카탈로그 미리보기를 굽는 사내 도구다**(promote 절차·스모크 테넌트·`dist-preview` S3 프리픽스).
    // 고객이 부를 표면이 아니고 어떤 배송 문서도 안내하지 않는데 38KB 가 전 테넌트에 복제되고 있었다
    // (심의 보안축 실측). 형제들(`pack-preset`·`gen-preset-assets`·`preset-canvas`)은 이미 빠져 있었고
    // 이것만 빠뜨렸다. 대조군 `verify-zip.mjs` 는 CUSTOMIZE.md 가 고객에게 직접 시키는 명령이라 남긴다.
    "scripts/snapshot-preview.mjs",
    // 그 도구를 뺐으므로 **이 재수출 shim 도 배송할 이유가 없다.** shim 머리말이 스스로
    // "`snapshot-preview.mjs` 가 이 경로를 물고 있어서 남긴다"고 적는데, 배송본에는 그 파일이 없다 —
    // 존재 이유가 거짓인 채로 배송되면 유지보수 에이전트가 죽은 장치를 살아 있는 것으로 읽는다.
    // 배송물에서 이것을 import 하는 코드는 0건이고(실측), 크롤러 정본은 `@zalkera/client` 에 있다.
    "scripts/lib/site-crawl.mjs",
    "scripts/lib/wiring-parity.mjs",
    // ⚠ **그 픽스처도 함께 뺀다.** 본체만 빼고 시험을 실으면 고객 트리에서 단독 실행 시
    // `ERR_MODULE_NOT_FOUND` 로 죽는다 — 형제 `visitor-ip-parity` 가 그렇게 한 번 나갔다.
    "scripts/lib/wiringParity.test.mjs",
    // 시험용 zip 작성기와 그 시험 — 검사기가 아니라 도구다. 고객이 부를 표면이 없다.
    "scripts/lib/miniZip.mjs",
    "scripts/lib/verifyZipJudgments.test.mjs",
    // 신호 정리 시험은 이 레포의 `dist-presets` 에 든 zip 을 대상으로 삼는다 — 고객 트리엔 없다.
    "scripts/lib/verifyZipSignal.test.mjs",
    // 배송 문서(`docs/byo-headless-guide.md`)와 소스의 env 이름 대조 — 우리 문서에 대한 규율이다.
    "scripts/lib/docEnvNames.test.mjs",
    // 팩 도구(`pack-preset.mjs`)가 시드값을 테마 계약과 대조할 때만 쓰는 판독기와 그 시험.
    // 그 도구가 정본 전용이라 둘 다 같다 — 고객 트리에서 부를 표면이 없다.
    "scripts/lib/themeEnums.mjs",
    "scripts/lib/themeEnums.test.mjs",
    // 배송 문서의 측정 주장을 재는 **정본 전용** 검사기다. BASELINE 이 이 레포 파일 경로에 매여 있고
    // `ci.yml` 도 판별자 뒤에서만 부른다 — 고객 트리에 실으면 부를 일 없는 9.8KB 가 전 테넌트에 복제된다.
    "scripts/lib/doc-claims.mjs",
    // 배송 문서의 severity 주장을 검사기 행동으로 못박는다 — 우리 문서에 대한 규율이라 정본 전용.
    "scripts/lib/validateSeverity.test.mjs",
    // 굽는 도구(`pack-preset.mjs`)의 매니페스트 생성 판정과 그 시험 — 그 도구가 정본 전용이라 둘 다 같다.
    "scripts/lib/contentManifest.mjs",
    "scripts/lib/packManifest.test.mjs",
    // ⚠ **방문자 IP 검사기도 배송하지 않는다**(4차 심의 · Fable/Opus 동시 판정). 처음엔 고객에게도
    // 쓸모 있다고 보고 실었는데, 네 라운드에 걸쳐 **거짓 양성이 닫히지 않았다** — 타입 전용 import,
    // 헬퍼 경유 `clientIp`, IP 무관 용도로 client 를 쓰는 파일의 동명 자기 함수까지.
    //
    // 위험이 비대칭이다: 거짓 양성은 **고객의 배포를 무환불로 막고**(BuildGate 가 CI 결론을 읽는다)
    // 주석 면제도 구조적으로 불가능한데(검사기가 주석을 지운다), 거짓 음성은 우리가 못 잡을 뿐이다.
    // 결정적으로 — **이 게이트가 실제로 도는 유일한 집단(BYO)이 거짓 실패를 먹는 집단과 같다.**
    // 관리형·업로드 경로는 플랫폼이 워크플로를 덮어써 이 검사가 아예 안 돈다(백엔드 실측).
    // 보호는 안 받고 벌만 받는 구조였다.
    //
    // 애초에 이 검사기의 목적은 **우리 팩 4벌이 갈리는 것**을 막는 것이다(2026-08-10 사고의 실제 원인).
    // 그 목적은 우리 레포에서만 서면 달성된다. 규칙 자체는 AGENTS.md 로 계속 배송한다.
    "scripts/lib/visitor-ip-parity.mjs",
    // ⚠ **그 픽스처도 함께 뺀다.** 본체만 빼고 시험을 실었더니 zip 안에서 단독 실행 시
    // `ERR_MODULE_NOT_FOUND` 로 죽었다(심의 실측). 고객 CI 는 교집합 가드로 그 단계를 스킵해
    // 관문이 깨지진 않지만, **고객이 받은 소스에 실행하면 죽는 파일**을 넣어 보내는 셈이다.
    "scripts/lib/visitor-ip-parity.test.mjs",
    // ⚠ **우리 인프라 워크플로는 배송물이 아니다**(심의 차단 2 · 2026-08-10). `ci.yml`·`client-upgrade.yml`
    // 은 고객 레포에서 돌라고 주는 것이지만, 이것은 **자사 S3·IAM role·AWS 계정 ID** 를 담은 내부
    // 굽기 파이프라인이다. 실려 나가면 ⑴ 고객 레포에서 lockfile push·cron 마다 3플랫폼 빌드가 돌고
    // ⑵ OIDC 실패 뒤 notify 잡이 **고객 레포에 이슈를 자동 생성**한다(우리 인프라 좌표가 그 이슈에 남는다).
    ".github/workflows/deps-payload.yml",
    // 검수 적재 키트. `qa/fixtures/README.md` 첫 줄이 **"배송물이 아닙니다. zip 에 안 실립니다"**라고
    // 적어 놓고 실제로는 실려 있었다(심의 경고 1). 자기 문서와 모순인 것도 문제지만, 그 안의 이미지
    // 10장이 라이선스 계수 대상 밖이라 **"기록 없는 이미지는 나갈 수 없다"가 이 디렉터리에서 거짓**이었다.
    "qa/",
];

/**
 * 프리셋 버전은 상수가 아니라 인자다 — `--version x.y.z` 는 **필수**이고 기본값이 없다.
 *
 * 기본값을 두지 않는 이유: 발행 이력은 원장이 갖고 이 레포는 모른다. 상수는 실제 발행 번호를 따라갈
 * 수 없으므로, 기본값이 있으면 플래그를 잊었을 때 상용보다 **낮은** 번호로 zip 이 구워진다. 키가
 * `{code}/{version}.zip` 이라 그것은 덮어쓰기가 아니라 새 객체이고, promote 하면 신규 테넌트가 그
 * 판을 받는다. 그래서 모르면 짐작하지 않고 **멈춘다.**
 *
 * 버전 시맨틱(memo97 §3.1): 시드(카피·에셋·구성)나 소스가 바뀌면 올린다. 갱신은 새 객체이고, 이미
 * 개시한 사이트의 소스는 고객 것이라 소급 갱신이 없다.
 */

/**
 * 팩 신원 매니페스트 계약(memo150 §3.1) — **백엔드 `PackManifestReader` 의 거울**이다.
 *
 * 이 상수들이 백엔드와 갈리면 팩은 성공하는데 적재가 400 으로 죽는다(`SiteTypeDetector.LOCKFILES` 거울과
 * 같은 종류의 자리). 계약 확장은 **rev 상향으로만** — 서버가 strict 파싱이라 키를 하나 더 넣는 순간
 * 배포된 백엔드가 그 zip 을 통째로 거부한다.
 */
const MANIFEST_PATH = ".zalkera/pack.json";
const MANIFEST_REV = 1;
/** `theme_code varchar(40)` 합치. */
const CODE_REGEX = /^[a-z0-9][a-z0-9-]{0,39}$/;
/**
 * 우리가 **내보내는** 번호의 규칙 — semver core 만, 앞자리 0 없이.
 *
 * 백엔드 `PackManifestReader.VERSION_REGEX` 는 `^[0-9]+\.[0-9]+\.[0-9]+$` 라 각 자리에 **앞자리 0**
 * 이 붙어도 받는다. 여기서는 안 받는다: 0 만 다른 두 값은 사람 눈에 같은 번호인데 `{code}/{version}.zip`
 * 키로는 **다른 객체**라, 어느 쪽이 정본인지 원장을 봐야 아는 상태를 만든다. 내보내는 쪽만 좁히는 것은
 * 서버가 받는 집합의 부분집합이므로 거울을 깨지 않는다.
 *
 * 프리릴리스·빌드 메타는 rev 2 후보다.
 */
const VERSION_REGEX = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
/** `theme_artifact.version` 컬럼 폭 — 백엔드 `PackManifestReader.MAX_VERSION_LENGTH` 거울. */
const MAX_VERSION_LENGTH = 40;

/**
 * 매니페스트 바이트. **키 순서·들여쓰기·개행이 고정**이라 같은 (code, version) 이면 같은 바이트다 —
 * 결정론이 이 파일의 계약이므로 `JSON.stringify(obj)` 의 키 순서에 기대지 않고 직접 쓴다.
 */
function packManifestBytes(code, version) {
    return Buffer.from(
        `{\n    "rev": ${MANIFEST_REV},\n    "code": ${JSON.stringify(code)},\n    "version": ${JSON.stringify(version)}\n}\n`,
        "utf8",
    );
}

const problems = [];
const fail = (code, message) => problems.push(`[${code}] ${message}`);

// ── 시드 검증 ────────────────────────────────────────────────────────────────

/** `asset`/`*Asset` 키의 문자열 값 = zip 상대 파일명 참조(§3.2-a-7). 백엔드 재작성 규칙과 같은 판정이다. */
const isReferenceKey = (key) => key === "asset" || (key.length > 5 && key.endsWith("Asset"));

/**
 * **업무 참조 키 형상**(memo142 §1 기계 판정). `product`/`*Product`(단수) · `products`/`*Products`(복수) ·
 * `categorySlug`. 종전에는 이 판정이 "이 handle 이 시드에 있는가"를 묻는 **해석기**였는데, 이제는
 * **금지 판정**이다 — 섹션 config 에 이 형상의 키가 있으면 그 섹션은 조회형이고, 조회의 자리는 선언이
 * 아니라 소스다.
 *
 * **타입 이름이 아니라 키 형상으로 거는 이유**: 어휘에서 `SERVICE_MENU`·`BOOKING_CTA` 가 삭제됐지만,
 * 같은 성격의 타입이 다시 생기면 이름만 다를 뿐 같은 위반이다. 형상으로 걸면 미래의 조회형도 잡힌다.
 * (판정 자체는 백엔드 `SeedProductReferences` 가 쓰던 것과 **같은 형태**를 그대로 재사용한다 — 그 규칙이
 * 이미 "무엇이 업무 참조인가"를 정확히 정의해 뒀다.)
 */
const isProductRefKey = (key) => key === "product" || (key.length > 7 && key.endsWith("Product"));
const isProductsRefKey = (key) => key === "products" || (key.length > 8 && key.endsWith("Products"));
const isBusinessRefKey = (key) => key === "categorySlug" || isProductRefKey(key) || isProductsRefKey(key);

/** 섹션 config 안의 업무 참조 키 **경로 전수**(사람이 고칠 재료라 경로로 돌려준다). */
function collectBusinessRefKeys(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectBusinessRefKeys(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isBusinessRefKey(key)) into.push(here);
            else collectBusinessRefKeys(value, here, into);
        }
    }
    return into;
}

/**
 * 참조 키가 재작성된 뒤의 **id 형** 키(`assetId`·`photoAssetId`·`productId`·`productIds`…).
 * 시드에는 이 형태가 있으면 안 된다(§2.6-5) — 아래 NUMERIC_ID 게이트가 쓴다.
 */
//
// ⚠ **백엔드 `SeedIdKeys` 와 같은 판정이어야 한다.** memo139 D9 가 "백엔드·팩 양쪽에 category 어간을
//    넣었다"고 적었는데 **팩 쪽이 안 들어갔다**(심의 실측): `categoryId: 46` 을 시드에 넣으면 팩은
//    통과하고 개시가 500 으로 죽는다 — 이 파일 곳곳이 경고하는 "가장 늦게 발견되는 결함" 그 형태다.
//    판정 방식도 백엔드와 맞춘다: **영숫자만 남겨 정규화**한 뒤 어간을 본다(`product_category_id`·
//    `category-id`·후행 공백 같은 위장 철자를 같은 자리로 접는다).
const ID_STEMS = ["asset", "product", "category"];
const isRewrittenIdKey = (key) => {
    const lower = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    let stem;
    if (lower.endsWith("ids")) stem = lower.slice(0, -3).replace(/s$/, "");
    else if (lower.endsWith("id")) stem = lower.slice(0, -2);
    else return false;
    return ID_STEMS.some((s) => stem === s || stem.endsWith(s));
};

/** 계약이 요구하는 id 형 키(`*AssetId`)를 소스가 쓰는 참조형 키(`*Asset`)로 되돌린다. */
const seedKeyOf = (idKey) => (idKey.endsWith("Ids") ? `${idKey.slice(0, -3)}s` : idKey.replace(/Id$/, ""));

/** 시드 config 에 재작성된 id 형 키가 있으면 그 경로를 모은다(§2.6-5 — 숫자 직기입 금지). */
function collectIdKeys(node, path = "", into = []) {
    if (Array.isArray(node)) node.forEach((v, i) => collectIdKeys(v, `${path}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = path ? `${path}.${key}` : key;
            if (isRewrittenIdKey(key)) into.push(here);
            else collectIdKeys(value, here, into);
        }
    }
    return into;
}

/**
 * 계약 정본(`@zalkera/client` 의 SECTION_CONTRACT)을 읽는다. **못 읽으면 팩을 실패시킨다** — 조용히 꺼지는
 * 게이트는 게이트가 아니고, 팩은 릴리스 행위라 `npm ci` 된 체크아웃에서 도는 것이 정상이다.
 *
 * 읽는 것은 타입 목록과 **필수 참조 키**(`requiredRefs` — contractRev 3·memo119 §2.6-3)다. 필수성의 지식은
 * 렌더 계약의 것이라 여기서 다시 짜지 않고 운반체가 실어 온 선언을 그대로 쓴다. 그 필드가 없는 구버전
 * client 로는 **팩하지 않는다** — 있는 줄 알았던 게이트가 사실 꺼져 있는 것이 가장 나쁜 상태다.
 */
function sectionContract() {
    try {
        const contract = createRequire(import.meta.url)("@zalkera/client")?.SECTION_CONTRACT;
        if (!Array.isArray(contract) || !contract.length) throw new Error("SECTION_CONTRACT 가 비었습니다(구버전 client)");
        // rev 5 부터 그룹 축(`requiredRefsAnyOf`)도 필요하다 — 없는 client 로 팩하면 "있는 줄 알았던
        // 게이트가 사실 꺼져 있는" 상태가 된다(rev 3 의 requiredRefs 도입 때와 같은 관례).
        const stale = contract
            .filter((s) => !Array.isArray(s?.requiredRefs) || !Array.isArray(s?.requiredRefsAnyOf))
            .map((s) => s?.type ?? String(s));
        if (stale.length) {
            throw new Error(
                `SECTION_CONTRACT 에 requiredRefs·requiredRefsAnyOf 가 없습니다(contractRev 5 미만) — ${stale.slice(0, 3).join(", ")}…`,
            );
        }
        return new Map(contract.map((s) => [s.type, s]));
    } catch (e) {
        console.error(`섹션 어휘 계약을 읽지 못했습니다 — ${e.message}`);
        console.error("  → 이 체크아웃에서 `npm ci` 를 먼저 돌리십시오(vendored @zalkera/client 설치).");
        process.exit(1);
    }
}

/**
 * 잣대 배송 확인 — **고객 zip 이 자기 약속을 지킬 수 있는가**(memo122 §1.3).
 *
 * `CUSTOMIZE.md` 는 고객에게 "산출물 검사기가 이 zip 에 들어 있고, 잣대는 `@zalkera/client` 로 따라온다"고
 * 약속한다. 그 약속의 참·거짓은 **이 체크아웃이 무는 client 버전**이 정한다 — 운반본을 안 싣는 버전을 물고
 * 팩하면, 문서만 참이고 물건은 거짓인 zip 이 나간다(그 상태를 실제로 한 번 배송한 것이 이 게이트의 이유다).
 *
 * 검사는 버전 비교가 아니라 **능력 확인**이다: 지금 설치된 client 에서 그 하위 경로가 열리는가. 버전 상수는
 * 갈라지지만 능력은 안 갈라진다. 팩은 릴리스 행위라 `npm ci` 된 체크아웃에서 도는 것이 정상이므로
 * (`sectionContract()` 와 같은 전제), 설치된 트리를 재는 것이 곧 고객이 받을 것을 재는 것이다.
 */
function assertGuaranteesCarried() {
    const require = createRequire(import.meta.url);
    /**
     * memo123 §6.1: 잣대만이 아니라 **검사기 자신**도 이제 client 가 배송한다(template 의 스크립트는
     * 그 bin 을 부르는 wrapper 다). 그래서 셋 다 열려야 zip 의 약속이 참이다 — 검사기가 없는 버전을
     * 물고 팩하면 고객의 `npm run check:aeo` 는 잣대를 찾기도 전에 wrapper 에서 exit 2 로 죽는다.
     */
    const needed = [
        ["AEO_YARDSTICK", "@zalkera/client/contracts/aeo-surface-guarantees.json", "AEO 보장표 운반본(잣대)"],
        ["AEO_CHECKER", "@zalkera/client/bin/check-aeo-surfaces.mjs", "산출물 검사기 본체"],
        ["AEO_CRAWLER", "@zalkera/client/lib/site-crawl.mjs", "검사기가 쓰는 크롤러"],
    ];
    const missing = needed.filter(([, specifier]) => {
        try {
            require.resolve(specifier);
            return false;
        } catch {
            return true;
        }
    });
    if (missing.length === 0) return;
    console.error("팩 실패 — 이 zip 의 약속을 못 지킵니다(zip 을 하나도 쓰지 않았습니다):");
    for (const [tag, specifier, what] of missing) {
        console.error(`  [${tag}] 설치된 @zalkera/client 가 ${what}을(를) 싣지 않습니다 — ${specifier}`);
    }
    console.error("    이대로 팩하면 고객이 `npm run check:aeo` 를 돌렸을 때 검사기·잣대를 못 찾아 멈추는데,");
    console.error("    CUSTOMIZE.md 는 따라온다고 약속합니다 — 문서만 참인 물건은 내보내지 않습니다.");
    console.error("    → 그것들을 실은 @zalkera/client 를 발행하고, 이 레포의 의존을 그 버전으로 올린 뒤");
    console.error("      (`npm i @zalkera/client@<버전>` — package-lock 포함) 다시 팩하십시오.");
    process.exit(1);
}

/**
 * 정적 라우트 세그먼트(`src/app/<seg>/page.tsx`). Next 규칙상 정적 세그먼트가 `[slug]` 보다 **우선**하므로,
 * 같은 이름의 시드 페이지는 그려지지 않는다 — 데이터는 들어갔는데 아무도 못 보는 고아가 된다.
 * 조용한 그림자라 사람 눈으로는 안 잡힌다. 레포에서 직접 세어 시드 slug 와 대조한다.
 */
function reservedSlugs(code) {
    // ⚠ 팩 v4: **그 팩의 라우트**를 본다(팩마다 소스가 다르므로 루트 `src/` 를 보면 틀린 답이 나온다 —
    //    커머스를 지운 팩에서 `products` 를 예약어로 잡거나, 반대로 그 팩만 가진 라우트를 놓친다).
    const appDir = join(PRESETS_DIR, code, "src/app");
    return new Set(
        readdirSync(appDir, {withFileTypes: true})
            .filter((e) => e.isDirectory() && !e.name.startsWith("[") && !e.name.startsWith("_"))
            .map((e) => e.name),
    );
}

/** 큐레이션 아이콘 맵은 **그 팩의 소스** 안에 있으니 항상 대조한다 — 미지 아이콘은 렌더에서 조용히 사라진다(§4.4). */
function iconKeys(code) {
    const src = readFileSync(join(PRESETS_DIR, code, "src/components/ui/Icon.tsx"), "utf8");
    const body = src.slice(src.indexOf("export const ICONS"), src.indexOf("export const ICON_KEYS"));
    return new Set([...body.matchAll(/"([a-z0-9-]+)":/g)].map((m) => m[1]));
}

/**
 * 루트가 홈으로 집어 오는 slug(`src/app/page.tsx` 참조). 정적 라우트와 겹치지만 **의도된 겹침**이라
 * 그림자 검사에서 면제한다 — 이 페이지만은 `/home` 이 아니라 `/` 로 나간다.
 */
const HOME_SLUG = "home";

/** 테마 enum 계약은 `src/lib/theme.ts` 에서 읽는다 — 판독기와 그 시험은 `scripts/lib/themeEnums.mjs`. */
function readThemeEnums() {
    const file = join(ROOT, "src/lib/theme.ts");
    return readThemeEnumsFrom(readFileSync(file, "utf8"), file);
}

/**
 * 시드 v3 검증(memo142) — 남은 최상위 키는 **`themeColors` 하나**다.
 *
 * `pages`·`menus` 는 팩 v2 에서 탈락했고(그 자리를 `content/` 가 받는다 — 아래 [validateContent]),
 * `products`·`categories` 는 팩 v3 에서 탈락했다(그 자리를 **소스의 직접 호출**이 받는다).
 *
 * **잔재 키를 조용히 무시하지 않고 실패시키는 이유는 두 세대가 같다**: 무시하면 그 프리셋은
 * "상품을 넣었는데 안 생기는"·"페이지를 넣었는데 안 나오는" 상태로 나가고, 그 원인이 파일 어디에도
 * 안 적혀 있다. 백엔드도 같은 판정이다(strict 파싱이 미지 키로 개시를 중단한다) — 갈리면 안 되는 축이다.
 */
function validateSeed(code, seedBytes, assetNames) {
    if (seedBytes.length > CAPS.seedJsonBytes) {
        fail("SEED_SIZE", `${code}: seed.json ${seedBytes.length}B > ${CAPS.seedJsonBytes}B`);
    }

    let seed;
    try {
        seed = JSON.parse(seedBytes.toString("utf8"));
    } catch (e) {
        fail("SEED_PARSE", `${code}: seed.json 파싱 실패 — ${e.message}`);
        return null;
    }

    const legacy = ["pages", "menus"].filter((k) => k in seed);
    if (legacy.length) {
        fail(
            "SEED_V1",
            `${code}: seed.json 에 ${legacy.join("·")} 가 남아 있습니다 — 팩 v2 에서 사이트의 얼굴은 ` +
                `presets/${code}/content/ 로 갔습니다. 옮기고 지우십시오`,
        );
    }
    // ⚠ **팩 v3 의 핵심 게이트**(memo142). 상품·갈래를 시드에 실으면 그것은 우리가 고객 DB 에 업무
    //    데이터를 만드는 것이고, 갈래 이름(`리빙`·`시술`)은 애초에 **사장이 정할 이름**이다.
    //    카탈로그의 입구는 콘솔·MCP 이고, 화면에 비추는 일은 소스가 `listProducts()` 로 한다.
    const business = ["products", "categories"].filter((k) => k in seed);
    if (business.length) {
        fail(
            "SEED_BUSINESS_DATA",
            `${code}: seed.json 에 ${business.join("·")} 가 있습니다 — 시드는 업무 데이터를 만들지 않습니다` +
                `(memo142 §1). 카탈로그는 콘솔·MCP 가 채우고, 화면은 소스가 listProducts()·` +
                `listProductCategories() 를 직접 불러 그립니다. 견본 카탈로그가 필요하면 ` +
                `qa/fixtures/${code}/catalog.json 으로 옮겨 파트너 API 로 적재하십시오`,
        );
    }
    const unknownTop = Object.keys(seed).filter((k) => k !== "themeColors");
    if (unknownTop.length && !unknownTop.every((k) => ["pages", "menus", "products", "categories"].includes(k))) {
        const rest = unknownTop.filter((k) => !["pages", "menus", "products", "categories"].includes(k));
        fail("SEED_STRICT", `${code}: 최상위 미지 키 — ${rest.join(", ")}. 남은 키는 themeColors 뿐입니다`);
    }

    // ⚠ **키만 보고 값을 안 봤다.** 위 `SEED_STRICT` 는 `themeColors` 라는 **낱말이 있는가**만 재고,
    //   그 안의 값이 계약 안인지는 팩·`verify-zip` 어디서도 안 쟀다. 그래서 `density: "comfortable"`
    //   (계약은 `compact|cozy`) 를 실은 팩 2벌이 4벌 전부 ✅ 로 나갔다(심의 실증). 파서는 **조용히
    //   버린다** — 시드가 선언한 밀도가 화면에 0회 반영되고, 아무 데서도 안 보인다.
    //
    //   ⚠ **표를 여기에 다시 쓰지 않는다.** 규칙을 딴 데서 재구현하면 정본이 바뀔 때 이쪽이 낡는다
    //   (이 레포가 반복해 겪은 형상이다). `src/lib/theme.ts` 의 선언을 **읽어서** 판정한다.
    const themeEnums = readThemeEnums();
    for (const [field, allowed] of Object.entries(themeEnums)) {
        const value = seed.themeColors?.[field];
        if (value === undefined) continue; // 안 준 것은 기본값을 쓴다 — 위반이 아니다
        if (!allowed.includes(value)) {
            fail(
                "SEED_ENUM",
                `${code}: seed.json 의 themeColors.${field} = ${JSON.stringify(value)} 가 계약 밖입니다 ` +
                    `(${allowed.join("|")}). 파서가 조용히 버리므로 그 선언은 화면에 반영되지 않습니다 ` +
                    `— 정본은 src/lib/theme.ts 입니다`,
            );
        }
    }

    // `.zalkera/assets/` 는 **전송 이미지 풀**이다. 팩 v3 에서 그 유일한 소비자(상품 커버)가 사라져
    // 현행 팩들은 이 디렉터리가 아예 없다 — 파일을 두면 아무도 안 쓰는 채로 배송된다.
    // 섹션 이미지의 정위치는 레포 상주(`presets/<code>/public/`)이고 그건 아래 [validateContent] 가 센다.
    for (const name of assetNames) {
        fail(
            "REF_UNUSED",
            `${code}: 아무도 안 쓰는 전송 에셋 — .zalkera/assets/${name}. 섹션 이미지라면 ` +
                `presets/${code}/public/ 로 옮기고(레포 상주가 정위치입니다), 상품 이미지라면 ` +
                `qa/fixtures/${code}/assets/ 로 옮기십시오(카탈로그는 콘솔이 채웁니다)`,
        );
    }

    return {seed};
}

/**
 * 콘텐츠 파일 검증 — **팩 v1 의 시드 페이지 검사가 통째로 이사 온 자리**다.
 *
 * 검사 항목이 바뀐 게 아니라 **대상 파일**이 바뀌었다: 계약 타입·필수 참조·아이콘·id 형 금지·slug
 * 그림자·캡. 여기서 막는 이유도 그대로다 — 이 결함들은 전부 예외를 안 던지고 **섹션이 조용히 사라지는**
 * 모양으로 나타나므로, 고객 개시 순간이 아니라 우리 터미널에서 죽어야 한다(전제 A 합치: 게이트는
 * 우리 산출물인 팩에만 걸리고 고객 zip·고객 레포에는 안 걸린다).
 *
 * 새로 생긴 축 둘: ⑴ 에셋이 `public/` 루트 절대 경로이고 그 파일이 실재하는가 ⑵ `sortOrder` 잔존
 * (배열이 순서인데 키가 남으면 순서의 원장이 둘이 된다).
 */
function validateContent(code, contentDir, publicNames, contract, icons, reserved) {
    const pagesDir = join(contentDir, "pages");
    let files;
    try {
        files = readdirSync(pagesDir).filter((n) => n.endsWith(".json")).sort();
    } catch {
        fail("CONTENT_MISSING", `${code}: presets/${code}/content/pages/ 가 없습니다 — 팩 v2 는 여기서 얼굴을 읽습니다`);
        return {pages: [], nav: null, usedAssets: new Set()};
    }
    if (files.length > CAPS.pages) fail("CAP_PAGES", `${code}: 페이지 ${files.length} > ${CAPS.pages}`);

    const pages = [];
    const usedAssets = new Set();

    for (const file of files) {
        const slug = file.slice(0, -".json".length);
        const path = join(pagesDir, file);
        const bytes = readFileSync(path);
        let doc;
        try {
            doc = JSON.parse(bytes.toString("utf8"));
        } catch (e) {
            fail("CONTENT_PARSE", `${code}/${slug}: 파싱 실패 — ${e.message}`);
            continue;
        }
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail("CONTENT_SHAPE", `${code}/${slug}: 최상위가 객체여야 합니다`);
            continue;
        }
        pages.push({slug, path, bytes});

        if (!/^[a-z0-9-]+$/.test(slug)) {
            fail("SLUG_FORMAT", `${code}: 파일명 "${file}" — slug 는 소문자·숫자·하이픈만 씁니다`);
        }
        if (slug !== HOME_SLUG && reserved.has(slug)) {
            fail(
                "SLUG_SHADOWED",
                `${code}: slug "${slug}" 는 정적 라우트 src/app/${slug}/ 에 가려집니다 — 이 페이지는 안 그려집니다`,
            );
        }
        if (typeof doc.title !== "string" || doc.title.trim() === "") {
            fail("CONTENT_TITLE", `${code}/${slug}: title 은 비어 있지 않은 문자열이어야 합니다`);
        }

        const sections = doc.sections ?? [];
        if (!Array.isArray(sections)) {
            fail("CONTENT_SECTIONS", `${code}/${slug}: sections 는 배열이어야 합니다 — 배열 순서가 곧 화면 순서입니다`);
            continue;
        }
        if (sections.length > CAPS.sectionsPerPage) {
            fail("CAP_SECTIONS", `${code}/${slug}: 섹션 ${sections.length} > ${CAPS.sectionsPerPage}`);
        }

        for (const [i, section] of sections.entries()) {
            const at = `${code}/${slug} sections[${i}]`;
            if (section == null || typeof section !== "object" || Array.isArray(section)) {
                fail("CONTENT_SECTION", `${at}: 섹션은 { type, config } 객체여야 합니다`);
                continue;
            }
            if ("sortOrder" in section) {
                fail(
                    "SORT_ORDER",
                    `${at}: sortOrder 는 콘텐츠 파일에 없는 키입니다 — 배열 순서가 순서입니다(계약 rev 4). ` +
                        `남겨 두면 "순서 바꿔"가 고칠 자리가 둘이 됩니다`,
                );
            }
            const spec = contract.get(section.type);
            if (!spec) {
                fail("CONTRACT", `${at}: 계약에 없는 섹션 타입 — ${section.type}`);
            }
            const config = section.config ?? {};
            if (config == null || typeof config !== "object" || Array.isArray(config)) {
                fail("CONTENT_CONFIG", `${at}: config 는 객체여야 합니다(JSON 문자열은 DB 방언입니다)`);
                continue;
            }
            const bytesOfConfig = Buffer.byteLength(JSON.stringify(config), "utf8");
            if (bytesOfConfig > CAPS.configBytes) {
                fail("CAP_CONFIG", `${at}: config ${bytesOfConfig}B > ${CAPS.configBytes}B`);
            }
            for (const item of config.items ?? []) {
                if (item?.icon && !icons.has(item.icon)) {
                    fail("ICON", `${at}: 큐레이션 맵에 없는 아이콘 — ${item.icon}`);
                }
            }

            // 필수 참조 — 계약이 id 형으로 선언한 것을 소스 방언 키로 되돌려 본다.
            for (const idKey of spec?.requiredRefs ?? []) {
                const key = seedKeyOf(idKey);
                const value = config[key];
                const filled = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value !== "";
                if (!filled) {
                    fail(
                        "REQUIRED_REF",
                        `${at}: ${section.type} 이 필수 참조 "${key}" 를 안 가리킵니다 — 렌더러가 이 섹션을 통째로 건너뜁니다(계약 ${idKey} 필수)`,
                    );
                }
            }

            // ⚠ **업무 참조 키 금지**(memo142 §1 기계 판정 · 팩 v3 의 핵심 게이트).
            //
            //    종전에는 여기서 "이 갈래가 시드에 있는가"를 대조했다. 이제 묻는 것이 다르다 —
            //    **선언이 업무 축을 가리키는 것 자체**가 경계 위반이다. 값이 업무 DB 에 살고 화면이
            //    비추기만 하는 조회는 선언이 아니라 소스의 소관이고(`ProductRail` 이 본보기), 절반 선언은
            //    "어디에"만 선언에 두고 "어떻게"를 공유 렌더러에 얼려 버린다.
            //
            //    **타입 이름이 아니라 키 형상으로 건다** — 어휘에서 조회형 둘이 삭제됐지만 같은 성격의
            //    타입이 다시 생겨도 여기서 잡힌다. 이 게이트는 **우리 산출물인 팩에만** 선다(요건 1:
            //    고객 zip·고객 레포의 어휘를 우리가 강제하지 않는다).
            for (const path of collectBusinessRefKeys(config)) {
                fail(
                    "BUSINESS_REF",
                    `${at}: 섹션 config 에 업무 참조 키 "${path}" — 배송물은 업무 축의 고유명사(상품 handle·` +
                        `갈래 slug)를 박지 않습니다(받은 사람 카탈로그에는 그 이름이 없어 영구히 빕니다). ` +
                        `진열은 소스에서 listProducts()·listProductCategories() 를 직접 부르십시오`,
                );
            }

            // 참조 그룹(rev 5) — 각 그룹에서 **하나 이상**이 채워져야 한다. 막으려는 것은
            // requiredRefs 와 같다(아무것도 안 가리킨 채 들어와 조용히 사라지는 섹션). 단위만 넓다.
            for (const group of spec?.requiredRefsAnyOf ?? []) {
                const keys = group.map(seedKeyOf);
                const anyFilled = keys.some((key) => {
                    const value = config[key];
                    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value !== "";
                });
                if (!anyFilled) {
                    fail(
                        "REQUIRED_REF",
                        `${at}: ${section.type} 이 ${keys.map((k) => `"${k}"`).join(" 또는 ")} 중 아무것도 안 가리킵니다 —` +
                            ` 렌더러가 이 섹션을 통째로 건너뜁니다`,
                    );
                }
            }

            // 숫자 직기입 금지 — 소스는 테넌트를 안 가린다.
            for (const path of collectIdKeys(config)) {
                fail(
                    "NUMERIC_ID",
                    `${at}: id 형 키 "${path}" — 소스는 참조형(public 경로·handle)으로 씁니다. 숫자 id 는 테넌트 스코프라 이 소스가 다른 테넌트에서 의미를 잃습니다`,
                );
            }

            // 에셋 = public 루트 절대 경로 + 실재.
            for (const [key, value] of Object.entries(flattenAssetRefs(config))) {
                if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.split("/").includes("..")) {
                    fail("ASSET_PATH", `${at}: "${key}" = ${JSON.stringify(value)} — public 루트 절대 경로여야 합니다(예 "/images/hero.png")`);
                    continue;
                }
                if (!publicNames.has(value)) {
                    fail("REF_MISSING", `${at}: 참조한 이미지 없음 — presets/${code}/public${value}`);
                }
                usedAssets.add(value);
            }

        }
    }

    // 역방향 — 아무 페이지도 안 쓰는 이미지. 에셋 풀과 같은 규칙이다(§3.2-a-7).
    for (const name of publicNames) {
        if (!usedAssets.has(name)) fail("REF_UNUSED", `${code}: 아무도 안 쓰는 이미지 — presets/${code}/public${name}`);
    }

    // 내비 — 없으면 정상(내비가 빈다). 있으면 형상을 본다.
    let nav = null;
    const navPath = join(contentDir, "nav.json");
    try {
        const navBytes = readFileSync(navPath);
        const parsed = JSON.parse(navBytes.toString("utf8"));
        nav = {path: navPath, bytes: navBytes};
        for (const position of ["header", "footer"]) {
            const links = parsed?.[position] ?? [];
            if (!Array.isArray(links)) {
                fail("NAV_SHAPE", `${code}: nav.json ${position} 는 배열이어야 합니다`);
                continue;
            }
            if (links.length > CAPS.navLinks) fail("CAP_NAV", `${code}: nav ${position} ${links.length} > ${CAPS.navLinks}`);
            for (const link of links) {
                if (typeof link?.label !== "string" || typeof link?.href !== "string") {
                    fail("NAV_LINK", `${code}: nav.json ${position} 항목은 { label, href } 문자열이어야 합니다 — ${JSON.stringify(link)}`);
                }
            }
        }
    } catch (e) {
        if (e.code !== "ENOENT") fail("NAV_PARSE", `${code}: nav.json — ${e.message}`);
    }

    return {pages, nav, usedAssets};
}

/** 중첩까지 훑어 에셋 참조를 `{경로: 값}` 으로 편다. */
function flattenAssetRefs(node, prefix = "", into = {}) {
    if (Array.isArray(node)) node.forEach((v, i) => flattenAssetRefs(v, `${prefix}[${i}]`, into));
    else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            const here = prefix ? `${prefix}.${key}` : key;
            if (isReferenceKey(key)) into[here] = value;
            else flattenAssetRefs(value, here, into);
        }
    }
    return into;
}

/** 에셋 캡·형식. 백엔드가 put 전에 하는 판정을 팩에서 먼저 한다(같은 규칙·다른 시점). */
function validateAssets(code, assets) {
    if (assets.length > CAPS.assets) fail("CAP_ASSETS", `${code}: 에셋 ${assets.length}개 > ${CAPS.assets}개`);

    let total = 0;
    for (const {name, bytes} of assets) {
        total += bytes.length;
        if (bytes.length > CAPS.assetFileBytes) fail("CAP_FILE", `${code}: ${name} ${bytes.length}B 초과`);

        const spec = RASTER[name.split(".").pop().toLowerCase()];
        if (!spec) {
            fail("ASSET_TYPE", `${code}: ${name} — 허용 확장자는 ${Object.keys(RASTER).join("·")} 뿐`);
            continue;
        }
        const matches = (offset, magic) => magic.every((b, i) => bytes[offset + i] === b);
        const ok = matches(0, spec.magic) && (!spec.tag || matches(spec.tag.offset, spec.tag.bytes));
        if (!ok) fail("ASSET_MAGIC", `${code}: ${name} — 확장자와 실제 바이트가 다릅니다`);
    }
    if (total > CAPS.assetTotalBytes) fail("CAP_TOTAL", `${code}: 에셋 총량 ${total}B > ${CAPS.assetTotalBytes}B`);
}

/**
 * §7 라이선스 게이트 — zip 에 실리는 이미지 **전수**가 매니페스트에 적혀 있어야 팩이 성공한다.
 * 출처 기록이 고객 소스와 **동행**하는 것이 소유 원칙상 정위치라, 기록 없는 이미지는 아예 나갈 수 없게 한다.
 *
 * 팩 v2 에서 대상이 셋으로 늘었다: `.zalkera/assets/`(상품 이미지) · **`presets/<code>/public/`(섹션
 * 이미지 — 새 거처)** · 템플릿 자신의 `public/`. 새 거처를 빠뜨리면 라이선스 기록 없는 이미지가
 * 레포 상주로 나가는데, 그게 정확히 이 게이트가 막으려던 것이다.
 */
function validateLicense(code, manifest, assets, presetPublicImages, packSrcImages = []) {
    const templateImages = listImages(join(ROOT, "public"));
    // ⚠ **팩 소스 안의 이미지도 센다**(보안 심의 W1). 종전 대상은 `.zalkera/assets`·프리셋 `public/`·
    //    템플릿 `public/` 뿐이라, `presets/<code>/src/` 밑에 둔 이미지가 **기록 없이 zip 에 실렸다**
    //    (실측). §7 게이트의 "기록 없는 이미지는 나갈 수 없다"가 거기서 거짓이었다. 오버레이가 걷힌
    //    뒤에도 그 디렉터리는 그대로 배송되므로 이 축은 그대로 유효하다.
    for (const name of [...assets.map((a) => a.name), ...presetPublicImages, ...templateImages, ...packSrcImages]) {
        if (!manifest.includes(name)) fail("LICENSE", `${code}: ASSETS-LICENSE.md 에 없는 이미지 — ${name}`);
    }
}

function listImages(dir) {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return [];
    }
    return entries.flatMap((e) =>
        e.isDirectory()
            ? listImages(join(dir, e.name))
            : /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(e.name)
              ? [e.name]
              : [],
    );
}

// ── ZIP (결정론) ─────────────────────────────────────────────────────────────

const DOS_TIME = 24576; // 12:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (7 << 5) | 26; // 2026-07-26 고정 — 팩 시각이 sha 를 흔들지 않게.

function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const {path, bytes} of entries) {
        const name = Buffer.from(path, "utf8");
        const deflated = deflateRawSync(bytes, {level: 9});
        const useStore = deflated.length >= bytes.length;
        const body = useStore ? bytes : deflated;
        const method = useStore ? 0 : 8;
        const sum = crc32(bytes);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 파일명
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(sum, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(bytes.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(sum, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(bytes.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // 외부 속성: 일반 파일 0644(JS 시프트는 부호 있음 — 반드시 >>>0)
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += 30 + name.length + body.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * **공용 프로젝트 배선** = git 추적 파일 − 제외 목록. `node_modules`·빌드 산출물이 자동으로 빠지고
 * 목록이 사람 손을 안 탄다.
 *
 * 팩 v4 에서 `src/` 가 제외로 들어가 이 함수가 싣는 것은 **소스가 아닌 것**들이다: `package.json`·
 * `tsconfig`·`next.config`·`.github/`·문서·고객용 스크립트. 팩마다 갈릴 이유가 없어 공유한다.
 */
function sourceEntries() {
    const tracked = execFileSync("git", ["ls-files", "-z"], {cwd: ROOT, maxBuffer: 32 * 1024 * 1024})
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .filter((p) => !SOURCE_EXCLUDES.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x)))
        .sort();
    return tracked.flatMap((path) => {
        // 심링크 거부는 팩 소스와 같은 이유다(레포 밖 내용이 zip 에 실린다) — 대상만 다르다.
        if (lstatSync(join(ROOT, path)).isSymbolicLink()) {
            fail("SOURCE_SYMLINK", `${path}: 소스에 심링크를 둘 수 없습니다 — 대상 내용이 zip 에 실립니다`);
            return [];
        }
        return [{path, bytes: readFileSync(join(ROOT, path))}];
    });
}


/**
 * 소스 출처 확인 — **팩은 커밋을 봉인하는 행위**다.
 *
 * `sourceEntries()` 는 경로만 git 에서 얻고 **바이트는 워킹트리에서** 읽는다. 즉 미커밋 편집이
 * 조용히 zip 에 들어가, 어떤 커밋과도 대응하지 않는 산출물이 고객에게 간다. 나중에 "이 사이트가
 * 어느 판본이냐"를 물으면 답할 수 없다. 더러운 트리에서는 팩하지 않는다.
 *
 * 뒤처진 체크아웃도 같은 병이다 — 2026-07-27 에 실제로 이 자리에서 났다. 원격은 인증 결함을
 * 이미 고쳤는데 로컬이 3커밋 뒤처져 있어, 그대로 팩했으면 **고쳐진 것을 되돌린 zip** 이 카탈로그에
 * 올라갈 뻔했다. fetch 는 하지 않는다(팩에 네트워크를 끌어들이지 않는다) — 이미 아는 원격
 * 참조로만 재고, 뒤처졌으면 경고한다. 판단은 사람이 한다.
 */
function sourceProvenance() {
    const git = (...a) => execFileSync("git", a, {cwd: ROOT}).toString("utf8").trim();
    const head = git("rev-parse", "--short", "HEAD");
    const dirty = git("status", "--porcelain");
    if (dirty && !process.argv.includes("--allow-dirty")) {
        fail("DIRTY_TREE", `미커밋 변경이 있습니다 — 커밋 후 팩하십시오(부득이하면 --allow-dirty):\n${dirty}`);
    }
    let behind = "";
    try {
        behind = git("rev-list", "--count", "HEAD..origin/main");
    } catch {
        // 원격 추적 참조가 없는 체크아웃(클론 직후·분리 헤드) — 잴 수 없으면 잠자코 넘긴다.
    }
    if (behind && behind !== "0") {
        console.warn(`  ⚠ 로컬이 origin/main 보다 ${behind}커밋 뒤처졌습니다 — 낡은 판본을 봉인할 수 있습니다.`);
        console.warn("    `git fetch && git status` 로 확인하고, 최신이 맞다면 그대로 진행하십시오.");
    }
    return head;
}

/**
 * 소스 보안 불변식 — 팩에 실리는 **코드 자체**를 본다(시드·에셋은 위에서 이미 본다).
 *
 * 왜 여기냐: 프리셋 zip 이 이 레포의 코드가 고객 사이트로 가는 **유일한 통로**다. 여기서 막으면
 * 결함이 고객 개시 순간이 아니라 우리 터미널에서 드러난다 — 이 스크립트의 원래 철학 그대로다.
 *
 * 소셜 로그인 콜백의 state 대조는 **fail-closed** 여야 한다. `if (saved && state && saved !== state)`
 * 형태는 검사가 있는 것처럼 보이지만 사실상 없는 것이다 — 공격자는 링크에서 state 를 빼기만 하면
 * 되고, 피해자는 애초에 로그인을 시작하지 않았으므로 저장된 값도 늘 비어 있다. 그러면 공격자 계정
 * 세션이 피해자 브라우저에 심겨, 피해자가 자기 계정인 줄 알고 주소·연락처를 적어 넣는다.
 * 4계보에 같은 파일이 흩어져 있던 레포라 기계 검사가 없으면 재발한다.
 */
function validateSource(source) {
    const callbacks = source.filter((e) => /src\/app\/auth\/callback\/.*\.tsx$/.test(e.path));
    for (const entry of callbacks) {
        const text = entry.bytes.toString("utf8");
        if (!text.includes("STATE_STORAGE_KEY")) continue; // state 를 안 다루는 콜백 파일은 대상이 아니다
        if (/if\s*\(\s*saved\s*&&/.test(text) || !/!saved/.test(text)) {
            fail("AUTH_FAIL_OPEN", `${entry.path}: OAuth state 대조가 fail-open 입니다 — 값이 없으면 거부해야 합니다(!saved || !state || saved !== state)`);
        }
    }
}

// ── 팩 ───────────────────────────────────────────────────────────────────────

/**
 * `presets/<code>/src/**` — **이 팩의 소스 전량**(팩 v4). zip 의 `src/` 는 여기서만 온다.
 *
 * 종전에는 이 함수가 "정본을 파일 단위로 가리는 오버레이"를 모았고, 무엇을 못 가리는지를 정하는
 * 목록(`PROTECTED_WIRING`)이 옆에 있었다. **오버레이가 없어지면서 둘 다 걷혔다** — 가릴 정본이
 * 없으니 "가리면 안 되는 것"도 없다. 그 목록이 지키던 값어치는 죽지 않고 **뜻이 바뀌어**
 * `scripts/lib/wiring-parity.mjs` 로 갔다: 이제 묻는 것은 "가렸는가"가 아니라
 * **"넷이 갈렸는가"**(바이트 동일)다.
 *
 * 남은 가드 둘은 오버레이와 무관하게 유효해서 그대로 있다:
 *
 * ⑴ **git 원장만 싣는다.** `readdirSync` 로 걸으면 `.gitignore` 에 걸린 파일이 **`git status` 가 깨끗한
 *    채** zip 에 실린다 — 실측으로 `presets/<code>/src/.env.local` 이 그랬다(DIRTY_TREE 도 ignored
 *    파일은 못 본다). 프리셋 zip 은 그 프리셋으로 개시하는 **전 테넌트**에 복제되므로 파급이 크다.
 * ⑵ **심링크 거부.** `readFileSync` 는 대상 내용을 그대로 읽으므로, 레포 밖 파일이 `.tsx` 이름을 쓰고
 *    zip 에 실릴 수 있다(이름 기반 시크릿 스캔도 못 잡는다). 실측 재현됨.
 */
const packSourceCache = new Map();
function packSourceEntries(code) {
    // 두 번 불린다(보안 불변식 검사 · inspect). 캐시가 없으면 같은 결함이 두 번 보고되고 파일도 두 번 읽는다.
    if (!packSourceCache.has(code)) packSourceCache.set(code, collectPackSource(code));
    return packSourceCache.get(code);
}

function collectPackSource(code) {
    const rel = `presets/${code}/src`;
    if (!existsSync(join(PRESETS_DIR, code, "src"))) {
        fail(
            "PACK_SRC_MISSING",
            `${code}: ${rel} 가 없습니다 — 팩 v4 부터 소스는 팩마다 온전히 갖습니다. ` +
                `새 팩이면 원본을 통째로 복사해 시작하십시오: cp -r src ${rel}`,
        );
        return [];
    }
    const tracked = trackedUnder(rel);
    if (tracked.size === 0) {
        fail("PACK_SRC_UNTRACKED", `${code}: ${rel} 에 git 추적 파일이 없습니다 — 커밋 후 팩하십시오`);
        return [];
    }

    const out = [];
    for (const path of [...tracked].sort()) {
        const abs = join(ROOT, path);
        // 원장에는 있는데 워킹트리에 없다 = 지워 놓고 커밋 안 한 상태. 평소엔 DIRTY_TREE 가 먼저 잡지만
        // `--allow-dirty` 로 우회하면 여기까지 온다 — 던지지 말고 무슨 일인지 말한다(실측으로 ENOENT
        // 스택트레이스가 났고, 그건 게이트 메시지가 아니다).
        if (!existsSync(abs)) {
            fail("PACK_SRC_DELETED", `${path}: git 원장에는 있는데 파일이 없습니다 — 삭제를 커밋하거나 되돌리십시오`);
            continue;
        }
        if (lstatSync(abs).isSymbolicLink()) {
            fail("SOURCE_SYMLINK", `${path}: 소스에 심링크를 둘 수 없습니다 — 대상 내용이 zip 에 실립니다`);
            continue;
        }
        out.push({path: path.slice(`presets/${code}/`.length), bytes: readFileSync(abs)});
    }
    return out;
}

/** `git ls-files` 원장 — 경로 하나 아래의 추적 파일 집합. */
function trackedUnder(rel) {
    return new Set(
        execFileSync("git", ["ls-files", "-z", "--", rel], {cwd: ROOT, maxBuffer: 32 * 1024 * 1024})
            .toString("utf8")
            .split("\0")
            .filter(Boolean),
    );
}

/**
 * `llms.txt` 를 **설치본에서 바이트 그대로** 실어 zip 루트에 둔다(Fable 설계 2026-08-01).
 *
 * 종전에는 zip 안에 없었다 — `npm ci` 뒤 `node_modules/@zalkera/client/llms.txt` 에만 생겼다. 그래서
 * zip 만 받아 연 사람, 그리고 **zip 을 통째로 물린 고객 LLM** 은 명세를 영영 못 읽었다. `README.md` 가
 * "AI 매뉴얼 — llms.txt"로 그 파일을 가리키는데 눈앞에 없었으니, 배송이 자기 문서를 배신하고 있었다.
 *
 * ⚠ **레포에 사본을 두지 않는다** — 두 번째 정본이 되어 드리프트가 시작된다. 팩 시점에 설치본에서
 * 복사하고, 재직렬화하지 않는다(바이트 대조가 드리프트를 숨을 곳 없이 잡게 한다 — `sync-aeo-guarantees`
 * 와 같은 근거). 버전 스탬프도 찍지 않는다: llms.txt 의 버전은 그것을 나른 `@zalkera/client` 의 버전이고
 * `package-lock.json` 이 이미 고정한다.
 */
function llmsManualEntry() {
    // ⚠ `require.resolve("@zalkera/client/llms.txt")` 는 **안 된다** — 그 패키지의 `exports` 맵이
    //    llms.txt 를 열어 두지 않았다(`files` 로 tarball 에는 실리지만 서브패스 export 는 없다).
    //    그래서 이미 존재가 보장된 운반본(`assertGuaranteesCarried` 가 먼저 확인한다) 경로에서
    //    패키지 루트를 얻는다. client 에 `"./llms.txt"` export 를 여는 것이 더 깨끗하지만 재발행이
    //    필요하므로 별건으로 남긴다 — 그때 이 함수는 resolve 한 줄로 줄어든다.
    const req = createRequire(import.meta.url);
    let root;
    try {
        root = dirname(dirname(req.resolve("@zalkera/client/contracts/aeo-surface-guarantees.json")));
    } catch {
        fail("LLMS_MISSING", "@zalkera/client 를 못 찾았습니다 — npm ci 후 재시도하십시오.");
        return null;
    }
    const path = join(root, "llms.txt");
    if (!existsSync(path)) {
        fail(
            "LLMS_MISSING",
            `@zalkera/client 가 llms.txt 를 나르지 않습니다(${path}) — 이 버전으로는 팩하지 마십시오. ` +
                "zip 이 명세 없이 나가면 README 가 없는 파일을 가리킵니다.",
        );
        return null;
    }
    return {path: "llms.txt", bytes: readFileSync(path)};
}

function presetPublicFiles(dir, base = "") {
    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true});
    } catch {
        return []; // public/ 없는 프리셋 — 섹션 이미지가 없을 뿐이다
    }
    return entries
        .flatMap((e) =>
            e.isDirectory()
                ? presetPublicFiles(join(dir, e.name), `${base}/${e.name}`)
                : [{route: `${base}/${e.name}`, name: e.name, bytes: readFileSync(join(dir, e.name))}],
        )
        .sort((a, b) => a.route.localeCompare(b.route));
}

/** 검증만 — 부작용 0. 한 테마라도 걸리면 아무 zip 도 안 쓴다(부분 산출물 금지). */
function inspect(code, contract) {
    const dir = join(PRESETS_DIR, code);
    // ⚠ 팩 소스를 **먼저** 모은다 — 아이콘 맵·예약 라우트가 그 팩 소스에서 나오므로(팩 v4),
    //    소스가 없으면 콘텐츠 검증의 잣대 자체가 없다.
    const packSource = packSourceEntries(code);
    if (packSource.length === 0) return null;
    const icons = iconKeys(code);
    const reserved = reservedSlugs(code);
    const seedBytes = readFileSync(join(dir, "seed.json"));
    const manifest = readFileSync(join(dir, "ASSETS-LICENSE.md"), "utf8");

    // `.zalkera/assets/` = 전송 이미지 풀. 팩 v3 에서 그 유일한 소비자(상품 커버)가 사라져
    // **현행 팩은 전부 이 디렉터리가 없다** — 있으면 validateSeed 가 미사용으로 막는다.
    const assetDir = join(dir, "assets");
    let assets = [];
    try {
        assets = readdirSync(assetDir)
            .filter((name) => statSync(join(assetDir, name)).isFile())
            .sort()
            .map((name) => ({name, bytes: readFileSync(join(assetDir, name))}));
    } catch {
        /* 상품 없는 테마 — 정상 */
    }

    const publicFiles = presetPublicFiles(join(dir, "public"));

    validateAssets(code, assets);
    validateSeed(code, seedBytes, new Set(assets.map((a) => a.name)));
    const content = validateContent(
        code,
        join(dir, "content"),
        new Set(publicFiles.map((f) => f.route)),
        contract,
        icons,
        reserved,
    );
    const packSrcImages = packSource
        .map((o) => o.path.split("/").pop())
        .filter((n) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(n));
    validateLicense(code, manifest, assets, publicFiles.map((f) => f.name), packSrcImages);

    // **git 원장 밖의 배송물이 없어야 한다.** 팩 소스는 위에서 이미 `git ls-files` 로 모으지만
    // `content/`·`public/` 은 디렉터리를 걸어서 모으므로, `.gitignore` 에 걸린 파일이 `git status` 가
    // 깨끗한 채 실릴 수 있다 — 오버레이에서 `.env.local` 로 실제 겪은 그 구멍이 이쪽에도 있었다.
    const tracked = trackedUnder(`presets/${code}`);
    const shipped = [
        ...publicFiles.map((f) => `presets/${code}/public${f.route}`),
        ...content.pages.map((p) => relative(ROOT, p.path)),
        ...(content.nav ? [relative(ROOT, content.nav.path)] : []),
    ];
    for (const path of shipped) {
        if (!tracked.has(path)) {
            fail("PRESET_UNTRACKED", `${path}: git 이 추적하지 않는 파일이 배송 대상입니다 — 커밋하거나 지우십시오`);
        }
    }
    return {code, seedBytes, manifest, assets, publicFiles, content, packSource};
}

function write(inspected, version, source, manual) {
    const {code, seedBytes, manifest, assets, publicFiles, content, packSource} = inspected;
    const slugs = content.pages.map((p) => p.slug);
    // 팩 v4: `src/` 는 **이 팩 것만** 들어간다(병합 없음 — 어느 줄이 어디서 왔는지 묻는 일이 없다).
    console.log(`    · 팩 소스 ${packSource.length}개 파일 (presets/${code}/src)`);
    const entries = [
        ...source,
        ...packSource,
        manual,
        // ── 레포 상주(사이트의 얼굴) ────────────────────────────────────────
        {path: "content/index.ts", bytes: Buffer.from(contentManifest(slugs), "utf8")},
        {
            path: "content/nav.json",
            bytes: content.nav?.bytes ?? Buffer.from(`{\n    "header": [],\n    "footer": []\n}\n`, "utf8"),
        },
        ...content.pages.map((p) => ({path: `content/pages/${p.slug}.json`, bytes: p.bytes})),
        ...publicFiles.map((f) => ({path: `public${f.route}`, bytes: f.bytes})),
        // ── 신원(팩이 자기 이름·버전을 말한다 · memo150 §8.1) ──────────────
        {path: MANIFEST_PATH, bytes: packManifestBytes(code, version)},
        // ── 전송(업무 데이터) ──────────────────────────────────────────────
        {path: ".zalkera/seed.json", bytes: seedBytes},
        {path: ".zalkera/ASSETS-LICENSE.md", bytes: Buffer.from(manifest, "utf8")},
        ...assets.map((a) => ({path: `.zalkera/assets/${a.name}`, bytes: a.bytes})),
    ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const buf = zip(entries);
    mkdirSync(OUT_DIR, {recursive: true});
    const out = join(OUT_DIR, `${code}-${version}.zip`);
    writeFileSync(out, buf);
    const sha = createHash("sha256").update(buf).digest("hex");
    console.log(`  ✓ ${relative(ROOT, out)}  ${(buf.length / 1024).toFixed(0)}KB  파일 ${entries.length}개`);
    console.log(`    sha256: ${sha}`);
    return {code, version, sha, path: out};
}

const args = process.argv.slice(2);
const versionFlag = args.indexOf("--version");
const version = versionFlag >= 0 ? args[versionFlag + 1] : undefined;
// `--version` 이 없으면 versionFlag 는 -1 이고 versionFlag+1 은 0 이 된다 — 그 자리를 그냥 제외하면
// 첫 위치인자(팩할 프리셋 코드)가 조용히 사라져 **항상 전체가 팩된다**. 플래그가 있을 때만 그 뒤를 건넌다.
const codes = args.filter((a, i) => !a.startsWith("--") && !(versionFlag >= 0 && i === versionFlag + 1));
const targets = codes.length
    ? codes
    : readdirSync(PRESETS_DIR, {withFileTypes: true})
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();

// **버전·코드는 팩 시작 전에 잰다**(memo150 §3.1). 종전에는 `--version` 이 무엇이든 파일명에만 찍혀서
// `--version 3.0.6-rc1` 같은 값이 그대로 zip 이름이 됐고, 그 오류가 적재 순간에야 드러났다. 이제 그 값은
// **바이트 안으로 들어가므로** 여기서 틀리면 그 zip 은 어차피 서버가 거부한다 — 몇 분짜리 게이트·빌드를
// 돌리기 전에 말하는 것이 맞다.
if (version === undefined) {
    console.error("--version 이 없습니다 — 팩 버전에는 기본값을 두지 않습니다.");
    console.error("  잊고 낮은 번호로 구우면 그것은 덮어쓰기가 아니라 **새 객체**입니다. promote 하면");
    console.error("  신규 테넌트가 그 판을 받고, 키가 {code}/{version}.zip 이라 되돌릴 수 없습니다.");
    console.error("");
    console.error("  다음 번호는 **이미 발행된 최신보다 높아야** 합니다. 이력은 원장이 갖고 있습니다:");
    console.error('    curl -s "$API/api/system/themes/<code>/artifacts" -H "Authorization: Bearer $TOKEN"');
    console.error("");
    console.error("  예: node scripts/pack-preset.mjs --version <x.y.z>");
    process.exit(1);
}
if (!VERSION_REGEX.test(version)) {
    console.error(`--version "${version}" 은 semver core(x.y.z)가 아닙니다 — 팩 매니페스트·원장이 받지 않는 형식입니다.`);
    console.error("  프리릴리스 태그(-rc1·+build)는 지금 계약(rev 1)에서 안 받습니다.");
    console.error("  앞자리 0 이 붙은 값도 안 받습니다 — 0 만 다른 값이 다른 객체가 되어 정본이 갈립니다.");
    process.exit(1);
}
if (version.length > MAX_VERSION_LENGTH) {
    // 백엔드 컬럼 폭이다. 여기서 안 막으면 팩은 성공하고 **적재가 400** 으로 죽는다.
    console.error(`--version 이 ${version.length}자입니다 — 상한 ${MAX_VERSION_LENGTH}자(theme_artifact.version).`);
    process.exit(1);
}

// 인자 검증은 git·파일시스템을 만지기 **전에** 끝낸다 — 아래 원장이 `sourceProvenance()` 를 부르므로,
// 이 검사가 뒤에 있으면 잘못된 코드 이름이 「더러운 트리」 오류에 가려진다.
for (const code of targets) {
    if (!CODE_REGEX.test(code)) {
        console.error(`프리셋 디렉터리 이름 "${code}" 은 팩 코드 형식(${CODE_REGEX.source})이 아닙니다 — 이 이름은 매니페스트·테마 코드로 그대로 갑니다.`);
        process.exit(1);
    }
}

/**
 * **설치본이 락파일과 같은가, 그리고 그 운반본의 지문은 무엇인가.**
 *
 * ■ 왜 이것이 관문인가
 *   zip 루트의 `llms.txt`(배송물 중 최대 파일)는 git 트리가 아니라 **설치된
 *   `node_modules/@zalkera/client`** 에서 바이트 그대로 실린다. `node_modules` 는 gitignore 라
 *   `git status --porcelain` 이 **못 본다.** 그래서 「깨끗한 트리」가 참인 채로 배송물이 갈릴 수
 *   있었다 — 실제로 이 레포의 정본 체크아웃이 설치본과 락파일이 어긋난 상태였다.
 *
 * ■ 두 겹으로 막는다
 *   ⑴ 설치본 버전이 락파일 핀과 다르면 여기서 멈춘다(`npm ci` 를 안 돌린 채 굽는 것).
 *   ⑵ 운반본 `llms.txt` 의 sha 를 원장에 적어, 같은 번호를 이어 구울 때 **같은 입력**임을
 *      증명하게 한다. 트리가 같아도 입력이 다르면 이어 굽기를 막는다.
 */
const clientState = (() => {
    // ⚠ `req("@zalkera/client/package.json")` 은 **안 된다** — 그 패키지의 `exports` 맵이
    //    `./package.json` 을 안 열어 둔다. 이미 존재가 보장된 운반본 경로에서 패키지 루트를 얻는다
    //    (`llmsManualEntry()` 와 같은 우회다).
    const req = createRequire(import.meta.url);
    let clientRoot;
    let installed;
    try {
        clientRoot = dirname(dirname(req.resolve("@zalkera/client/contracts/aeo-surface-guarantees.json")));
        installed = JSON.parse(readFileSync(join(clientRoot, "package.json"), "utf8")).version;
    } catch {
        console.error("@zalkera/client 를 못 찾았습니다 — 이 체크아웃에서 npm ci 를 먼저 돌리십시오.");
        process.exit(1);
    }
    let pinned = null;
    try {
        const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
        pinned = lock.packages?.["node_modules/@zalkera/client"]?.version ?? null;
    } catch {
        // 락파일이 없거나 형태가 다르면 대조할 잣대가 없다 — 그 사실을 아래에서 말한다.
    }
    const mismatch = clientMismatch(installed, pinned);
    if (mismatch) {
        console.error(mismatch);
        console.error("  zip 의 llms.txt 는 **설치본에서** 실립니다 — 이대로 구우면 낡은 명세가 전 테넌트로 갑니다.");
        console.error("  node_modules 는 gitignore 라 「깨끗한 트리」로 보여도 이 어긋남은 안 보입니다.");
        console.error("");
        console.error("  · npm ci 를 돌린 뒤 다시 구우십시오.");
        process.exit(1);
    }
    let llmsSha = null;
    try {
        llmsSha = createHash("sha256").update(readFileSync(join(clientRoot, "llms.txt"))).digest("hex");
    } catch {
        // 운반본이 없으면 `llmsManualEntry()` 가 뒤에서 LLMS_MISSING 으로 멈춘다. 여기서는 지문만 비운다.
    }
    return {version: installed, llmsSha};
})();
console.log(`  @zalkera/client ${clientState.version} (락파일 핀과 일치)`);

/**
 * **한 버전은 한 판본에서만 나온다.**
 *
 * 실제로 갈렸다: 한 프리셋만 다른 커밋에서 다시 구워졌는데 **`.zalkera/pack.json` 의 버전은 넷 다
 * 같았고**, `verify-zip` 도 통과시켰다. 그대로 승격하면 테넌트마다 다른 소스를 받는다. 사람 눈에만
 * 걸렸다 — 팩에는 자기가 어느 트리에서 나왔는지 적는 칸이 없기 때문이다.
 *
 * 매니페스트에는 못 넣는다: 백엔드 `PackManifestReader` 가 strict 파싱이라 키를 하나 더 넣는 순간
 * 그 zip 을 통째로 거부한다(계약 확장은 rev 상향으로만). 그래서 **zip 밖 원장**에 적는다.
 *
 * ■ 원장이 `dist-presets/` 밖에 사는 이유
 *   단조성 관문의 안내문이 「`dist-presets/` 를 비우십시오」라고 말한다. 원장이 그 안에 있으면
 *   **안내를 따르는 순간 감시자가 자기를 지운다** — 그러고 나면 갈린 판본을 아무도 못 잡는다.
 *   레포 루트에 두고 `.gitignore` 로 뺀다(로컬 기록인 것은 그대로다).
 *
 * ■ 이 검사가 단조성보다 **먼저** 서는 이유
 *   같은 버전을 다시 부르면 단조성이 `version <= localMax` 로 먼저 걸려, 원장은 판정 자체에
 *   도달하지 못했다. 그런데 「넷 중 하나만 구웠으니 나머지를 잇는다」는 **정상 작업**이다 —
 *   실제로 그것 때문에 두 판이 갈렸다. 순서를 뒤집어, 원장이 「같은 깨끗한 트리」를 증명하면
 *   그 이어 굽기를 통과시킨다. 같은 트리 + 같은 운반본이면 같은 바이트가 나온다(zip 타임스탬프가 고정이다).
 *
 * ⚠ 더러운 트리에서 구우면 커밋 sha 로 판본을 특정할 수 없다 — 그때는 `dirty` 를 기록하고,
 *   같은 버전에 이어 붙이는 것을 막는다.
 */
/**
 * 출처 원장의 자리. 시험이 **정본 원장을 갈아 끼우지 않도록** 경로를 주입받는다 — 종전에는
 * 시험이 진짜 원장을 지웠다 덮었다 하고 `finally` 로만 되돌려서, 중단되거나 두 판이 동시에
 * 돌면 원장이 사라졌다. 원장이 없으면 다음 굽기에서 갈림 관문이 **조용히 열린다**(fail-open).
 *
 * 주입이 뒷문이 되지 않게 **쓰면 큰 소리로 알린다** — 굽는 사람이 이 줄을 보고도 넘어갔다면
 * 그건 판단이지 사고가 아니다.
 */
const LEDGER = process.env.ZALKERA_PACK_LEDGER ?? join(ROOT, ".pack-provenance.json");
if (process.env.ZALKERA_PACK_LEDGER) {
    console.error(`⚠ 출처 원장을 정본이 아닌 곳에서 읽습니다: ${LEDGER}`);
    console.error("  ZALKERA_PACK_LEDGER 가 설정돼 있습니다 — 실제 굽기라면 이 변수를 지우십시오.");
}
const head = sourceProvenance();
const dirty = execFileSync("git", ["status", "--porcelain"], {cwd: ROOT}).toString("utf8").trim().length > 0;
const priorLedger = (() => {
    try {
        return JSON.parse(readFileSync(LEDGER, "utf8"));
    } catch {
        return {};
    }
})();
const prior = priorLedger[version];
// 원장을 손으로 고치는 것은 `LEDGER_SPLIT` 안내문이 시키는 정규 절차다. 그래서 형태를 한 번 잰다 —
// `codes` 가 문자열이면 병합이 글자 단위로 쪼개지고, 안내문을 찍는 `join` 이 그 전에 터진다.
const shapeError = ledgerShapeError(prior);
if (shapeError) {
    console.error(`원장의 ${version} 항목이 깨졌습니다 — ${shapeError}`);
    console.error(`  원장: ${LEDGER}`);
    process.exit(1);
}

/**
 * **여기 있는 것보다 낮은 번호로는 안 굽는다** — `dist-presets/` 에 이미 있는 최대 번호.
 *
 * ⚠ **이것은 원장이 아니다.** `dist-presets/` 는 gitignore 라 카탈로그의 상태를 모른다. 여기서
 *   막는 것은 「같은 자리에 이미 있는 것보다 낮게 굽기」뿐이고, 그보다 앞선 승격본이 원격에
 *   있으면 이 검사는 아무 말도 못 한다(그때는 `--version` 안내가 시키는 원장 조회가 유일한 답이다).
 *   그래도 실무에서 밟히는 형상은 대부분 이쪽이다 — 방금 구운 옆에 낮은 것을 얹는 것.
 */
const localMax = (() => {
    let best = null;
    let names = [];
    try {
        names = readdirSync(OUT_DIR);
    } catch {
        return null;
    }
    for (const name of names) {
        const m = /^(?:[a-z0-9][a-z0-9-]*)-(\d+\.\d+\.\d+)\.zip$/.exec(name);
        if (m && (best === null || cmpVersion(m[1], best) > 0)) best = m[1];
    }
    return best;
})();

// 판정은 `scripts/lib/pack-gate.mjs` 한 곳에만 있다 — 여기 있을 때 「같은 트리 이어굽기」 분기를
// 시험이 한 번도 못 밟았다(트리 상태와 폴더 상태에 동시에 매여 있었다). 문면만 여기서 만든다.
const decision = packGateDecision({
    version,
    localMax,
    prior,
    head,
    dirty,
    clientSha: clientState.llmsSha,
    allowRewind: args.includes("--allow-rewind"),
});
if (decision.code === "LEDGER_SPLIT") {
    console.error(`--version ${version} 은 이미 다른 트리에서 구워졌습니다 — 한 버전은 한 판본에서만 나옵니다.`);
    console.error(`  이미 있는 것: HEAD ${prior.head}${prior.dirty ? "(더러운 트리)" : ""} · client ${(prior.clientSha ?? "기록없음").slice(0, 12)} · ${(Array.isArray(prior.codes) ? prior.codes : []).join(", ")}`);
    console.error(`  지금:         HEAD ${head}${dirty ? "(더러운 트리)" : ""} · client ${(clientState.llmsSha ?? "없음").slice(0, 12)} · ${targets.join(", ")}`);
    console.error("");
    console.error("  섞인 채로 승격하면 테넌트마다 다른 소스를 받습니다. **번호를 올려** 구우십시오.");
    console.error(`  이 버전을 정말 다시 만들어야 하면 원장에서 ${version} 항목을 지우고 dist-presets/ 의`);
    console.error("  그 버전 zip 도 함께 지운 뒤, 네 벌을 한 번에 구우십시오.");
    console.error(`  원장: ${LEDGER}`);
    console.error("  ⚠ --allow-rewind 로는 이 관문을 못 비킵니다 — 갈린 판본은 사람이 승인할 성질이 아닙니다.");
    process.exit(1);
}
if (decision.code === "NOT_HIGHER") {
    console.error(`--version ${version} 은 dist-presets/ 에 이미 있는 ${localMax} 보다 높지 않습니다.`);
    console.error("  키가 {code}/{version}.zip 이라 낮은 번호는 덮어쓰기가 아니라 **새 객체**이고,");
    console.error("  promote 하면 신규 테넌트가 그 판을 받습니다. 되돌릴 수 없습니다.");
    console.error("");
    console.error("  · 다시 구우려면 dist-presets/ 를 비우거나 더 높은 번호를 주십시오.");
    console.error("  · 일부러 낮게 구워야 하면 --allow-rewind 를 붙이십시오(그 판단은 사람 몫입니다).");
    console.error("");
    console.error("  ⚠ 이 검사는 **로컬 폴더만** 봅니다 — 카탈로그의 최신은 원장이 압니다:");
    console.error('    curl -s "$API/api/system/themes/<code>/artifacts" -H "Authorization: Bearer $TOKEN"');
    process.exit(1);
}
if (decision.appendable) {
    console.log(`  같은 트리(${head})에서 ${version} 를 잇습니다 — 이미 구운 것: ${prior.codes.join(", ")}`);
}
const mergedCodes = mergeCodes(prior, targets);

console.log(`프리셋 팩 — version=${version}, 대상 ${targets.join(", ")}`);

const source = sourceEntries();
console.log(`  공용 프로젝트 배선 ${source.length}개 파일(git 추적 − src/·팩 도구·시드 원본) · HEAD ${head}`);

// ⚠ 소스 보안 불변식은 **실제로 배송되는 것**에 걸어야 한다(보안 심의 B4). 팩 v4 에서 그것은 각 팩의
//    `src/` 다 — 루트 `src/` 만 보면 규칙이 멀쩡한데도 대상이 안 들어가 통과한다(오버레이 시절 실측).
//    루트 `src/`(새 팩이 복사해 갈 원본)도 같이 본다 — 원본이 썩으면 다음 팩이 그것을 물려받는다.
validateSource([
    ...targets.flatMap((code) => packSourceEntries(code)),
    ...[...trackedUnder("src")].sort().map((path) => ({path, bytes: readFileSync(join(ROOT, path))})),
]);

// **배선 동일성**(오너 확정 2026-08-01) — 팩이 소스를 따로 갖는 대신, *틀리면 사고가 나는* 파일만
// 바이트로 잠근다. 얼굴이 갈리는 것은 의도이므로 재지 않는다. 판정은 `scripts/lib/wiring-parity.mjs`
// 한 곳에만 있다(`node scripts/lib/wiring-parity.mjs` 이 같은 함수를 부른다 — 검사기 사본이 갈리는 병의 재발 방지).
// 배송 문서·주석의 주장을 굽기 전에 잰다. CI 도 같은 검사기를 부르지만, **여기가 봉인 시점**이라
// 여기서 걸리는 편이 카탈로그에 올라간 뒤 아는 것보다 낫다. 정본 전용 검사기라 zip 에는 안 실린다.
try {
    execFileSync("node", [join(ROOT, "scripts/lib/doc-claims.mjs")], {cwd: ROOT, stdio: "inherit"});
} catch {
    fail("DOC_CLAIMS", "배송 문서·주석의 주장 검사에 걸렸습니다 — 위 출력을 보십시오");
}

problems.push(...checkWiringParity(ROOT));

// **방문자 IP 선언** — 배선 동일성이 못 보는 자리다(그쪽은 바이트 잠금이라 **얼굴**을 못 넣는다).
// 그런데 얼굴 안에 안전 배선 한 줄이 산다: 2026-08-10 발행 심의에서 skeleton 주문 상세 페이지의
// 선언이 빠진 채 팩이 구워졌고, 기계 검사도 CI 도 전부 초록이었다. **팩은 회수가 불가능**하므로
// 그 소스로 개시한 사이트는 영구히 그 상태가 된다 — 그래서 발행 직전에 한 번 더 선다.
problems.push(
    ...checkVisitorIp(ROOT).violations.map(
        (v) => `방문자 IP 선언 누락 — ${v.tree}/${v.file}: ${v.why}`,
    ),
);

const contract = sectionContract();
assertGuaranteesCarried();
// ⚠ **게이트 이전에** 확인한다(기능 심의 차단 1). 초판은 존재 확인이 `write()` 안에 있었는데
//    `problems` 게이트는 그 전에 소진되므로, `fail("LLMS_MISSING")` 이 push 돼도 **아무도 다시 보지
//    않았다** — exit 0 · zip 산출 · 메시지조차 미출력(실측 재현). 이 파일이 스스로 경고하는 그
//    "조용히 꺼지는 게이트"를 내가 만들었다. 게이트는 게이트가 소진되기 전에 서야 한다.
const llmsManual = llmsManualEntry();
// 아이콘 맵·예약 라우트는 **그 팩의 소스**에서 읽으므로 inspect 안에서 팩마다 구한다(팩 v4).
const inspected = targets.map((code) => inspect(code, contract));

if (problems.length) {
    console.error("\n팩 실패 — 게이트 위반(zip 을 하나도 쓰지 않았습니다):");
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
}

const packed = inspected.map((item) => write(item, version, source, llmsManual));

// **산출 직후 자기 zip 을 검수한다**(memo145 §7 T1-⑶ · 오너 확정 기본 on).
//
// 왜 여기냐: 이 스크립트의 게이트는 전부 **소스**를 잰다(시드·콘텐츠·에셋·배선). 그런데 2026-08-01 에
// 소스가 전부 통과한 zip 이 서빙 박스에서 반려됐다 — `.next/standalone/server.js` 가 안 나왔기 때문이고,
// 소스만 보는 검사로는 영원히 못 보는 축이었다. 산출물 축을 재려면 빌드가 필요하고, 빌드하는 검사기는
// 이미 있다(`verify-zip.mjs`). 없던 것은 **그 둘을 잇는 배선**뿐이었다.
//
// 기본이 on 인 이유: "절차 문서로 남기자"는 이번 사건이 이미 반증했다 — 문서는 안 돈다. 완화는
// 명시적으로 켜는 것이다(`--no-verify`, build.sh 의 GATE_MISSING_CHECKER 와 같은 원칙). 대가는 팩 시간이
// zip 당 수 분 늘어나는 것이고, 팩은 릴리스 행위라 그 비용을 치르는 것이 맞다.
//
// 실패해도 zip 은 지우지 않는다 — `--keep` 로 다시 돌려 원인을 봐야 하기 때문이다. 대신 **적재 안내를
// 찍지 않고** 종료코드 1 로 끝낸다(운영자가 마지막으로 읽는 줄이 curl 명령이라, 그것이 보이면 올린다).
if (!process.argv.includes("--no-verify")) {
    console.log(`\n산출물 검수 — 팩한 zip ${packed.length}개를 verify-zip 으로 실제 빌드해 봅니다(zip 당 수 분).`);
    console.log("  건너뛰려면 --no-verify (권장하지 않습니다 — 소스 게이트는 산출물 축을 못 봅니다).");
    const rejected = [];
    for (const p of packed) {
        console.log(`\n── verify-zip ${relative(ROOT, p.path)} ${"─".repeat(20)}`);
        // `--pack` — **카탈로그에 올릴 우리 산출물**이라는 선언(memo150 §8.2). 그 모드에서만 매니페스트가
        // 필수가 되고 파일명 대조가 선다. 외주 납품 zip 은 매니페스트 의무가 없으므로(§8.4) 플래그 없이
        // 부르는 쪽은 종전과 같다 — 이 러너는 카탈로그 입장권이 아니라 납품 검수기다.
        const r = spawnSync(process.execPath, [join(ROOT, "scripts/verify-zip.mjs"), p.path, "--pack"], {stdio: "inherit"});
        if (r.status !== 0) rejected.push(p);
    }
    if (rejected.length) {
        console.error(`\n팩 실패 — 산출된 zip ${rejected.length}개가 자기 검수를 통과하지 못했습니다:`);
        for (const p of rejected) console.error(`  ${relative(ROOT, p.path)} — 적재하지 마십시오`);
        console.error("  원인을 보려면: node scripts/verify-zip.mjs <zip> --keep");
        process.exit(1);
    }
}

// 레지스트리는 DB(theme + theme_artifact)다. 종전의 backend `site.presets` yaml 은 memo105 T3 에서
// 은퇴했는데 이 안내만 남아 있었다 — 운영자가 마지막으로 읽는 줄이라 틀린 채로 두면 그대로 따라 한다.
// ⚠ `-F "version=…"` 은 **일부러 없다**(memo150 §8.1). 버전의 정본은 zip 안 `.zalkera/pack.json` 이고,
//    서버는 폼 version 이 함께 오면 매니페스트와 대조해 다르면 거부한다. 안내에 남겨 두면 운영자가
//    "버전은 손으로 내는 것"이라는 틀린 심상을 계속 갖게 되는데, 그 심상이 이 트랜치가 죽인 결함군이다.
console.log("\n적재(업로드) — 본사 SUPER_ADMIN 권한(버전은 zip 안 .zalkera/pack.json 이 말합니다):");
for (const p of packed) {
    console.log(
        `  curl -X POST "$API/api/system/themes/${p.code}/artifacts" \\\n` +
            `    -H "Authorization: Bearer $TOKEN" \\\n` +
            `    -F "file=@${relative(ROOT, p.path)}" \\\n` +
            // 썸네일은 선택이다 — 이미지 0장인 프리셋(골격)에는 파일이 없고, 있는 줄 알고 복붙하면
            // curl 이 파일을 못 읽어 통째로 실패한다(심의 실측). 있는 것만 안내한다.
            (existsSync(join(PRESETS_DIR, p.code, "thumbnail.png"))
                ? `    -F "thumbnail=@presets/${p.code}/thumbnail.png" \\\n`
                : "") +
            `    -F "expectedSha256=${p.sha}"`,
    );
}
writeFileSync(
    LEDGER,
    `${JSON.stringify({...priorLedger, [version]: {head, dirty, clientSha: clientState.llmsSha, codes: mergedCodes}}, null, 2)}\n`,
);
console.log("\n공개(노출 전환) — 적재와 분리돼 있어 올린 것이 곧바로 개시 대상이 되지는 않습니다:");
for (const p of packed) {
    console.log(`  curl -X POST "$API/api/system/themes/${p.code}/artifacts/${p.version}/promote" -H "Authorization: Bearer $TOKEN"`);
}
