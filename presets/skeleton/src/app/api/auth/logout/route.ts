// zalkera-allow-preview-write: 자기 세션만 닫는다 — 막으면 프리뷰에서 로그아웃 뒤 화면을 못 본다.
import {NextResponse} from "next/server";
import {assertSameOrigin} from "@/lib/http";
import {zalkera} from "@/lib/zalkera";
import {clearCustomerTokens, getAccessToken, rotateCartSessionKey} from "@/lib/session";
import {setAuthHint} from "@/lib/authHint";

/** 로그아웃 — 백엔드 세션 폐기 + 쿠키 삭제. */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const accessToken = await getAccessToken();
    if (accessToken) {
        await zalkera.logout(accessToken).catch(() => undefined);
    }
    await clearCustomerTokens();
    const response = NextResponse.json({ok: true});
    // 세션 종료 → 낙관적 로그인 힌트도 비운다(헤더가 즉시 익명 크롬으로 돌아가게).
    setAuthHint(response, false);
    // ⚠ **게스트 카트 키도 돌린다.** `clearCustomerTokens()` 는 토큰 쿠키만 지우므로, 이 줄이 없으면
    //    로그아웃 뒤에도 같은 카트 키가 남아 다음 요청의 `X-Cart-Session` 으로 그대로 나간다 —
    //    매장·키오스크 같은 공용 브라우저에서 앞사람이 담은 것이 다음 방문자에게 이어진다.
    //    로그아웃은 "내 흔적을 지운다"는 기대가 걸린 자리라 거기서 카트만 남으면 기대와 어긋난다.
    //
    //    ⚠ 삭제가 아니라 **회전**이다 — 쿠키를 지우면 다음 담기에서 새 키가 나기까지 빈 구간이 생기고,
    //    `co-{cartSessionKey}` 멱등 불변식이 키 부재를 전제로 하지 않는다(위 헬퍼 머리말).
    //
    //    회원 카트는 이 경로로 노출되지 않는다 — 백엔드가 로그인 중 만든 카트에 `sessionKey` 를 안
    //    심고(`ShopCartService.resolveOrCreate`: `sessionKey = if (customerId == null) sessionKey else null`),
    //    회원 조회는 세션키를 아예 안 본다. 새는 것은 **그 브라우저의 게스트 카트**다.
    rotateCartSessionKey(response);
    return response;
}
