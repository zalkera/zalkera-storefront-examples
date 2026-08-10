#!/usr/bin/env node
/**
 * `visitor-ip-parity.mjs` 회귀 픽스처.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 이 검사기는 **여섯 라운드 연속으로 수정됐고, 매 라운드 새 구멍이 나왔다.** 그때마다 검증은
 * 임시 픽스처로 했고 커밋되지 않아 증발했다 — 그래서 같은 형태가 다음 라운드에 조용히 되살아났다.
 * 실제로 5차에 닫은 shorthand 구멍이 6차에 **부분 재개방**됐고, 그것을 잡은 것도 사람이 아니라
 * 심의가 지어 본 픽스처였다.
 *
 * 여기 든 형태는 전부 **실제로 한 번은 뚫렸거나 잘못 잡혔던 것**이다. 추측으로 만든 것이 아니다.
 *
 * ## 판정의 두 축 — 둘 다 비싸다
 *
 * - **미탐**(잡아야 하는데 통과): 위조 가능한 IP 가 팩 4벌에 실려도 CI 가 초록이다.
 * - **오탐**(정상인데 잡음): 우리 CI 가 이유 없이 막힌다. 이 검사기는 고객에게 배송되지 않으므로
 *   오탐의 반경은 우리 레포뿐이지만, 막힌 사람은 검사기를 끄고 싶어진다 — 끄이는 검사기는 없는
 *   검사기보다 나쁘다.
 *
 * 실행: `node scripts/lib/visitor-ip-parity.test.mjs`
 */
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {checkVisitorIp} from "./visitor-ip-parity.mjs";

/** 클라이언트 바인딩. 이게 없으면 파일이 스캔 대상이 아니다(고객 자기 함수 오탐 방지). */
const CLI = 'import {visitorIp} from "@zalkera/client";\nimport {zalkera} from "@/lib/zalkera";\n';
/** 출처가 해소된 정상 호출 한 줄 — "정상 옆에 위조" 형태를 만들 때 쓴다. */
const OK = 'export const ok = async () => zalkera.getShipment("b", {context: {clientIp: visitorIp(await headers())}});\n';

/** [이름, 소스, 잡혀야 하는가] */
const CASES = [
    // ── 진짜 위반 — 잡아야 한다 ────────────────────────────────────────────────
    ["선언 자체가 없다", CLI + 'export default () => zalkera.getOrder("a");', true],
    ["첫 홉 손추출", CLI + 'export default () => zalkera.getOrder("a", {context: {clientIp: h.get("x-forwarded-for").split(",")[0]}});', true],
    ["첫 홉 손추출 → shorthand", CLI + 'const clientIp = h.get("x-forwarded-for").split(",")[0];\nexport default () => zalkera.getOrder("a", {context: {clientIp}});', true],
    ["출처불명 shorthand", CLI + 'export default () => zalkera.getOrder("a", {context: {clientIp}});', true],
    ["상수 위조", CLI + 'const clientIp = "0.0.0.0";\nexport default () => zalkera.getOrder("a", {context: {clientIp}});', true],
    ["대문자 헤더", CLI + 'export default () => zalkera.getOrder("a", {context: {clientIp: h.get("X-Forwarded-For")}});', true],
    ["x-real-ip", CLI + 'export default () => zalkera.getOrder("a", {context: {clientIp: h.get("x-real-ip")}});', true],
    ["계산된 헤더 이름", CLI + 'export default () => zalkera.getOrder("a", {context: {clientIp: h.get(`x-forwarded-${"for"}`)}});', true],
    // 5차에 닫았다가 6차에 부분 재개방됐던 계열 — 정상 한 줄이 옆에 있어도 각각 따로 봐야 한다
    ["정상 옆에 위조 shorthand", CLI + 'const clientIp = h.get("x-forwarded-for").split(",")[0];\nexport const a = () => zalkera.getOrder("a", {context: {clientIp}});\n' + OK, true],
    // 구조분해가 **값을 만드는** 경우 — 형태만 보고 면제하면 여기서 새어 나간다
    ["요청 본문 구조분해", CLI + 'const {clientIp} = await req.json();\nexport default () => zalkera.getOrder("a", {context: {clientIp}});', true],
    ["쿼리스트링 구조분해", CLI + 'const {clientIp} = Object.fromEntries(url.searchParams);\nexport default () => zalkera.getOrder("a", {context: {clientIp}});', true],
    ["정상 옆에 본문 유래 구조분해", CLI + 'const {clientIp} = await req.json();\nexport const a = () => zalkera.getOrder("a", {context: {clientIp}});\n' + OK, true],
    ["파라미터형인데 파일에 출처가 없다", CLI + 'const send = ({clientIp}: {clientIp: string}) => zalkera.submitInquiry({}, {clientIp});\nexport default () => send(data);', true],
    // 호출 형태를 바꿔 스캔을 피하려는 것들
    ["대괄호 접근", CLI + 'export default () => zalkera["getOrder"]("a");', true],
    ["별칭", CLI + 'const go = zalkera.getOrder;\nexport default () => go("a");', true],
    ["옵셔널 체이닝", CLI + 'export default () => zalkera?.getOrder?.("a");', true],
    ["구조분해 호출", CLI + 'const {getOrder} = zalkera;\nexport default () => getOrder("a");', true],
    ["후행 주석으로 위장", CLI + 'export default () => zalkera.getOrder("a"); // clientIp', true],
    ["visitorIp 가 딴 용도로만 있다", CLI + 'const other = visitorIp(h);\nexport default () => zalkera.getOrder("a", {context: {clientIp: h.get("x-forwarded-for")}});', true],

    // ── 정상 — 잡으면 안 된다 ─────────────────────────────────────────────────
    ["직접 호출", CLI + 'export default async () => zalkera.getOrder("a", {context: {clientIp: visitorIp(await headers())}});', false],
    ["변수 경유", CLI + 'const ip = visitorIp(h);\nexport default () => zalkera.getOrder("a", {context: {clientIp: ip}});', false],
    ["조건부 대입", CLI + 'let ip; if (x) ip = visitorIp(h);\nexport default () => zalkera.getOrder("a", {context: {clientIp: ip}});', false],
    ["출처가 해소된 shorthand", CLI + 'const clientIp = visitorIp(h);\nexport default () => zalkera.getOrder("a", {context: {clientIp}});', false],
    ["이미 만들어진 것을 읽는 구조분해", CLI + 'export default async () => { const {clientIp} = access.context; return zalkera.getOrder("a", {context: {clientIp: visitorIp(await headers())}}); };', false],
    ["파라미터 구조분해 + 파일에 출처 있음", CLI + 'function log({clientIp}: {clientIp: string}) {}\n' + OK, false],
    ["타입 표기", CLI + 'type A = {context: {clientIp: string}};\n' + OK, false],
    ["타입 표기 union", CLI + 'type A = {clientIp: string | undefined};\n' + OK, false],
    ["URL 이 든 정상 코드", CLI + 'const u = "https://x.example/a"; // 주석\nexport default async () => zalkera.getOrder(u, {context: {clientIp: visitorIp(await headers())}});', false],
    // 우리 클라이언트를 안 쓰는 파일은 대상이 아니다 — 고객 코드에 낼 수 있는 최악의 오탐이었다
    ["고객 자기 DB 계층", 'const repo = db.orders;\nexport const g = (id) => repo.getOrder(id);', false],
    ["타입만 가져다 쓰는 파일", 'import type {OrderSummary} from "@zalkera/client";\nimport {repo} from "@/db";\nexport const l = (id) => repo.getOrder(id);', false],
    ["동명 지역 헬퍼", 'const {cancelOrder} = helpers;\nexport default () => cancelOrder("a");', false],
];

const root = mkdtempSync(join(tmpdir(), "visitor-ip-fixtures-"));
mkdirSync(join(root, "src", "app"), {recursive: true});
let failed = 0;

for (const [name, source, shouldFlag] of CASES) {
    writeFileSync(join(root, "src", "app", "case.tsx"), source);
    const flagged = checkVisitorIp(root).violations.length > 0;
    if (flagged !== shouldFlag) {
        failed += 1;
        console.error(`  ✗ ${name} — ${flagged ? "잡혔다" : "통과했다"}(기대: ${shouldFlag ? "잡힘" : "통과"})`);
    }
}
rmSync(root, {recursive: true, force: true});

if (failed > 0) {
    console.error(`\n방문자 IP 검사기 픽스처 ${failed}건 실패 — 판정이 바뀌었다.`);
    console.error("의도한 변경이면 이 파일의 기대값을 같이 고쳐라. **기대값을 안 고치고 통과시키지 마라** —");
    console.error("이 파일이 있는 이유가 그 조용한 회귀를 막는 것이다.");
    process.exit(1);
}
console.log(`방문자 IP 검사기 픽스처 통과 — ${CASES.length}형태(위반 ${CASES.filter((c) => c[2]).length} · 정상 ${CASES.filter((c) => !c[2]).length})`);
