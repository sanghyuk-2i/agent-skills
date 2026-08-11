#!/usr/bin/env bash
# base 브랜치를 worktree로 체크아웃하고, base/head 두 dev 서버를 띄운다.
#
#   prepare.sh --base <ref> [--port 3000] [--port-env PORT] [--install "npm ci"] \
#              [--dev "npm run dev"] [--ready-path /] [--timeout 120000]
#
# 작업 디렉토리는 시스템 temp 아래에 둔다. 대상 레포 안에는 아무 파일도 만들지 않는다
# (.gitignore를 건드릴 필요가 없고, worktree가 실수로 커밋될 일도 없다).
# 상태는 $WORK/state.json에 기록되고 cleanup.sh가 그걸 읽어 정리한다.

set -euo pipefail

BASE=""; PORT=3000; PORT_ENV="PORT"; INSTALL=""; DEV=""; READY_PATH="/"; TIMEOUT_MS=120000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --port-env) PORT_ENV="$2"; shift 2 ;;
    --install) INSTALL="$2"; shift 2 ;;
    --dev) DEV="$2"; shift 2 ;;
    --ready-path) READY_PATH="$2"; shift 2 ;;
    --timeout) TIMEOUT_MS="$2"; shift 2 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$BASE" ]] || { echo "--base 는 필수입니다" >&2; exit 2; }
[[ -n "$DEV"  ]] || { echo "--dev 는 필수입니다 (예: --dev 'npm run dev')" >&2; exit 2; }

REPO_ROOT=$(git rev-parse --show-toplevel)
BASE_SHA=$(git rev-parse "$BASE")
SLUG=$(basename "$REPO_ROOT" | tr -c 'a-zA-Z0-9_.-' '-')
HASH=$(printf '%s' "$REPO_ROOT" | shasum | cut -c1-8)
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"   # macOS의 TMPDIR은 슬래시로 끝난다
WORK="$TMP_BASE/pr-ui-review/${SLUG}-${HASH}"
BASE_TREE="$WORK/base"
OUT_DIR="$WORK/out"
mkdir -p "$WORK" "$OUT_DIR"

log() { echo "[prepare] $*" >&2; }

port_free() { ! nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
find_free_port() {
  local p=$1
  while ! port_free "$p"; do p=$((p + 1)); done
  echo "$p"
}
wait_ready() {
  local url=$1 pid=$2 log_file=$3 deadline=$((SECONDS + TIMEOUT_MS / 1000))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "서버가 죽었습니다. 로그 마지막 40줄:"; tail -40 "$log_file" >&2; return 1
    fi
    if curl -sfo /dev/null --max-time 3 "$url"; then return 0; fi
    sleep 1
  done
  log "타임아웃: $url 가 응답하지 않습니다. 로그 마지막 40줄:"; tail -40 "$log_file" >&2; return 1
}

# ── 1. base worktree (같은 sha면 재사용) ─────────────────────────────────────
if [[ -d "$BASE_TREE/.git" || -f "$BASE_TREE/.git" ]]; then
  CURRENT=$(git -C "$BASE_TREE" rev-parse HEAD 2>/dev/null || echo "")
  if [[ "$CURRENT" != "$BASE_SHA" ]]; then
    log "base worktree를 $BASE_SHA 로 갱신"
    git -C "$BASE_TREE" checkout --detach "$BASE_SHA" --quiet
  else
    log "base worktree 재사용 ($BASE_SHA)"
  fi
else
  log "base worktree 생성: $BASE_TREE ($BASE_SHA)"
  rm -rf "$BASE_TREE"
  git worktree add --detach "$BASE_TREE" "$BASE_SHA" --quiet 2>/dev/null \
    || git worktree add --detach "$BASE_TREE" "$BASE_SHA"
fi

# ── 2. base 의존성 설치 (lockfile이 head와 같으면 node_modules를 심볼릭 링크로 공유) ──
if [[ -n "$INSTALL" ]]; then
  LOCK=""
  for f in package-lock.json pnpm-lock.yaml yarn.lock bun.lockb; do
    [[ -f "$REPO_ROOT/$f" ]] && LOCK="$f" && break
  done
  if [[ -n "$LOCK" && -d "$REPO_ROOT/node_modules" ]] \
     && cmp -s "$REPO_ROOT/$LOCK" "$BASE_TREE/$LOCK" && [[ ! -e "$BASE_TREE/node_modules" ]]; then
    log "lockfile이 동일 → head의 node_modules를 링크 (설치 생략)"
    ln -s "$REPO_ROOT/node_modules" "$BASE_TREE/node_modules"
  elif [[ ! -d "$BASE_TREE/node_modules" ]]; then
    log "base 의존성 설치: $INSTALL (시간이 걸립니다)"
    ( cd "$BASE_TREE" && eval "$INSTALL" ) >"$WORK/install.log" 2>&1 \
      || { log "설치 실패. 로그: $WORK/install.log"; tail -40 "$WORK/install.log" >&2; exit 1; }
  else
    log "base node_modules 재사용"
  fi
fi

# ── 3. 서버 기동 ─────────────────────────────────────────────────────────────
HEAD_PORT=$PORT
HEAD_PID=""
HEAD_REUSED=false
if ! port_free "$HEAD_PORT" && curl -sfo /dev/null --max-time 3 "http://localhost:$HEAD_PORT$READY_PATH"; then
  log "포트 $HEAD_PORT 에서 이미 서버가 응답 → head 서버로 재사용 (현재 브랜치 상태여야 합니다)"
  HEAD_REUSED=true
else
  HEAD_PORT=$(find_free_port "$PORT")
  log "head 서버 기동: port $HEAD_PORT"
  ( cd "$REPO_ROOT" && env "$PORT_ENV=$HEAD_PORT" bash -c "$DEV" ) >"$WORK/head.log" 2>&1 &
  HEAD_PID=$!
  wait_ready "http://localhost:$HEAD_PORT$READY_PATH" "$HEAD_PID" "$WORK/head.log" || exit 1
fi

BASE_PORT=$(find_free_port $((HEAD_PORT + 1)))
log "base 서버 기동: port $BASE_PORT"
( cd "$BASE_TREE" && env "$PORT_ENV=$BASE_PORT" bash -c "$DEV" ) >"$WORK/base.log" 2>&1 &
BASE_PID=$!
wait_ready "http://localhost:$BASE_PORT$READY_PATH" "$BASE_PID" "$WORK/base.log" || exit 1

cat >"$WORK/state.json" <<JSON
{
  "repoRoot": "$REPO_ROOT",
  "work": "$WORK",
  "outDir": "$OUT_DIR",
  "baseTree": "$BASE_TREE",
  "baseSha": "$BASE_SHA",
  "headUrl": "http://localhost:$HEAD_PORT",
  "baseUrl": "http://localhost:$BASE_PORT",
  "headPid": ${HEAD_PID:-null},
  "basePid": $BASE_PID,
  "headReused": $HEAD_REUSED
}
JSON

log "준비 완료"
cat "$WORK/state.json"
