import {assetPath, asString, readConfig} from "@zalkera/client";

type DoctorIntroConfig = Record<string, unknown>;

/** 원장 소개 — 사진·이름·직함·소개. */
export function DoctorIntroSection({config}: {config: unknown}) {
    const c = readConfig<DoctorIntroConfig>(config);
    const name = asString(c?.name)?.trim();
    const title = asString(c?.title);
    const bio = asString(c?.bio);
    const photoAsset = assetPath(c?.photoAsset);
    // 이름 없는 소개는 보여줄 게 없다 — 조용히 스킵.
    if (!name) return null;

    return (
        <section className="flex gap-5 items-start mb-12">
            {photoAsset && (
                <img
                    src={photoAsset}
                    alt={name}
                    loading="lazy"
                    className="w-35 h-35 object-cover rounded-lg shrink-0"
                />
            )}
            <div>
                <h2 className="text-primary">{name}</h2>
                {title && <p className="mt-1 mb-3 text-muted">{title}</p>}
                {bio && <p className="whitespace-pre-wrap leading-relaxed">{bio}</p>}
            </div>
        </section>
    );
}
