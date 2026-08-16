/**
 * 콘텐츠 매니페스트를 **생성**한다(`content/index.ts`).
 *
 * 손으로 유지하지 않는 이유: 매니페스트와 파일 목록이 갈리면 "파일은 있는데 아무도 못 보는 페이지"가
 * 되고, 그 드리프트를 사람이 지키는 것이 이 레포가 내내 진 싸움이다. 파일 목록에서 파생시키면
 * 갈릴 수가 없다. 형상은 템플릿 기본(`content/index.ts`)과 같아서 고객이 손으로 이어 고칠 수 있다.
 */
export function contentManifest(slugs) {
    const imports = slugs.map((slug) => `import ${identifierOf(slug)} from "./pages/${slug}.json";`).join("\n");
    // ⚠ **키를 명시한다 — 축약(`{our_story}`)은 키를 식별자로 만든다.** slug `our-story` 의 URL 은
    //   `/our-story` 인데 축약이면 맵 키가 `our_story` 가 되어 그 주소가 404 다(파일은 멀쩡히 있다).
    //   N3 은 import **경로**를 보므로 이 어긋남을 못 잡는다 — 검사기가 초록인 채로 페이지가 사라진다.
    //   그 계약은 `scripts/lib/packManifest.test.mjs` 가 진다:
    //   `node --test scripts/lib/packManifest.test.mjs` → 축약으로 되돌리면 `# fail 1`.
    const entries = slugs.map((slug) => `    ${JSON.stringify(slug)}: ${identifierOf(slug)},`).join("\n");
    return `/**
 * 콘텐츠 매니페스트 — **\`content/\` 디렉터리의 유일한 코드**.
 *
 * 페이지 json 을 **정적 import** 해서 slug → 페이지 맵으로 내놓는다. 읽는 쪽은 \`src/lib/content.ts\` 다.
 * 정적 import 라야 dev 에서 json 을 고치면 화면이 즉시 바뀌고(HMR), 빌드 산출물에 콘텐츠가 실린다.
 *
 * **페이지를 하나 만들 때 고치는 곳은 둘뿐이다**: \`content/pages/<slug>.json\` 을 쓰고, 여기에
 * import 한 줄 + 아래 맵에 한 줄(\`"<slug>": <이름>,\`).
 *
 * ⚠ 맵의 **키가 곧 URL** 이다. 축약(\`{our_story}\`)으로 적으면 키가 파일명이 아니라 식별자가 되어
 * \`/our-story\` 가 404 가 된다 — 파일은 있고 검사기도 초록이다.
 */
import nav from "./nav.json";
${imports}

/** slug → 페이지 콘텐츠. **키가 곧 URL 경로**다(\`about\` → \`/about\`, \`home\` → \`/\`). */
export const pages: Record<string, unknown> = {
${entries}
};

export {nav};
`;
}

/**
 * slug 를 **유효한** JS 식별자로. 하이픈은 식별자에 못 쓰고(`our-story` → `our_story`),
 * 숫자로 시작하는 것도 못 쓴다 — slug 규칙 `^[a-z0-9-]+$` 는 `2025-report`·`3d` 를 허용하는데
 * 그대로 옮기면 매니페스트가 **SyntaxError** 라 굽기가 알 수 없는 이유로 죽는다.
 */
export function identifierOf(slug) {
    const ident = slug.replace(/-/g, "_");
    return /^[A-Za-z_$]/.test(ident) ? ident : `_${ident}`;
}
