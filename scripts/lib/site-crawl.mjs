/**
 * 최소 크롤러 — **재수출 shim**(memo123 §6.1).
 *
 * 정본은 `@zalkera/client` 의 `lib/site-crawl.mjs` 로 옮겼다. 검사기 본체가 그 패키지의 bin 이 되면서
 * (오케스트레이터가 툴킷에서 spawn 해야 해서) 크롤러도 같이 가야 했다 — 검사기와 크롤러가 다른 레포에
 * 살면 "미리보기에는 나오는데 검사기는 못 보는 페이지"라는, 이 파일이 원래 막으려던 갈라짐이 그대로
 * 되살아난다.
 *
 * 이 자리에 shim 을 남기는 이유는 `snapshot-preview.mjs` 가 이 경로를 물고 있어서다. 경로 하나를 위해
 * 사본을 만들지는 않는다 — 재수출은 사본이 아니다.
 */
export * from "@zalkera/client/lib/site-crawl.mjs";
