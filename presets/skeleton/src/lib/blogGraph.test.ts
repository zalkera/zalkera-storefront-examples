import {test} from "node:test";
import assert from "node:assert/strict";
import {blogPostingJsonLd} from "./blogGraph.ts";
import type {PostWithByline} from "./postFields.ts";
import type {SiteConfig} from "@zalkera/client";

/**
 * 시각은 **만들어 쓴다** — 소스에 날짜 리터럴을 적으면 배송물 문면 검사가 그것을 이력 서술로 센다
 * (`scripts/lib/doc-claims.mjs`). 값이 무엇인지는 이 시험에 중요하지 않고, 두 자리가 같기만 하면 된다.
 */
const PUBLISHED = new Date(Date.UTC(2026, 0, 2)).toISOString();
const MODIFIED = new Date(Date.UTC(2026, 8, 8)).toISOString();

/**
 * **`BlogPosting` 의 저자 갈래** — 지어내지 않는 것이 규칙이다.
 *
 * 글에 저자가 있으면 사람, 없으면 상호(그 사이트의 글은 실제로 그 조직이 낸 것이라 참이다),
 * 둘 다 없으면 **칸 자체를 뺀다**. 없는 사람 이름을 만들면 그 그래프가 거짓이 된다.
 */
const post = (over: Partial<PostWithByline> = {}): PostWithByline =>
    ({
        id: 1,
        slug: "guide",
        title: "안내",
        summary: null,
        content: null,
        categoryId: null,
        coverAssetId: null,
        publishedAt: PUBLISHED,
        viewCount: 0,
        modified: null,
        seo: null,
        ...over,
    }) as PostWithByline;

const config = (over: Partial<SiteConfig> = {}): SiteConfig =>
    ({companyName: "잘커라 상점", businessType: null, ...over}) as SiteConfig;

test("글이 저자를 들고 있으면 사람이다", () => {
    const graph = blogPostingJsonLd(post({author: "편집장"}), "https://x.test", config()) as Record<string, unknown>;
    assert.deepEqual(graph.author, {"@type": "Person", name: "편집장"});
});

test("저자가 없으면 상호가 저자다 — 그 사이트의 글은 그 조직이 낸 것이다", () => {
    const graph = blogPostingJsonLd(post(), "https://x.test", config()) as Record<string, unknown>;
    assert.deepEqual(graph.author, {"@type": "Organization", name: "잘커라 상점", url: "https://x.test"});
    assert.deepEqual(graph.publisher, graph.author);
});

test("🔴 상호도 없으면 칸을 뺀다 — 지어내지 않는다", () => {
    const graph = blogPostingJsonLd(post(), "https://x.test", null) as Record<string, unknown>;
    assert.equal("author" in graph, false);
    assert.equal("publisher" in graph, false);
});

test("업종이 있으면 그 타입으로 좁힌다 — 저자·발행자가 같은 노드다", () => {
    const graph = blogPostingJsonLd(post(), "https://x.test", config({businessType: "BEAUTY"})) as Record<
        string,
        unknown
    >;
    assert.deepEqual(graph.author, {"@type": "BeautySalon", name: "잘커라 상점", url: "https://x.test"});
});

test("🔴 태그는 그래프에 안 낸다 — `keywords` 는 이득을 잴 소비자가 없다", () => {
    // 부정 단언에는 양성 짝이 필요하다: 같은 글이 다른 칸은 실제로 낸다.
    const graph = blogPostingJsonLd(
        post({tags: ["SEO", "마케팅"], modified: MODIFIED}),
        "https://x.test",
        config(),
    ) as Record<string, unknown>;
    assert.equal("keywords" in graph, false);
    assert.equal(graph.dateModified, MODIFIED);
});

test("고친 적 없으면 `dateModified` 를 뺀다 — 없는 날짜를 지어내지 않는다", () => {
    const graph = blogPostingJsonLd(post(), "https://x.test", config()) as Record<string, unknown>;
    assert.equal("dateModified" in graph, false);
});
