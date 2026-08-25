/**
 * **개발 서버 판정을 문다.**
 *
 * ■ 왜 생겼나
 *   `next build` 가 CSS 파싱 실패를 경고로만 내는 바람에, 미리보기가 안 뜨는 팩이 검수 12개 항목
 *   전부 초록으로 납품됐다. 그 구멍을 메운 것이 `judgeDevScript` 인데, 판정을 CLI 안 지역 코드로
 *   두면 **그 자리에 시험이 0건**이 된다 — 메운 구멍이 조용히 다시 열리는 형태다.
 *
 * ■ 왜 순수 함수만 재나
 *   띄우는 쪽(`runDevProbe`)은 실제 Next 설치가 있어야 재는데, 그 설치는 이 시험이 만들 수 있는
 *   것이 아니다(수백 MB·수십 초). 대신 관측→판정의 **모든 갈래**를 여기서 못 박고, 띄우기와
 *   판정의 배선은 실물 zip 검수가 확인한다.
 *
 * 사용: `node --test scripts/lib/devCompile.test.mjs`
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {judgeDevScript} from "./devCompile.mjs";

test("양성 통제군 — 200 이면 통과다", () => {
    // 이것이 없으면 「무엇이든 반려」 구현으로도 아래가 전부 초록이 된다.
    assert.equal(judgeDevScript({devScript: "next dev", status: 200}).verdict, "pass");
});

test("500 은 반려다 — 이 검사가 생긴 자리다", () => {
    const v = judgeDevScript({devScript: "next dev", status: 500, logTail: "Parsing CSS source code failed"});
    assert.equal(v.verdict, "fail");
    assert.match(v.why, /500/);
});

test("4xx 도 반려다 — 첫 화면은 서야 한다", () => {
    assert.equal(judgeDevScript({devScript: "next dev", status: 404}).verdict, "fail");
});

test("기동 중 종료하면 반려다 — 안 뜬 것을 미검사로 넘기지 않는다", () => {
    const v = judgeDevScript({devScript: "next dev", exitCode: 1, logTail: "boom"});
    assert.equal(v.verdict, "fail");
    assert.match(v.why, /exit 1/);
});

test("exit 0 으로 끝나도 반려다 — 서버는 안 끝난다", () => {
    // `exitCode: 0` 을 falsy 로 다루면 이 갈래가 통째로 «살아 있음»으로 새어 나간다.
    assert.equal(judgeDevScript({devScript: "next dev", exitCode: 0}).verdict, "fail");
});

test("dev 스크립트가 없으면 미검사다 — 통과가 아니다", () => {
    const v = judgeDevScript({});
    assert.equal(v.verdict, "skip");
    assert.notEqual(v.verdict, "pass");
});

test("빈 dev 스크립트는 «스크립트 없음»으로 읽는다 — 사유까지 못 박는다", () => {
    // ⚠ **판정만 재면 이 시험이 아무것도 안 문다.** 공백 스크립트를 «정의됨»으로 읽어도 띄우기가
    //   실패해 결국 `skip` 이라, `verdict` 만 보면 두 경로가 같아 보인다. 사유가 갈리는지까지
    //   봐야 그 완화를 잡는다.
    //   재현: `devCompile.mjs` 의 술어에서 `|| devScript.trim() === ""` 를 지우고
    //         `node --test scripts/lib/devCompile.test.mjs` → 이 시험 하나만 실패한다.
    const v = judgeDevScript({devScript: "   "});
    assert.equal(v.verdict, "skip");
    assert.match(v.why, /스크립트가 없다/);
});

test("두 «미검사» 사유는 서로 다른 문장이다 — 합치면 위 시험이 무뎌진다", () => {
    const noScript = judgeDevScript({}).why;
    const noAnswer = judgeDevScript({devScript: "vite", status: null}).why;
    assert.notEqual(noScript, noAnswer);
});

test("살아 있는데 안 답하면 미검사다 — 통과로 세지 않는다", () => {
    const v = judgeDevScript({devScript: "vite", status: null, exitCode: null});
    assert.equal(v.verdict, "skip");
    assert.match(v.why, /PORT/);
});

test("종료가 상태보다 먼저다 — 죽은 서버를 «안 답함»으로 눅이지 않는다", () => {
    // 죽으면 상태도 못 받는다. 두 관측이 같이 오면 «죽었다»가 이겨야 반려로 선다.
    assert.equal(judgeDevScript({devScript: "next dev", exitCode: 137, status: null}).verdict, "fail");
});

test("실패 사유에 서버 출력 꼬리를 싣는다 — 원인 없이 반려하지 않는다", () => {
    const v = judgeDevScript({devScript: "next dev", status: 500, logTail: "line1\nParsing CSS source code failed"});
    assert.match(v.why, /Parsing CSS source code failed/);
});

test("판정은 세 값뿐이다 — 오타 하나가 조용히 통과로 새지 않게", () => {
    const cases = [
        {},
        {devScript: "next dev", status: 200},
        {devScript: "next dev", status: 500},
        {devScript: "next dev", exitCode: 2},
        {devScript: "next dev", status: null},
    ];
    for (const c of cases) assert.ok(["pass", "fail", "skip"].includes(judgeDevScript(c).verdict), JSON.stringify(c));
});

test("인자가 없어도 던지지 않는다 — 판정 자리가 예외로 사라지면 안 된다", () => {
    assert.equal(judgeDevScript().verdict, "skip");
    assert.equal(judgeDevScript(null).verdict, "skip");
});

test("신호로 죽으면 반려다 — `code` 가 null 이라 첫 인자만 보면 «살아 있음»이 된다", () => {
    // 이 갈래가 없으면 OOM 킬러에 죽은 서버가 「안 답한다」로 눅어 **미검사**로 샌다.
    const v = judgeDevScript({devScript: "next dev", exitCode: null, exitSignal: "SIGKILL"});
    assert.equal(v.verdict, "fail");
    assert.match(v.why, /SIGKILL/);
});

test("종료·신호가 상태보다 먼저다 — 200 이 같이 와도 죽은 것이 이긴다", () => {
    assert.equal(judgeDevScript({devScript: "next dev", exitSignal: "SIGKILL", status: 200}).verdict, "fail");
    assert.equal(judgeDevScript({devScript: "next dev", exitCode: 0, status: 200}).verdict, "fail");
});

test("붙었는데 응답이 없으면 반려다 — strict 여부와 무관하다", () => {
    // 컴파일이 안 끝나는 소스는 미리보기가 안 뜬다는 점에서 500 과 결과가 같다.
    for (const strict of [true, false]) {
        assert.equal(judgeDevScript({devScript: "next dev", hung: true, strict}).verdict, "fail", `strict=${strict}`);
    }
});

test("다른 출처로 넘기면 통과가 아니다 — 남의 200 을 이 서버 성적으로 읽지 않는다", () => {
    assert.equal(judgeDevScript({devScript: "next dev", offsite: true}).verdict, "skip");
    assert.equal(judgeDevScript({devScript: "next dev", offsite: true, strict: true}).verdict, "fail");
});

test("strict 면 못 잰 자리가 반려다 — 아티팩트가 스스로 검사를 끄지 못한다", () => {
    // `--byo` 가 아닌 실행에서는 zip 이 `dev` 를 지우거나 포트를 박아 가드를 끌 수 없어야 한다.
    for (const obs of [{}, {devScript: "  "}, {devScript: "next dev -p 3000", status: null}]) {
        assert.equal(judgeDevScript({...obs, strict: true}).verdict, "fail", JSON.stringify(obs));
        assert.equal(judgeDevScript({...obs, strict: false}).verdict, "skip", JSON.stringify(obs));
    }
});

test("strict 반려 사유는 무엇을 하라는지 말한다 — 사유 없는 반려는 막다른 길이다", () => {
    assert.match(judgeDevScript({strict: true}).why, /next dev/);
    assert.match(judgeDevScript({devScript: "next dev -p 3000", status: null, strict: true}).why, /포트를 박지/);
});

test("실패 꼬리는 **끝**을 든다 — 배너가 아니라 오류가 남아야 한다", () => {
    // `.slice(0, 6)` 변이면 앞의 배너만 실려 사유가 쓸모없어진다.
    const log = ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "여기가 진짜 오류"].join("\n");
    assert.match(judgeDevScript({devScript: "next dev", status: 500, logTail: log}).why, /여기가 진짜 오류/);
    assert.equal(/b1/.test(judgeDevScript({devScript: "next dev", status: 500, logTail: log}).why), false);
});

test("500 사유는 백엔드 부재 가능성을 같이 말한다 — 거짓 반려로 읽히지 않게", () => {
    assert.match(judgeDevScript({devScript: "next dev", status: 500}).why, /fail-soft/);
});
