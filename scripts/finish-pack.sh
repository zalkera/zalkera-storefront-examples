#!/usr/bin/env bash
#
# 팩 굽기 마감 — client 발행 **뒤**에 부른다.
#
# 왜 스크립트인가: 순서를 틀리면 팩이 옛 `llms.txt` 를 싣는다. 그 zip 은 성공적으로 구워지고
# sha 도 나오는데 내용만 낡아서, 적재한 뒤에야 안다. 순서를 손으로 지키게 두지 않는다.
#
# 사용: bash scripts/finish-pack.sh 3.1.0
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "판 번호를 주십시오: bash scripts/finish-pack.sh 3.1.0" >&2
    exit 2
fi

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "── 1. @zalkera/client 최신본 설치"
# ⚠ **`package.json` 범위를 손으로 올리지 마라.** 그러면 락파일과 갈리고, `npm ci` 는 그
#    불일치에서 죽는다 — **발행 전이면 그 범위를 만족하는 판이 없어서** 더 확실히 죽는다
#    (실측: CI 가 `ETARGET No matching version found for @zalkera/client@^0.24.2` 로 실패).
#    범위는 여기서, **발행된 판을 보고** 올린다.
LATEST=$(npm view @zalkera/client version 2>/dev/null || true)
if [ -z "$LATEST" ]; then
    echo "❌ npm 에서 @zalkera/client 판을 못 읽었습니다 — 네트워크나 발행 상태를 확인하십시오." >&2
    exit 1
fi
echo "   npm latest: $LATEST"
# ⚠ **맨 `npm install` 로는 안 올라간다.** 락파일에 핀이 있으면 그 핀을 유지한다 —
#    범위가 `^0.24.0` 이라 0.24.1 을 받아야 할 것 같지만 받지 않는다. 이름과 판을 대고 부른다.
npm install "@zalkera/client@^${LATEST}"
INSTALLED=$(node -p "require('./node_modules/@zalkera/client/package.json').version")
PINNED=$(node -p "require('./package-lock.json').packages['node_modules/@zalkera/client'].version")
echo "   설치본 $INSTALLED · 락파일 $PINNED"
if [ "$INSTALLED" != "$PINNED" ]; then
    echo "❌ 설치본과 락파일이 갈립니다 — 팩이 어느 판의 llms.txt 를 실을지 말할 수 없습니다." >&2
    exit 1
fi

# ⚠ **낱말까지 본다.** 판 번호가 올라가도 그 판이 우리가 기대한 내용인지는 별개다.
if grep -q "프리뷰" node_modules/@zalkera/client/llms.txt; then
    echo "❌ 설치된 llms.txt 가 아직 「프리뷰」를 담고 있습니다(설치본 $INSTALLED)." >&2
    echo "   client 를 발행하셨는지, npm 캐시가 옛 판을 주고 있지 않은지 확인하십시오." >&2
    echo "   재현: grep -c 프리뷰 node_modules/@zalkera/client/llms.txt" >&2
    exit 1
fi

echo "── 2. 검사 전량"
npm run verify
node scripts/lib/floor-gate.mjs
node scripts/lib/doc-claims.mjs
node scripts/lib/wiring-parity.mjs

echo "── 3. 락파일·범위 커밋(더러운 트리에서는 팩이 안 구워진다)"
# ⚠ **둘을 같은 커밋에 담는다.** 범위만 올리고 락파일을 안 맞추면 `npm ci` 가 죽는다.
if [ -n "$(git status --porcelain package.json package-lock.json)" ]; then
    git add package.json package-lock.json
    git commit -q -m "chore(deps): @zalkera/client ${INSTALLED} — 팩이 이 판의 llms.txt 를 싣는다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
    echo "   커밋했습니다: $(git log --oneline -1)"
else
    echo "   락파일 변경 없음"
fi

echo "── 4. 팩 굽기(4벌 · 검수 포함)"
node scripts/pack-preset.mjs --version "$VERSION"

echo
echo "✅ 끝났습니다. 위 curl 명령으로 적재·공개하십시오."
echo "   ⚠ 적재 전 확인: dist-presets/ 는 gitignore 라, 디스크의 zip 이 카탈로그의 그 판이라는"
echo "     보장이 없습니다. 방금 구운 것만 올리십시오(doc/RELEASE.md §2.1-c)."
