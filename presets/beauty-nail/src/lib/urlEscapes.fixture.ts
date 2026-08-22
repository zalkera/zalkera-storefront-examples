/**
 * **URL 소독기 회귀 픽스처 — 시험 둘이 나눠 쓴다.**
 *
 * `safeUrl.test.ts`(중립 배선)와 `oauthPath.test.ts`(로그인 능력)가 같은 입력으로 재야 한다.
 * 두 파일에 베껴 두면 한쪽만 늘어나 **같은 이름의 시험이 다른 것을 재는** 상태가 된다.
 *
 * ⚠ **여기에 `test()` 를 두지 마라.** 시험 파일이 이 모듈을 import 하므로, 여기 시험이 있으면
 *   양쪽 실행에 각각 등재되어 통과 수가 부풀고 하한 판정이 거짓이 된다.
 *
 * 든 형태는 전부 **고치기 전 판에서 실제로 뚫렸던** 것이다. 문자 목록으로 막지 마라 —
 * `//`·`/\\`·`/%2e%2e//`·`/a/b/../..//`·`/./..//` 가 전부 같은 값으로 정규화된다.
 */
export const ESCAPES = [
    "//evil.example",
    "/\\evil.example",
    "/..//evil.example",
    "/a/b/../..//evil.example",
    "/%2e%2e//evil.example",
    "/./..//evil.example",
    "/..//evil.example/path?x=1#frag",
    "/../..//evil.example",
];

export const INTERNAL = ["/about", "/products/1", "/a/b/../c", "/search?q=1", "/page#top", "/"];
