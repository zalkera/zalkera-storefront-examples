import type {MetadataRoute} from "next";
import {siteUrl} from "@/lib/site";

/**
 * robots.txt — 크롤러에게 색인 범위와 sitemap 위치를 알린다(memo 50 W1).
 *
 * **막는 것은 세션·쓰기 경로뿐이다.** 장바구니·결제·마이페이지·주문조회·로그인은 개인 상태라
 * 색인되면 안 되고(개인정보 노출·중복 색인), 색인돼봐야 검색 가치가 0이다. 공개 카탈로그는 전부 연다 —
 * 우리가 원하는 게 정확히 그것(구글 리치결과·AI 발견)이기 때문이다.
 *
 * AI 크롤러(GPTBot·ClaudeBot 등)를 따로 막지 않는다: 독립 브랜드 사이트의 발견 경로는
 * 네이버 밖이고(memo 50 §9-3), 여기서 막으면 그 경로를 우리 손으로 닫는 셈이다.
 * 테넌트가 AI 학습 거부를 원하면 그때 이 파일에 해당 user-agent 를 추가한다.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: ["/api/", "/cart", "/checkout", "/mypage", "/orders", "/login", "/auth"],
            },
        ],
        sitemap: `${siteUrl()}/sitemap.xml`,
    };
}
