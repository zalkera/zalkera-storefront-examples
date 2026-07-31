import type {NextConfig} from "next";

const config: NextConfig = {
    // 테넌트마다 다른 S3/CDN 미디어 도메인을 쓰므로 이미지 최적화 도메인 화이트리스트를 강제하지 않는다.
    // 필요하면 images.remotePatterns 로 각 사이트가 자기 CDN 을 추가한다.
};

export default config;
