import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {getShopSession} from "@/lib/session";
import {isPreview} from "@/lib/preview";

/**
 * 수량 변경.
 *
 * ⚠ 이 레포에는 이 PATCH 의 호출부가 없다(카트 UI 는 DELETE 만 쓴다) — 즉 **회귀 테스트가 없는
 * 계약이다.** 다운스트림 사이트가 `fetch(url, {method:"PATCH", body: JSON.stringify(x)})` 처럼
 * 헤더를 빠뜨리면 브라우저가 `text/plain;charset=UTF-8` 을 붙여 **415** 가 된다. 호출부를 새로
 * 쓰는 사람은 `Content-Type: application/json` 을 반드시 실어라.
 */
export async function PATCH(req: Request, {params}: {params: Promise<{variantId: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    // 본문을 읽는 라우트라 ③층(CT 강제)도 건다 — `<form enctype="text/plain">` 운반체를 막는다.
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 프로덕션 데이터 오염 방지로 쓰기를 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 장바구니 변경가 비활성화됩니다."}, {status: 403});
    }
    const {variantId} = await params;
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {quantity} = body;
    try {
        return NextResponse.json(
            await zalkera.updateCartItem(Number(variantId), Number(quantity), await getShopSession()),
        );
    } catch (error) {
        return errorResponse(error);
    }
}

/** 항목 삭제. */
export async function DELETE(req: Request, {params}: {params: Promise<{variantId: string}>}) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    // 프리뷰 모드(memo29 §3)는 읽기전용 — 프로덕션 데이터 오염 방지로 쓰기를 차단한다.
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 장바구니 변경가 비활성화됩니다."}, {status: 403});
    }
    const {variantId} = await params;
    try {
        return NextResponse.json(await zalkera.removeFromCart(Number(variantId), await getShopSession()));
    } catch (error) {
        return errorResponse(error);
    }
}
