// 서버 전용. 클라이언트 컴포넌트에서 import 하지 말 것 — baseUrl 이 노출된다.
import {createZalkeraClient} from "@zalkera/client";
import {apiBase, storefrontKey, tenantCode} from "@/lib/env";
import {bindSocialExchange} from "@/lib/oauthState";

/**
 * 잘커라 공개/커머스 API 클라이언트 싱글턴. RSC·route handler·server action 에서만 쓴다.
 * env: ZALKERA_API_BASE(백엔드 URL, /api 안 붙임), ZALKERA_TENANT(이 사이트 테넌트 코드),
 *      ZALKERA_STOREFRONT_KEY(서버 시크릿 키 — 있으면 X-Storefront-Key 로 전 요청 인증).
 *
 * **`socialLogin` 은 싱글턴에서 뗀다** — 소셜 교환은 `exchangeSocialLogin` 한 입구로만 한다. 그 입구가 state 쿠키
 * 대조·소각을 교환보다 먼저 하므로, 교환을 새로 짜는 코드가 대조를 빠뜨릴 수 없다(`@/lib/oauthState`).
 * 클라이언트를 이 파일 밖에서 또 만들면 그 보장이 사라진다 — `guardWiring.test.ts` 가 막는다.
 */
const {socialLogin, ...client} = createZalkeraClient({
    baseUrl: apiBase(),
    tenant: tenantCode(),
    secretKey: storefrontKey(),
});

export const zalkera = client;

export const exchangeSocialLogin = bindSocialExchange(socialLogin, () => process.env.NODE_ENV === "production");
