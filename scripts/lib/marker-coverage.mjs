/**
 * 면제 마커의 사유 판정이 **무엇을 통과시키는지** 코드포인트 전수로 잰다.
 *
 * 「사유가 없으면 면제가 안 된다」가 참이려면 눈에 안 보이는 글자도 사유가 아니어야 한다.
 * 이 도구가 그 명제를 숫자로 만든다 — 규칙을 넓히거나 좁힐 때 여기로 확인한다.
 *
 * 사용: `node scripts/lib/marker-coverage.mjs`
 */
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(join(ROOT, "src", "lib", "previewGuard.test.ts"), "utf8");
const m = /const ALLOW_MARKER = (\/.+\/[a-z]*);\n/.exec(src);
if (!m) {
    console.error("ALLOW_MARKER 리터럴을 못 찾았습니다 — 이름이 바뀌었으면 이 도구도 같이 고치십시오.");
    process.exit(1);
}
// eslint-disable-next-line no-eval -- 배송 파일의 리터럴을 그대로 재는 것이 이 도구의 목적이다.
const RE = eval(m[1]);
const line = (reason) => `// zalkera-allow-preview-write: ${reason}\n`;
const invisible = (s) => /\p{Cc}|\p{Cf}|\p{Co}|\p{Cn}|\p{Zs}/u.test(s) || /[ᅟᅠ⠀ㅤﾠ]/u.test(s);

let pass = 0;
let inv = 0;
for (let c = 0; c <= 0x10ffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const s = String.fromCodePoint(c);
    if (!RE.test(line(s))) continue;
    pass++;
    if (invisible(s)) inv++;
}
console.log(`한 글자 사유로 통과: ${pass} · 그중 눈에 안 보이는 것: ${inv}`);
console.log(`정상 사유 통과: ${RE.test(line("캐시라서 고객 데이터가 아니다."))}`);
if (inv > 0) {
    console.error("눈에 안 보이는 글자가 사유로 통과합니다 — 「사유가 없으면 면제가 안 된다」가 거짓입니다.");
    process.exit(1);
}
