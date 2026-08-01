/**
 * `seo`(페이지·상품)·`seoDefaults`(사이트) 오버라이드 — **opaque JSON 패스스루**다.
 *
 * 백엔드가 스키마를 검증하지 않는다. 사이트 하나 고칠 때마다 백엔드를 배포하지 않으려는 의도적
 * 설계라, 검증 책임이 소비자에게 온다. 그래서 이 파서는 **어떤 입력에도 throw 하지 않는다** —
 * 비JSON·배열·null·타입 불일치 전부 `{}` 로 강하하고, 호출부의 폴백 체인이 받는다. 제목은 살아야 한다.
 *
 * 권장 구조:
 * ```json
 * { "title": "강남프리미엄네일 — 강남역 네일아트", "description": "강남역 3번출구 …" }
 * ```
 * 길이 제한·정규화는 하지 않는다(패스스루 철학 — 쓰레기를 넣으면 자기 검색결과가 쓰레기가 되는 건
 * 테넌트 몫이다). `keywords` 는 구글이 무시하므로 두지 않는다.
 */
export interface SeoOverrides {
    /** 문서 제목 오버라이드. 없으면 호출부의 자연 제목(상품명·페이지 제목·상호). */
    title?: string;
    /** meta description. 없으면 **생략** — 없는 문구를 지어내지 않는다. */
    description?: string;
}

/** [SeoOverrides] 참고. 실패는 전부 `{}` — 던지지 않는다. */
export function parseSeo(raw: string | null | undefined): SeoOverrides {
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    // 배열·null·원시값도 JSON.parse 를 통과한다 — 객체일 때만 필드를 본다.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const {title, description} = parsed as Record<string, unknown>;
    return {
        title: typeof title === "string" ? title : undefined,
        description: typeof description === "string" ? description : undefined,
    };
}
