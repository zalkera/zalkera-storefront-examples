// 서버 전용. 클라이언트 컴포넌트에서 import 하지 말 것 — baseUrl 이 노출된다.
import {createZalkeraClient} from "@zalkera/client";
import {apiBase, storefrontKey, tenantCode} from "@/lib/env";

/**
 * 잘커라 공개/커머스 API 클라이언트 싱글턴. RSC·route handler·server action 에서만 쓴다.
 * env: ZALKERA_API_BASE(백엔드 URL, /api 안 붙임), ZALKERA_TENANT(이 사이트 테넌트 코드),
 *      ZALKERA_STOREFRONT_KEY(서버 시크릿 키 — 있으면 X-Storefront-Key 로 전 요청 인증).
 */
export const zalkera = createZalkeraClient({
    baseUrl: apiBase(),
    tenant: tenantCode(),
    secretKey: storefrontKey(),
});
