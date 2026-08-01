import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {ZalkeraError} from "@zalkera/client";
import {zalkera} from "@/lib/zalkera";
import {parseSeo} from "@/lib/seo";
import {siteUrl} from "@/lib/site";
import {JsonLd, blogPostingJsonLd, breadcrumbJsonLd} from "@/components/JsonLd";
import {ViewBeacon} from "./ViewBeacon";

/**
 * 블로그/공지 상세 (RSC · ISR). 발행글은 세션 무관 읽기라 상품 상세와 같은 사상으로 굽는다:
 * 첫 요청에 렌더한 뒤 `revalidate` 주기로 캐시. posts 는 태그 무효화가 없어(SDK 가 ReadOptions 를
 * 안 받는다) 시간 기반 revalidate 만 건다. generateStaticParams 는 두지 않는다(글이 유동적 → on-demand ISR).
 */
export const dynamic = "force-static";
export const revalidate = 300;

/**
 * generateMetadata 와 페이지가 **같은 인자로** 부르므로 Next request memoization 이 1회로 합친다 —
 * 인자가 갈리면 조용히 2회가 된다(상품 상세와 같은 관례).
 */
function loadPost(slug: string) {
    return zalkera.getPost(slug);
}

export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
    const {slug} = await params;
    const post = await loadPost(slug).catch((error) => {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    });
    const seo = parseSeo(post.seo);
    return {
        title: seo.title ?? post.title,
        description: seo.description ?? post.summary ?? undefined,
    };
}

export default async function BlogPostPage({params}: {params: Promise<{slug: string}>}) {
    const {slug} = await params;

    let post;
    try {
        post = await loadPost(slug);
    } catch (error) {
        if (error instanceof ZalkeraError && error.status === 404) notFound();
        throw error;
    }

    const base = siteUrl();

    return (
        <main>
            {/* 검색·AI 발견용 구조화 데이터 — 아래 보이는 내용과만 일치시킨다(저자·가짜 이미지 금지). */}
            <JsonLd data={blogPostingJsonLd(post, base)} />
            <JsonLd
                data={breadcrumbJsonLd([
                    {name: "홈", url: base},
                    {name: "블로그", url: `${base}/blog`},
                    {name: post.title, url: `${base}/blog/${post.slug}`},
                ])}
            />
            <h1>{post.title}</h1>
            {post.publishedAt && (
                <time className="text-sm text-muted">
                    {new Date(post.publishedAt).toLocaleDateString("ko-KR", {timeZone: "Asia/Seoul"})}
                </time>
            )}
            {/* 커버 이미지 — /media/{id} 안정 URL(W4). next/image 는 바이트를 Next 런타임에 태우므로
                쓰지 않는다. 없으면 아무것도 안 그린다. */}
            {post.coverAssetId != null && (
                <img
                    src={`/media/${post.coverAssetId}`}
                    alt={post.title}
                    loading="lazy"
                    className="my-4 h-auto max-w-full rounded-lg"
                />
            )}
            {/* 본문 — 마크다운 렌더러를 붙이지 않는다(D5). 백엔드가 준 문자열 그대로 pre-wrap. */}
            {post.content && <div className="whitespace-pre-wrap">{post.content}</div>}
            {/* 조회수 비콘 — RSC 에서 recordPostView 를 직접 부르면 ISR 프리렌더가 조회를 세므로 금지.
                브라우저 아일랜드가 BFF(/api/posts/{slug}/view)를 친다. */}
            <ViewBeacon slug={slug} />
        </main>
    );
}
