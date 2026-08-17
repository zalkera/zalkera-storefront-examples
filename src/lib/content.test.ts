import {strictEqual} from "node:assert/strict";
import {test} from "node:test";
import {ownPage} from "./ownPage.ts";

const pages: Record<string, unknown> = {"회사연혁": {title: "연혁"}, home: {title: "홈"}};

test("프로토타입 키는 페이지가 아니다", () => {
    // ⚠ 그냥 `pages[slug]` 로 읽으면 `__proto__` 가 `Object.prototype` 을 돌려주고, 그것이 객체라
    //   `isRecord` 가드를 통과한다. `/__proto__` 가 404 대신 빈 페이지로 서고 크롤러가 줍는다.
    for (const key of ["__proto__", "constructor", "valueOf", "toString", "hasOwnProperty", "isPrototypeOf"]) {
        strictEqual(ownPage(pages, key), undefined, key);
    }
});

test("적어 둔 페이지는 그대로 꺼낸다", () => {
    strictEqual(ownPage(pages, "회사연혁"), pages["회사연혁"]);
    strictEqual(ownPage(pages, "home"), pages.home);
});

test("없는 slug 는 undefined", () => {
    strictEqual(ownPage(pages, "이런-페이지-없다"), undefined);
    strictEqual(ownPage({}, "__proto__"), undefined);
});
