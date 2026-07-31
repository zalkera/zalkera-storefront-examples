import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse, invalidBody, readJsonBody} from "@/lib/http";
import {isPreview} from "@/lib/preview";

/**
 * 문의 접수 BFF — **공개(인증 없음)**. IP 민감 호출의 clientIp 관용구 **정본**이다(memo 57 축C).
 *
 * ⚠️ **clientIp 를 안 넘기면 방문자 전원이 레이트리밋에 걸린다.** 백엔드의 문의 레이트리밋은
 * `X-Forwarded-For` 첫 홉을 테넌트×IP 로 센다(분당 3건 공유). clientIp 를 안 주면 백엔드가 보는 건
 * 테넌트 서버 IP 하나뿐이라, 분당 4번째 방문자부터 **전원 429** 가 된다. 그래서 원 방문자 IP 를
 * `x-forwarded-for` 에서 뽑아 넘긴다 — IP 민감 호출(inquiry·lead·조회수)은 전부 이 관용구를 복제하라.
 */
export async function POST(req: Request) {
    if (isPreview()) {
        return NextResponse.json({message: "프리뷰 모드에서는 문의가 비활성화됩니다."}, {status: 403});
    }
    // 원 방문자 IP — 프록시 체인의 첫 홉. 이걸 안 넘기면 위 주석의 사고가 난다.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const input = await readJsonBody(req);
    if (!input) return invalidBody();
    try {
        const created = await zalkera.submitInquiry(input, {clientIp: ip});
        return NextResponse.json(created);
    } catch (error) {
        return errorResponse(error);
    }
}
