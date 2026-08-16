/**
 * 최소 래스터 캔버스 + PNG 인코더.
 *
 * 외부 이미지 라이브러리를 쓰지 않는다. `node:zlib` 만으로 PNG(RGBA·color type 6)를 직접 쓴다 —
 * 시드 에셋은 사진이 아니라 **토큰 색으로 그린 추상 그래픽**이라 이 정도 프리미티브면 충분하고,
 * 의존을 더하면 그 의존이 곧 공급망 표면이 된다(§4.3 copy-in 사상과 같은 이유).
 *
 * **결정론적이다** — 난수는 고정 시드 LCG 뿐이라 같은 입력이면 같은 바이트가 나온다. 재생성이
 * 팩 sha256 을 흔들지 않아야 "코드 패치 → 전 테마 재팩"(§3.1)이 안전하다.
 */
import {deflateSync} from "node:zlib";

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

/** ZIP 로컬 헤더도 같은 CRC-32 를 쓴다 — 테이블을 두 벌 두지 않으려고 여기서 내보낸다. */
export function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
}

function chunk(type, body) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
}

/** `#rrggbb` → [r,g,b]. 팔레트를 테마 토큰과 같은 표기로 적기 위한 헬퍼. */
export function hex(value) {
    const v = value.replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** 고정 시드 LCG — 질감용 미세 흔들림에만 쓴다(결정론 유지). */
export function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
    };
}

export class Canvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8Array(width * height * 4); // 초기값 = 완전 투명
    }

    /** 알파 합성 1픽셀. 경계 밖은 조용히 버린다(도형 클리핑을 호출부가 안 하도록). */
    blend(x, y, [r, g, b], alpha) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
        const i = (y * this.width + x) * 4;
        const a = Math.min(1, alpha);
        const dstA = this.data[i + 3] / 255;
        const outA = a + dstA * (1 - a);
        if (outA <= 0) return;
        for (let k = 0; k < 3; k++) {
            const src = [r, g, b][k];
            this.data[i + k] = Math.round((src * a + this.data[i + k] * dstA * (1 - a)) / outA);
        }
        this.data[i + 3] = Math.round(outA * 255);
    }

    /** 대각 선형 그라디언트로 배경을 채운다. 시드 아트의 바탕은 항상 이것 하나다. */
    fillGradient(from, to, {angle = 0.6, noise = 0} = {}) {
        const random = rng(20260726);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const span = Math.abs(dx) * this.width + Math.abs(dy) * this.height;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const t = Math.min(1, Math.max(0, (x * dx + y * dy) / span));
                const jitter = noise ? (random() - 0.5) * noise : 0;
                const color = [0, 1, 2].map((k) => Math.round(from[k] + (to[k] - from[k]) * t + jitter));
                this.blend(x, y, color, 1);
            }
        }
    }

    /** 라운드 사각형(안티에일리어싱 없음 — 큰 도형이라 계단이 안 보인다). */
    roundRect(x, y, w, h, radius, color, alpha = 1) {
        for (let py = Math.floor(y); py < y + h; py++) {
            for (let px = Math.floor(x); px < x + w; px++) {
                const cx = Math.min(Math.max(px, x + radius), x + w - radius);
                const cy = Math.min(Math.max(py, y + radius), y + h - radius);
                if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) this.blend(px, py, color, alpha);
            }
        }
    }

    circle(cx, cy, radius, color, alpha = 1) {
        for (let py = Math.floor(cy - radius); py <= cy + radius; py++) {
            for (let px = Math.floor(cx - radius); px <= cx + radius; px++) {
                if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) this.blend(px, py, color, alpha);
            }
        }
    }

    /** 링(도넛) — 추상 구성의 리듬을 만드는 데 쓴다. */
    ring(cx, cy, radius, thickness, color, alpha = 1) {
        const inner = (radius - thickness) ** 2;
        const outer = radius ** 2;
        for (let py = Math.floor(cy - radius); py <= cy + radius; py++) {
            for (let px = Math.floor(cx - radius); px <= cx + radius; px++) {
                const d = (px - cx) ** 2 + (py - cy) ** 2;
                if (d <= outer && d >= inner) this.blend(px, py, color, alpha);
            }
        }
    }

    /** 5×7 비트맵 글자. 가상 상호 워드마크·모노그램 전용이라 대문자만 있다. */
    text(str, x, y, scale, color, {tracking = 1, alpha = 1} = {}) {
        let cursor = x;
        for (const ch of str.toUpperCase()) {
            if (ch === " ") {
                cursor += (GLYPH_WIDTH + tracking + 1) * scale;
                continue;
            }
            const glyph = GLYPHS[ch];
            if (!glyph) continue;
            glyph.forEach((row, ry) => {
                for (let rx = 0; rx < GLYPH_WIDTH; rx++) {
                    if (!(row & (1 << (GLYPH_WIDTH - 1 - rx)))) continue;
                    for (let sy = 0; sy < scale; sy++) {
                        for (let sx = 0; sx < scale; sx++) {
                            this.blend(cursor + rx * scale + sx, y + ry * scale + sy, color, alpha);
                        }
                    }
                }
            });
            cursor += (GLYPH_WIDTH + tracking) * scale;
        }
        return cursor - x;
    }

    /** 문자열을 그렸을 때의 픽셀 폭 — 가운데 정렬 계산용. */
    static textWidth(str, scale, tracking = 1) {
        return str.length * (GLYPH_WIDTH + tracking) * scale - tracking * scale;
    }

    toPng() {
        const stride = this.width * 4;
        const raw = Buffer.alloc((stride + 1) * this.height);
        for (let y = 0; y < this.height; y++) {
            raw[y * (stride + 1)] = 0; // filter: None — 도형 위주라 필터 이득이 작고 재현이 단순하다.
            Buffer.from(this.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
        }
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(this.width, 0);
        ihdr.writeUInt32BE(this.height, 4);
        ihdr[8] = 8; // bit depth
        ihdr[9] = 6; // color type: RGBA
        return Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            chunk("IHDR", ihdr),
            chunk("IDAT", deflateSync(raw, {level: 9})),
            chunk("IEND", Buffer.alloc(0)),
        ]);
    }
}

const GLYPH_WIDTH = 5;

/** 5×7 대문자 비트맵. 각 행은 5비트(왼쪽이 최상위)다. */
const GLYPHS = {
    A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
    E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
    H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
};
