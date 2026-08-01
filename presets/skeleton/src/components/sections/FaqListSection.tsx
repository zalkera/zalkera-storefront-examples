import {JsonLd} from "@/components/JsonLd";
import {asObjectArray, asString, readConfig} from "@zalkera/client";

/**
 * 해소 — 자주 묻는 질문. **네이티브 `<details>/<summary>`** 로 그린다.
 *
 * Radix Accordion 을 쓰지 않는 이유가 취향이 아니다: 그쪽은 닫힌 패널의 내용을 클라이언트 상태로
 * 관리해서 **SSR 마크업에 답변 본문이 안 실린다**. 우리는 검색·AI 가 답을 그대로 읽어 가는 게 목적이라
 * (AEO), 닫혀 있어도 마크업에 존재하는 쪽이 맞다. 덤으로 런타임 JS 0·접근성 내장이다.
 *
 * 같은 이유로 이 섹션만 JSON-LD(FAQPage)를 산출한다 — 페이지에 보이는 Q/A 와 구조화 데이터가
 * 정확히 같은 내용이어야 하므로 같은 배열에서 만든다.
 */
export function FaqListSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const items = asObjectArray(c?.items)
        .map((i) => ({question: asString(i.question)?.trim(), answer: asString(i.answer)?.trim()}))
        .filter((i): i is {question: string; answer: string} => Boolean(i.question && i.answer));
    if (items.length === 0) return null;

    const title = asString(c?.title)?.trim();
    return (
        <section className="mb-12">
            {title && <h2 className="mb-6">{title}</h2>}
            <div className="grid gap-2">
                {items.map((item, i) => (
                    <details key={i} className="rounded-lg border border-border px-4 py-3">
                        <summary className="cursor-pointer font-semibold">{item.question}</summary>
                        <p className="mt-2 whitespace-pre-wrap text-muted">{item.answer}</p>
                    </details>
                ))}
            </div>
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    mainEntity: items.map((item) => ({
                        "@type": "Question",
                        name: item.question,
                        acceptedAnswer: {"@type": "Answer", text: item.answer},
                    })),
                }}
            />
        </section>
    );
}
