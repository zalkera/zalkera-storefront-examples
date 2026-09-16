import test from "node:test";
import assert from "node:assert/strict";
import {ATTRIBUTION_COOKIE_OPTIONS, decodeTouch, encodeTouch, readLandingTouch, toLeadTracking} from "./attribution.ts";

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
