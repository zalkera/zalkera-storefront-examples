import Link from "next/link";

/**
 * 404 — **없는 주소일 때 사람에게 보이는 것**.
 *
 * ⚠ **이 파일을 지우지 마라.** 없으면 Next 기본 페이지가 대신 뜬다 — 영문
 *   `404: This page could not be found.`, system-ui, `height:100vh`, **사이트 레이아웃 밖**이다.
 *   헤더도 푸터도 없는 흰 화면에 영어 한 줄이 고객 사이트의 얼굴이 된다.
 *
 * `notFound()` 를 부르는 자리가 넷이다(`[slug]`·`blog/[slug]`·`products/[slug]`·`c/[slug]`) —
 * 오타 난 링크·지운 글·없는 상품이 전부 여기로 온다. 흔한 화면이지 예외가 아니다.
 *
 * 레이아웃 **안**에서 그려지므로 헤더·푸터가 붙고, 방문자는 사이트를 떠나지 않는다.
 */
export default function NotFound() {
    return (
        <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
            <p className="text-muted text-sm">404</p>
            <h1 className="text-2xl font-semibold">찾으시는 페이지가 없습니다</h1>
            <p className="text-muted">주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
            <Link
                href="/"
                className="bg-primary mt-2 rounded-md px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
            >
                홈으로 가기
            </Link>
        </main>
    );
}
