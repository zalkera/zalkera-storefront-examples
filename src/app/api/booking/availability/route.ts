import {NextResponse} from "next/server";
import {zalkera} from "@/lib/zalkera";
import {errorResponse} from "@/lib/http";

/**
 * 예약 가용 슬롯 프록시 — 브라우저(아일랜드)가 이걸 부른다.
 *
 * **왜 공개 API인데 BFF를 거치나**: `availability` 는 비인증 공개이지만, 서버 전용 불변식(llms.txt §2)의
 * 근거는 인증이 아니라 **baseUrl 은닉·`X-Tenant` 헤더 신뢰·CORS**다. 브라우저에서 직접 부르면 백엔드
 * 주소가 노출되고 테넌트 헤더를 위조할 면이 열린다(`/media/[id]` 프록시가 같은 선례).
 *
 * **왜 서버 렌더가 아니라 여기냐**: 슬롯은 볼라틸이다 — 옆 손님이 방금 잡으면 바뀐다. 상품 상세는
 * ISR(`force-static`+300s)이라 거기서 구우면 **5분 낡은 시간표**를 보여주고 `SLOT_FULL` 을 만든다.
 * 볼라틸은 클라이언트 아일랜드로 내리고, 그 아일랜드가 이 라우트를 친다.
 */
export async function GET(req: Request) {
    const {searchParams} = new URL(req.url);
    const productId = Number(searchParams.get("productId"));
    if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({message: "productId 가 필요합니다."}, {status: 400});
    }

    // 조회 창 — 클라이언트가 준 값을 그대로 백엔드에 넘기지 않는다. 백엔드 자체 상한이 있는지
    // 미확인이라(설계 §45 명시), 여기서 클램프해 과대 조회를 막는다.
    const now = Date.now();
    const from = parseAt(searchParams.get("from")) ?? now;
    const to = parseAt(searchParams.get("to")) ?? from + DEFAULT_WINDOW_MS;
    const clampedTo = Math.min(to, from + MAX_WINDOW_MS);
    if (clampedTo <= from) {
        return NextResponse.json({message: "조회 구간이 올바르지 않습니다."}, {status: 400});
    }

    try {
        const slots = await zalkera.availability({
            productId,
            from: new Date(from).toISOString(),
            to: new Date(clampedTo).toISOString(),
        });
        // 볼라틸이라 캐시 금지 — CDN·브라우저가 시간표를 굳히면 이 라우트를 만든 이유가 사라진다.
        return NextResponse.json(slots, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        return errorResponse(error);
    }
}

/** ISO-8601 → epoch ms. 파싱 불가면 null(호출부가 기본값으로 강하). */
function parseAt(raw: string | null): number | null {
    if (!raw) return null;
    const at = Date.parse(raw);
    return Number.isNaN(at) ? null : at;
}

/**
 * 기본 조회 창 = 상한과 같은 31일(§46 후속).
 *
 * 처음엔 14일이었는데 **침묵 실패를 냈다**: 스모크 슬롯이 8/3~8/10 인데 그날이 7/17 이라 기본 창
 * (7/31) 밖이었고, 화면은 "지금 예약할 수 있는 시간이 없습니다"를 띄웠다 — **슬롯이 있는데 없다고
 * 한 것**이다. 한 달 앞서 슬롯을 여는 건 뷰티 정상 운영이라 이건 거래처 재량이 아니라 기본값의 결함이다.
 * 기본을 상한과 같게 두면 "안 보이는 슬롯"이 구조적으로 사라진다 — 좁혀서 얻는 게 없다.
 */
const DEFAULT_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
/** 상한 31일 — 백엔드 자체 창 제한은 미확인이라 여기서 막는다(과대 조회 방어). */
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
