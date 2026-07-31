/**
 * 콘텐츠 매니페스트 — **`content/` 디렉터리의 유일한 코드**.
 *
 * 사이트의 얼굴(페이지·섹션·문구·이미지 선택·내비)은 이 레포가 정본으로 갖는다. 이 파일은 그
 * json 들을 **정적 import** 해서 slug → 페이지 맵으로 내놓기만 한다. 읽는 쪽은 `src/lib/content.ts` 다.
 *
 * **왜 정적 import 인가**(런타임 `fs.readFile` 이 아니라):
 *  - `next dev` 에서 json 을 고치면 **HMR 로 화면이 즉시 바뀐다**. fs 읽기는 모듈 그래프 밖이라
 *    파일을 고쳐도 아무 일이 안 일어난다 — 확인이 비싸지면 재시도가 늘고, 그게 곧 토큰이다.
 *  - `next build`(standalone) 산출물에 콘텐츠가 **트레이싱된다**. fs 읽기는 `outputFileTracingIncludes`
 *    를 손으로 맞춰야 하고, 빠뜨리면 개시된 사이트에서만 페이지가 사라진다.
 *
 * **페이지를 하나 만들 때 고치는 곳은 둘뿐이다**: `content/pages/<slug>.json` 을 쓰고, 이 파일에
 * import 한 줄 + 아래 맵에 한 줄. 그 이상은 없다(라우팅은 `src/app/[slug]` 가 이미 한다).
 */
import nav from "./nav.json";

/**
 * slug → 페이지 콘텐츠. **키가 곧 URL 경로**다(`about` → `/about`, `home` → `/`).
 *
 * 값을 `unknown` 으로 두는 이유: json 은 사람과 AI 가 손으로 고치는 파일이라 형상이 틀릴 수 있고,
 * 그 판정과 강하는 전부 `src/lib/content.ts` 한 곳이 한다. 여기서 타입을 주장하면 틀린 파일이
 * **빌드를 세우는데**, 계약은 "틀린 부분만 안 그린다" 다.
 */
export const pages: Record<string, unknown> = {
    // 페이지를 만들면 위에 `import about from "./pages/about.json";` 를 더하고 여기에 `about,` 한 줄.
    // 템플릿 기본은 콘텐츠 0 이다 — 홈은 커머스 골격을 그린다(`src/app/page.tsx`).
};

export {nav};
