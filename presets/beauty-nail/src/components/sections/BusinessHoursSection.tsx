import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 방문 정보 — 영업(진료)시간 표.
 *
 * **쉬는 날은 `closed` 로 판정한다.** 「휴진」을 문자열로 찾으면 표기가 편집자 자유
 * (「쉽니다」·「정기휴무」·「CLOSED」)라 깨지고, 지역배포에서는 더 깨진다 — 그러면 이 섹션이
 * 잡겠다던 실패(쉬는 날이 화면에서 안 구분됨)를 여기서 되풀이한다.
 */
export function BusinessHoursSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const rows = asObjectArray(c?.rows)
        .map((r) => ({
            days: asString(r.days)?.trim(),
            time: asString(r.time)?.trim(),
            closed: r.closed === true,
        }))
        // 둘 중 하나만 있으면 줄이 성립하지 않는다 — 「월요일 ―」 은 정보가 아니다.
        .filter((r) => r.days && r.time);
    if (rows.length === 0) return null;

    const eyebrow = asString(c?.eyebrow)?.trim();
    const title = asString(c?.title)?.trim();
    const note = asString(c?.note)?.trim();
    return (
        <section className="mb-12">
            {(eyebrow || title) && (
                <div className="mb-6">
                    {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
                    {title && <h2>{title}</h2>}
                </div>
            )}
            <dl className="divide-y divide-border rounded-xl border border-border">
                {rows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                        <dt className="font-semibold">{row.days}</dt>
                        <dd className={row.closed ? "font-semibold text-danger" : undefined}>{row.time}</dd>
                    </div>
                ))}
            </dl>
            {note && <p className="mt-4 whitespace-pre-wrap text-sm text-muted">{note}</p>}
        </section>
    );
}
