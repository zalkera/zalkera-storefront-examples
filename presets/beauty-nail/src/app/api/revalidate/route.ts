// zalkera-allow-preview-write: 고객 데이터가 아니라 캐시이고, 시크릿 헤더가 없으면 401 이다.
// zalkera-allow-cross-origin: 시크릿 헤더가 없으면 401 — 앰비언트 권한에 기대지 않는다.
//
// ⚠ 마커의 이유는 **한 줄**이다 — 검사기가 면제 목록에 출력하는 것이 그 한 줄이라, 두 줄로 쓰면
// 목록에 문장이 잘린 채 찍힌다(그렇게 잘려 있었다). 부연은 아래처럼 마커 밖 주석으로 적는다.
//
// 자격증명은 `x-oneque-revalidate-secret` 헤더이고, 없으면 401 이라 쿠키에 기대지 않는다.
// 즉 CSRF 개념이 성립하지 않는다.
// 근거가 "브라우저가 아니다"가 **아니라는** 점이 중요하다 — 브라우저에서 불려도 시크릿이 없으면 막힌다.
import {NextResponse} from "next/server";
import {revalidatePath, revalidateTag} from "next/cache";

/**
 * 온디맨드 revalidate. ISR-우선 서빙에서 신선도를 지키는 정본 경로:
 * SEO 페이지는 per-request SSR 하지 않고 CDN 캐시를 서빙하되, **백엔드 데이터가 바뀌면**
 * 백엔드가 이 엔드포인트를 호출해 해당 path/tag 의 캐시를 무효화한다(발행·상품변경 훅).
 *
 * 인증: 공유 시크릿 헤더(`x-oneque-revalidate-secret` == env `ZALKERA_REVALIDATE_SECRET`).
 * 헤더 **이름은 그대로다** — 백엔드 RevalidateClient 가 보내는 와이어 이름이라 양쪽 동시 변경 전엔 못 바꾼다.
 * 시크릿 미설정이면 안전을 위해 비활성(503). 이 라우트는 상태를 바꾸지 않는 서버 함수라
 * SEO 라우트가 아니다(validator ISR 게이트 대상 아님 — api/ 는 제외).
 *
 * body: { paths?: string[], tags?: string[] }  →  { revalidated: true, paths, tags }
 */
export async function POST(req: Request) {
    const secret = process.env.ZALKERA_REVALIDATE_SECRET;
    if (!secret) {
        return NextResponse.json({message: "ZALKERA_REVALIDATE_SECRET 미설정 — revalidate 비활성."}, {status: 503});
    }
    if (req.headers.get("x-oneque-revalidate-secret") !== secret) {
        return NextResponse.json({message: "invalid secret"}, {status: 401});
    }

    let body: {paths?: unknown; tags?: unknown};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({message: "invalid json body"}, {status: 400});
    }

    const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
    const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];

    if (paths.length === 0 && tags.length === 0) {
        return NextResponse.json({message: "paths 또는 tags 중 하나는 있어야 합니다."}, {status: 400});
    }

    for (const p of paths) revalidatePath(p);
    // Next 16: route handler 에서의 온디맨드 태그 무효화는 두 번째 인자 "max"(즉시 만료)로 호출한다.
    for (const t of tags) revalidateTag(t, "max");

    return NextResponse.json({revalidated: true, paths, tags, now: Date.now()});
}
