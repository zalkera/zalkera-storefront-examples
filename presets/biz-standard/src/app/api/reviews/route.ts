import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/**
 * "후기 더 보기" 아일랜드용 페이지 조회 프록시 — 브라우저가 이걸 친다.
 *
 * **왜 BFF 인가**: availability 와 같은 근거 — 읽기 공개 API 라도 브라우저 직호출은 baseUrl 노출·
 * `X-Tenant` 위조 면을 연다(`/media/[id]`·availability 선례). 인증은 안 붙인다(공개 읽기라 미리보기에서도 동작).
 *
 * **size 는 클라 입력을 안 받는다** — 상수 10 고정. 백엔드 전역 상한 부재를 방어하고, 상품 상세 RSC 의
 * 첫 페이지 `size:10` 과 반드시 일치시켜 페이지 경계를 어긋나지 않게 한다.
 */
export async function GET(req: Request) {
    const {searchParams} = new URL(req.url);
    const productId = Number(searchParams.get("productId"));
    if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({message: "productId 가 필요합니다."}, {status: 400});
    }
    const page = Number(searchParams.get("page"));
    if (!Number.isInteger(page) || page < 0) {
        return NextResponse.json({message: "page 가 올바르지 않습니다."}, {status: 400});
    }

    try {
        const reviews = await zalkera.listProductReviews(productId, {page, size: PAGE_SIZE});
        // 볼라틸은 아니지만 페이지 응답을 CDN 이 굳히면 낡은 페이지가 고정되므로 no-store.
        return NextResponse.json(reviews, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        return errorResponse(error);
    }
}

/** BFF 고정 페이지 크기 — 상품 상세 RSC 첫 페이지 size 와 반드시 일치. */
const PAGE_SIZE = 10;

/**
 * 후기 작성 BFF — 로그인 필수. 구매검증은 백엔드가 한다(본인 주문·배송완료·상품 일치 3중).
 *
 * body: {productId, orderItemId, rating, title?, content}. productId 는 후기 경로용,
 * orderItemId 는 작성 키(주문 상세 items[].id 에서 얻는다).
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 후기 작성이 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {productId, orderItemId, rating, title, content} = body;
    try {
        const review = await zalkera.createProductReview(
            Number(productId),
            {orderItemId: Number(orderItemId), rating: Number(rating), title: title || undefined, content},
            accessToken,
        );
        const response = NextResponse.json(review);
        setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        if (response.status === 401) setAuthHint(response, false);
        return response;
    }
}
