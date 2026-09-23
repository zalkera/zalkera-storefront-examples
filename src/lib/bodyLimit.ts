/**
 * 길이 상한 안의 JSON 만 파싱한다. 넘거나 못 읽으면 `null`.
 *
 * 본문을 한 번 더 훑는 라우트(결제 문의 멱등키)가 쓴다 — 상한이 없으면 Next 기본 상한(10MB)까지
 * 들어와, 키를 만드는 데만 요청 하나가 이벤트 루프를 0.5초 넘게 쥔다.
 */
export function parseJsonWithin(text: string, maxChars: number): unknown {
    if (text.length > maxChars) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
