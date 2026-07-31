import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {isPreview} from "@/lib/preview";

/**
 * 광고 랜딩 리드 접수 BFF — **공개(인증 없음)**. inquiry/route.ts 의 clientIp 관용구 복제.
 *
 * ⚠️ **clientIp 를 안 넘기면 방문자 전원이 레이트리밋에 걸린다.** 백엔드 리드 레이트리밋은
 * `X-Forwarded-For` 첫 홉을 테넌트×IP 로 센다(30건/60초 공유). clientIp 를 안 주면 백엔드가 보는 건
 * 테넌트 서버 IP 하나뿐이라, 창당 31번째 방문자부터 **전원 429** 가 된다. 그래서 원 방문자 IP 를
 * `x-forwarded-for` 첫 홉에서 뽑아 넘긴다(문의·조회수 비콘과 동일 관용구).
 *
 * 성공은 201 을 관통시킨다(inquiry 는 200 으로 뭉갠다) — 리드 생성은 새 리소스라 201 이 맞다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 리드 접수가 비활성화됩니다."}, {status: 403});
    }
    const input = await readJsonBody(req);
    if (!input) return invalidBody();
    // 원 방문자 IP — 프록시 체인의 첫 홉. 이걸 안 넘기면 위 주석의 사고가 난다.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    try {
        const created = await zalkera.submitLead(input, {clientIp: ip});
        return NextResponse.json(created, {status: 201});
    } catch (error) {
        return errorResponse(error);
    }
}
