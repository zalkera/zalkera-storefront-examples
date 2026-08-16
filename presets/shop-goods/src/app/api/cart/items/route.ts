import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {ensureCartSessionKey, getAccessToken} from "@/lib/session";
import {isPreview} from "@/lib/preview";
import {setAuthHint} from "@/lib/authHint";

/** 장바구니 담기 — 게스트면 카트 세션키를 만들어 쿠키에 심고, 그 키로 담는다. */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드는 읽기전용 — 프로덕션 데이터 오염 방지로 쓰기를 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 장바구니 변경이 비활성화됩니다."}, {status: 403});
    }
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {variantId, quantity} = body;
    // 게스트 카트키를 확보(없으면 생성)해 명시적으로 세션을 구성한다 — 같은 요청에서 재조회에 의존하지 않는다.
    const cartSessionKey = await ensureCartSessionKey();
    const accessToken = await getAccessToken();
    try {
        const cart = await zalkera.addToCart(Number(variantId), Number(quantity) || 1, {accessToken, cartSessionKey});
        const response = NextResponse.json(cart);
        // 로그인 고객의 성공 액션이면 힌트를 갱신(재로그인 없이 30일 슬라이딩) — 게스트면 손대지 않는다.
        if (accessToken) setAuthHint(response, true);
        return response;
    } catch (error) {
        const response = errorResponse(error);
        // stale 힌트 정리: 로그인 토큰으로 호출했는데 401 이면 세션이 죽은 것 → 힌트를 비운다.
        if (accessToken && response.status === 401) setAuthHint(response, false);
        return response;
    }
}
