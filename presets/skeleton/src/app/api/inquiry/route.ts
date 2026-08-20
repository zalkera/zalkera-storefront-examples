import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {assertJsonContentType, assertSameOrigin, errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {isPreview} from "@/lib/preview";
import {visitorIp} from "@zalkera/client";

/**
 * 문의 접수 BFF — **공개(인증 없음)**. IP 민감 호출의 clientIp 관용구 **정본**이다.
 *
 * ⚠️ **clientIp 를 안 넘기면 방문자 전원이 레이트리밋에 걸린다.** 백엔드의 문의 레이트리밋은
 * **테넌트×IP** 로 센다(분당 3건 공유 · 성공·실패 무관 전 호출 계수). clientIp 를 안 주면 백엔드가 보는 건
 * 테넌트 서버 IP 하나뿐이라, 분당 4번째 방문자부터 **전원 429** 가 된다. 그래서 원 방문자 IP 를
 * `visitorIp(req.headers)` 로 뽑아 넘긴다 — IP 민감 호출(inquiry·lead·조회수)은 전부 이 관용구를 복제하라.
 *
 * ⚠️ **첫 홉을 직접 쓰지 마라**(`x-forwarded-for` 의 첫 엔트리는 방문자가 위조할 수 있다). `visitorIp` 는
 * 신뢰 프록시 홉 수를 기준으로 뒤에서부터 채택한다.
 *
 * ⚠️ **그 흡수는 홉 수가 배포와 맞을 때만 성립한다.** 홉 수는 `ZALKERA_TRUSTED_PROXY_HOPS` 로 정하고
 * 기본값은 1(맨 뒤 항목)이다. 프록시가 없으면 XFF 전체가 방문자가 쓴 문자열이라 **맨 뒤도 위조값**이고,
 * 반대로 프록시가 2단인데 1로 두면 프록시 IP 를 방문자로 읽어 전 방문자가 같은 칸을 쓴다.
 * 배포마다 세어서 넣어야 하고, 모르면 `0`(주장하지 않음)이 안전하다 — `.env.example` 참조.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;
    if (isPreview()) {
        return NextResponse.json({message: "미리보기 모드에서는 문의가 비활성화됩니다."}, {status: 403});
    }
    // 원 방문자 IP. 이걸 안 넘기면 위 주석의 사고가 난다(첫 홉 직접 추출은 위조 가능·금지).
    const ip = visitorIp(req.headers);
    const input = await readJsonBody(req);
    if (!input) return invalidBody();
    try {
        const created = await zalkera.submitInquiry(input, {clientIp: ip});
        return NextResponse.json(created);
    } catch (error) {
        return errorResponse(error);
    }
}
