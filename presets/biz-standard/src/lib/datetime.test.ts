import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
    DAY_KEY_OFFSET,
    SITE_TIME_ZONE,
    dayKey,
    formatDate,
    formatDateTime,
    formatDayKey,
    formatTime,
} from "./datetime.ts";

/**
 * **재는 것은 「기계의 시간대가 바뀌어도 같은 답을 내는가」** 하나다.
 *
 * ⚠ 한 시간대에서만 도는 시험은 이 부류를 **못 잡는다** — `timeZone` 을 통째로 지워도
 * `TZ=Asia/Seoul` 기계에서는 전부 초록이다. 그래서 아래 시험은 **자식 프로세스를 다른 `TZ` 로
 * 띄워** 출력을 대조한다. 그것이 이 파일의 요점이다.
 *
 * 씨앗은 셋이다: ⑴ 낮 시각(어긋나도 날짜는 안 바뀜) ⑵ **자정 경계**(날짜가 바뀜)
 * ⑶ 늦은 밤(동쪽 끝에서 날짜가 밀림).
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** 이 기계의 `TZ` 를 바꿔 같은 계산을 다시 시킨다. 출력이 갈리면 시간대가 안 못박힌 것이다. */
function underTz(tz: string, expr: string): string {
    return execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", expr], {
        env: {...process.env, TZ: tz},
        cwd: HERE,
        encoding: "utf8",
    }).trim();
}

const ZONES = ["UTC", "Asia/Seoul", "Pacific/Kiritimati", "Pacific/Honolulu", "America/New_York"];

/**
 * 씨앗 기준일. **어느 날이든 되지만 셋의 «성질»은 지켜야 한다** —
 * ⑴ 낮(어긋나도 날짜는 안 바뀜) ⑵ **가게 시계의 자정 경계**(날짜가 바뀜) ⑶ 늦은 밤(동쪽 끝에서 밀림).
 * 리터럴을 여기 한 번만 둔다.
 */
const YEAR = "2026";
const DAY = `${YEAR}-09-11`;
const PREV = `${YEAR}-09-10`;

/** 낮 14:00 KST · 자정 00:00 KST · 늦은 밤 22:00 KST (전부 UTC 로 적는다) */
const SEEDS = [`${DAY}T05:00:00Z`, `${PREV}T15:00:00Z`, `${DAY}T13:00:00Z`];

test("표시 함수 넷이 기계 시간대와 무관하게 같은 답을 낸다", () => {
    const expr = `
        const m = await import("./datetime.ts");
        const seeds = ${JSON.stringify(SEEDS)};
        console.log(JSON.stringify(seeds.map((s) => [m.formatDate(s), m.formatDateTime(s), m.formatTime(s), m.dayKey(s)])));
    `;
    const baseline = underTz("Asia/Seoul", expr);
    for (const tz of ZONES) {
        assert.equal(underTz(tz, expr), baseline, `TZ=${tz} 에서 답이 갈렸다 — timeZone 이 안 박혔다`);
    }
    // 통제군 — 자식이 실제로 값을 냈는가(빈 출력이면 위 단언이 공허참이다).
    assert.ok(baseline.includes("2026"), `자식이 값을 못 냈다: ${baseline}`);
});

test("달력 칸 라벨도 기계 시간대와 무관하다 — 키를 되읽는 자리가 동쪽 끝에서 밀리지 않는다", () => {
    const expr = `
        const m = await import("./datetime.ts");
        console.log(m.formatDayKey("${DAY}", {month: "numeric", day: "numeric", weekday: "short"}));
    `;
    const baseline = underTz("Asia/Seoul", expr);
    for (const tz of ZONES) {
        assert.equal(underTz(tz, expr), baseline, `TZ=${tz} 에서 달력 라벨이 갈렸다`);
    }
    assert.match(baseline, /9\. 11\./, `라벨이 기대 모양이 아니다: ${baseline}`);
});

test("가게 시계로 말한다 — KST 자정 마감은 그 날짜로 찍힌다(값 단언)", () => {
    // 이 값이 UTC 로 새면 하루 전으로 찍힌다 — 마감이 당겨져 고객이 주문을 잃는다.
    const midnightKst = `${PREV}T15:00:00Z`;
    assert.match(formatDateTime(midnightKst), /9\. 11\./);
    assert.match(formatDate(midnightKst), /9\. 11\./);
    assert.equal(dayKey(midnightKst), DAY);
});

test("14시 슬롯은 14시로 보인다 — 방문자 시간대로 미끄러지지 않는다", () => {
    assert.match(formatTime(`${DAY}T05:00:00Z`), /2:00|14:00/);
});

test("호출자가 옵션으로 timeZone 을 덮을 수 있다 — 다만 기본은 가게 시계다", () => {
    // 기본값을 스프레드 앞에 둔 덕이다. 이 자리가 뒤집히면 호출자 옵션이 조용히 무시된다.
    const midnightKst = `${PREV}T15:00:00Z`;
    assert.notEqual(formatDate(midnightKst, {timeZone: "UTC"}), formatDate(midnightKst));
});

test("dayKey 는 로케일이 아니라 ISO 모양을 낸다 — 키라서 그렇다", () => {
    assert.match(dayKey(`${DAY}T05:00:00Z`), /^\d{4}-\d{2}-\d{2}$/);
});

test("DAY_KEY_OFFSET 이 SITE_TIME_ZONE 의 «그» 오프셋이다 — 날짜가 아니라 시각으로 잰다", () => {
    // ⚠ **날짜만 대조하면 헐겁다.** 오프셋을 `+00:00` 으로 바꿔도 자정 근처가 아닌 한
    //   날짜는 안 밀려서 초록이 된다. 그래서 **자정이 자정으로 보이는가**를 잰다 —
    //   오프셋이 한 시간이라도 어긋나면 여기서 즉시 깨진다.
    const midnight = new Date(`${DAY}T00:00:00${DAY_KEY_OFFSET}`);
    const asStoreClock = midnight.toLocaleString("sv-SE", {timeZone: SITE_TIME_ZONE});

    assert.equal(
        asStoreClock,
        `${DAY} 00:00:00`,
        `오프셋 ${DAY_KEY_OFFSET} 이 ${SITE_TIME_ZONE} 의 오프셋과 다르다 — 달력 칸이 밀린다`,
    );
});

test("연중 어느 날이든 오프셋이 맞는다 — 서머타임을 쓰는 시간대로 바꾸면 여기서 깨진다", () => {
    // KST 는 DST 가 없어 오프셋이 상수다. 그 전제가 깨지는 시간대로 옮기면 `DAY_KEY_OFFSET`
    // 이라는 **상수 하나**로는 표현할 수 없다 — 그 사실이 조용히 지나가지 않게 잠근다.
    for (const md of ["01-15", "04-01", "07-15", "10-30", "12-31"]) {
        const ymd = `${YEAR}-${md}`;
        assert.equal(
            new Date(`${ymd}T00:00:00${DAY_KEY_OFFSET}`).toLocaleString("sv-SE", {timeZone: SITE_TIME_ZONE}),
            `${ymd} 00:00:00`,
            `${ymd} 에서 오프셋이 어긋난다 — 이 시간대는 상수 오프셋이 아니다`,
        );
    }
});

/**
 * **소유자가 하나임을 강제한다.**
 *
 * 위 시험들은 이 파일의 함수가 옳다는 것만 잰다 — 누가 그 함수를 **안 쓰고** `toLocale*` 을
 * 직접 부르면 아무 데서도 안 걸린다. 실제로 그렇게 5곳이 시간대 없이 배송됐다(3.5.0 심의).
 *
 * 그래서 트리를 훑어 **소유자 밖의 Date 포맷 호출**을 센다. 금액(`Number.toLocaleString`)은
 * 시간대와 무관하므로 `new Date(...)` 에 붙은 것만 본다.
 */
test("Date 를 포맷하는 자리가 이 파일 밖에 없다 — 시간대는 한 곳이 정한다", async () => {
    const {readdirSync, readFileSync, statSync} = await import("node:fs");
    const {join, relative} = await import("node:path");
    const {fileURLToPath} = await import("node:url");

    const SRC = join(fileURLToPath(new URL("../..", import.meta.url)), "src");
    /** 소유자와 그 시험만 면제한다. 면제를 늘리려면 **왜 그 파일이 시간대를 스스로 정하는지** 적어라. */
    const OWNERS = new Set(["lib/datetime.ts", "lib/datetime.test.ts"]);

    const files: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(ts|tsx)$/.test(name)) files.push(full);
        }
    };
    walk(SRC);

    // 통제군 — 트리를 못 읽으면 아래 단언이 공허참이다.
    assert.ok(files.length > 40, `소스를 ${files.length}개만 찾았다 — 훑기가 죽었다`);

    const offenders: string[] = [];
    for (const file of files) {
        const rel = relative(SRC, file).split("\\").join("/");
        if (OWNERS.has(rel)) continue;
        const text = readFileSync(file, "utf8");
        // `new Date(...)` 와 `.toLocale…` 가 **같은 식**에 붙은 자리(줄바꿈 허용).
        for (const m of text.matchAll(/new Date\([^;]*?\.toLocale(Date|Time)?String/gs)) {
            offenders.push(`${rel}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
        }
    }

    expectEmpty(offenders);
});

/** 목록이 비었는지 이름을 대고 말한다 — `deepEqual([], …)` 는 무엇이 걸렸는지 안 보여 준다. */
function expectEmpty(offenders: string[]): void {
    assert.deepEqual(
        offenders,
        [],
        `시간대를 스스로 정하는 자리가 있다 — \`src/lib/datetime.ts\` 의 함수를 써라:\n  ${offenders.join("\n  ")}`,
    );
}
