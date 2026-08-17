/**
 * **매니페스트에서 «그 사이트가 실제로 적어 둔» 페이지만 꺼낸다.**
 *
 * ■ 왜 별도 함수인가
 *   `pages[slug]` 로 바로 읽으면 `__proto__` 가 `Object.prototype` 을 돌려주고, 그것이 객체라
 *   `isRecord` 같은 가드를 **통과한다**. 그러면 `/__proto__` 가 404 가 아니라 slug 를 제목으로 단
 *   빈 페이지로 서고, `sitemap` 에는 없지만 크롤러가 링크를 타면 줍는다.
 *
 *   재현: `node -e 'console.log(typeof ({})["__proto__"])'` → `object`
 *   `constructor`·`valueOf` 는 함수라 걸러지는데, 걸러지는 이유가 «함수여서»인 것은 **우연**이다.
 *
 * ■ 왜 `content.ts` 가 아니라 여기인가
 *   `content.ts` 는 `@/` 별칭으로 남을 가져오고, 시험 러너(`--experimental-strip-types`)는 그 별칭을
 *   못 푼다. 판정을 별칭 없는 자리에 두어야 **판정 자체를 시험**할 수 있다 — 값만 흉내 낸 시험은
 *   제품이 바뀌어도 안 깨진다.
 */
export function ownPage(pages: Record<string, unknown>, slug: string): unknown {
    return Object.hasOwn(pages, slug) ? pages[slug] : undefined;
}
