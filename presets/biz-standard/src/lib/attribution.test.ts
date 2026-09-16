import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import type TS from "typescript";
import {
    ATTRIBUTION_COOKIE_OPTIONS,
    decodeTouch,
    encodeTouch,
    hasAdTouch,
    nextTouch,
    readLandingTouch,
    shouldCaptureLanding,
    toLeadTracking,
} from "./attribution.ts";

/**
 * 광고 유입 — 들어온 요청에서 잡는 규칙(`attribution.ts`). 쿠키를 심는 자리는 `middleware`, 넘기는 자리는 담기·예약·리드 BFF 다.
 * 이 유입이 비면 캠페인 표의 매출이 0 이다 — 광고비만 찬다.
 */
const at = (path: string) => new URL(path, "http://0.0.0.0:3000");

test("🔴 광고 유입이 있으면 잡는다 — 캠페인·매체·경로·외부 호스트", () => {
    const touch = readLandingTouch(
        at("/products/tee?utm_source=naver&utm_medium=cpc&utm_campaign=%EB%B4%84&gclid=g1&x=1"),
        "https://search.naver.com/search.naver?query=%EB%82%B4%20%EC%9D%B4%EB%A6%84",
        "shop.example.com",
    );
    assert.deepEqual(touch, {
        utmCampaign: "봄",
        utmSource: "naver",
        utmMedium: "cpc",
        landingPath: "/products/tee",
        referrer: "search.naver.com",
        gclid: "g1",
    });
});

test("🔴 유입 값이 없으면 null — 직접 방문은 쿠키를 덮지 않는다", () => {
    assert.equal(readLandingTouch(at("/products/tee?page=2"), "https://search.naver.com/", "shop.example.com"), null);
    assert.equal(readLandingTouch(at("/"), null, "shop.example.com"), null);
});

test("referrer 는 호스트만 · 자기 사이트면 싣지 않는다 · 해석 안 되면 싣지 않는다", () => {
    assert.equal(
        readLandingTouch(at("/?utm_campaign=a"), "https://shop.example.com/x?q=1", "shop.example.com")?.referrer,
        undefined,
    );
    assert.equal(readLandingTouch(at("/?utm_campaign=a"), "not a url", "shop.example.com")?.referrer, undefined);
    assert.equal(
        readLandingTouch(at("/?utm_campaign=a"), "https://m.facebook.com/l.php?u=1", "shop.example.com")?.referrer,
        "m.facebook.com",
    );
});

test("🔴 255자 초과·제어문자 값은 버린다(자르지 않는다) — 나머지 칸은 남는다", () => {
    const long = "x".repeat(256);
    const touch = readLandingTouch(at(`/?utm_campaign=${long}&utm_source=naver`), null, "h");
    assert.equal(touch?.utmCampaign, undefined);
    assert.equal(touch?.utmSource, "naver");
    assert.equal(readLandingTouch(at("/?utm_campaign=a%0Ab"), null, "h"), null);
    assert.equal(readLandingTouch(at(`/?utm_campaign=${"가".repeat(255)}`), null, "h")?.utmCampaign, "가".repeat(255));
});

test("🔴 인코딩한 쿠키 값은 예산(3000자) 안이다 — 넘치면 캠페인·매체부터 남기고 뒤를 버린다", () => {
    const k = "가".repeat(255);
    const q = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "nclid"]
        .map((p) => `${p}=${encodeURIComponent(k)}`)
        .join("&");
    const touch = readLandingTouch(at(`/?${q}`), null, "h");
    assert.ok(touch);
    assert.ok(encodeURIComponent(encodeTouch(touch)).length <= 3000, "브라우저가 말없이 버리는 크기다");
    assert.equal(touch.utmCampaign, k, "캠페인이 먼저 남아야 한다 — 매출을 세는 칸이다");
    assert.equal(touch.utmSource, undefined, "최악 값(한글 255자)은 둘째 긴 칸부터 못 들어간다 — 짧은 경로는 남는다");

    // 양성 짝 — 보통 크기의 유입은 전부 들어간다.
    const usual = readLandingTouch(
        at(
            "/p?utm_source=naver&utm_medium=cpc&utm_campaign=%EB%B4%84%20%EC%84%B8%EC%9D%BC&utm_content=a&utm_term=b&gclid=" +
                "g".repeat(100),
        ),
        "https://search.naver.com/",
        "h",
    );
    assert.equal(Object.keys(usual ?? {}).length, 8);
});

test("🔴 쿠키 값은 방문자가 고칠 수 있다 — 모르는 키·문자열 아닌 값·규칙을 어긴 값은 버리고, 깨진 값은 null", () => {
    assert.deepEqual(decodeTouch(encodeTouch({utmCampaign: "봄", utmSource: "naver"})), {
        utmCampaign: "봄",
        utmSource: "naver",
    });
    assert.deepEqual(
        decodeTouch(JSON.stringify({utmCampaign: "봄", evil: "x", utmSource: 3, utmMedium: "y".repeat(300)})),
        {
            utmCampaign: "봄",
        },
    );
    assert.equal(decodeTouch("{not json"), null);
    assert.equal(decodeTouch(JSON.stringify(["utmCampaign", "봄"])), null);
    assert.equal(decodeTouch(undefined), null);
    assert.equal(
        decodeTouch(JSON.stringify({landingPath: "/x"})),
        null,
        "유입 값 없이 경로만 있는 쿠키는 유입이 아니다",
    );
});

test("리드 추적으로 옮길 때는 겹치는 칸만", () => {
    assert.deepEqual(toLeadTracking({utmCampaign: "봄", utmTerm: "t", referrer: "r", landingPath: "/", nclid: "n"}), {
        utmSource: null,
        utmMedium: null,
        utmCampaign: "봄",
        utmContent: null,
        gclid: null,
        fbclid: null,
        nclid: "n",
    });
});

test("쿠키는 httpOnly · lax · 30일", () => {
    assert.deepEqual(ATTRIBUTION_COOKIE_OPTIONS, {httpOnly: true, sameSite: "lax", path: "/", maxAge: 2592000});
});

test("🔴 유입의 기준 — 캠페인·소스·매체·클릭 ID 중 하나 · utm_term·utm_content 만으로는 유입이 아니다", () => {
    assert.equal(readLandingTouch(at("/?utm_content=hero&utm_term=t"), null, "h"), null);
    assert.equal(hasAdTouch({utmContent: "hero", utmAdgroup: "g"}), false, "리드 폼 추적도 같은 기준");
    assert.equal(hasAdTouch({utmContent: "hero", gclid: "g1"}), true);
    assert.equal(hasAdTouch({utmCampaign: "   "}), false);
    assert.equal(hasAdTouch(null), false);
});

test("🔴 잡는 요청은 방문자가 연 문서뿐 — 프리페치·하위 요청은 쿠키를 덮지 않는다", () => {
    const h = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;
    assert.equal(shouldCaptureLanding("GET", h({"sec-fetch-dest": "document"})), true);
    assert.equal(shouldCaptureLanding("GET", h({})), true, "Sec-Fetch-Dest 없는 클라이언트는 문서로 본다");
    assert.equal(shouldCaptureLanding("GET", h({"sec-fetch-dest": "image"})), false, "다른 사이트의 <img>");
    assert.equal(shouldCaptureLanding("GET", h({"sec-fetch-dest": "empty"})), false, "RSC fetch");
    // Next 의 라우터 프리페치는 RSC fetch 라 dest 가 empty 다(`Next-Router-Prefetch` 헤더는 middleware 앞에서 떼진다).
    assert.equal(shouldCaptureLanding("GET", h({"sec-fetch-dest": "empty", "next-router-prefetch": "1"})), false);
    assert.equal(shouldCaptureLanding("GET", h({"sec-fetch-dest": "document", "sec-purpose": "prefetch"})), false);
    assert.equal(shouldCaptureLanding("POST", h({"sec-fetch-dest": "document"})), false);
});

test("🔴 fbclid 만 붙은 유입은 캠페인 쿠키를 안 덮고 — 광고 클릭(gclid·nclid·utm_source)은 캠페인 이름이 없어도 덮는다", () => {
    const paid = {utmCampaign: "봄", utmSource: "naver"};
    assert.equal(nextTouch(paid, {fbclid: "f1"}), null, "공유 링크의 fbclid 가 광고 캠페인을 지운다");
    assert.deepEqual(
        nextTouch(paid, {gclid: "g1"}),
        {gclid: "g1"},
        "나중에 누른 구글 광고의 매출이 앞 네이버 캠페인에 잡힌다",
    );
    assert.deepEqual(nextTouch(paid, {nclid: "n1"}), {nclid: "n1"});
    assert.deepEqual(nextTouch(paid, {utmSource: "google", utmMedium: "cpc"}), {utmSource: "google", utmMedium: "cpc"});
    assert.deepEqual(nextTouch(paid, {fbclid: "f1", utmSource: "meta"}), {fbclid: "f1", utmSource: "meta"});
    assert.deepEqual(nextTouch(paid, {utmCampaign: "가을"}), {utmCampaign: "가을"});
    assert.deepEqual(nextTouch({gclid: "g1"}, {fbclid: "f1"}), {fbclid: "f1"}, "캠페인 없는 쿠키는 덮는다");
    assert.equal(nextTouch(paid, null), null);
});

/**
 * 배선 — 이 호출이 빠지면 타입·배선 동일성·하한이 전부 초록인 채 캠페인 매출이 0 이 된다(인자가 선택이라).
 * 라우트가 없는 트리(고객이 그 기능을 지운 형상)는 대상이 아니다.
 */
test("🔴 middleware 가 유입을 잡고, 담기·예약·리드 BFF 가 넘긴다", () => {
    const ts: typeof TS = createRequire(import.meta.url)("typescript");
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const calls = (path: string, name: string): boolean => {
        const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        let found = false;
        const visit = (n: TS.Node): void => {
            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) found = true;
            ts.forEachChild(n, visit);
        };
        visit(sf);
        return found;
    };
    const missing: string[] = [];
    let checked = 0;
    const need = (rel: string, names: string[]) => {
        const path = join(src, rel);
        if (!existsSync(path)) return;
        checked++;
        for (const name of names) if (!calls(path, name)) missing.push(`${rel} — ${name}() 를 안 부른다`);
    };
    need("middleware.ts", ["shouldCaptureLanding", "readLandingTouch", "nextTouch", "decodeTouch"]);
    need("app/api/cart/items/route.ts", ["getLandingAttribution"]);
    need("app/api/booking/route.ts", ["getLandingAttribution"]);
    need("app/api/lead/route.ts", ["getLandingAttribution", "hasAdTouch"]);

    // 부르기만 하고 결과를 안 넘기는 형상 — 담기의 넷째 인자 · 예약 입력의 `attribution` 칸 · 광고 URL 응답의 no-store.
    const find = (rel: string, pred: (n: TS.Node) => boolean): boolean => {
        const path = join(src, rel);
        if (!existsSync(path)) return true;
        const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        let hit = false;
        const visit = (n: TS.Node): void => {
            if (pred(n)) hit = true;
            ts.forEachChild(n, visit);
        };
        visit(sf);
        return hit;
    };
    const method = (n: TS.Node, name: string): n is TS.CallExpression =>
        ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name;
    if (!find("app/api/cart/items/route.ts", (n) => method(n, "addToCart") && n.arguments.length === 4))
        missing.push("app/api/cart/items/route.ts — addToCart 에 넷째 인자(유입)를 안 넘긴다");
    if (
        !find(
            "app/api/booking/route.ts",
            (n) =>
                method(n, "createBooking") &&
                n.arguments.some(
                    (a) =>
                        ts.isObjectLiteralExpression(a) &&
                        a.properties.some(
                            (p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === "attribution",
                        ),
                ),
        )
    )
        missing.push("app/api/booking/route.ts — createBooking 입력에 attribution 이 없다");
    if (
        !find(
            "middleware.ts",
            (n) =>
                method(n, "set") &&
                n.arguments.length === 2 &&
                ts.isStringLiteralLike(n.arguments[0]) &&
                /^cache-control$/i.test(n.arguments[0].text) &&
                ts.isStringLiteralLike(n.arguments[1]) &&
                /no-store/.test(n.arguments[1].text),
        )
    )
        missing.push("middleware.ts — 광고 URL 응답에 Cache-Control no-store 가 없다");
    assert.ok(checked > 0, "대상 파일을 하나도 못 찾았다 — 경로가 바뀌었으면 이 시험도 옮겨라");
    assert.deepEqual(missing, []);
});
