// zalkera-allow-preview-write: 로그인 흐름 — 막으면 프리뷰에서 로그인한 화면을 못 본다.
import {NextResponse} from "next/server";
import {assertJsonContentType, assertSameOrigin} from "@/lib/http";
import {PROVIDER_CONFIG, buildAuthorizeUrl, callbackPath, parseProviderParam} from "@/lib/oauth";
import {issueOAuthState} from "@/lib/session";

/**
 * 소셜 로그인 **개시** — state 를 서버가 발행해 httpOnly 쿠키에 심고 authorize URL 을 돌려준다.
 *
 * 종전에는 브라우저가 `crypto.randomUUID()` 로 state 를 만들어 sessionStorage 에 넣었다. 그러면 그 검사는
 * **우리 클라이언트 코드가 실행될 때만** 산다 — BYO 고객이 자기 로그인 화면을 새로 짜거나 AI 가 그 파일을
 * 다시 쓰면 조용히 사라진다. 서버가 발행하면 어떤 프론트엔드가 붙든 교환 라우트가 스스로 방어한다.
 *
 * **`redirect_uri` 를 본문에서 받지 않는다.** 요청이 도달한 오리진에서 파생한다 — 클라이언트가 보낸 값을
 * 그대로 authorize 에 실으면 열린 리다이렉터가 된다. 교환 시점에도 같은 방식으로 파생해야 두 값이 맞는다.
 */
export async function POST(req: Request) {
    const blocked = assertSameOrigin(req);
    if (blocked) return blocked;
    const badType = assertJsonContentType(req);
    if (badType) return badType;

    const body = await req.json().catch(() => null);
    const provider = parseProviderParam(String(body?.provider ?? ""));
    if (!provider) {
        return NextResponse.json({message: "지원하지 않는 로그인 방식입니다.", code: "INVALID_BODY"}, {status: 400});
    }
    if (!PROVIDER_CONFIG[provider].clientId) {
        // 미설정 provider 는 조용히 실패시키지 않는다 — 운영자가 무엇을 안 채웠는지 알아야 한다.
        return NextResponse.json(
            {
                message: `${PROVIDER_CONFIG[provider].label} 로그인이 아직 설정되지 않았습니다.`,
                code: "PROVIDER_NOT_CONFIGURED",
            },
            {status: 503},
        );
    }

    const origin = req.headers.get("origin")!; // assertSameOrigin 이 존재·일치를 이미 보장한다.
    const state = await issueOAuthState(provider);
    return NextResponse.json({
        authorizeUrl: buildAuthorizeUrl(provider, `${origin}${callbackPath(provider)}`, state),
        // 클라이언트의 sessionStorage 대조(UX)용으로만 돌려준다 — **방어는 쿠키가 한다.**
        // state 는 authorize URL 에도 그대로 실려 나가므로 여기서 돌려주는 것이 비밀을 더 노출하지 않는다.
        state,
    });
}
