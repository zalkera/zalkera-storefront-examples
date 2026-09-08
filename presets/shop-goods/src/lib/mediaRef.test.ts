import {test} from "node:test";
import assert from "node:assert/strict";
import {bodyMediaSrc, bodyVideoSrc, resolveMediaRef} from "./mediaRef.ts";
import {parseMarkdown} from "./markdown.ts";

/**
 * **저작기가 박는 문자열이 실제 주소가 되는가.**
 *
 * 이 그물이 없으면 본문 이미지가 **전부** `#` 이 된다(모르는 스킴 → 소독기가 무력화). 화면에는
 * 깨진 이미지가 뜨고, 브라우저는 그 쪽 HTML 을 이미지로 다시 요청한다. 렌더러가 `/media/{id}` 가
 * 올 것이라고 **가정**하면 그 순간 이 부류가 돌아온다 — 가정이 아니라 해석이어야 한다.
 */

test("참조가 안정 URL 이 된다 — 저작기가 실제로 내는 꼴 그대로", () => {
    assert.equal(bodyMediaSrc("media:12"), "/media/12");
    assert.equal(bodyMediaSrc(" media:7 "), "/media/7"); // 붙여넣기 공백
    assert.equal(resolveMediaRef("media:12"), 12);
});

test("참조가 아닌 것은 안 그린다 — 양성의 음성 짝", () => {
    // 이 짝이 없으면 「전부 /media/ 로 만든다」는 구현도 위 시험을 통과한다.
    for (const bad of [
        "media:abc",
        "media:0", // 0 은 id 가 아니다(백엔드에 그 행이 없다)
        "media:-3",
        "media:1.5",
        "MEDIA:12", // 저작기는 소문자로만 낸다
        "media: 12", // 안쪽 공백은 참조가 아니다
        "media:12345678901234567890", // 안전정수 밖 — Number 가 **다른 자산**으로 반올림한다
    ]) {
        assert.equal(resolveMediaRef(bad), null, `${bad} 를 참조로 읽었다`);
        assert.equal(bodyMediaSrc(bad), null, `${bad} 가 주소가 됐다`);
    }
});

test("못 쓰는 주소는 «없음» 이다 — 문자열 센티넬이 아니라 `null`", () => {
    // `null` 이라야 호출자가 검사를 지우는 순간 타입이 막는다. `"#"` 이면 `<img src="#">` 가
    // 그 쪽 HTML 을 이미지로 다시 요청하는 형태가 조용히 배송된다.
    assert.equal(bodyMediaSrc("javascript:alert(1)"), null);
    assert.equal(bodyMediaSrc("//evil.example/a.png"), null);
    assert.equal(bodyMediaSrc("/..//evil.example/a.png"), null);
    assert.equal(bodyMediaSrc(null), null);
    assert.equal(bodyMediaSrc("/media/12"), "/media/12");
    assert.equal(bodyMediaSrc("https://cdn.example/a.png"), "https://cdn.example/a.png");
});

test("이미지 주소는 링크 주소보다 좁다 — 소독기가 통과시키는 것도 여기서 걸린다", () => {
    // 링크로는 정당하지만 이미지로는 아닌 것들.
    for (const notAnImage of [
        "mailto:a@b.co",
        "tel:+8210",
        "#section-2", // `src="#조각"` 은 그 쪽 HTML 을 이미지로 다시 받는다
        "?page=2",
        "http://cdn.example/a.png", // 혼합 콘텐츠로 어차피 막힌다
        "../images/a.png", // 상대경로: 소독기가 루트로 접어 **저작기와 다른 주소**가 된다
        "images/a.png",
        "   ", // 접히면 사이트 루트가 된다 — 그것도 헛된 왕복이다
        "",
    ]) {
        assert.equal(bodyMediaSrc(notAnImage), null, `${JSON.stringify(notAnImage)} 가 이미지 주소가 됐다`);
    }
    // 그 좁힘이 정상 주소까지 먹지 않는다(음성 짝의 양성 짝).
    assert.equal(bodyMediaSrc("HTTPS://CDN.example/a.png"), "HTTPS://CDN.example/a.png");
    assert.equal(bodyMediaSrc("/uploads/a.png?v=2"), "/uploads/a.png?v=2");
});

test("스킴 판정은 문자가 아니라 파서가 한다 — 브라우저가 읽는 대로 읽는다", () => {
    // 소독기(`safeUrl.ts`)가 못박은 규율과 같은 자리다. `/^https:/` 문자 검사로 바꾸면 아래가 갈린다.
    // 제어문자 접두는 URL 파서가 걷어내 **https 로 읽는다** — 브라우저도 그렇게 읽으므로 통과가 옳다.
    assert.equal(bodyMediaSrc("\u0001https://cdn.example/a.png"), "\u0001https://cdn.example/a.png");
    // 스킴 안에 낀 탭은 파서가 URL 로 못 읽는다 — 여기서는 **안 그린다**(막는 쪽으로 어긋난다).
    assert.equal(bodyMediaSrc("ht\tps://cdn.example/a.png"), null);
    // 슬래시가 없는 https 도 파서가 https 로 읽는다(`https:evil…` 은 상대 경로가 아니다).
    assert.equal(bodyMediaSrc("https:evil.example/a.png"), "https:evil.example/a.png");
});

/**
 * **경계를 넘는 계약이라 생산자 쪽 꼴을 그대로 통과시킨다.**
 *
 * 삽입 문자열의 정본은 콘솔 `zalkera-frontend-partner` 의
 * `src/features/media/ui/MediaDrawer.tsx` — `` `![${asset.originalName}](media:${asset.id})` `` 다.
 * 여기서 그 **조립식 그대로** 만들어 본문 파이프라인 전체(파서 → 해석기)를 통과시킨다. 값만
 * 대사하면 두 레포가 각자 초록인 채 답이 갈린다.
 */
test("저작기 삽입 문자열이 본문 파이프라인을 끝까지 통과한다", () => {
    const [id, name] = [12, "제품 사진.png"];
    const blocks = parseMarkdown(`![${name}](media:${id})`);

    const [para] = blocks;
    assert.equal(para?.kind, "paragraph");
    const [image] = para!.kind === "paragraph" ? para!.text : [];
    assert.equal(image?.kind, "image");
    assert.equal(image!.kind === "image" ? image.alt : "", name, "alt 가 색인되려면 이름이 남아야 한다");
    assert.equal(bodyMediaSrc(image!.kind === "image" ? image.src : ""), `/media/${id}`);
});

test("🔴 자체 영상은 불변 참조만 받는다 — 외부 주소는 «없음» 이다", () => {
    // 이 그물이 없으면 본체를 `bodyMediaSrc` 위임으로 바꿔 외부 https 를 되살려도 초록이다
    // (AST 시험은 **함수 이름**만 잠근다). 그 형상에서는 방문자가 아무 조작도 안 했는데
    // `preload="metadata"` 가 그 호스트로 나가 IP·UA 가 제3자에게 간다.
    assert.equal(bodyVideoSrc("media:34"), "/media/34");
    for (const external of [
        "https://cdn.example/clip.mp4",
        "http://cdn.example/clip.mp4",
        "/uploads/clip.mp4",
        "media:abc",
        null,
    ]) {
        assert.equal(bodyVideoSrc(external), null, `${JSON.stringify(external)} 가 영상 주소가 됐다`);
    }
});
