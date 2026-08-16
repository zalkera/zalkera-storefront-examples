import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve} from "node:path";

// 문서가 계약 rev 를 사람 말로 적는데, 계약이 오를 때 그 줄이 따라오지 않았다(rev 4 인 채로 계약은 5).
// AGENTS.md 는 **유지보수하는 LLM 이 읽는 교본**이라, 여기가 낡으면 낡은 계약대로 고친 소스가 나온다.
// 사람이 기억해서 맞추는 대신 기계가 대조한다.
//
// ⚠ **잘커라 정본 저장소에서만 돈다.** 이 시험은 **우리 교본**이 **우리 계약**을 따라오는지 보는
//   것이지 고객 문서 형식을 강제하는 것이 아니다. 무조건 돌리면, 우리가 계약 rev 를 올리는 날
//   `client-upgrade.yml` 이 락파일을 승급시키는 순간 **전 테넌트의 CI 가 빨개지고** 배포 게이트 가
//   그 사이트의 배포를 막는다 — 고객은 우리 계약이 무엇이 바뀌었는지 모르는데 자기 배포가 막힌다.
//   `ci.yml` 이 스텝마다 경고하는 바로 그 비대칭이라, 같은 판별자(`presets/` + `pack-preset.mjs`)를 쓴다.
const CANONICAL =
    existsSync(resolve(import.meta.dirname, "../../presets")) &&
    existsSync(resolve(import.meta.dirname, "../../scripts/pack-preset.mjs"));

test(
    "AGENTS.md 가 적은 계약 rev 가 설치본의 SECTION_CONTRACT_REV 와 같다",
    {skip: CANONICAL ? false : "잘커라 정본 저장소 전용"},
    async () => {
        const require_ = createRequire(import.meta.url);
        const {SECTION_CONTRACT_REV} = require_("@zalkera/client");
        const agents = readFileSync(resolve(import.meta.dirname, "../../AGENTS.md"), "utf8");

        const stated = agents.match(/현재 \*\*rev (\d+)\*\*/);
        assert.ok(stated, "AGENTS.md 에서 '현재 **rev N**' 을 못 찾았다 — 서술을 지웠다면 이 검사도 함께 손봐라");
        assert.equal(
            Number(stated[1]),
            SECTION_CONTRACT_REV,
            `AGENTS.md 는 rev ${stated[1]} 이라는데 설치된 @zalkera/client 는 rev ${SECTION_CONTRACT_REV} 다.` +
                " 계약이 오르면 AGENTS.md 의 '오른 자국' 목록에 그 rev 를 적고 이 줄도 올려라.",
        );

        // 자국 목록도 그 rev 까지 이어져 있어야 한다 — 숫자만 올리고 내용을 안 적으면 읽는 쪽이 무엇이 바뀌었는지 모른다.
        assert.match(
            agents,
            new RegExp(`rev ${SECTION_CONTRACT_REV} =`),
            `AGENTS.md 에 'rev ${SECTION_CONTRACT_REV} = ...' 자국이 없다 — 무엇이 바뀌었는지 한 줄 적어라.`,
        );
    },
);
