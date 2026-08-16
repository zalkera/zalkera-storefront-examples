/**
 * zip 엔트리 목록에서 **산출물·의존성 최상위 디렉터리**를 찾는다. 순수 함수라 전수로 시험한다.
 *
 * 압축을 풀기 전에 판정하려고 있다 — 이런 zip 은 어차피 반려인데 먼저 풀면 그 크기만큼
 * 임시공간을 쓴다. 고객 트리를 통째로 담으면 190MB·엔트리 17,000개가 된다.
 */

/** 담기면 안 되는 최상위 이름. */
export const JUNK_TOP = ["node_modules", ".next", ".git"];

/**
 * @param entries `unzip -Z1` 의 줄들
 * @returns 발견된 최상위 이름(정렬·중복 제거). 비어 있으면 통과.
 */
export function junkTopLevel(entries) {
    const found = new Set();
    for (const raw of entries) {
        const line = raw.trim();
        if (!line) continue;
        // zip 은 `pack/node_modules/...` 처럼 한 겹 감싸일 수 있다. 앞 두 조각까지만 본다.
        const parts = line.split("/").filter(Boolean);
        for (const p of parts.slice(0, 2)) {
            if (JUNK_TOP.includes(p)) found.add(p);
        }
    }
    return [...found].sort();
}
