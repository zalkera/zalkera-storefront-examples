import {test} from "node:test";
import assert from "node:assert/strict";
import {bodyMediaSrc, resolveMediaRef} from "./mediaRef.ts";
import {parseMarkdown} from "./markdown.ts";

/**
 * **저작기가 박는 문자열이 실제 주소가 되는가.**
 *
 * 이 그물이 없으면 본문 이미지가 **전부** `#` 이 된다(모르는 스킴 → 소독기가 무력화). 화면에는
 * 깨진 이미지가 뜨고, 브라우저는 그 쪽 HTML 을 이미지로 다시 요청한다. 팩은 그 상태로 배송돼
 * 있었다 — 렌더러가 `/media/{id}` 가 올 것이라고 **가정**했기 때문이다.
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
        assert.equal(bodyMediaSrc(bad), "#", `${bad} 가 주소가 됐다`);
    }
});

test("참조가 아닌 주소는 소독기를 그대로 탄다 — 해석을 끼워도 소독이 안 약해진다", () => {
    assert.equal(bodyMediaSrc("javascript:alert(1)"), "#");
    assert.equal(bodyMediaSrc("//evil.example/a.png"), "#");
    assert.equal(bodyMediaSrc("/..//evil.example/a.png"), "#");
    assert.equal(bodyMediaSrc(null), "#");
    assert.equal(bodyMediaSrc("/media/12"), "/media/12");
    assert.equal(bodyMediaSrc("https://cdn.example/a.png"), "https://cdn.example/a.png");
});

test("이미지 주소는 링크 주소보다 좁다 — 소독기가 통과시키는 것도 여기서 걸린다", () => {
    // 링크로는 정당하지만 이미지로는 아닌 것들. `src="#조각"` 은 그 쪽 HTML 을 이미지로 다시 받는다.
    for (const notAnImage of ["mailto:a@b.co", "tel:+8210", "#section-2", "?page=2"]) {
        assert.equal(bodyMediaSrc(notAnImage), "#", `${notAnImage} 가 이미지 주소가 됐다`);
    }
    // http 는 혼합 콘텐츠로 어차피 막힌다 — 막히는 그림은 안 그린다.
    assert.equal(bodyMediaSrc("http://cdn.example/a.png"), "#");
    // 그 좁힘이 정상 주소까지 먹지 않는다(음성 짝의 양성 짝).
    assert.equal(bodyMediaSrc("HTTPS://CDN.example/a.png"), "HTTPS://CDN.example/a.png");
    assert.equal(bodyMediaSrc("/uploads/a.png?v=2"), "/uploads/a.png?v=2");
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
