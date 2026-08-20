/**
 * **시험용 최소 zip 작성기 — 무압축(stored) 항목만.**
 *
 * 이 박스에도 CI 에도 `zip` 실행파일이 없을 수 있다.
 * 재현: `command -v zip unzip; echo rc=$?` → 이 개발 박스는 `unzip` 만 나오고 rc=1.
 * 시험이 외부 명령의 유무에 걸리면 그 시험은 어떤 기계에서는 조용히 안 돌고, 안 도는 시험은
 * 없는 시험이다. 그래서 필요한 만큼만 직접 쓴다.
 *
 * ⚠ **배송물이 아니다.** 검사기가 아니라 시험 도구이므로 팩에서 뺀다.
 */
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";

/** CRC-32 표 — 한 번만 만든다. */
const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/**
 * `entries` 를 담은 zip 을 `outPath` 에 쓴다.
 *
 * @param entries `{[zip 안 경로]: 문자열 | Buffer}`. 경로에 `/` 를 쓰면 폴더가 된다.
 * @returns 만든 파일의 sha256(16진).
 */
export function writeMiniZip(outPath, entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    // 날짜는 고정한다 — 같은 입력이면 같은 바이트가 나와야 한다.
    const dosTime = 0;
    // DOS 날짜 필드의 고정값. 값 자체는 뜻이 없다 — 같은 입력이 같은 바이트를 내는 것이 목적이다.
    const dosDate = 0x2821;

    for (const [name, body] of Object.entries(entries)) {
        const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
        const nameBuf = Buffer.from(name, "utf8");
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(10, 4); // 필요 버전
        local.writeUInt16LE(0, 6); // 플래그
        local.writeUInt16LE(0, 8); // 무압축
        local.writeUInt16LE(dosTime, 10);
        local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, nameBuf, data);

        const head = Buffer.alloc(46);
        head.writeUInt32LE(0x02014b50, 0);
        head.writeUInt16LE(20, 4); // 만든 버전
        head.writeUInt16LE(10, 6);
        head.writeUInt16LE(0, 8);
        head.writeUInt16LE(0, 10);
        head.writeUInt16LE(dosTime, 12);
        head.writeUInt16LE(dosDate, 14);
        head.writeUInt32LE(crc, 16);
        head.writeUInt32LE(data.length, 20);
        head.writeUInt32LE(data.length, 24);
        head.writeUInt16LE(nameBuf.length, 28);
        head.writeUInt32LE(offset, 42);
        central.push(head, nameBuf);

        offset += local.length + nameBuf.length + data.length;
    }

    const centralBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8);
    end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);

    const all = Buffer.concat([...chunks, centralBuf, end]);
    writeFileSync(outPath, all);
    return createHash("sha256").update(all).digest("hex");
}
