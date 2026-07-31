import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {getShopSession} from "@/lib/session";

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
export async function DELETE() {
    const session = await getShopSession();
    if (!session.accessToken && !session.cartSessionKey) return NextResponse.json(EMPTY);
    try {
        return NextResponse.json(await zalkera.clearCart(session));
    } catch (error) {
        return errorResponse(error);
    }
}
