import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import type TS from "typescript";
import {
    ATTRIBUTION_COOKIE_OPTIONS,
    chooseLeadTracking,
    decodeTouch,
    encodeTouch,
    hasAdTouch,
    leadTrackingFromQuery,
    nextTouch,
    readLandingTouch,
    reduceNaPm,
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
        gclid: "1",
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
    const q = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "gbraid",
        "wbraid",
        "NaPm",
        "fbclid",
    ]
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
    assert.deepEqual(
        toLeadTracking({utmCampaign: "봄", utmTerm: "t", referrer: "r", landingPath: "/", naPm: "tr=sa", wbraid: "w"}),
        {
            utmSource: null,
            utmMedium: null,
            utmCampaign: "봄",
            utmContent: null,
            gclid: null,
            gbraid: null,
            wbraid: "w",
            naPm: "tr=sa",
            fbclid: null,
        },
    );
});

/** 클릭 ID 원문은 방문자를 가리키는 식별값이다 — 쿠키·리드에는 「있음」과 유형 조각만 간다(memo220 §2-1 오너 판정 ①). */
test('🔴 클릭 표지 원문은 쿠키·리드에 안 남는다 — 구글·Meta 는 "1" · NaPm 은 조각', () => {
    const touch = readLandingTouch(
        at(
            "/?utm_campaign=a&gclid=Cj0KCQraw&gbraid=gbraw&wbraid=wbraw&fbclid=IwARraw&NaPm=ct%3Da%7Cci%3Dsecret%7Ctr%3Dsa",
        ),
        null,
        "h",
    );
    assert.deepEqual(touch, {
        utmCampaign: "a",
        landingPath: "/",
        gclid: "1",
        gbraid: "1",
        wbraid: "1",
        naPm: "tr=sa",
        fbclid: "1",
    });
    // 조작된 쿠키에 원문이 들어 있어도 읽을 때 다시 줄인다
    assert.deepEqual(decodeTouch(JSON.stringify({gclid: "Cj0KCQraw", fbclid: "IwARraw"})), {gclid: "1", fbclid: "1"});
    const lead = leadTrackingFromQuery("?gclid=Cj0KCQraw&fbclid=IwARraw&wbraid=wbraw&utm_content=hero");
    assert.deepEqual(lead, {utmContent: "hero", gclid: "1", wbraid: "1", fbclid: "1"});
    const cookie = encodeTouch(touch ?? {});
    for (const raw of ["Cj0KCQraw", "gbraw", "wbraw", "IwARraw", "secret"])
        assert.equal(cookie.includes(raw), false, raw);
});

test("🔴 iOS 구글 광고 표지(gbraid·wbraid)만 붙어도 잡는다 — utm 없는 자동 태그", () => {
    assert.deepEqual(readLandingTouch(at("/?gbraid=b1"), null, "h"), {gbraid: "1", landingPath: "/"});
    assert.deepEqual(readLandingTouch(at("/p?wbraid=w1"), null, "h"), {wbraid: "1", landingPath: "/p"});
    assert.deepEqual(decodeTouch(JSON.stringify({gbraid: "b1", wbraid: "w1"})), {gbraid: "1", wbraid: "1"});
});

test("🔴 NaPm 조각 규칙의 경계 — 첫 tr= 조각 · 1~32자 영숫자·_ · 광고 유형은 정확 일치(서버·SDK 문서와 같다)", () => {
    assert.equal(reduceNaPm("tr=sa|tr=gfa"), "tr=sa", "첫 조각");
    assert.equal(reduceNaPm("ct=a|tr=|tr=sa"), "tr=", "빈 첫 조각을 건너뛰지 않는다");
    assert.equal(reduceNaPm("tr=" + "a".repeat(32)), "tr=" + "a".repeat(32));
    assert.equal(reduceNaPm("tr=" + "a".repeat(33)), "tr=", "33자는 버린다");
    assert.equal(reduceNaPm("tr=a b"), "tr=", "공백은 허용 문자가 아니다");
    const paid = {utmCampaign: "봄"};
    assert.equal(nextTouch(paid, {naPm: "tr=sasa"}), null, "sa 로 시작해도 sa 가 아니면 광고 유형이 아니다");
    assert.equal(nextTouch(paid, {naPm: "tr=SA"}), null, "대소문자도 정확 일치");
});

/** 리드 폼은 그 페이지의 쿼리를 쿠키와 같은 규칙으로 읽는다 — 빈 값이 유입이 되어 쿠키 보충을 막지 않게. */
test("🔴 리드 폼 쿼리 캡처 — 빈 값·255자 초과는 버리고 NaPm 은 조각으로 · 없으면 undefined", () => {
    assert.equal(
        leadTrackingFromQuery("?NaPm="),
        undefined,
        "빈 NaPm 이 tr= 유입이 되면 쿠키의 캠페인이 리드에서 빠진다",
    );
    assert.equal(leadTrackingFromQuery("?NaPm=%20%20"), undefined);
    assert.equal(leadTrackingFromQuery(`?NaPm=${"x".repeat(256)}`), undefined, "쿠키 쪽과 같게 255자 초과는 버린다");
    assert.equal(leadTrackingFromQuery(""), undefined);
    assert.deepEqual(leadTrackingFromQuery("?NaPm=ct%3Da%7Cci%3Db%7Ctr%3Dsa&utm_adgroup=g1&gbraid=b1"), {
        utmAdgroup: "g1",
        gbraid: "1",
        naPm: "tr=sa",
    });
});

/** 리드 BFF 의 선택은 쿠키 덮기 규칙과 같다 — 광고로 들어온 뒤 검색결과·공유 링크로 돌아와 문의해도 캠페인이 남는다. */
test("🔴 리드 추적 선택 — 폼이 광고 접점이 아니면 쿠키의 광고 접점을 싣는다", () => {
    const cookie = {utmCampaign: "봄", utmSource: "naver", naPm: "tr=sa"};
    const fromCookie = chooseLeadTracking({naPm: "tr=sls"}, cookie) as Record<string, unknown>;
    assert.equal(fromCookie.utmCampaign, "봄", "네이버 자연 검색으로 돌아온 리드가 캠페인을 잃는다");
    assert.equal(fromCookie.naPm, "tr=sa");
    assert.equal((chooseLeadTracking({fbclid: "f1"}, {gclid: "g1"}) as Record<string, unknown>).gclid, "g1");
    // 양성 짝 — 폼이 광고 접점이면 그 방문의 값 · 둘 다 광고 아님이면 폼 · 폼에 유입이 없으면 쿠키 · 둘 다 없으면 폼 그대로
    assert.deepEqual(chooseLeadTracking({gclid: "g2"}, cookie), {gclid: "1"});
    // 폼이 원문을 보내도(옛 탭 · 고친 폼) 서버 요청에는 「있음」·조각만
    assert.deepEqual(chooseLeadTracking({gclid: "Cj0raw", naPm: "ct=a|ci=secret|tr=sa", utmContent: "hero"}, null), {
        gclid: "1",
        naPm: "tr=sa",
        utmContent: "hero",
    });
    // 걸러지는 표지 칸(256자·공백)과 옛 탭의 `nclid` 는 빠지고, gbraid·wbraid 는 「있음」으로
    assert.deepEqual(
        chooseLeadTracking({gbraid: "b", wbraid: "w", gclid: "x".repeat(256), fbclid: "  ", nclid: "n"}, null),
        {gbraid: "1", wbraid: "1"},
    );
    assert.deepEqual(chooseLeadTracking({gclid: "x".repeat(256), nclid: "n"}, null), {});
    assert.deepEqual(chooseLeadTracking({fbclid: "f1"}, {fbclid: "f0"}), {fbclid: "1"});
    assert.equal((chooseLeadTracking({utmContent: "hero"}, cookie) as Record<string, unknown>).utmCampaign, "봄");
    assert.equal((chooseLeadTracking(undefined, {fbclid: "f0"}) as Record<string, unknown>).fbclid, "f0");
    assert.deepEqual(chooseLeadTracking({utmContent: "hero"}, null), {utmContent: "hero"});
    assert.equal(chooseLeadTracking(undefined, null), undefined);
});

/** 네이버 표지는 원문에 클릭 ID(`ci`)·해시(`hk`)가 들어 있다 — 쿠키에도 서버에도 판정 조각만 간다(memo220 §2-1). */
test("🔴 NaPm 은 tr 조각만 잡는다 — 쿠키를 고쳐 원문을 넣어도 읽을 때 다시 줄인다", () => {
    const touch = readLandingTouch(at("/?NaPm=ct%3Dhf2bview%7Cci%3D0Gy1001FZz%7Ctr%3Dsa%7Chk%3Db03c9555"), null, "h");
    assert.deepEqual(touch, {naPm: "tr=sa", landingPath: "/"});
    assert.equal(decodeTouch(JSON.stringify({naPm: "ct=a|ci=secret|tr=gfa|hk=h"}))?.naPm, "tr=gfa");
    // 조각이 없거나 모양이 이상하면 `tr=` — 서버는 이것을 원문과 같은 매체(NAVER_LINK)로 가른다
    assert.equal(reduceNaPm("ct=x|ci=y"), "tr=");
    assert.equal(reduceNaPm("ct=tr=gfa|tr=sa"), "tr=sa", "조각은 접두로만 고른다 — 다른 조각 안에 든 tr= 은 아니다");
    assert.equal(reduceNaPm("ct=x|tr=<script>|hk=z"), "tr=");
    assert.equal(reduceNaPm("tr=sls"), "tr=sls");
    assert.equal(reduceNaPm("ct%3Dx%7Ctr%3Dsa"), "tr=", "해독 안 된 값 — URLSearchParams 는 해독해 준다");
});

test("쿠키는 httpOnly · lax · 30일", () => {
    assert.deepEqual(ATTRIBUTION_COOKIE_OPTIONS, {httpOnly: true, sameSite: "lax", path: "/", maxAge: 2592000});
});

test("🔴 유입의 기준 — 캠페인·소스·매체·클릭 표지 중 하나 · utm_term·utm_content 만으로는 유입이 아니다", () => {
    assert.equal(readLandingTouch(at("/?utm_content=hero&utm_term=t"), null, "h"), null);
    assert.equal(hasAdTouch({utmContent: "hero", utmAdgroup: "g"}), false, "리드 폼 추적도 같은 기준");
    assert.equal(hasAdTouch({utmContent: "hero", gclid: "g1"}), true);
    assert.equal(hasAdTouch({naPm: "tr="}), true, "네이버 표지도 유입이다");
    assert.equal(hasAdTouch({wbraid: "w"}), true);
    assert.equal(hasAdTouch({gbraid: "b"}), true);
    assert.equal(hasAdTouch({fbclid: "f"}), true, "광고 여부를 몰라도 유입이다 — 캠페인 쿠키만 못 덮을 뿐");
    assert.equal(hasAdTouch({nclid: "n"}), false, "nclid 는 근거 없는 이름이라 유입으로 안 친다(memo220)");
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

test("🔴 광고 여부를 모르는 링크 표지(fbclid · 광고 유형 아닌 NaPm)만 붙은 유입은 광고 접점 쿠키를 안 덮고 — 광고 클릭은 캠페인 이름이 없어도 덮는다", () => {
    const paid = {utmCampaign: "봄", utmSource: "naver"};
    assert.equal(nextTouch(paid, {fbclid: "f1"}), null, "공유 링크의 fbclid 가 광고 캠페인을 지운다");
    assert.equal(nextTouch(paid, {naPm: "tr=sls"}), null, "네이버 쇼핑 목록 클릭이 광고 캠페인을 지운다");
    assert.equal(nextTouch(paid, {naPm: "tr="}), null, "유형을 모르는 네이버 링크도 같다");
    assert.equal(nextTouch(paid, {fbclid: "f1", naPm: "tr=sls"}), null);
    assert.deepEqual(
        nextTouch(paid, {gclid: "g1"}),
        {gclid: "g1"},
        "나중에 누른 구글 광고의 매출이 앞 네이버 캠페인에 잡힌다",
    );
    assert.deepEqual(nextTouch(paid, {naPm: "tr=sa"}), {naPm: "tr=sa"}, "네이버 검색광고 클릭은 덮는다");
    assert.deepEqual(nextTouch(paid, {naPm: "tr=gfa"}), {naPm: "tr=gfa"});
    assert.deepEqual(nextTouch(paid, {wbraid: "w1"}), {wbraid: "w1"});
    assert.deepEqual(nextTouch(paid, {gbraid: "b1", fbclid: "f1"}), {gbraid: "b1", fbclid: "f1"});
    assert.deepEqual(nextTouch(paid, {utmSource: "google", utmMedium: "cpc"}), {utmSource: "google", utmMedium: "cpc"});
    assert.deepEqual(nextTouch(paid, {fbclid: "f1", utmSource: "meta"}), {fbclid: "f1", utmSource: "meta"});
    assert.deepEqual(nextTouch(paid, {utmCampaign: "가을"}), {utmCampaign: "가을"});
    // 캠페인이 없어도 광고 접점이면 지킨다 — utm 없는 광고 클릭 주문이 링크 방문으로 매체를 잃지 않게(memo220)
    assert.equal(nextTouch({gclid: "g1"}, {fbclid: "f1"}), null, "구글 광고 클릭 쿠키를 Instagram 공유 링크가 지운다");
    assert.equal(nextTouch({naPm: "tr=sa"}, {naPm: "tr=sls"}), null, "네이버 검색광고 쿠키를 쇼핑 목록 클릭이 지운다");
    assert.equal(nextTouch({utmMedium: "cpc"}, {fbclid: "f1"}), null);
    // 양성 짝 — 광고 여부를 모르는 쿠키는 다음 링크가 덮는다(마지막 링크 접점)
    assert.deepEqual(nextTouch({fbclid: "f0"}, {naPm: "tr=sls"}), {naPm: "tr=sls"});
    assert.deepEqual(nextTouch({naPm: "tr="}, {fbclid: "f1"}), {fbclid: "f1"});
    assert.deepEqual(nextTouch(null, {fbclid: "f1"}), {fbclid: "f1"}, "쿠키가 없으면 링크 표지도 심는다");
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
    need("app/api/lead/route.ts", ["getLandingAttribution", "chooseLeadTracking"]);

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
    // middleware 의 덮기 규칙 세 조건 — 기존 쿠키를 읽어 넘기고 · 문서 요청 판정이 쿠키 쓰기를 가르고 · no-store 는 쿠키 쓰기와 무관하다.
    const middlewarePath = join(src, "middleware.ts");
    if (existsSync(middlewarePath)) {
        const sf = ts.createSourceFile(
            middlewarePath,
            readFileSync(middlewarePath, "utf8"),
            ts.ScriptTarget.Latest,
            true,
        );
        const nodes: TS.Node[] = [];
        const collect = (n: TS.Node): void => {
            nodes.push(n);
            ts.forEachChild(n, collect);
        };
        collect(sf);
        const named = (n: TS.Node, name: string): n is TS.CallExpression =>
            ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name;
        const contains = (outer: TS.Node, inner: TS.Node): boolean => inner.pos >= outer.pos && inner.end <= outer.end;
        const guardOf = (n: TS.Node): TS.Node | undefined =>
            ts.isIfStatement(n) ? n.expression : ts.isConditionalExpression(n) ? n.condition : undefined;
        const ancestors = (n: TS.Node): TS.Node[] => {
            const out: TS.Node[] = [];
            for (let p = n.parent; p; p = p.parent) out.push(p);
            return out;
        };
        const touchCalls = nodes.filter((n) => named(n, "nextTouch"));
        if (
            !touchCalls.some(
                (n) =>
                    n.arguments.length >= 1 &&
                    named(n.arguments[0], "decodeTouch") &&
                    /cookies\.get\(\s*(ATTRIBUTION_COOKIE|["']zalkera_attribution["'])\s*\)/.test(
                        n.arguments[0].getText(sf),
                    ),
            )
        )
            missing.push(
                "middleware.ts — nextTouch 가 기존 쿠키(decodeTouch(cookies.get(ATTRIBUTION_COOKIE)))를 받지 않는다",
            );
        // 판정은 조건·삼항·`&&` 에 곧장 두거나, 변수에 담아 쓰거나, 같은 블록 앞의 조기 반환(`if (!판정) return …`)으로 가를 수 있다.
        const captureNames = new Set(
            nodes.flatMap((n) =>
                ts.isVariableDeclaration(n) &&
                ts.isIdentifier(n.name) &&
                n.initializer !== undefined &&
                named(n.initializer, "shouldCaptureLanding")
                    ? [n.name.text]
                    : [],
            ),
        );
        const mentionsCapture = (expr: TS.Node): boolean =>
            nodes.some(
                (c) =>
                    contains(expr, c) &&
                    (named(c, "shouldCaptureLanding") || (ts.isIdentifier(c) && captureNames.has(c.text))),
            );
        const guardedByCapture = (n: TS.Node): boolean =>
            ancestors(n).some((a) => {
                const guard = guardOf(a);
                if (guard && contains(guard, n)) return false;
                if (guard && mentionsCapture(guard)) {
                    const branch = ts.isIfStatement(a) ? a.thenStatement : (a as TS.ConditionalExpression).whenTrue;
                    return contains(branch, n);
                }
                return (
                    ts.isBinaryExpression(a) &&
                    a.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
                    mentionsCapture(a.left) &&
                    contains(a.right, n)
                );
            }) ||
            nodes.some(
                (s) =>
                    ts.isIfStatement(s) &&
                    s.end <= n.pos &&
                    s.parent !== undefined &&
                    contains(s.parent, n) &&
                    ts.isPrefixUnaryExpression(s.expression) &&
                    s.expression.operator === ts.SyntaxKind.ExclamationToken &&
                    mentionsCapture(s.expression.operand) &&
                    (ts.isReturnStatement(s.thenStatement) ||
                        (ts.isBlock(s.thenStatement) && s.thenStatement.statements.some(ts.isReturnStatement))),
            );
        if (!touchCalls.some(guardedByCapture))
            missing.push(
                "middleware.ts — shouldCaptureLanding 판정이 nextTouch(쿠키 쓰기)를 가르지 않는다(프리페치가 쿠키를 덮는다 · 인식하는 형상: 조건·삼항·&&·판정을 담은 변수·조기 반환)",
            );
        const noStore = nodes.filter(
            (n): n is TS.CallExpression =>
                method(n, "set") &&
                n.arguments.length === 2 &&
                ts.isStringLiteralLike(n.arguments[0]) &&
                /^cache-control$/i.test(n.arguments[0].text),
        );
        if (
            noStore.some((n) =>
                ancestors(n).some((a) => {
                    const guard = guardOf(a);
                    return (
                        guard !== undefined &&
                        !contains(guard, n) &&
                        /\btouch\b|shouldCaptureLanding/.test(guard.getText(sf))
                    );
                }),
            )
        )
            missing.push(
                "middleware.ts — no-store 를 쿠키를 쓸 때만 준다(쿠키 없이 나간 광고 URL 응답이 공유 캐시에 남는다)",
            );
    }
    // 리드 — 선택 결과를 본문의 `tracking` 에 대입해야 한다(부르고 버리면 쿠키의 캠페인이 리드에 안 실린다).
    if (
        !find(
            "app/api/lead/route.ts",
            (n) =>
                ts.isBinaryExpression(n) &&
                n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isPropertyAccessExpression(n.left) &&
                n.left.name.text === "tracking" &&
                ts.isCallExpression(n.right) &&
                ts.isIdentifier(n.right.expression) &&
                n.right.expression.text === "chooseLeadTracking",
        )
    )
        missing.push("app/api/lead/route.ts — chooseLeadTracking 결과를 tracking 에 대입하지 않는다");
    assert.ok(checked > 0, "대상 파일을 하나도 못 찾았다 — 경로가 바뀌었으면 이 시험도 옮겨라");
    assert.deepEqual(missing, []);
});
