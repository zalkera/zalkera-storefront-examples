#!/usr/bin/env node
/**
 * AEO 보장 표면 검사기 — **얇은 wrapper**(memo123 §6.1).
 *
 * 검사기 본체는 `@zalkera/client` 의 bin(`zalkera-aeo-check`)으로 옮겼다. 옮긴 이유는 소비자가 셋으로
 * 늘었기 때문이다: ⑴ 이 체크아웃 ⑵ 고객 zip ⑶ **serving-orchestrator 의 발행 직후 자동 검사**.
 * ⑶의 실행체는 "외부 의존 0 단일 server.mjs"라는 속성을 지켜야 해서 검사기를 자기 안에 못 넣고, 대신
 * 툴킷 디렉터리에 client 를 설치해 그 bin 을 spawn 한다. 여기에 사본을 남겨 두면 두 검사기가 조용히
 * 갈라지고(`lib/site-crawl.mjs` 가 이미 같은 이유로 한 사본이다), 갈라진 잣대는 "미리보기에는 통과인데
 * 자동 검사는 red" 같은 형태로만 드러난다.
 *
 * 그래서 이 파일이 하는 일은 하나다: **설치된 client 의 검사기를 찾아 그대로 실행한다.** 인자는 손대지
 * 않고 넘긴다(플래그가 늘어도 여기를 고칠 일이 없다). 사용법·종료코드·잣대 해석 순서는 전부 본체의
 * 머리말이 정본이다.
 *
 *   npm run check:aeo -- https://개시된사이트 --category BOOKING --out out/aeo-snapshot.json
 *   npm run check:aeo -- https://개시된사이트 --site-wide-only     (보장 주장이 없는 사이트)
 *   npm run check:aeo -- --print-guarantees                        (잣대 해석만·네트워크 불요)
 */
import {createRequire} from "node:module";

const CHECKER_SUBPATH = "@zalkera/client/bin/check-aeo-surfaces.mjs";

let checker;
try {
    checker = createRequire(import.meta.url).resolve(CHECKER_SUBPATH);
} catch {
    // 여기서 죽는 경우는 둘뿐이다: 설치를 안 했거나, 검사기를 싣지 않는 구 버전을 물었거나.
    // 둘은 고치는 방법이 다르므로 한 문장으로 뭉뚱그리지 않는다.
    let installed = true;
    try {
        createRequire(import.meta.url).resolve("@zalkera/client");
    } catch {
        installed = false;
    }
    console.error(
        "산출물 검사기를 못 찾았습니다 — 아무 판정도 하지 않습니다.\n" +
            (installed
                ? `   @zalkera/client 는 설치돼 있는데 그 안에 검사기(${CHECKER_SUBPATH})가 없습니다.\n` +
                  "   검사기를 싣지 않는 구 버전입니다 — `npm i @zalkera/client@latest` 로 올리십시오."
                : "   @zalkera/client 가 설치돼 있지 않습니다 — 이 디렉터리에서 `npm install` 을 먼저 돌리십시오."),
    );
    process.exit(2);
}

// 본체는 top-level await 로 크롤하고 스스로 `process.exit()` 로 종료코드를 정한다 — 감싸지 않고 그대로 태운다.
await import(checker);
