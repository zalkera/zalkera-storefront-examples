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
 * 적대 코퍼스. **여기 값을 지우지 마라** — 각각이 실제로 한 번 뚫렸던 형태다.
 * 새 형태를 발견하면 더하라(줄이는 방향으로만 고치지 마라).
 */
const CORPUS = [
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
    "https://evil.example/x",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    // 정상 — 과잉 차단도 드리프트다
    "/about",
    "/a/b?q=1#x",
    "#top",
    "?q=1",
    "mailto:a@b.com",
    "tel:+8210",
];

test("드리프트 검사가 실제로 값을 본다(하한)", () => {
    assert.ok(CORPUS.length >= 20, `코퍼스가 ${CORPUS.length}개뿐이다 — 이 검사가 공허해진다`);
    const escaping = CORPUS.filter(escapes).length;
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

test("두 사본 모두 어떤 코퍼스 값도 밖으로 내보내지 않는다", () => {
    for (const raw of CORPUS) {
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
