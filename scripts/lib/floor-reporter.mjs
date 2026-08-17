/**
 * **`npm test` 한 번에서 스위트별 통과 수를 뽑는 리포터.**
 *
 * ■ 왜 있나
 *   하한 판정은 종전에 `npm test` 를 돌린 **뒤 스위트를 한 벌씩 다시** 돌려서 얻었다. 그 재실행이
 *   Test 스텝의 73%였고, 그중 절반 이상이 **단언 0건짜리 프로세스 기동**이었다(빈 `.ts` 자식 104ms ·
 *   빈 `.mjs` 자식 77ms). 직렬이라 코어를 늘려도 안 줄어든다 — 12코어 1,870ms 대 4코어 1,888ms.
 *
 *   node 러너가 `test:pass` 이벤트에 `file` 을 싣는다. 같은 정보를 한 번에 얻을 수 있다.
 *
 * ■ 무엇을 세나
 *   **최상위 시험만**(`nesting === 0`). 중첩 `describe` 안의 시험까지 세면 같은 스위트가 두 벌로
 *   집계돼 하한이 부풀고, 그 부풀린 값은 시험을 지워도 안 내려간다.
 *
 * ■ **이 리포터는 판정하지 않는다**
 *   파일별 통과 수를 `TSV` 로 stdout 에 낼 뿐이고, 하한과 대조하는 것은 `judgeFloors` 다.
 *   판정을 여기 두면 `npm test` 를 부르는 모든 자리가 하한을 알아야 한다.
 *
 * 사용: `node --experimental-strip-types --test --test-reporter=./scripts/lib/floor-reporter.mjs …`
 */
export default async function* floorReporter(source) {
    const pass = new Map();
    for await (const event of source) {
        if (event.type !== "test:pass") continue;
        const {file, nesting} = event.data;
        if (!file || nesting !== 0) continue;
        pass.set(file, (pass.get(file) ?? 0) + 1);
    }
    for (const [file, n] of [...pass].sort()) yield `${file}\t${n}\n`;
}
