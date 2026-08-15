import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertSameOrigin, errorResponse} from "@/lib/http";
import {getShopSession} from "@/lib/session";
import {isPreview} from "@/lib/preview";

const EMPTY = {items: [], subtotal: 0, currency: "KRW"};

/** 장바구니 조회. 식별자(토큰·게스트키)가 없으면 빈 카트. */
export async function GET() {
    const session = await getShopSession();
    if (!session.accessToken && !session.cartSessionKey) return NextResponse.json(EMPTY);
    try {
        return NextResponse.json(await zalkera.getCart(session));
    } catch (error) {
        return errorResponse(error);
    }
}

/** 장바구니 비우기. */
export async function DELETE(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 프로덕션 데이터 오염 방지로 쓰기를 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 장바구니 변경이 비활성화됩니다."}, {status: 403});
    }
    const session = await getShopSession();
    if (!session.accessToken && !session.cartSessionKey) return NextResponse.json(EMPTY);
    try {
        return NextResponse.json(await zalkera.clearCart(session));
    } catch (error) {
        return errorResponse(error);
    }
}
