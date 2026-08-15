#!/usr/bin/env node
/**
 * 템플릿 미리보기 스냅샷 (memo116 §3).
 *
 * **이미 개시된 스모크 테넌트를 크롤해 정적 HTML 사진을 뜬다.** 팩 시점에 오프라인 빌드로 굽는 안은
 * 기각됐다 — 시드 콘텐츠는 개시 경로에서만 DB 에 실리므로(memo102 규약) 백엔드 없는 빌드는
 * 백엔드 없이 구우면 **골격만** 나온다(빈 미리보기 = 거짓 진열). promote 절차가 이미
 * 스모크 개시 1회를 요구하니(memo105 §6-3), 그 돌아가는 실물을 찍으면 "고객이 개시하면 받는 바로
 * 그것"이 공짜로 나온다. 미리보기의 정직성이 절차가 아니라 **구조**로 담보되는 자리다.
 *
 * 산출물은 서버 런타임 0 이다: 정적 HTML + CSS + 이미지뿐이고 **JS 는 통째로 들어내진다**(아래 §왜).
 *
 * ── 사용 ────────────────────────────────────────────────────────────────────
 *   node scripts/snapshot-preview.mjs <사이트URL> --code biz-standard --version 1.0.3 \
 *        [--out dist-preview/biz-standard/1.0.3] [--label "표시 이름"] \
 *        [--start-url https://…] [--route /products/foo]… [--redact "상호"]… [--max-pages 60]
 *        [--report out/report.json]   ← 미지정 시 stdout. **산출 디렉터리 안을 지정하지 마십시오**(공개됩니다)
 *
 *   node scripts/snapshot-preview.mjs --verify dist-preview/biz-standard/1.0.3
 *
 * 종료코드: 0=성공 · 1=검증 실패(산출물에 결함) · 2=실행 불가(인자·네트워크 문제)
 *
 * ── 왜 스크립트를 통째로 들어내나 ──────────────────────────────────────────
 * 셋 다 같은 결론을 가리킨다.
 *  1. **거짓 동작 금지** — 하이드레이션이 살아 있으면 클라이언트 컴포넌트가 죽은 `/api/*` 를 부르고,
 *     장바구니 버튼이 눌리고, 로그인 토글이 돈다. 사진에 손잡이가 달려선 안 된다.
 *  2. **식별정보** — Next 는 RSC flight 페이로드(`self.__next_f.push`)를 인라인 스크립트로 싣는데
 *     거기 페이지 본문·절대 URL·상호가 통째로 들어 있다. 마크업만 지우고 이걸 남기면 가린 게 아니다.
 *  3. **자족성** — CDN 정적 프리픽스에 얹히는 산출물이라 청크 그래프를 통째로 미러링할 이유가 없다.
 * FAQ 아코디언은 네이티브 `<details>` 라 JS 없이도 열린다(AGENTS.md 규약) — 디자인 미리보기로서
 * 잃는 것이 거의 없다.
 *
 * ── 외부 의존 0 ────────────────────────────────────────────────────────────
 * 이 레포의 팩 스크립트가 zip 을 손으로 쓰는 것과 같은 규율이다. HTML 은 정규식 태그 스캐너로,
 * 다운로드는 Node 내장 `fetch` 로 처리한다. 스냅샷은 **우리가 만든 마크업**을 상대하므로(임의 웹이
 * 아니다) 파서를 들일 만큼의 다양성이 없다 — 그래도 산출물은 §검증이 기계로 다시 센다.
 */
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, extname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
// 크롤러는 보장 검사기(check-aeo-surfaces.mjs)와 **한 사본**을 쓴다(lib/site-crawl.mjs). 복사하면
// 라우트 분류가 조용히 갈라져 "미리보기엔 나오는데 검사기는 못 보는 페이지"가 생긴다.
import {
    DROP, IDENTITY_ROUTES, attrOf, crawlPages, makeClassifier, rewriteTags, segmentsOf, unescapeAttr,
} from "./lib/site-crawl.mjs";

// ── 라우트 정책 ──────────────────────────────────────────────────────────────
//
// 정의는 `lib/site-crawl.mjs` 로 옮겼다(검사기와 공유). 미리보기가 그중에서 고르는 것은 하나다:
// **식별정보 라우트(`/policies`·`/contact`)를 훑지 않는다** — 사진에 남기면 가릴 것만 많다.
// 보장 검사기는 아무것도 공개하지 않으므로 같은 라우트를 훑는다.

// ── 가림(redaction) 규칙 ─────────────────────────────────────────────────────

/**
 * 공개 표면에 남으면 안 되는 식별정보 패턴.
 *
 * **정직하게**: 이 패턴들이 잡는 것은 정형 식별자뿐이다. **주소·대표자명·이미지 안에 그림으로 박힌 글자는
 * 기계가 못 잡는다.** 즉 "식별정보 0"을 최종적으로 지탱하는 것은 이 스크립트가 아니라 ① 스모크 테넌트에
 * 실데이터를 넣지 않는 절차와 ② 발행 전 육안 검수(memo116 §9 게이트 ③)다. 스크립트는 그 둘이 실패했을 때
 * 걸리는 그물이지 그 둘의 대체재가 아니다 — 전에 이 주석이 "기계가 지킨다"라고 단언했는데, 심의가 실측으로
 * 못 잡는 형태를 여럿 찾아 서술을 바로잡는다.
 *
 * `label` 은 콘솔 보고용이고, 매치된 **값 자체는 어디에도 기록하지 않는다**(리포트 포함).
 */
const IDENTITY_PATTERNS = [
    // 하이픈 없는 10자리도 잡는다(`2148603271`). 앞뒤가 숫자면 다른 수의 일부이므로 경계를 본다.
    {label: "사업자등록번호", re: /(?<!\d)\d{3}-?\d{2}-?\d{5}(?!\d)/g},
    // 지역번호 괄호(`02)`)·국제표기(`+82-`)·전각 숫자까지. 전각은 별도 문자류라 같이 넣는다.
    {label: "전화번호", re: /(?:\+?82[-.\s)]?|\b0)\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}\b/g},
    {label: "전화번호(전각)", re: /[０-９]{2,4}[－ー-][０-９]{3,4}[－ー-][０-９]{4}/g},
    // `[at]`·`(at)`·` at ` 치환형까지. 치환형은 공백을 포함해 좁게 잡는다(오탐 방지).
    {label: "이메일", re: /[A-Za-z0-9._%+-]+(?:@|\s*[\[(]at[\])]\s*)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g},
];

const REDACTED = "[가려짐]";

// ── 인자 ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flagAll = (name) => {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
    }
    return out;
};

const die = (msg) => {
    console.error(msg);
    process.exit(2);
};

/**
 * 검증 모드는 크롤 인자를 요구하지 않는다. **분기만 여기서 하고 실행은 파일 맨 끝**이다 —
 * 여기서 곧바로 `verify()` 를 부르면 아래에 선언된 상수(`outDir` 등)가 아직 TDZ 라 터진다
 * (실제로 그렇게 짰다가 단독 실행이 ReferenceError 로 죽었다).
 */
const verifyDir = argv.includes("--verify") ? flag("verify") : null;
if (argv.includes("--verify") && !verifyDir) die("사용: node scripts/snapshot-preview.mjs --verify <스냅샷 디렉터리>");

const siteUrl = argv.find((a) => !a.startsWith("--") && /^https?:\/\//.test(a));
const code = flag("code");
const version = flag("version");
if (!verifyDir && (!siteUrl || !code || !version)) {
    die(
        "사용: node scripts/snapshot-preview.mjs <사이트URL> --code <프리셋코드> --version <버전> [옵션]\n" +
            "      node scripts/snapshot-preview.mjs --verify <디렉터리>",
    );
}

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const outDir = verifyDir ? "" : resolve(flag("out", join(ROOT, "dist-preview", code, version)));
const label = flag("label", `${code} v${version} 미리보기`);
const startUrl = flag("start-url");
const maxPages = Number(flag("max-pages", "60"));
const extraRoutes = flagAll("route");
const manualRedactions = flagAll("redact");
// 리포트는 기본 stdout. 파일로 받으려면 **산출 디렉터리 밖** 경로를 주십시오 — 안에 쓰면 공개됩니다.
const reportPath = flag("report", "");

const origin = verifyDir ? "" : new URL(siteUrl).origin;
const entryPath = verifyDir ? "/" : new URL(siteUrl).pathname.replace(/\/+$/, "") || "/";

// ── 라우트·경로 계산 ──────────────────────────────────────────────────────────

/** 이 실행의 URL 분류기 — 식별정보 라우트를 페이지에서 뺀다(위 라우트 정책). */
const classify = makeClassifier({origin, skipRoutes: IDENTITY_ROUTES});

/** 라우트 → 산출 파일 상대경로. `/` → index.html · `/blog/x` → blog/x/index.html (디렉터리 인덱스 관례). */
const fileOf = (routePath) => (routePath === "/" ? "index.html" : `${segmentsOf(routePath).join("/")}/index.html`);

/** 그 파일에서 산출물 루트로 올라가는 접두사. 루트 절대경로(`/…`)를 쓰면 CDN 하위 프리픽스에서 통째로 깨진다. */
const upTo = (routePath) => (routePath === "/" ? "" : "../".repeat(segmentsOf(routePath).length));

// ── 자산 ─────────────────────────────────────────────────────────────────────

const assets = new Map(); // absoluteUrl → {name, bytes, type}
const fetchFailures = [];

/** 자산 파일명. **선두를 `a` 로 고정**하는 이유: 순수 숫자 해시가 전화번호 정규식에 걸려 자기 파일명을 가리는 일을 막는다. */
function assetName(url, contentType) {
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
    let ext = extname(new URL(url).pathname).toLowerCase();
    if (!ext) {
        const t = (contentType ?? "").split(";")[0].trim();
        ext = {"text/css": ".css", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
            "image/gif": ".gif", "image/svg+xml": ".svg", "image/avif": ".avif"}[t] ?? ".bin";
    }
    return `a${hash}${ext}`;
}

async function fetchAsset(absUrl) {
    if (assets.has(absUrl)) return assets.get(absUrl).name;
    let res;
    try {
        res = await fetch(absUrl);
    } catch (e) {
        fetchFailures.push(`${absUrl} — ${e.message}`);
        return null;
    }
    if (!res.ok) {
        fetchFailures.push(`${absUrl} — HTTP ${res.status}`);
        return null;
    }
    const type = res.headers.get("content-type") ?? "";
    let bytes = Buffer.from(await res.arrayBuffer());
    const name = assetName(absUrl, type);
    assets.set(absUrl, {name, bytes, type}); // 재귀 전에 먼저 등록 — CSS 순환 참조에서 무한루프를 막는다.

    if (type.includes("css") || name.endsWith(".css")) {
        assets.get(absUrl).bytes = Buffer.from(await rewriteCss(bytes.toString("utf8"), absUrl), "utf8");
    }
    return name;
}

/** CSS 안의 `url(...)`·`@import` 를 따라가 같은 평면 디렉터리(`_assets/`)로 모은다 — 같은 폴더라 파일명만 남으면 된다. */
async function rewriteCss(css, cssUrl) {
    const refs = new Set();
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) refs.add(m[2]);
    for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/g)) refs.add(m[2]);

    let out = css;
    for (const ref of refs) {
        if (/^(data:|https?:)/.test(ref) && !ref.startsWith(origin)) continue; // data URI·외부 CDN 은 건드리지 않는다
        let abs;
        try {
            abs = new URL(ref, cssUrl).toString();
        } catch {
            continue;
        }
        if (!abs.startsWith(origin)) continue;
        const name = await fetchAsset(abs);
        if (name) out = out.split(ref).join(name);
    }
    return out;
}

// ── 크롤 ─────────────────────────────────────────────────────────────────────

const pages = new Map(); // routePath → 원본 HTML
const blockedTargets = new Set();
const externalTargets = new Set();

/**
 * 훑기 자체는 `lib/site-crawl.mjs` 가 한다. 여기서 하는 일은 그 결과를 이 스크립트의 상태에 옮겨 담고,
 * 모아 온 자산 URL 을 실제로 내려받는 것뿐이다(자산 수집은 사진을 뜨는 쪽에만 필요하다 — 보장 검사기는
 * 그래프만 읽으므로 바이트를 안 받는다).
 */
async function crawl() {
    const result = await crawlPages({
        origin,
        entryPath,
        extraRoutes,
        maxPages,
        classify,
        userAgent: "zalkera-snapshot-preview",
        onPage: (path) => console.log(`  · 크롤 ${path}`),
    });
    for (const [path, html] of result.pages) pages.set(path, html);
    for (const p of result.blocked) blockedTargets.add(p);
    for (const o of result.external) externalTargets.add(o);
    for (const f of result.fetchFailures) fetchFailures.push(f);
    for (const a of result.assetUrls) await fetchAsset(a);
}

// ── 배너·fallback·robots ─────────────────────────────────────────────────────

/**
 * 상단 고정 배너 — memo116 §3 "한계의 정직한 고지"(memo107 §4.4 구운 콘텐츠 정직 고지와 같은 규율).
 *
 * 스타일을 inline 으로 박는 이유: 사이트의 CSS 는 테넌트 색이 얹힌 **디자인 자산**이고 배너는
 * 그 위에 놓이는 **고지**다. 사이트 CSS 에 의존하면 테마에 따라 배너가 배경에 묻어 사라진다 —
 * 고지가 조건부로 사라지면 고지가 아니다. `sticky` 는 정상 흐름에서 자리를 차지해 콘텐츠를 가리지 않는다.
 */
function banner(prefix) {
    const startLink = startUrl
        ? `<a data-zalkera-preview-exit="1" href="${startUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" style="color:#fff;text-decoration:underline;white-space:nowrap">이 템플릿으로 시작하기</a>`
        : "";
    return (
        `<div data-zalkera-preview-banner="1" role="note" style="position:sticky;top:0;z-index:2147483647;` +
        `display:flex;flex-wrap:wrap;align-items:center;gap:.25rem .75rem;` +
        `background:#0f172a;color:#fff;padding:.5rem .75rem;font:500 13px/1.5 system-ui,-apple-system,sans-serif">` +
        `<strong style="font-weight:700">미리보기입니다 — 실제 사이트가 아닙니다.</strong>` +
        `<span>템플릿 <code style="font-family:ui-monospace,monospace">${code}</code> v${version}</span>` +
        `<span style="opacity:.8">주문·결제·로그인 등 기능은 개시 후 동작합니다.</span>` +
        startLink +
        `</div>` +
        `<!-- zalkera preview snapshot · ${prefix || "./"} -->`
    );
}

function fallbackPage() {
    const startLink = startUrl
        ? `<p><a data-zalkera-preview-exit="1" href="${startUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">이 템플릿으로 시작하기</a></p>`
        : "";
    return (
        `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="robots" content="noindex,nofollow">` +
        `<title>${label} — 미리보기에서는 동작하지 않습니다</title>` +
        `</head><body style="margin:0;font:400 15px/1.7 system-ui,-apple-system,sans-serif;color:#0f172a;background:#fff">` +
        banner("../") +
        `<main style="max-width:36rem;margin:0 auto;padding:3rem 1rem">` +
        `<h1 style="font-size:1.35rem">미리보기에서는 동작하지 않습니다</h1>` +
        `<p>이 페이지는 <strong>정적 사진</strong>입니다. 장바구니·결제·로그인·문의 같은 기능과 사업자 정보 표시면은 ` +
        `실제 사이트에서만 동작합니다.</p>` +
        `<p><strong>개시하면 전부 동작합니다.</strong></p>` +
        startLink +
        `<p><a href="../index.html">미리보기 첫 화면으로</a></p>` +
        `</main></body></html>`
    );
}

/** memo98 플랫폼 존 관례 — 미리보기는 색인 대상이 아니다. 페이지마다 meta 도 함께 박는다(둘 다 있어야 새 경로가 안 샌다). */
const ROBOTS_TXT = "# 미리보기 스냅샷 — 색인 금지(memo116 §3 · memo98)\nUser-agent: *\nDisallow: /\n";

// ── 페이지 변환 ──────────────────────────────────────────────────────────────

/** `<script>`·`<style>`처럼 내용을 가진 요소를 통째로 지운다. RSC flight 는 `</script>` 를 이스케이프하므로 비탐욕 매치로 안전하다. */
const stripElement = (html, tag) =>
    html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "").replace(new RegExp(`<${tag}\\b[^>]*\\/>`, "gi"), "");

/** 이 meta/link 는 **실사이트의 신원**이다 — 사진에 남기면 남의 사이트를 사칭하는 마크업이 된다. */
function dropsIdentityHead(tag, attrs) {
    if (tag === "meta") {
        const prop = (attrOf(attrs, "property") ?? "").toLowerCase();
        const name = (attrOf(attrs, "name") ?? "").toLowerCase();
        if (prop.startsWith("og:")) return true;
        if (name.startsWith("twitter:")) return true;
        if (name === "description" || name === "author" || name === "naver-site-verification" || name === "google-site-verification") return true;
        if (name === "robots") return true; // 우리 noindex 로 교체한다
    }
    if (tag === "link") {
        const rel = (attrOf(attrs, "rel") ?? "").toLowerCase();
        if (["canonical", "alternate", "manifest", "preload", "modulepreload", "prefetch", "dns-prefetch", "preconnect"].includes(rel)) return true;
    }
    return false;
}

function transformPage(routePath, rawHtml, siteNames) {
    const prefix = upTo(routePath);
    let html = stripElement(rawHtml, "script");
    html = stripElement(html, "noscript"); // 내용이 JS 부재 안내라 사진에선 의미가 없다

    const assetHref = (raw) => {
        const c = classify(raw, routePath);
        if (c.kind !== "asset") return null;
        const hit = assets.get(c.url.toString());
        return hit ? `${prefix}_assets/${hit.name}` : null;
    };
    const linkHref = (raw) => {
        const c = classify(raw, routePath);
        if (c.kind === "page" && pages.has(c.path)) return `${prefix}${fileOf(c.path)}`;
        // 크롤 못 한 페이지·기능 라우트·외부·mailto/tel — 전부 fallback 이 받는다. **죽은 링크 0**이 계약이다.
        return `${prefix}_preview/unavailable.html`;
    };

    let titleReplaced = false;
    html = rewriteTags(html, (tag, attrs) => {
        if (dropsIdentityHead(tag, attrs)) return DROP;
        if (tag === "a") {
            const href = attrOf(attrs, "href");
            if (href === undefined || href === null) return null;
            if (href.startsWith("#")) return null; // 문서 내 앵커는 그대로 산다(LEAD_CTA 의 #lead 등)
            return attrs.map(([k, v]) => (k.toLowerCase() === "href" ? [k, linkHref(href)] : [k, v]));
        }
        if (tag === "link") {
            const href = attrOf(attrs, "href");
            const local = href ? assetHref(href) : null;
            if (!href) return null;
            if (!local) return DROP; // 못 받은 스타일시트·아이콘은 남기면 죽은 링크가 된다
            return attrs.map(([k, v]) => (k.toLowerCase() === "href" ? [k, local] : [k, v]));
        }
        if (tag === "img" || tag === "source" || tag === "video" || tag === "audio") {
            return attrs.map(([k, v]) => {
                const key = k.toLowerCase();
                if (key === "src") return [k, assetHref(v ?? "") ?? `${prefix}_preview/unavailable.html`];
                if (key === "srcset") {
                    const parts = (v ?? "").split(",").map((p) => {
                        const [u, ...rest] = p.trim().split(/\s+/);
                        const local = assetHref(u);
                        return local ? [local, ...rest].join(" ") : null;
                    });
                    return [k, parts.filter(Boolean).join(", ")];
                }
                // `poster` 도 자산이다 — 빼먹으면 루트 절대경로가 남아 CDN 하위 프리픽스에서 조용히 404 다.
                if (key === "poster") return [k, assetHref(v ?? "") ?? `${prefix}_preview/unavailable.html`];
                return [k, v];
            });
        }
        // 인라인 style 의 url() 은 어느 태그에나 붙는다(히어로 배경이 대표적). 태그별 분기 밖에서 공통 처리한다.
        if (attrs.some(([k]) => k.toLowerCase() === "style" && /url\(/i.test(String(attrs.find(([kk]) => kk.toLowerCase() === "style")?.[1] ?? "")))) {
            return attrs.map(([k, v]) => {
                if (k.toLowerCase() !== "style") return [k, v];
                const rewritten = String(v ?? "").replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m0, q, u) => {
                    const local = assetHref(u);
                    return local ? `url(${q}${local}${q})` : m0;
                });
                return [k, rewritten];
            });
        }
        if (tag === "form") {
            // 사진 위의 폼은 제출될 곳이 없다 — 눌러도 fallback 안내로 간다(거짓 동작 금지).
            return [["action", `${prefix}_preview/unavailable.html`], ["method", "get"],
                ...attrs.filter(([k]) => !["action", "method"].includes(k.toLowerCase()))];
        }
        return null;
    });

    // 제목 — 실사이트의 상호가 탭·검색결과에 남지 않게 미리보기 라벨로 갈아 끼운다.
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, () => {
        titleReplaced = true;
        return `<title>${label}</title>`;
    });

    // noindex + (제목이 없던 문서를 위한) 제목 주입.
    html = html.replace(/<\/head>/i, `<meta name="robots" content="noindex,nofollow">${titleReplaced ? "" : `<title>${label}</title>`}</head>`);

    // 배너 — `<body …>` 여는 태그 바로 뒤.
    html = html.replace(/<body([^>]*)>/i, (m) => `${m}${banner(prefix)}`);

    // 마지막에 가린다 — URL 재작성이 끝난 뒤라 `_assets/…` 를 건드리지 않는다.
    return redact(html, siteNames);
}

const redactionCounts = new Map();
const bump = (label, n) => redactionCounts.set(label, (redactionCounts.get(label) ?? 0) + n);

function redact(html, siteNames) {
    let out = html;
    for (const literal of [...siteNames, ...manualRedactions, origin, new URL(origin).host]) {
        if (!literal) continue;
        const parts = out.split(literal);
        if (parts.length > 1) {
            bump(literal === origin || literal === new URL(origin).host ? "출처 주소" : `문자열 "${literal}"`, parts.length - 1);
            out = parts.join(REDACTED);
        }
    }
    for (const {label: pLabel, re} of IDENTITY_PATTERNS) {
        let n = 0;
        out = out.replace(re, () => {
            n++;
            return REDACTED;
        });
        if (n) bump(pLabel, n);
    }
    return out;
}

/**
 * 실사이트가 스스로 말하는 상호 — `og:site_name` 과 `<title>` 에서 뽑는다. 이 문자열을 **본문에서도**
 * 가려야 시드 카피에 박힌 상호("… 대표 홍길동" 같은 문장)가 남지 않는다. 자동으로 못 잡는 변형은
 * `--redact` 로 넣고, 남을 수 있는 것은 리포트가 이름으로 지목한다(§보고).
 */
function siteNamesFrom(htmls) {
    const found = new Set();
    for (const html of htmls) {
        for (const m of html.matchAll(/<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"/gi)) found.add(unescapeAttr(m[1]));
        for (const m of html.matchAll(/<meta[^>]+content="([^"]*)"[^>]+property="og:site_name"/gi)) found.add(unescapeAttr(m[1]));
        const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (t) {
            const text = unescapeAttr(t[1]).trim();
            // layout 의 `%s | 상호` 템플릿 — 파이프 뒤가 상호다. 파이프가 없으면 홈이라 제목 전체가 상호다.
            const tail = text.includes("|") ? text.split("|").pop().trim() : text;
            if (tail) found.add(tail);
        }
    }
    // 길이 내림차순 — 긴 것을 먼저 가려야 "원큐 스토어"가 "원큐"로 쪼개져 반쪽만 남는 일이 없다.
    return [...found].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
}

// ── 산출 ─────────────────────────────────────────────────────────────────────

function writeOut(path, content) {
    const full = join(outDir, path);
    mkdirSync(dirname(full), {recursive: true});
    writeFileSync(full, content);
}

// ── 검증(브라우저 없이) ──────────────────────────────────────────────────────

/**
 * 산출물을 다시 기계로 센다 — 크롤·변환이 통과했다는 사실과 **산출물이 요구를 만족한다**는 사실은
 * 다르다. 이 함수는 산출 직후 자동으로 돌고 `--verify` 로 단독 실행도 된다(나중에 손댄 스냅샷도 잰다).
 */
function verify(dir) {
    const problems = [];
    const ok = (cond, msg) => {
        if (!cond) problems.push(msg);
    };

    if (!existsSync(dir)) {
        console.error(`디렉터리가 없습니다: ${dir}`);
        return false;
    }

    const files = [];
    const walk = (d) => {
        for (const e of readdirSync(d, {withFileTypes: true})) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else files.push(p);
        }
    };
    walk(dir);
    const htmls = files.filter((f) => f.endsWith(".html"));

    ok(htmls.length > 0, "HTML 이 하나도 없습니다");

    // **확장자를 가리지 않고 전 파일을 훑는다.** 전에는 .html·.css 만 봤고, 그래서 `_preview/report.json`
    // 이 가린 상호를 그대로 싣고도 검증을 통과했다(심의 실측). 산출 디렉터리에 들어간 것은 전부 공개되므로
    // 검사 범위가 발행 범위보다 좁으면 그 차이가 곧 유출 창이다. 바이너리는 텍스트로 못 읽히니 건너뛴다.
    for (const file of files) {
        let body;
        try { body = readFileSync(file, "utf8"); } catch { continue; }
        if (body.includes("\u0000")) continue; // 바이너리
        for (const {label, re} of IDENTITY_PATTERNS) {
            if (new RegExp(re.source, re.flags.replace("g", "")).test(body)) {
                ok(false, `${relative(dir, file)} 에 ${label} 가 남아 있습니다`);
            }
        }
    }
    // robots.txt 는 **오리진 루트에서만** 유효하다. 이 산출물은 `{code}/{version}/` 하위에 얹히므로 여기 있는
    // robots.txt 는 색인을 못 막는다 — 전에는 이 존재 검사가 "지켜졌다"는 거짓 안심을 만들었다(심의 지적).
    // 실제 색인 차단은 아래 페이지별 noindex meta 이고, 존 루트 robots.txt·X-Robots-Tag 는 T4 인프라 몫이다.
    // 파일 자체는 남긴다(존 루트에 얹을 때 그대로 쓰는 원본).
    if (existsSync(join(dir, "robots.txt"))) {
        ok(/Disallow:\s*\/\s*$/m.test(readFileSync(join(dir, "robots.txt"), "utf8")), "robots.txt 에 `Disallow: /` 가 없습니다");
    }
    ok(existsSync(join(dir, "_preview", "unavailable.html")), "기능 라우트 fallback 페이지가 없습니다");

    for (const file of htmls) {
        const rel = relative(dir, file);
        const html = readFileSync(file, "utf8");

        ok(/data-zalkera-preview-banner/.test(html), `${rel}: 미리보기 배너가 없습니다`);
        ok(/<meta[^>]+name="robots"[^>]+content="noindex/i.test(html), `${rel}: noindex meta 가 없습니다`);
        ok(!/<script\b/i.test(html), `${rel}: <script> 가 남아 있습니다(RSC 페이로드·거짓 동작 경로)`);
        ok(!/<meta[^>]+property="og:/i.test(html), `${rel}: og:* meta 가 남아 있습니다(실사이트 신원)`);
        // og 만 보다가 twitter·description 을 흘렸다(심의 실측). transform 이 지우는 것은 verify 도 봐야 한다 —
        // 검사 범위가 처리 범위보다 좁으면 그 차이만큼 회귀가 조용히 산다.
        ok(!/<meta[^>]+name="twitter:/i.test(html), `${rel}: twitter:* meta 가 남아 있습니다(실사이트 신원)`);
        ok(!/<meta[^>]+name="description"/i.test(html), `${rel}: description meta 가 남아 있습니다(실사이트 소개문)`);
        ok(!/rel="canonical"/i.test(html), `${rel}: canonical 이 남아 있습니다(실사이트를 가리킵니다)`);
        // 재작성 대상이 아닌 속성으로 루트 절대경로가 새면 CDN 하위 프리픽스에서 404 가 된다.
        ok(!/\b(?:srcset|poster)\s*=\s*"[^"]*(?:https?:\/\/|\s\/|^\/)/i.test(html), `${rel}: srcset/poster 에 절대 URL·루트 절대경로가 남아 있습니다`);
        ok(!/style\s*=\s*"[^"]*url\(\s*['"]?(?:https?:)?\//i.test(html), `${rel}: 인라인 style 의 url() 이 재작성되지 않았습니다`);

        for (const {label: pLabel, re} of IDENTITY_PATTERNS) {
            re.lastIndex = 0;
            if (re.test(html)) ok(false, `${rel}: ${pLabel} 형태의 문자열이 남아 있습니다`);
        }

        // 링크·자산: 절대 URL 0 · 루트 절대경로 0 · 죽은 링크 0.
        //
        // CSS 안의 `url(...)`·`@import` 도 같은 잣대로 본다 — 받지 못한 폰트·배경이미지가 있으면
        // 재작성이 원본 경로를 그대로 남기고, 그건 CDN 에서 조용히 404 가 된다(HTML 만 보면 안 보인다).
        rewriteTags(html, (tag, attrs) => {
            // 배너의 개시 링크만 밖을 가리킬 수 있다 — **그 태그 자신이 표식을 달고 있을 때만** 봐준다
            // (주변 문자열로 판정하면 표식 없는 절대 URL 이 배너 근처에 있다는 이유로 통과한다).
            const isExit = attrs.some(([k]) => k.toLowerCase() === "data-zalkera-preview-exit");
            for (const key of ["href", "src"]) {
                const raw = attrOf(attrs, key);
                if (!raw || raw.startsWith("#")) continue;
                const v = unescapeAttr(raw);
                if (/^(https?:)?\/\//i.test(v)) {
                    if (!isExit) ok(false, `${rel}: 절대 URL 이 남아 있습니다 — ${v.slice(0, 60)}`);
                    continue;
                }
                if (v.startsWith("/")) {
                    ok(false, `${rel}: 루트 절대경로 ${v} — CDN 하위 프리픽스에서 깨집니다`);
                    continue;
                }
                if (/^(data|mailto|tel|javascript):/i.test(v)) {
                    if (!v.startsWith("data:")) ok(false, `${rel}: ${v.split(":")[0]}: 링크가 남아 있습니다`);
                    continue;
                }
                const target = resolve(dirname(file), v.split(/[?#]/)[0]);
                ok(existsSync(target), `${rel}: 죽은 링크 ${v}`);
            }
            return null;
        });
    }

    for (const file of files.filter((f) => f.endsWith(".css"))) {
        const rel = relative(dir, file);
        const css = readFileSync(file, "utf8");
        const refs = new Set();
        for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) refs.add(m[2]);
        for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/g)) refs.add(m[2]);
        for (const ref of refs) {
            if (ref.startsWith("data:")) continue;
            if (/^(https?:)?\/\//i.test(ref)) ok(false, `${rel}: CSS 가 외부 절대 URL 을 참조합니다 — ${ref.slice(0, 60)}`);
            else if (ref.startsWith("/")) ok(false, `${rel}: CSS 가 루트 절대경로를 참조합니다 — ${ref}`);
            else ok(existsSync(resolve(dirname(file), ref.split(/[?#]/)[0])), `${rel}: CSS 의 죽은 참조 ${ref}`);
        }
    }

    if (problems.length > 0) {
        console.error(`\n검증 실패 — ${problems.length}건:`);
        for (const p of problems.slice(0, 40)) console.error(`  ❌ ${p}`);
        if (problems.length > 40) console.error(`  … 외 ${problems.length - 40}건`);
        return false;
    }
    console.log(`✅ 검증 통과 — HTML ${htmls.length}장 · 파일 ${files.length}개 (배너·noindex·스크립트 0·절대URL 0·죽은링크 0·식별패턴 0)`);
    return true;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

if (verifyDir) process.exit(verify(resolve(verifyDir)) ? 0 : 1);

console.log(`미리보기 스냅샷 — ${code} v${version}`);
console.log(`  원본: ${siteUrl}`);
console.log(`  산출: ${relative(process.cwd(), outDir) || outDir}`);

await crawl();

if (pages.size === 0) {
    console.error("\n크롤한 페이지가 0 입니다 — 사이트가 떠 있는지, URL 이 맞는지 확인하십시오.");
    for (const f of fetchFailures.slice(0, 10)) console.error(`  · ${f}`);
    process.exit(2);
}

const siteNames = siteNamesFrom([...pages.values()]);
console.log(`\n  자동 가림 대상(사이트가 스스로 말하는 이름): ${siteNames.length ? siteNames.map((s) => `"${s}"`).join(", ") : "없음"}`);

for (const [routePath, raw] of pages) writeOut(fileOf(routePath), transformPage(routePath, raw, siteNames));
for (const {name, bytes} of assets.values()) writeOut(join("_assets", name), bytes);
writeOut(join("_preview", "unavailable.html"), fallbackPage());
writeOut("robots.txt", ROBOTS_TXT);
writeOut(
    "manifest.json",
    JSON.stringify(
        {
            code,
            version,
            label,
            generatedAt: new Date().toISOString(),
            pages: [...pages.keys()].sort(),
            fallback: "_preview/unavailable.html",
            note: "미리보기 스냅샷 — 실사이트가 아니며 서버 런타임이 없습니다(memo116 §3).",
        },
        null,
        2,
    ) + "\n",
);
// **리포트는 산출 디렉터리 밖으로 낸다.** 전에는 `_preview/report.json` 에 썼는데, 그 디렉터리는
// `unavailable.html` 때문에 반드시 발행돼야 해서 프리픽스 단위 제외가 불가하고 — 즉 리포트가 공개 CDN 에
// 실렸다. 게다가 `redactions` 는 "건수만 남긴다"고 적어 놓고 **맵의 키가 값이었다**(가린 상호가 평문으로
// 실렸다). `externalOrigins` 도 canonical 에서 지운 그 도메인을 그대로 담았다. 공개 URL 은 회수 불능이라
// (memo116 §9 비가역 ①) 이건 되돌릴 수 없는 유출이었다 — 심의가 실측으로 잡았다.
// 이제 기본은 stdout 이고, `--report <path>` 로만 파일에 쓴다(경로는 운영자 책임).
const reportBody = JSON.stringify(
    {
        // 라벨은 익명 인덱스다. 무엇을 가렸는지는 운영자가 자기 입력으로 안다 — 산출물이 알 필요가 없다.
        redactions: Object.fromEntries([...redactionCounts.entries()].map(([, n], i) => [`가림#${i + 1}`, n])),
        crawledPages: pages.size,
        assets: assets.size,
        blockedRoutes: [...blockedTargets].sort(),
        externalOriginCount: externalTargets.size,   // 호스트 목록은 싣지 않는다(출처 식별 경로)
        fetchFailures: fetchFailures.length,
    },
    null,
    2,
) + "\n";
if (reportPath) writeFileSync(reportPath, reportBody);
else process.stdout.write(reportBody);

console.log(`\n  페이지 ${pages.size}장 · 자산 ${assets.size}개`);
console.log(`  fallback 으로 보낸 라우트: ${[...blockedTargets].sort().join(", ") || "없음"}`);
if (externalTargets.size) console.log(`  외부 링크 오리진(전부 fallback 으로 보냄): ${[...externalTargets].sort().join(", ")}`);
if (redactionCounts.size) {
    console.log("  가린 것:");
    for (const [k, n] of redactionCounts) console.log(`    · ${k} — ${n}건`);
} else {
    console.log("  가린 것: 없음");
}
// 받지 못한 자원은 **실패다**. 이미지 한 장이 빠진 스냅샷은 그 자리만 비는 게 아니라 "이 템플릿은
// 이렇게 생겼습니다"라는 진술이 틀린 것이 된다. 산출물은 남겨서(사람이 원인을 본다) 종료코드로만 막는다.
if (fetchFailures.length) {
    console.error(`  ❌ 받지 못한 자원 ${fetchFailures.length}건 — 스냅샷이 불완전합니다:`);
    for (const f of fetchFailures.slice(0, 15)) console.error(`    · ${f}`);
    if (fetchFailures.length > 15) console.error(`    … 외 ${fetchFailures.length - 15}건`);
}

console.log("");
const passed = verify(outDir) && fetchFailures.length === 0;

console.log(
    "\n사람이 마지막으로 볼 것(기계가 못 보는 자리):\n" +
        "  · 시드 카피·이미지 안에 스모크 테넌트의 상호·연락처가 그림으로 박혀 있지 않은지\n" +
        "  · 배너 문구와 버전 표기가 실제 팩 버전과 같은지\n" +
        "  · 첫 화면이 '고객이 개시하면 받는 그것'과 같은지",
);
process.exit(passed ? 0 : 1);
