/**
 * **시험 한 판에서 스위트별 통과 수를 뽑는 리포터.**
 *
 * ■ 왜 있나
 *   하한 판정은 종전에 시험을 돌린 **뒤 스위트를 한 벌씩 다시** 돌려서 얻었다. 그 재실행이
 *   Test 스텝의 73%였고, 그중 절반 이상이 **단언 0건짜리 프로세스 기동**이었다(빈 `.ts` 자식 104ms ·
 *   빈 `.mjs` 자식 77ms). 직렬이라 코어를 늘려도 안 줄어든다 — 12코어 1,870ms 대 4코어 1,888ms.
 *
 *   node 러너가 `test:pass` 이벤트에 `file` 을 싣는다. 같은 정보를 한 번에 얻을 수 있다.
 *
 * ■ 무엇을 세나 — **`# pass N` 과 같은 것**
 *   ⑴ `details.type === "test"` 인 것만. 이 이벤트는 `suite` 에도 온다 — 중첩 `describe` 를 세면
 *      같은 스위트가 두 벌로 집계돼 하한이 부푼다.
 *   ⑵ **`skip`·`todo` 는 뺀다.** node 는 건너뛴 시험에도 `test:pass` 를 낸다 — 그것을 세면
 *      스위트를 통째로 `{skip: true}` 로 재우고도 하한을 통과한다. 가드를 지우는 것이 고치는 것보다
 *      쉬워지는 자리다.
 *      재현: 시험 셋(정상·skip·todo)짜리 파일에 `node --test -- <파일>` → `# pass 1` ·
 *      `# skipped 1` · `# todo 1`. 걸러내지 않은 리포터는 3 을 낸다.
 *   ⑶ `nesting` 은 안 본다. 중첩 `describe` 안의 정상 시험은 `# pass` 가 세므로 우리도 세야 한다.
 *   ⑷ 시험이 **하나도 없는 파일**이 자기 이름으로 내는 통과 1건도 뺀다. 종전 `# pass` 는 이것을
 *      셌으므로, 하한 1 짜리 스위트는 빈 파일로 갈아치워도 통과했다. 여기서만 종전보다 엄하다.
 *
 * ■ **이 리포터는 판정하지 않는다**
 *   파일별 통과 수를 `TSV` 로 stdout 에 낼 뿐이고, 하한과 대조하는 것은 `judgeFloors` 다.
 *   판정을 여기 두면 시험을 돌리는 모든 자리가 하한을 알아야 한다.
 *
 * 사용: `node --experimental-strip-types --test --test-reporter=./scripts/lib/floor-reporter.mjs …`
 */
import {resolve} from "node:path";

export default async function* floorReporter(source) {
    const pass = new Map();
    for await (const event of source) {
        if (event.type !== "test:pass") continue;
        const {file, name, skip, todo, details} = event.data;
        if (!file || details?.type !== "test") continue;
        // ⚠ **`skip`·`todo` 는 뺀다.** `skip` 은 `true` 또는 이유 문자열로 온다 — `!skip` 이 아니라
        //   `undefined` 인지로 거른다.
        if (skip !== undefined || todo !== undefined) continue;
        // ⚠ **시험이 하나도 없는 파일은 자기 «이름»으로 통과 한 건을 낸다.** 종전 `# pass N` 도
        //   똑같이 1 을 냈다 — 즉 하한 1 짜리 스위트는 **빈 파일로 갈아치워도** 통과한다.
        //   여기서 더 엄하게 간다.
        //
        //   ⚠ **`name === file` 로는 못 거른다.** 글롭으로 부르면 node 가 `name` 을 **상대경로**로,
        //   `file` 을 절대경로로 싣는다(파일을 절대경로로 직접 넘길 때만 둘이 같다). 문자열 비교로
        //   두면 실제 호출 형상에서 한 번도 안 걸린다. 경로로 맞춰서 묻는다.
        if (name && resolve(name) === file) continue;
        pass.set(file, (pass.get(file) ?? 0) + 1);
    }
    for (const [file, n] of [...pass].sort()) yield `${file}\t${n}\n`;
}
