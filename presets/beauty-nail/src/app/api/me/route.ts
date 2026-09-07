import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {clearCustomerTokens, getAccessToken, rotateCartSessionKey} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";
import {isPreview} from "@/lib/preview";

/**
 * 로그인 고객의 **프로필 수정**과 **회원 탈퇴**.
 *
 * ⛔ **탈퇴는 되돌릴 수 없다** — 프로필 PII 가 비식별화되고 소셜 연결과 모든 세션이 폐기된다.
 * 그래서 화면(`AccountSettings`)이 확인 단계를 거치고, 이 라우트는 그 확인을 다시 묻지 않는다.
 * ⚠ **주문 이력은 남는다**(전자상거래법상 보존). 「모든 기록이 삭제됩니다」로 안내하면 거짓이다.
 */

/** 프로필 수정 — 넘긴 값만 바뀐다(`undefined` 는 「안 바꾼다」이지 「지운다」가 아니다). */
export async function PATCH(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 프로필 수정이 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    const body = await readJsonBody(req);
    if (!body) return invalidBody();
    const {name, phone} = body as {name?: unknown; phone?: unknown};
    try {
        const me = await zalkera.updateMe(accessToken, {
            // ⚠ 빈 문자열을 그대로 보내면 이름을 «지우는» 요청이 된다. 안 건드린 칸은 빼서 보낸다.
            ...(typeof name === "string" && name.trim() ? {name: name.trim()} : {}),
            ...(typeof phone === "string" && phone.trim() ? {phone: phone.trim()} : {}),
        });
        // 개인 정보 — 캐시 금지(형제 라우트와 같은 규율).
        return NextResponse.json({me}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * 회원 탈퇴. 성공하면 **손에 든 토큰이 죽은 값**이므로 로그아웃과 같은 정리를 함께 한다 —
 * 쿠키 삭제 · 로그인 힌트 해제 · 게스트 카트 키 회전(공용 브라우저에서 앞사람 카트가 안 이어지게).
 */
export async function DELETE(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    // ⛔ 미리보기에서는 막는다 — 되돌릴 수 없는 파괴다(로그아웃과 다르다).
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 탈퇴가 비활성화됩니다."}, {status: 403});
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({message: "로그인이 필요합니다."}, {status: 401});
    try {
        const message = await zalkera.withdrawMe(accessToken);
        await clearCustomerTokens();
        const response = NextResponse.json({message});
        setAuthHint(response, false);
        rotateCartSessionKey(response);
        return response;
    } catch (error) {
        // ⚠ 실패하면 **쿠키를 지우지 않는다.** 지우면 「탈퇴는 안 됐는데 로그아웃만 된」 상태가 되고,
        //    사용자는 무엇이 일어났는지 알 길이 없다.
        return errorResponse(error);
    }
}
