import Link from "next/link";
import {buttonClasses} from "@/components/ui/Button";
import {cn} from "@/lib/cn";
import {safeLinkUrl} from "@/lib/safeUrl";
import {assetPath, asString, readConfig} from "@zalkera/client";

/** 설명 — 이미지 한 장과 본문의 좌우 배치(사업영역·회사소개 겸용). 이미지가 없으면 본문만 그린다. */
export function TextMediaSection({config}: {config: unknown}) {
    const c = readConfig<Record<string, unknown>>(config);
    const title = asString(c?.title)?.trim();
    const body = asString(c?.body)?.trim();
    if (!title && !body) return null;

    const asset = assetPath(c?.asset);
    const mediaFirst = asString(c?.mediaSide) !== "right"; // 기본은 이미지 왼쪽.
    const ctaLabel = asString(c?.ctaLabel)?.trim();
    const ctaHref = asString(c?.ctaHref);

    return (
        <section className="mb-12 grid gap-6 md:grid-cols-2 md:items-center">
            {asset && (
                <img
                    src={asset}
                    alt=""
                    /*
                     * ⚠ **접힘 아래다 — 늦게 받는다.** `TEXT_MEDIA` 는 §2~§4 에 오므로 첫 화면과
                     *   대역을 다투면 안 된다. 실측(2026-09-08 · shop-goods): 이 한 장이 홈 이미지
                     *   바이트의 **41%**(30,305/73,527 B)이고 히어로(§0)의 74% 다.
                     *   재현: `node -e 'const c=require("./content/pages/home.json");
                     *   console.log(JSON.stringify(c.sections.map(s=>[s.type,s.config?.asset])))'`
                     *   로 섹션별 자산을 뽑고 `stat -c%s public/<파일>` 로 바이트를 잰다.
                     *   §0 에 두는 배치라면 `HERO` 섹션을 써라 — 그쪽이 eager 가 맞는 자리다.
                     */
                    loading="lazy"
                    className={cn("h-auto w-full rounded-xl object-cover", mediaFirst ? "md:order-1" : "md:order-2")}
                />
            )}
            <div className={cn("grid gap-3", asset && (mediaFirst ? "md:order-2" : "md:order-1"))}>
                {title && <h2>{title}</h2>}
                {body && <p className="whitespace-pre-wrap text-muted">{body}</p>}
                {ctaLabel && ctaHref && (
                    <div>
                        <Link href={safeLinkUrl(ctaHref)} className={buttonClasses("outline", "no-underline")}>
                            {ctaLabel}
                        </Link>
                    </div>
                )}
            </div>
        </section>
    );
}
