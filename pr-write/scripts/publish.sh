#!/usr/bin/env bash
# pr-ui-review가 만든 이미지를 orphan 브랜치에 올리고 PR 코멘트를 갱신한다.
#
#   publish.sh upload  --out-dir <dir> --pr <n> [--branch ui-review-assets]
#                      (<dir>/manifest.json 이 가리키는 표시용 이미지만 올린다)
#   publish.sh comment --pr <n> --body-file <md>
#   publish.sh check                       # public/private 판별만
#
# upload는 git plumbing만 쓴다 — 워킹트리도 HEAD도 건드리지 않으므로
# 사용자가 작업 중인 브랜치 상태가 그대로 유지된다.

set -euo pipefail

MARKER="<!-- pr-ui-review -->"
BRANCH="ui-review-assets"
CMD="${1:-}"; shift || true

OUT_DIR=""; PR=""; BODY_FILE=""; FORCE_LOCAL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --pr) PR="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --local) FORCE_LOCAL=true; shift ;;
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
  if [[ "$FORCE_LOCAL" == "true" ]]; then
    # 이미지를 레포에 올리고 싶지 않을 때: 올리지 않고 경로만 돌려준다
    echo "{\"mode\":\"local\",\"private\":$IS_PRIVATE,\"outDir\":\"$OUT_DIR\",\"reason\":\"--local 지정\"}"
    exit 0
  fi
  # public: raw.githubusercontent.com 링크. private: raw 링크는 토큰 없이 404라 깨지므로,
  # 같은 레포 안의 blob 링크(?raw=true)를 쓴다 — 레포 접근 권한이 있는 리뷰어에게는 로그인 상태로 렌더된다.
  if [[ "$IS_PRIVATE" == "true" ]]; then
    URL_BASE="https://github.com/$NWO/blob/$BRANCH"; URL_SUFFIX="?raw=true"
  else
    URL_BASE="https://raw.githubusercontent.com/$NWO/$BRANCH"; URL_SUFFIX=""
  fi

  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  MANIFEST="$OUT_DIR/manifest.json"
  [[ -f "$MANIFEST" ]] || { echo "$MANIFEST 가 없습니다. pr-ui-review로 먼저 manifest를 만드세요" >&2; exit 2; }
  # 경로 이름은 현재 HEAD가 아니라 캡처한 그 상태(manifest의 head sha)를 따른다
  SHA=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['head']['sha'] or '')" "$MANIFEST")
  [[ -n "$SHA" ]] || SHA=$(git rev-parse --short=7 HEAD)
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
m=json.load(sys.stdin); m['''$rel''']='$URL_BASE/$PREFIX/$rel$URL_SUFFIX'
print(json.dumps(m))")
  done < <(python3 "$HERE/manifest-images.py" "$MANIFEST" "$OUT_DIR")

  TREE=$(git write-tree)
  MSG="ui-review: PR #$PR @ $SHA"
  if [[ -n "$PARENT" ]]; then
    COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
  else
    COMMIT=$(git commit-tree "$TREE" -m "$MSG")
  fi
  git push --quiet origin "$COMMIT:refs/heads/$BRANCH"

  echo "{\"mode\":\"remote\",\"private\":$IS_PRIVATE,\"branch\":\"$BRANCH\",\"prefix\":\"$PREFIX\",\"urls\":$MAPPING}"
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
