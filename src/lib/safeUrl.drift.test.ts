/**
 * **소독기 사본 드리프트 검사** — 팩 로컬 `src/lib/safeUrl.ts` 와 `@zalkera/client` 의 같은 이름
 * 함수가 **같은 입력에 같은 판정**을 내는가.
 *
 * ## 왜 필요한가
 *
 * 같은 규칙이 두 곳에 산다: 이 레포의 `src/lib/safeUrl.ts`(고객이 소유하는 소스)와
 * `@zalkera/client` 의 운반본(`llms.txt` 가 정본 헬퍼로 지목한다). 한쪽만 고치면 다른 쪽이
 * 취약하게 남고, 문서가 취약한 쪽을 쓰라고 안내한다 — 실제로 그렇게 됐다.
 *
 * 사본을 하나로 합치는 것이 정석이지만, 레인 A(고객이 소스를 소유하고 고친다)에서는 로컬 사본이
 * 있는 것이 설계다. 그러면 **갈리는 것을 기계가 재는 수밖에 없다.**
 *
 * ## 오라클
 *
 * 적대 코퍼스를 양쪽에 태워 **출력이 아니라 안전성**을 비교한다 — 정규화 방식이 달라 문자열이
 * 갈릴 수는 있어도, "밖으로 나가는가"는 반드시 같아야 한다.
 *
 * 코퍼스가 비면 이 검사는 아무것도 안 하고 초록이 되므로 **하한을 건다.**
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {safeLinkUrl as local} from "./safeUrl.ts";
import {safeLinkUrl as vendored} from "@zalkera/client";

const BASE = "https://tenant.example";

/** 밖으로 나가면 true. 두 사본의 이 값이 갈리면 드리프트다. */
function escapes(value: string): boolean {
    try {
        return new URL(value, BASE).origin !== BASE;
    } catch {
        return false;
    }
}

/**
 * **내부로 남아야 하는** 값. 여기 있는 것이 밖으로 나가면 오픈 리다이렉트다.
 * 값을 지우지 마라 — 각각이 실제로 한 번 뚫렸던 형태다. 새 형태는 더하라.
 */
const MUST_STAY_INTERNAL = [
    // 파서가 제거하는 문자로 `//` 를 위장
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\r\n/evil.example",
    // 역슬래시 접기
    "/\\evil.example",
    "\\\\evil.example",
    // 정규화 뒤에야 이탈
    "/..//evil.example",
    "/%2e%2e//evil.example",
    "/a/b/../..//evil.example",
    "/./..//evil.example",
    // 고전
    "//evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    // 정상 — 과잉 차단도 드리프트다
    "/about",
    "/a/b?q=1#x",
    "#top",
    "?q=1",
];

/**
 * **밖으로 나가도 되는** 값. 메뉴는 외부 링크가 정당하므로 스킴 허용목록을 쓴다 —
 * 이 값들을 "이탈"로 세면 시험이 설계를 거스른다.
 */
const MAY_GO_EXTERNAL = ["https://example.com/a", "http://example.com/a", "mailto:a@b.com", "tel:+8210"];

const CORPUS = [...MUST_STAY_INTERNAL, ...MAY_GO_EXTERNAL];

test("드리프트 검사가 실제로 값을 본다(하한)", () => {
    assert.ok(CORPUS.length >= 18, `코퍼스가 ${CORPUS.length}개뿐이다 — 이 검사가 공허해진다`);
    // 소독기를 안 거치면 실제로 밖으로 나가는 표본이 충분히 있어야 한다. 없으면 무엇도 안 막는 셈이다.
    const escaping = MUST_STAY_INTERNAL.filter(escapes).length;
    assert.ok(escaping >= 6, `밖으로 나가는 표본이 ${escaping}개뿐이다 — 코퍼스가 무뎌졌다`);
});

test("팩 로컬과 @zalkera/client 의 safeLinkUrl 이 같은 안전성 판정을 낸다", () => {
    const drift: string[] = [];
    for (const raw of CORPUS) {
        const a = escapes(local(raw));
        const b = escapes(vendored(raw));
        if (a !== b) drift.push(`${JSON.stringify(raw)} — 로컬 ${a ? "이탈" : "안전"} · client ${b ? "이탈" : "안전"}`);
    }
    assert.deepEqual(drift, [], `소독기 사본이 갈렸다:\n  ${drift.join("\n  ")}`);
});

test("두 사본 모두 내부로 남아야 하는 값을 밖으로 내보내지 않는다", () => {
    for (const raw of MUST_STAY_INTERNAL) {
        assert.equal(
            escapes(local(raw)),
            false,
            `로컬이 밖으로 내보냈다: ${JSON.stringify(raw)} → ${JSON.stringify(local(raw))}`,
        );
        assert.equal(
            escapes(vendored(raw)),
            false,
            `client 가 밖으로 내보냈다: ${JSON.stringify(raw)} → ${JSON.stringify(vendored(raw))}`,
        );
    }
});

test("허용 스킴의 외부 링크는 두 사본 모두 살려 둔다 — 과잉 차단도 드리프트다", () => {
    for (const raw of MAY_GO_EXTERNAL) {
        assert.equal(local(raw), raw, `로컬이 정당한 외부 링크를 막았다: ${JSON.stringify(raw)}`);
        assert.equal(vendored(raw), raw, `client 가 정당한 외부 링크를 막았다: ${JSON.stringify(raw)}`);
    }
});
