import {parseProviderParam} from "@/lib/oauth";
import {CallbackHandler} from "./CallbackHandler";

/**
 * OAuth 콜백 페이지 (RSC 껍데기). provider 는 라우트 파라미터(소문자), code·state·error 는 쿼리로 온다.
 * 실제 교환은 CallbackHandler(클라이언트)가 한다 — state 대조에 sessionStorage 가 필요하기 때문.
 */
export default async function CallbackPage({
    params,
    searchParams,
}: {
    params: Promise<{provider: string}>;
    searchParams: Promise<{code?: string; state?: string; error?: string}>;
}) {
    const {provider: raw} = await params;
    const sp = await searchParams;
    const provider = parseProviderParam(raw);

    return (
        <main>
            <h1>로그인 처리 중…</h1>
            <CallbackHandler
                provider={provider}
                code={sp.code}
                state={sp.state}
                providerError={sp.error ?? null}
            />
        </main>
    );
}
