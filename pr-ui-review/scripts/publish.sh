#!/usr/bin/env bash
# 이미지를 orphan 브랜치에 올리고 PR 코멘트를 갱신한다.
#
#   publish.sh upload  --out-dir <dir> --pr <n> [--branch ui-review-assets]
#   publish.sh comment --pr <n> --body-file <md>
#   publish.sh check                       # public/private 판별만
#
# upload는 git plumbing만 쓴다 — 워킹트리도 HEAD도 건드리지 않으므로
# 사용자가 작업 중인 브랜치 상태가 그대로 유지된다.

set -euo pipefail

MARKER="<!-- pr-ui-review -->"
BRANCH="ui-review-assets"
CMD="${1:-}"; shift || true

OUT_DIR=""; PR=""; BODY_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --pr) PR="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT=$(git rev-parse --show-toplevel)
NWO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
IS_PRIVATE=$(gh repo view --json isPrivate --jq .isPrivate)

case "$CMD" in
check)
  echo "{\"repo\":\"$NWO\",\"private\":$IS_PRIVATE}"
  ;;

upload)
  [[ -n "$OUT_DIR" && -n "$PR" ]] || { echo "--out-dir, --pr 필수" >&2; exit 2; }
  if [[ "$IS_PRIVATE" == "true" ]]; then
    # private 레포는 raw.githubusercontent.com이 토큰 없이 404 → 코멘트에 이미지가 안 뜬다.
    echo "{\"mode\":\"local\",\"private\":true,\"outDir\":\"$OUT_DIR\",\"reason\":\"private 레포는 raw URL 임베드가 불가능합니다\"}"
    exit 0
  fi

  SHA=$(git rev-parse --short=7 HEAD)
  PREFIX="pr-${PR}/${SHA}"
  git fetch origin "$BRANCH" --quiet 2>/dev/null || true
  PARENT=$(git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" || true)

  TMP_INDEX=$(mktemp -t ui-review-index.XXXXXX)
  rm -f "$TMP_INDEX"
  export GIT_INDEX_FILE="$TMP_INDEX"
  trap 'rm -f "$TMP_INDEX"' EXIT

  if [[ -n "$PARENT" ]]; then git read-tree "$PARENT"; else git read-tree --empty; fi

  MAPPING="{}"
  while IFS= read -r -d '' f; do
    rel=$(basename "$f")
    blob=$(git hash-object -w "$f")
    git update-index --add --cacheinfo "100644,$blob,$PREFIX/$rel"
    MAPPING=$(printf '%s' "$MAPPING" | python3 -c "
import json,sys
m=json.load(sys.stdin); m['''$rel''']='https://raw.githubusercontent.com/$NWO/$BRANCH/$PREFIX/$rel'
print(json.dumps(m))")
  done < <(find "$OUT_DIR" -maxdepth 1 -name '*.png' -print0 | sort -z)

  TREE=$(git write-tree)
  MSG="ui-review: PR #$PR @ $SHA"
  if [[ -n "$PARENT" ]]; then
    COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
  else
    COMMIT=$(git commit-tree "$TREE" -m "$MSG")
  fi
  git push --quiet origin "$COMMIT:refs/heads/$BRANCH"

  echo "{\"mode\":\"remote\",\"private\":false,\"branch\":\"$BRANCH\",\"prefix\":\"$PREFIX\",\"urls\":$MAPPING}"
  ;;

comment)
  [[ -n "$PR" && -n "$BODY_FILE" ]] || { echo "--pr, --body-file 필수" >&2; exit 2; }
  grep -q -- "$MARKER" "$BODY_FILE" || { echo "본문에 마커($MARKER)가 없습니다" >&2; exit 2; }

  EXISTING=$(gh api "repos/$NWO/issues/$PR/comments" --paginate \
    --jq "map(select(.body | contains(\"$MARKER\"))) | .[0].id // empty")

  if [[ -n "$EXISTING" ]]; then
    gh api -X PATCH "repos/$NWO/issues/comments/$EXISTING" -F body=@"$BODY_FILE" --jq '.html_url'
    echo "(기존 코멘트 갱신: $EXISTING)" >&2
  else
    gh api -X POST "repos/$NWO/issues/$PR/comments" -F body=@"$BODY_FILE" --jq '.html_url'
    echo "(새 코멘트 작성)" >&2
  fi
  ;;

*)
  echo "사용법: publish.sh {check|upload|comment} ..." >&2
  exit 2
  ;;
esac
