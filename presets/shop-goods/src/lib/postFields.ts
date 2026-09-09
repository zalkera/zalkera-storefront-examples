import type {PostDetail} from "@zalkera/client";

/**
 * **계약이 아직 안 실은 칸** — 백엔드는 보내는데 설치된 `@zalkera/client`(0.33.0)의 타입에는 없다.
 *
 * ⚠ **임시다.** client 0.34.0 이 발행되면 이 파일을 지우고 `PostDetail` 을 그대로 쓴다.
 * 넓히는 자리를 한 곳에 모아 두는 이유는, 흩어 놓으면 판이 올라온 뒤 어디를 지워야 하는지
 * 아무도 모르게 되기 때문이다.
 */
export type PostWithByline = PostDetail & {
    /** 표시용 작성자. 없으면 상호가 저자다. */
    author?: string | null;
    /** 표시용 태그. 공개 태그 라우트는 만들지 않는다. */
    tags?: string[];
};
