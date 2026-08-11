#!/usr/bin/env bash
# dev 서버를 내리고 base worktree를 제거한다.
#
#   cleanup.sh [--keep-worktree] [--keep-out]
#
# state.json이 없어도 안전하게 끝난다. 산출물(out/)은 기본으로 남긴다 —
# 게시 실패 시 사용자가 직접 첨부할 수 있어야 하기 때문.

set -euo pipefail

KEEP_WORKTREE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-worktree) KEEP_WORKTREE=true; shift ;;
    --keep-out) shift ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT=$(git rev-parse --show-toplevel)
SLUG=$(basename "$REPO_ROOT" | tr -c 'a-zA-Z0-9_.-' '-')
HASH=$(printf '%s' "$REPO_ROOT" | shasum | cut -c1-8)
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
WORK="$TMP_BASE/pr-ui-review/${SLUG}-${HASH}"
STATE="$WORK/state.json"

log() { echo "[cleanup] $*" >&2; }

kill_tree() { # dev 서버는 자식 프로세스를 남기므로 프로세스 그룹째 정리한다
  local pid=$1
  [[ -z "$pid" || "$pid" == "null" ]] && return 0
  kill -0 "$pid" 2>/dev/null || return 0
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  sleep 1
  kill -9 "$pid" 2>/dev/null || true
  log "서버 종료: pid $pid"
}

if [[ -f "$STATE" ]]; then
  HEAD_PID=$(python3 -c "import json;print(json.load(open('$STATE')).get('headPid') or '')")
  BASE_PID=$(python3 -c "import json;print(json.load(open('$STATE')).get('basePid') or '')")
  REUSED=$(python3 -c "import json;print(json.load(open('$STATE')).get('headReused'))")
  [[ "$REUSED" == "True" ]] && log "head 서버는 원래 떠 있던 것이라 건드리지 않습니다" || kill_tree "$HEAD_PID"
  kill_tree "$BASE_PID"
  rm -f "$STATE"
else
  log "state.json 없음 — 종료할 서버 정보가 없습니다"
fi

if [[ "$KEEP_WORKTREE" == false && -e "$WORK/base" ]]; then
  # node_modules를 심볼릭 링크로 공유했다면 링크만 지워야 head의 것이 안전하다
  [[ -L "$WORK/base/node_modules" ]] && rm -f "$WORK/base/node_modules"
  git -C "$REPO_ROOT" worktree remove --force "$WORK/base" 2>/dev/null || rm -rf "$WORK/base"
  git -C "$REPO_ROOT" worktree prune
  log "base worktree 제거"
fi

log "정리 완료. 산출물은 $WORK/out 에 남아 있습니다."
