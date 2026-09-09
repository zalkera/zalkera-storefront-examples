/**
 * JSON-LD 를 `<script>` 본문 문자열로 — **`<` 를 전부 유니코드 이스케이프한다.**
 *
 * `JSON.stringify` 는 이 일을 안 한다. 데이터에 `</script>` 가 섞이면 HTML 파서가 거기서 스크립트를
 * 닫아 버리고 그 뒤가 마크업이 된다(JSON-LD 삽입의 고전적 XSS 벡터). 이 그래프에 들어가는 값은
 * 콘솔에서 사람이 적은 자유 문자열이다 — 제목·작성자·태그·회사명. 즉 **신뢰 경계**다.
 *
 * ⚠ **대상을 `</script` 로 좁히지 마라.** 대소문자·공백을 낀 변형(`</SCRIPT >`)이 있고 파서마다
 * 관용이 다르다. `<` 전량이 유일하게 안전한 경계다. JSON 문법에서 `<` 는 `<` 와 같은 값이라
 * 소비자가 읽는 데이터는 안 바뀐다.
 *
 * ⚠ **`.tsx` 가 아니라 여기 산다.** Node 의 타입 스트리핑이 JSX 를 못 읽어서, 컴포넌트 안에 두면
 * 이 판정에 시험을 붙일 수 없다.
 */
export function jsonLdScriptBody(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
