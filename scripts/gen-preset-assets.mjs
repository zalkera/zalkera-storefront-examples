#!/usr/bin/env node
/**
 * 프리셋 시드 에셋 생성기 (memo102 §7).
 *
 * 조달 우선순위 ①(자체 생성)의 실물이다 — 저작권 분쟁 당사자가 없고, 재배포·고객 상업 사용이 모두 열리며,
 * 테마 토큰 색으로 그리니 시드 색과 아트가 자동으로 맞는다. **사진이 아니다**: 고객이 콘솔에서 자기
 * 이미지로 갈아끼우는 것이 정상 경로이고(§7), 이 그래픽은 그 자리를 "완성돼 보이게" 채우는 몫이다.
 *
 * 금지선(§7) 준수: 식별 가능 인물 0(아바타는 모노그램) · 실존 타사 로고 0(워드마크는 **가상 상호**) · 지도 0.
 *
 * 사용: node scripts/gen-preset-assets.mjs [테마코드...]   (인자 없으면 전체)
 * 결정론적이라 재실행해도 바이트가 같다 — 재생성이 팩 sha256 을 흔들지 않는다.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {Canvas, hex, rng} from "./preset-canvas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 테마별 팔레트·에셋 목록. 팔레트는 seed.json 의 themeColors 와 **같은 값**이어야 한다 —
 * 아트가 사이트 색과 따로 놀면 "토큰만으로 인상이 갈린다"(§2.1 ③)는 주장이 첫 화면에서 깨진다.
 */
const THEMES = {
    "biz-standard": {
        primary: "#1d4ed8",
        accent: "#60a5fa",
        surface: "#f8fafc",
        deep: "#0f172a",
        arts: [
            ["hero.png", 1200, 800, "stack"],
            ["about.png", 1000, 750, "bands"],
        ],
        // 가상 상호 — 실존 상표를 피하려고 조어를 쓴다. 고객이 실제 고객사 로고로 교체하는 자리다.
        logos: ["NOVARC", "PELIQ", "MARUDO", "KUBRIX", "VANTIO"],
        avatars: ["K", "J"],
    },
    /**
     * 커머스(재화 판매). 따뜻한 점토색 계열로 잡아 앞의 둘(파랑=정보형·청록=전환형)과 인상이 안 겹치게 한다.
     *
     * 상품 커버(`goods-*.png`)가 **시드 상품 `imageAsset`** 이고 나머지는 섹션 이미지다. 팩이 둘을 다른
     * 자리로 보내므로(`.zalkera/assets/` vs `public/`) 생성 후 배치가 갈린다 — §아래 `generate` 주석 참조.
     * 커버를 4:3 으로 두는 것은 상품 카드가 그 비율로 자르기 때문이다.
     */
    "shop-goods": {
        primary: "#b45309",
        accent: "#fdba74",
        surface: "#fffbf5",
        deep: "#1c1917",
        arts: [
            ["hero.png", 1200, 800, "shelf"],
            ["story.png", 1000, 750, "bands"],
            ["goods-cover.png", 800, 600, "object", {variant: 0}],
            ["goods-mug.png", 800, 600, "object", {variant: 1}],
            ["goods-candle.png", 800, 600, "object", {variant: 2}],
            ["goods-towel.png", 800, 600, "object", {variant: 3}],
            ["goods-tray.png", 800, 600, "object", {variant: 4}],
        ],
        logos: [],
        avatars: ["D", "N"],
    },
    /**
     * 뷰티(네일). 색은 `BeautyStarterService.Vertical.NAIL` 의 팔레트 **바이트 그대로**다 — 그 KDoc 이
     * "최종 거처는 뷰티 SITE_PRESET 팩 시드의 themeColors"라고 이사 경로를 지정해 뒀고, 이 프리셋이 그
     * 거처다. 값이 갈라지면 뷰티 스타터로 칠한 색과 프리셋으로 개시한 색이 달라진다.
     *
     * `accent` 는 시드에 대응 키가 없는 아트 전용 색이라, 팔레트의 `secondary` 를 그대로 쓴다.
     */
    "beauty-nail": {
        primary: "#E8A0BF",
        accent: "#BA90C6",
        surface: "#FDF4F5",
        deep: "#4A2C3A",
        arts: [
            ["hero.png", 1200, 800, "petal"],
            ["salon.png", 1000, 750, "bloom"],
            // 전/후 짝. 같은 variant 가 같은 배치를 만들고 stage 만 다르다 — 짝이 "같은 손"으로 보여야 한다.
            ["care-01-before.png", 600, 600, "swatch", {variant: 0, stage: 0}],
            ["care-01-after.png", 600, 600, "swatch", {variant: 0, stage: 1}],
            ["care-02-before.png", 600, 600, "swatch", {variant: 1, stage: 0}],
            ["care-02-after.png", 600, 600, "swatch", {variant: 1, stage: 1}],
            ["care-03-before.png", 600, 600, "swatch", {variant: 2, stage: 0}],
            ["care-03-after.png", 600, 600, "swatch", {variant: 2, stage: 1}],
            // 시술 메뉴 커버(memo119 §2.7 — 시드 상품 `imageAsset`). 전/후 짝과 달리 **`stage: 1` 만** 쓴다:
            // 메뉴 카드는 "이 시술을 하면 이렇게 된다"를 보여주는 자리지 비교 자리가 아니다. 치수를 4:3 으로
            // 달리 두는 것은 SERVICE_MENU 카드가 `aspect-[4/3]` 로 자르기 때문이고, 그 덕에 전/후(정사각)와
            // 아트 시드도 겹치지 않는다.
            ["menu-care.png", 800, 600, "swatch", {variant: 0, stage: 1}],
            ["menu-onecolor.png", 800, 600, "swatch", {variant: 1, stage: 1}],
            ["menu-art.png", 800, 600, "swatch", {variant: 2, stage: 1}],
            ["menu-extension.png", 800, 600, "swatch", {variant: 3, stage: 1}],
            ["menu-removal.png", 800, 600, "swatch", {variant: 4, stage: 1}],
        ],
        logos: [],
        avatars: ["M", "S"],
        // 원장 사진 자리. 아바타와 같은 모노그램이되 섹션이 크게 쓰므로 해상도만 올린다.
        portraits: [["doctor.png", "Y", 400]],
    },
};

/** 카드가 겹쳐 쌓인 구성 — "표준을 그대로 옮긴다"는 정보형 테마의 인상. */
function stack(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    canvas.circle(canvas.width * 0.82, canvas.height * 0.24, canvas.width * 0.26, accent, 0.35);
    canvas.ring(canvas.width * 0.2, canvas.height * 0.78, canvas.width * 0.19, 14, primary, 0.28);
    for (let i = 0; i < 3; i++) {
        const w = canvas.width * 0.44;
        const h = canvas.height * 0.2;
        const x = canvas.width * 0.16 + i * canvas.width * 0.07;
        const y = canvas.height * 0.2 + i * canvas.height * 0.16;
        canvas.roundRect(x, y, w, h, 26, i === 1 ? primary : deep, i === 1 ? 0.9 : 0.14);
        canvas.roundRect(x + 28, y + h * 0.34, w * 0.4, 10, 5, i === 1 ? accent : deep, i === 1 ? 0.9 : 0.3);
        canvas.roundRect(x + 28, y + h * 0.56, w * 0.62, 8, 4, i === 1 ? accent : deep, i === 1 ? 0.5 : 0.18);
    }
    scatter(canvas, deep, random, 90);
}

/** 수평 띠 — 공정·연혁 같은 서술 구간의 배경. */
function bands(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    for (let i = 0; i < 5; i++) {
        const y = canvas.height * (0.16 + i * 0.15);
        const w = canvas.width * (0.34 + ((i * 37) % 45) / 100);
        canvas.roundRect(canvas.width * 0.1, y, w, 22, 11, i % 2 === 0 ? primary : deep, i % 2 === 0 ? 0.55 : 0.16);
    }
    canvas.circle(canvas.width * 0.86, canvas.height * 0.7, canvas.width * 0.2, accent, 0.3);
    canvas.ring(canvas.width * 0.86, canvas.height * 0.7, canvas.width * 0.28, 10, primary, 0.22);
    scatter(canvas, deep, random, 70);
}

/** 동심 궤도 — 하나의 행동(상담)으로 수렴하는 전환형 테마의 인상. */
function orbit(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    const cx = canvas.width * 0.66;
    const cy = canvas.height * 0.5;
    [0.42, 0.32, 0.22].forEach((r, i) => canvas.ring(cx, cy, canvas.height * r, 12 - i * 2, primary, 0.22 + i * 0.08));
    canvas.circle(cx, cy, canvas.height * 0.13, primary, 0.92);
    canvas.circle(cx + canvas.height * 0.32, cy - canvas.height * 0.18, 26, accent, 0.9);
    canvas.circle(cx - canvas.height * 0.42, cy + canvas.height * 0.22, 18, accent, 0.75);
    canvas.roundRect(canvas.width * 0.06, canvas.height * 0.36, canvas.width * 0.24, 16, 8, deep, 0.22);
    canvas.roundRect(canvas.width * 0.06, canvas.height * 0.46, canvas.width * 0.17, 12, 6, deep, 0.16);
    scatter(canvas, deep, random, 80);
}

/** 부채꼴로 번지는 꽃잎 — 곡선·겹침 위주의 부드러운 인상(뷰티 히어로). */
function petal(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    const cx = canvas.width * 0.68;
    const cy = canvas.height * 0.54;
    // 원 8장을 원주 위에 겹쳐 얹으면 꽃잎처럼 읽힌다 — Canvas 에 곡선 프리미티브가 원뿐이라 이렇게 만든다.
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + 0.4;
        const r = canvas.height * 0.19;
        canvas.circle(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, r, i % 2 === 0 ? primary : accent, 0.3);
    }
    canvas.circle(cx, cy, canvas.height * 0.1, primary, 0.85);
    canvas.ring(cx, cy, canvas.height * 0.42, 8, accent, 0.3);
    canvas.roundRect(canvas.width * 0.07, canvas.height * 0.38, canvas.width * 0.22, 16, 8, deep, 0.2);
    canvas.roundRect(canvas.width * 0.07, canvas.height * 0.48, canvas.width * 0.15, 12, 6, deep, 0.14);
    scatter(canvas, deep, random, 70);
}

/** 크게 번진 원들 — 매장 분위기 자리(공간을 찍은 사진이 들어올 칸). */
function bloom(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    canvas.circle(canvas.width * 0.3, canvas.height * 0.34, canvas.width * 0.3, primary, 0.26);
    canvas.circle(canvas.width * 0.66, canvas.height * 0.56, canvas.width * 0.28, accent, 0.28);
    canvas.circle(canvas.width * 0.48, canvas.height * 0.78, canvas.width * 0.18, primary, 0.2);
    canvas.ring(canvas.width * 0.3, canvas.height * 0.34, canvas.width * 0.38, 10, accent, 0.22);
    scatter(canvas, deep, random, 60);
}

/**
 * 전/후 자리표시자. **시술 결과 사진이 아니다** — 손톱 다섯 칸을 추상 도형으로 세우고, `stage` 로
 * 정돈된 정도만 달리한다(전=흐리고 들쭉날쭉, 후=또렷하고 가지런). 실제 결과를 지어내지 않으면서
 * "여기 전후 사진이 들어간다"는 자리를 보여주는 것이 목적이고, 고객은 이 그림을 반드시 교체한다.
 */
function swatch(canvas, palette, random, {variant = 0, stage = 0} = {}) {
    const {primary, accent, deep} = palette;
    const after = stage === 1;
    canvas.circle(canvas.width * 0.5, canvas.height * 0.62, canvas.width * 0.36, accent, after ? 0.22 : 0.12);

    for (let i = 0; i < 5; i++) {
        // variant 가 손가락 길이 배치를 정한다 — 같은 variant 의 전/후가 같은 손으로 읽혀야 한다.
        const lift = [0.06, 0.1, 0.12, 0.09, 0.05][(i + variant) % 5];
        const w = canvas.width * 0.11;
        const h = canvas.height * (0.2 + lift);
        const x = canvas.width * (0.19 + i * 0.14);
        const y = canvas.height * 0.66 - h;
        canvas.roundRect(x, y, w, h, w * 0.45, deep, after ? 0.14 : 0.2);
        // 발색 면 — 후에만 또렷하고 가지런하게 얹힌다.
        canvas.roundRect(
            x + (after ? 0 : 2 + ((i * 7) % 5)),
            y + (after ? 0 : 3 + ((i * 5) % 7)),
            w,
            h * (after ? 0.62 : 0.38),
            w * 0.45,
            primary,
            after ? 0.92 : 0.32,
        );
    }
    if (after) canvas.ring(canvas.width * 0.5, canvas.height * 0.62, canvas.width * 0.42, 6, primary, 0.3);
    scatter(canvas, deep, random, 40);
}

/**
 * 진열대 — 재화를 파는 가게의 첫 화면. 선반 두 단 위에 물건이 놓인 실루엣을 추상 도형으로 세운다.
 * "무엇을 파는지"를 지어내지 않으면서 진열의 리듬만 보여주는 것이 목적이고, 고객은 이 그림을 교체한다.
 */
function shelf(canvas, palette, random) {
    const {primary, accent, deep} = palette;
    canvas.circle(canvas.width * 0.78, canvas.height * 0.28, canvas.width * 0.24, accent, 0.32);
    for (let row = 0; row < 2; row++) {
        const shelfY = canvas.height * (0.46 + row * 0.28);
        // 선반 판.
        canvas.roundRect(canvas.width * 0.12, shelfY, canvas.width * 0.76, 12, 6, deep, 0.22);
        for (let i = 0; i < 4; i++) {
            // 물건 높이·폭을 칸마다 달리해 "같은 물건 반복"으로 안 읽히게 한다.
            const h = canvas.height * [0.16, 0.11, 0.19, 0.13][(i + row) % 4];
            const w = canvas.width * [0.11, 0.14, 0.09, 0.12][(i + row) % 4];
            const x = canvas.width * (0.16 + i * 0.19);
            const lead = (i + row) % 3 === 0; // 한 칸만 브랜드색으로 세운다 — 시선이 갈 자리.
            canvas.roundRect(x, shelfY - h, w, h, w * 0.22, lead ? primary : deep, lead ? 0.9 : 0.16);
            canvas.roundRect(x + w * 0.24, shelfY - h * 0.7, w * 0.52, 8, 4, lead ? accent : deep, lead ? 0.85 : 0.24);
        }
    }
    canvas.ring(canvas.width * 0.22, canvas.height * 0.2, canvas.width * 0.13, 12, primary, 0.26);
    scatter(canvas, deep, random, 80);
}

/**
 * 상품 커버 자리표시자. **상품 사진이 아니다** — 바닥 그림자 위에 물건 하나를 추상 도형으로 세우고
 * `variant` 로 실루엣만 달리한다. 실제 상품을 지어내지 않으면서 "여기 상품 사진이 들어간다"는 자리를
 * 보여주는 것이 목적이다(§7 금지선: 식별 가능 인물 0 · 실존 상표 0).
 */
function object(canvas, palette, random, {variant = 0} = {}) {
    const {primary, accent, deep} = palette;
    const cx = canvas.width * 0.5;
    const baseY = canvas.height * 0.72;
    canvas.circle(cx, canvas.height * 0.46, canvas.width * 0.3, accent, 0.24);
    // 바닥 그림자 — 물건이 떠 보이지 않게.
    canvas.circle(cx, baseY + 10, canvas.width * 0.22, deep, 0.1);

    // variant 가 실루엣을 정한다: 폭·높이·모서리·손잡이 유무.
    const [wf, hf, roundf, handle] = [
        [0.34, 0.34, 0.1, false], // 접힌 천 — 넓고 낮다
        [0.24, 0.3, 0.16, true], // 컵 — 손잡이가 붙는다
        [0.2, 0.42, 0.12, false], // 초 — 좁고 높다
        [0.38, 0.26, 0.08, false], // 수건 — 가장 넓다
        [0.44, 0.16, 0.3, false], // 트레이 — 납작하다
    ][variant % 5];

    const w = canvas.width * wf;
    const h = canvas.height * hf;
    const x = cx - w / 2;
    const y = baseY - h;
    canvas.roundRect(x, y, w, h, Math.min(w, h) * roundf, primary, 0.9);
    // 띠 하나 — 라벨·결의 자리.
    canvas.roundRect(x, y + h * 0.62, w, h * 0.14, 0, deep, 0.14);
    if (handle) canvas.ring(x + w + w * 0.16, y + h * 0.48, w * 0.24, w * 0.11, primary, 0.9);

    scatter(canvas, deep, random, 36);
}

/** 아주 옅은 점 격자 — 평평한 그라디언트에 질감을 준다(고정 시드라 결정론 유지). */
function scatter(canvas, color, random, count) {
    for (let i = 0; i < count; i++) {
        canvas.circle(random() * canvas.width, random() * canvas.height, 2 + random() * 3, color, 0.06);
    }
}

const COMPOSITIONS = {stack, bands, orbit, petal, bloom, swatch, shelf, object};

function art(width, height, palette, kind, opts = {}) {
    const canvas = new Canvas(width, height);
    // 픽셀 노이즈를 쓰지 않는다 — 질감은 조금 얻고 deflate 는 크게 잃는다(히어로 한 장이 700KB→수십 KB).
    canvas.fillGradient(hex(palette.surfaceHex), mix(palette.surfaceHex, palette.primaryHex, 0.16));
    // 같은 치수의 그림이 여럿일 때(전/후 6장) 시드가 겹치면 점 격자까지 똑같아진다 — opts 를 시드에 섞는다.
    const seed = 20260726 + width + height + (opts.variant ?? 0) * 97 + (opts.stage ?? 0) * 13;
    COMPOSITIONS[kind](canvas, palette, rng(seed), opts);
    return canvas;
}

/** 가상 상호 워드마크 — 모노그램 타일 + 블록 레터. 투명 배경이라 어느 표면에나 얹힌다. */
function wordmark(name, palette) {
    const canvas = new Canvas(360, 110);
    const scale = 4;
    canvas.roundRect(8, 27, 56, 56, 16, palette.primary, 0.92);
    const initial = name[0];
    canvas.text(initial, 8 + (56 - Canvas.textWidth(initial, scale)) / 2, 27 + (56 - 7 * scale) / 2, scale, [255, 255, 255]);
    canvas.text(name, 82, 41, scale, palette.deep, {alpha: 0.82});
    return canvas;
}

/**
 * 콘솔 카드 썸네일(§8 레지스트리 `thumbnailKey`) — 테마 목록이 성립하려면 카드에 그림이 있어야 한다.
 * zip 에 안 들어간다(고객 소스가 아니라 **우리 카탈로그 자산**이라 S3 `platform/` 평면에 따로 올린다).
 * 사이트 첫 화면의 축소판처럼 보이게: 상단 바 + 히어로 블록 + 본문 줄 + 액센트.
 */
function thumbnail(palette) {
    const canvas = new Canvas(640, 400);
    canvas.fillGradient(hex(palette.surfaceHex), mix(palette.surfaceHex, palette.primaryHex, 0.1));
    canvas.roundRect(0, 0, 640, 44, 0, palette.deep, 0.9);
    canvas.roundRect(24, 18, 64, 8, 4, palette.primary, 0.95);
    [1, 2, 3].forEach((i) => canvas.roundRect(500 + i * 34, 20, 22, 5, 3, [255, 255, 255], 0.5));

    canvas.roundRect(40, 92, 250, 18, 9, palette.deep, 0.75);
    canvas.roundRect(40, 124, 190, 12, 6, palette.deep, 0.3);
    canvas.roundRect(40, 152, 96, 26, 13, palette.primary, 0.95);
    canvas.roundRect(340, 84, 260, 150, 18, palette.primary, 0.22);
    canvas.circle(470, 159, 44, palette.accent, 0.7);

    [0, 1, 2].forEach((i) => {
        canvas.roundRect(40 + i * 190, 272, 160, 88, 14, palette.deep, 0.1);
        canvas.circle(64 + i * 190, 298, 10, palette.primary, 0.8);
        canvas.roundRect(40 + i * 190 + 14, 320, 96, 8, 4, palette.deep, 0.35);
        canvas.roundRect(40 + i * 190 + 14, 336, 128, 6, 3, palette.deep, 0.2);
    });
    return canvas;
}

/**
 * 후기 아바타·인물 자리 — 식별 가능 인물 사진 금지(§7)라 모노그램으로 간다.
 *
 * [size] 비례식은 200 에서 종전 상수(100·78·scale 10)와 **정확히 같은 값**을 낸다 — 기존 biz 아바타의
 * 바이트가 이 일반화로 흔들리면 안 된다(재생성이 팩 sha256 을 바꾸지 않는다는 계약).
 */
function avatar(initial, palette, size = 200) {
    const canvas = new Canvas(size, size);
    const half = size / 2;
    canvas.circle(half, half, half, palette.primary, 0.14);
    canvas.circle(half, half, size * 0.39, palette.primary, 0.9);
    const scale = Math.round(size / 20);
    canvas.text(initial, half - Canvas.textWidth(initial, scale) / 2, half - (7 * scale) / 2, scale, [255, 255, 255]);
    return canvas;
}

function mix(fromHex, toHex, t) {
    const a = hex(fromHex);
    const b = hex(toHex);
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/**
 * 시드가 상품 커버로 쓰는 파일명 — **시드가 정본**이다. 여기서 목록을 따로 관리하면 시드와 갈라지고,
 * 갈라진 순간 팩 게이트가 "안 쓰는 에셋"으로 잡거나(양성) 커버가 섹션 자리로 새어 나간다(음성).
 * 상품이 없는 테마는 빈 집합이라 `assets/` 가 아예 안 생긴다(팩의 기대와 같다).
 */
function readSeedCovers(code) {
    try {
        const seed = JSON.parse(readFileSync(join(ROOT, "presets", code, "seed.json"), "utf8"));
        return (seed.products ?? []).map((p) => p.imageAsset).filter(Boolean);
    } catch {
        return []; // 시드가 없는 테마 — 전부 섹션 이미지로 본다.
    }
}

function generate(code) {
    const spec = THEMES[code];
    if (!spec) throw new Error(`알 수 없는 테마: ${code}`);

    const palette = {
        primary: hex(spec.primary),
        accent: hex(spec.accent),
        deep: hex(spec.deep),
        primaryHex: spec.primary,
        surfaceHex: spec.surface,
    };
    // ⚠ **거처가 둘이고 팩이 그 둘을 다른 자리로 보낸다**(pack v2):
    //    `presets/<code>/assets/`  → zip `.zalkera/assets/` — **상품 커버 전용 풀**이다.
    //    `presets/<code>/public/`  → zip `public/` — 섹션 이미지(히어로·후기 아바타 등).
    //
    // 초판은 **전부 `assets/` 로** 썼다. 팩이 v2 에서 갈라진 뒤에도 생성기가 안 따라가서, 재생성하면
    // 섹션 이미지가 `assets/` 로 되돌아가고 팩의 참조 무결성 게이트("아무 상품도 안 쓰는 에셋")에
    // 걸린다 — 즉 **"재생성은 결정론적이라 안전하다"는 계약이 조용히 깨져 있었다**(실측: 이 파일을
    // import 하는 것만으로 전 테마가 재생성돼 stray 가 21개 생겼다).
    //
    // 판별은 이름으로 한다: 시드 상품이 `imageAsset` 으로 가리키는 파일만 상품 커버다.
    const coverNames = new Set(readSeedCovers(code));
    const assetDir = join(ROOT, "presets", code, "assets");
    const publicDir = join(ROOT, "presets", code, "public", "images");

    const written = [];
    const emit = (name, canvas) => {
        const dir = coverNames.has(name) ? assetDir : publicDir;
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, name), canvas.toPng());
        written.push(coverNames.has(name) ? `assets/${name}` : `public/images/${name}`);
    };

    for (const [name, width, height, kind, opts] of spec.arts) emit(name, art(width, height, palette, kind, opts));
    spec.logos.forEach((name, i) => emit(`logo-${String(i + 1).padStart(2, "0")}.png`, wordmark(name, palette)));
    spec.avatars.forEach((initial, i) => emit(`avatar-${String(i + 1).padStart(2, "0")}.png`, avatar(initial, palette)));
    // 이름이 역할을 말해야 하는 인물 자리(원장 등) — avatar-NN 연번에 섞으면 시드에서 누가 누군지 안 보인다.
    (spec.portraits ?? []).forEach(([name, initial, size]) => emit(name, avatar(initial, palette, size)));

    // 썸네일은 시드 에셋이 아니다 — assets/ 밖에 둬야 참조 무결성 게이트(안 쓰는 에셋 = 실패)에 안 걸린다.
    writeFileSync(join(ROOT, "presets", code, "thumbnail.png"), thumbnail(palette).toPng());

    console.log(`${code}: 시드 에셋 ${written.length}개 — ${written.join(", ")} (+ thumbnail.png)`);
}

const targets = process.argv.slice(2);
for (const code of targets.length ? targets : Object.keys(THEMES)) generate(code);
