/**
 * **측정 자식에게 줄 환경.**
 *
 * ■ 왜 파일로 나왔나
 *   이 규율은 `verify-zip.mjs` 안의 지역 함수였고, 시험은 그 규율을 **베껴 적은 사본**을 재고
 *   있었다. 사본은 넷 중 둘만 지웠다 — 즉 나머지 둘을 목록에서 빼도 아무도 안 죽었다. 그중
 *   `NEXT_PUBLIC_*_PREVIEW` 는 **빌드의 뜻을 바꾼다**: 미리보기 빌드를 상용인 줄 알고 재게 된다.
 *
 * ■ 무엇을 지우나 — 값이 아니라 **뜻**이 달라지는 것들
 *   · `NODE_TEST_CONTEXT` — node 러너가 자식 모드로 돌아 `# pass N` 요약 줄을 안 낸다. 그러면
 *     하한 파싱이 `-1` 이 되어 **멀쩡한 팩이 전 스위트 0/하한으로 거짓 반려**된다.
 *     재현: `NODE_TEST_CONTEXT=child-v8 node --experimental-strip-types --test <시험파일> | grep '^# pass'`
 *     → 무출력
 *   · `NODE_OPTIONS` — 자식 node 에 임의 플래그를 주입한다.
 *   · `NEXT_PUBLIC_ZALKERA_PREVIEW` · `NEXT_PUBLIC_ONEQUE_PREVIEW` — 미리보기 판별자가 읽는다.
 *     이름이 둘인 것은 개명 과도기 때문이고, **한쪽만 지우면 다른 쪽으로 그대로 샌다.**
 */

/** 자식에게 물려주면 **판정이 바뀌는** 변수들. */
export const INHERITED_NOISE = [
    "NODE_TEST_CONTEXT",
    "NODE_OPTIONS",
    "NEXT_PUBLIC_ZALKERA_PREVIEW",
    "NEXT_PUBLIC_ONEQUE_PREVIEW",
];

/** 상속 잡음을 지우고 선언한 값만 얹는다. */
export function childEnv(extra = {}, base = process.env) {
    const env = {...base, ...extra};
    for (const k of INHERITED_NOISE) delete env[k];
    return env;
}
