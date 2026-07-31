import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";
import {getShopSession} from "@/lib/session";

/** 수량 변경. */
export async function PATCH(req: Request, {params}: {params: Promise<{variantId: string}>}) {
    const {variantId} = await params;
    const {quantity} = await req.json();
    try {
        return NextResponse.json(
            await zalkera.updateCartItem(Number(variantId), Number(quantity), await getShopSession()),
        );
    } catch (error) {
        return errorResponse(error);
    }
}

/** 항목 삭제. */
export async function DELETE(_req: Request, {params}: {params: Promise<{variantId: string}>}) {
    const {variantId} = await params;
    try {
        return NextResponse.json(await zalkera.removeFromCart(Number(variantId), await getShopSession()));
    } catch (error) {
        return errorResponse(error);
    }
}
