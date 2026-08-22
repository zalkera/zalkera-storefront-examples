import Link from "next/link";
import {asObjectArray, asString, readConfig} from "@zalkera/client";
import {buttonClasses} from "@/components/ui/Button";
import {safeLinkUrl} from "@/lib/safeUrl";

/**
 * 방문 정보 — 주소와 찾아오는 길.
 *
 * `links`(누르는 것)와 `items`(읽는 것)를 가른다 — 섞으면 버튼으로 그릴지 문단으로 그릴지 알 수 없다.
 * 주차·지하철·버스를 `detail` 한 문자열에 뭉치면 이 어휘가 잡겠다던 「본문에 묻힘」이 된다.
 *
 * ⚠ 주소의 **사실**은 `site_config` 가 정본이다(홈의 조직 노드가 그것을 낸다). 여기 `address` 는
 *   화면에 보이는 문자열이라, 둘을 함께 고쳐야 사람이 보는 것과 기계가 읽는 것이 안 갈린다.
 */
export function DirectionsSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const address = asString(c?.address)?.trim();
    if (!address) return null;

    const eyebrow = asString(c?.eyebrow)?.trim();
    const title = asString(c?.title)?.trim();
    const detail = asString(c?.detail)?.trim();
    // ⚠ href 는 콘텐츠라 외부에서 온 값이다 — 소독 없이 링크에 넣으면 `javascript:` 가 실린다.
    const links = asObjectArray(c?.links)
        .map((l) => ({label: asString(l.label)?.trim(), href: asString(l.href)}))
        .filter((l) => l.label && l.href);
    const items = asObjectArray(c?.items)
        .map((i) => ({label: asString(i.label)?.trim(), body: asString(i.body)?.trim()}))
        .filter((i) => i.label && i.body);

    return (
        <section className="mb-12">
            {(eyebrow || title) && (
                <div className="mb-6">
                    {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
                    {title && <h2>{title}</h2>}
                </div>
            )}
            <div className="rounded-xl border border-border p-6">
                <p className="text-lg font-semibold">{address}</p>
                {detail && <p className="mt-1 text-muted">{detail}</p>}
                {links.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-3">
                        {links.map((link, i) => (
                            <Link
                                key={i}
                                href={safeLinkUrl(link.href ?? "")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={buttonClasses("outline", "no-underline")}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                )}
                {items.length > 0 && (
                    <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                        {items.map((item, i) => (
                            <div key={i}>
                                <dt className="text-sm font-semibold">{item.label}</dt>
                                <dd className="whitespace-pre-wrap text-sm text-muted">{item.body}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>
        </section>
    );
}
