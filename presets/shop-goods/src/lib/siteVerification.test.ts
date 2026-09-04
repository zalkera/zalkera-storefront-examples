/**
 * **소유확인 메타가 실제로 무엇을 내는가.**
 *
 * ■ 왜 생겼나
 *   이 배선이 조용히 죽으면 테넌트는 콘솔에 값을 넣고 재빌드까지 기다린 뒤 **각 도구에서 「확인
 *   실패」만** 본다 — 화면은 멀쩡하고 로그도 조용하다. 그래서 「값이 있으면 나온다」와 「없으면
 *   안 나온다」를 **둘 다** 잰다: 앞쪽만 재면 항상 태그를 내는 코드가 통과하고, 뒤쪽만 재면
 *   아무것도 안 내는 코드가 통과한다.
 *
 * ■ 입력이 아니라 **반환한 형상**을 본다
 *   `process.env` 를 세는 것으로는 못 잰다 — 읽어 놓고 버리는 코드가 초록이 된다.
 *   여기서는 함수를 실제로 부르고 나온 객체의 키·값을 확인한다.
 *
 * 재현: `npm test`
 */
import assert from "node:assert/strict";
import test from "node:test";
import {siteVerification} from "./site.ts";

const NAMES = [
    "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
    "NEXT_PUBLIC_NAVER_SITE_VERIFICATION",
    "NEXT_PUBLIC_BING_SITE_VERIFICATION",
] as const;

/** 세 이름을 지운 상태에서 주어진 것만 세팅하고 부른다 — 남은 env 가 옆 시험을 오염시키지 않는다. */
function withEnv(values: Partial<Record<(typeof NAMES)[number], string>>) {
    const saved = NAMES.map((n) => [n, process.env[n]] as const);
    for (const n of NAMES) delete process.env[n];
    for (const [n, v] of Object.entries(values)) process.env[n] = v;
    try {
        return siteVerification();
    } finally {
        for (const [n, v] of saved) {
            if (v === undefined) delete process.env[n];
            else process.env[n] = v;
        }
    }
}

test("셋 다 비면 verification 키 자체가 없다", () => {
    assert.equal(withEnv({}), undefined);
    // 빈 문자열·공백만도 「없음」이다 — 빈 content 는 각 도구의 검증에서 실패로 잡힌다.
    assert.equal(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "   "}), undefined);
});

test("구글 토큰은 verification.google 로 나간다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gtok"}), {google: "gtok"});
});

test("네이버·Bing 은 각 도구가 정한 meta 이름으로 나간다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok"}), {
        other: {"naver-site-verification": "ntok"},
    });
    // Bing 은 `bing-site-verification` 이 아니다 — 이름을 틀리면 태그는 나가고 확인은 안 된다.
    assert.deepEqual(withEnv({NEXT_PUBLIC_BING_SITE_VERIFICATION: "btok"}), {
        other: {"msvalidate.01": "btok"},
    });
});

test("셋을 같이 넣으면 셋 다 나간다 — 하나가 다른 것을 가리지 않는다", () => {
    assert.deepEqual(
        withEnv({
            NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "gtok",
            NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok",
            NEXT_PUBLIC_BING_SITE_VERIFICATION: "btok",
        }),
        {google: "gtok", other: {"naver-site-verification": "ntok", "msvalidate.01": "btok"}},
    );
});

test("앞뒤 공백은 벗긴다 — 붙여넣기가 흔하다", () => {
    assert.deepEqual(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "  gtok\n"}), {google: "gtok"});
});

test("메타 태그 전문을 넣으면 버린다 — 값이 틀린 태그보다 없는 태그가 낫다", () => {
    const pasted = '<meta name="google-site-verification" content="gtok" />';
    assert.equal(withEnv({NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: pasted}), undefined);
    // 한 값이 나빠도 나머지는 산다 — 하나 때문에 셋이 같이 죽으면 원인이 안 보인다.
    assert.deepEqual(
        withEnv({
            NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: pasted,
            NEXT_PUBLIC_NAVER_SITE_VERIFICATION: "ntok",
        }),
        {other: {"naver-site-verification": "ntok"}},
    );
});
