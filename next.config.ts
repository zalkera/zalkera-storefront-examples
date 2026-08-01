import type {NextConfig} from "next";

const config: NextConfig = {
    /**
     * **잘커라 호스팅의 실행 형식**(memo145 §3).
     *
     * 잘커라가 이 소스를 서빙할 때 실행하는 것은 `next start` 가 아니라 빌드 산출물
     * `.next/standalone/server.js` 다(`node server.js` 로 뜨는 자기완결 아티팩트를 :ro 로 마운트한다).
     * 이 키를 지우면 빌드는 성공해도 그 산출물이 안 나와 **서빙 게이트가 반려**한다.
     *
     * 계약은 키가 아니라 **산출물**이다: "잘커라가 서빙하는 소스는 빌드가 `.next/standalone`
     * 자기완결 산출물을 내야 한다." `output: "standalone"` 은 거기 도달하는 사실상 유일한 관용
     * 수단이라 여기 적어 둔다 — 다른 길로 같은 산출물을 낸다면 그것도 계약을 지킨 것이다.
     *
     * **자체 호스팅(BYO)이면 무관하다.** Vercel·자기 컨테이너·정적 export 무엇이든 자유이고,
     * 이 요건은 우리가 서빙 책임을 질 때만 붙는다(memo140 §6.5).
     *
     * 이 파일의 나머지는 소스를 받은 쪽의 것이다 — 이미지 도메인·리라이트·헤더는 마음대로 고쳐도
     * 된다(우리는 이 파일을 잠그지 않는다). 다만 위 산출물이 계속 나오는지만 지켜 주십시오.
     */
    output: "standalone",

    // 테넌트마다 다른 S3/CDN 미디어 도메인을 쓰므로 이미지 최적화 도메인 화이트리스트를 강제하지 않는다.
    // 필요하면 images.remotePatterns 로 각 사이트가 자기 CDN 을 추가한다.
};

export default config;
