#!/usr/bin/env bash
# SKILL.md의 description을 .cursor-rule.mdc에 맞춘다. SKILL.md가 원본이다.
#
#   sync-description.sh          # 반영
#   sync-description.sh --check  # 어긋나 있으면 exit 1 (쓰지 않음)

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$DIR/SKILL.md"
DST="$DIR/.cursor-rule.mdc"

DESC=$(awk '/^---$/{n++; next} n==1 && /^description:/{sub(/^description: */,""); print; exit}' "$SRC")
[[ -n "$DESC" ]] || { echo "SKILL.md에서 description을 찾지 못했습니다" >&2; exit 1; }

NEW=$(awk -v d="$DESC" '/^description:/ && !done {print "description: " d; done=1; next} {print}' "$DST")

if [[ "${1:-}" == "--check" ]]; then
  [[ "$NEW" == "$(cat "$DST")" ]] && exit 0
  echo ".cursor-rule.mdc의 description이 SKILL.md와 다릅니다. sync-description.sh를 실행하세요" >&2
  exit 1
fi

printf '%s\n' "$NEW" > "$DST"
