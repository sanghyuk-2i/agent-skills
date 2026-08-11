---
name: pr-ui-review
description: GitHub PR의 UI 변경을 before/after 스크린샷으로 비교하고, 실제로 달라진 영역에만 번호 붙은 박스를 그려 PR 코멘트로 게시합니다. base 브랜치를 git worktree로 띄워 현재 브랜치와 같은 화면을 캡처하고, 픽셀 diff로 변경 영역을 찾은 뒤 각 박스에 설명을 답니다. PR을 올릴 때, UI/스타일/컴포넌트를 수정했을 때, "화면 뭐가 바뀌었는지 보여줘", "스크린샷 붙여줘", "리뷰어가 보기 쉽게" 같은 요청에 사용하세요. 사용자가 "스크린샷"이라는 말을 쓰지 않아도 프론트엔드 변경을 PR로 올리는 맥락이면 사용하세요.
---

# PR UI 리뷰 스크린샷

코드 diff는 `className` 한 줄이 화면에서 무엇을 바꾸는지 알려주지 않는다. 이 스킬은 base와 head를 **동시에 띄워 같은 화면을 찍고**, 픽셀 비교로 달라진 곳에만 박스를 그려 PR 코멘트로 올린다.

**핵심 원칙 하나**: 리뷰어가 봐야 할 박스는 적을수록 좋다. 픽셀이 달라진 모든 곳이 아니라 **실제로 바뀐 곳**만 표시한다. 버튼이 8px 커져서 그 아래 전체가 밀려 내려간 경우, 박스는 버튼 하나이고 나머지는 "8px 아래로 이동" 한 줄로 요약한다. 이 구분(`shifted`)은 `annotate.mjs`가 자동으로 해준다.

## 0단계 — 전제 확인

```bash
git rev-parse --show-toplevel && gh auth status
gh pr view --json number,baseRefName,headRefName,isDraft 2>/dev/null
```

| 상황 | 진행 |
|---|---|
| PR 있음 | 정상 흐름. `baseRefName`을 base로 |
| PR 없음 | **브랜치 비교 모드**: base를 `origin/main`(또는 기본 브랜치)으로 잡고 7단계 게시 대신 산출물 경로만 보고 |
| 커밋되지 않은 변경 있음 | 그대로 진행 (head 서버는 워킹트리를 띄운다). 다만 게시 시 "커밋 안 된 변경 포함"임을 코멘트에 밝힌다 |

스킬 스크립트가 처음 실행되는 환경이면 한 번만:
```bash
npm install --prefix <스킬경로>/scripts    # 대상 레포에는 아무것도 설치하지 않는다
```

## 1단계 — UI 변경이 있는지 판별

```bash
BASE=$(gh pr view --json baseRefName --jq .baseRefName)
git fetch origin "$BASE" --quiet
git diff --name-only "origin/$BASE...HEAD"
git log --oneline "origin/$BASE...HEAD"
```

UI 파일: `.tsx .jsx .ts(컴포넌트) .vue .svelte .css .scss .sass .less .styl`, `tailwind.config.*`, 디자인 토큰, `public/` 이미지·폰트.

**UI 파일이 하나도 없으면 여기서 멈춘다.** 서버를 띄우지 말고 "이 PR에는 UI 변경이 없습니다"라고 보고한다. 로직만 바뀐 PR에 스크린샷을 붙이는 건 리뷰어에게 노이즈다.

커밋 메시지도 같이 읽는다 — 6단계에서 "무엇이 왜 바뀌었는지" 설명할 때 근거가 된다.

## 2단계 — 캡처할 라우트 정하기

`.claude/ui-review.json`을 읽고(없으면 3단계 전에 만든다) `routes[].match` glob을 1단계의 변경 파일과 대조한다.

| 결과 | 진행 |
|---|---|
| 매칭된 라우트 있음 | 그대로 진행 |
| 설정은 있는데 매칭 0개 | 변경 파일을 import 그래프로 역추적해 후보 라우트를 찾고, **AskUserQuestion으로 확인** |
| 설정 파일 없음 | 아래 초안을 만들어 사용자 승인 후 생성 |

설정 초안은 추측하지 말고 근거를 갖고 만든다:
- `dev.command`/`install` → `package.json`의 scripts, lockfile 종류
- `routes[].path` → 라우터 구조(`app/`, `pages/`, `routes/`, router 설정 파일)
- `routes[].match` → 그 라우트가 실제로 import하는 디렉토리

템플릿은 `assets/ui-review.example.json`, 필드 설명은 `references/config.md`.

## 3단계 — base/head 두 서버 띄우기

```bash
<스킬경로>/scripts/prepare.sh --base "origin/$BASE" \
  --dev "npm run dev" --port 3000 --port-env PORT --install "npm ci" --ready-path /
```

worktree와 산출물은 전부 시스템 temp(`$TMPDIR/pr-ui-review/<repo>/`)에 둔다. **대상 레포 안에는 파일을 만들지 않는다.** 출력된 `state.json`의 `baseUrl`/`headUrl`/`outDir`을 다음 단계에서 쓴다.

실패하면 스크립트가 서버 로그 마지막 40줄을 보여준다. 대개 원인은 셋 중 하나다: base에서 의존성이 안 맞음, 포트 충돌, 환경변수(`.env`) 누락. 고쳐서 재시도하되 **추측으로 넘어가지 않는다** — base가 안 뜨면 비교 자체가 무의미하다.

## 4단계 — 캡처

```bash
node <스킬경로>/scripts/capture.mjs --repo "$(git rev-parse --show-toplevel)" \
  --base-url <baseUrl> --head-url <headUrl> --out-dir <outDir> --routes checkout,cart
```

같은 브라우저 컨텍스트로 base→head 순차 캡처한다. 애니메이션 무력화, `document.fonts.ready` 대기, lazy 로딩 강제 트리거, `stabilize.mask` 마스킹이 전부 적용된다. 자세한 안정화 기법과 문제 대응은 `references/capture.md`.

## 5단계 — diff와 박스

라우트마다:
```bash
node <스킬경로>/scripts/annotate.mjs --before <out>/<name>.before.png \
  --after <out>/<name>.after.png --out-dir <out> --name <name>
```

출력 JSON을 읽고 판단한다:

| 필드 | 의미 | 대응 |
|---|---|---|
| `boxes: []`, `shifted: []` | 픽셀 차이 없음 | "시각적 변화 없음" — 코드는 바뀌었는데 화면이 그대로면 그 사실 자체가 리뷰 정보다 |
| `boxes: []`, `shifted` 있음 | 내용은 그대로, 위치만 이동 | "레이아웃이 N px 밀렸습니다"로 보고, 박스는 안 그린다 |
| `wholePageChanged: true` | 60% 넘게 변함 | 박스가 무의미. 전면 개편으로 보고 before/after 원본만 나란히 붙인다 |
| `truncated > 0` | 박스가 상한을 넘음 | 코멘트에 "그 외 N곳 더" 명시 |
| `heightChanged` | 페이지 길이 변화 | 코멘트에 "페이지 높이 756→764px" 한 줄 |

노이즈가 심하면(`changedRatio`가 큰데 실제 변경은 작을 때) `stabilize.mask`에 셀렉터를 추가하도록 사용자에게 제안한다. 임계값을 올려서 덮지 않는다 — 진짜 변경까지 놓친다.

## 6단계 — 박스마다 설명 쓰기

`<name>.box-N.png`(해당 영역의 before/after 크롭)를 **Read로 직접 보고** 코드 diff와 대조해 한 줄씩 쓴다.

- 좋음: `① 결제 버튼 — 높이 40→48px, 라운딩 4→12px, 파랑#2563eb→검정#111827, 문구 "결제하기"→"안전하게 결제하기"`
- 나쁨: `① 버튼이 변경되었습니다`

**본 것만 쓴다.** 크롭에서 확인되지 않는 변화(호버 상태, 애니메이션)를 추측해서 적지 않는다. 코드 diff에는 있는데 스크린샷에 안 잡힌 변경이 있으면 그것도 알린다 — "다크모드 스타일도 바뀌었으나 이번 캡처에는 포함되지 않음"처럼.

## 7단계 — 게시

```bash
<스킬경로>/scripts/publish.sh check                                  # public/private 판별
<스킬경로>/scripts/publish.sh upload --out-dir <out> --pr <n>        # → 파일명:URL 매핑
<스킬경로>/scripts/publish.sh comment --pr <n> --body-file <md>      # 마커로 upsert
```

`upload`는 git plumbing만 써서 `ui-review-assets` orphan 브랜치에 올린다 — 워킹트리와 HEAD를 건드리지 않는다. `comment`는 `<!-- pr-ui-review -->` 마커로 기존 코멘트를 찾아 갱신하므로 재실행해도 코멘트가 쌓이지 않는다.

**private 레포면 `upload`가 `mode: "local"`을 돌려준다.** raw.githubusercontent.com은 토큰 없이 404라 이미지가 안 뜨기 때문이다. 이때는 게시하지 말고, 산출물 경로와 붙여넣을 마크다운 본문을 사용자에게 그대로 보여준다. 자세한 내용과 코멘트 형식은 `references/publishing.md`.

**게시 전 사용자에게 확인받는다.** PR 코멘트는 팀 전체에게 보이는 외부 행동이다.

## 8단계 — 정리

```bash
<스킬경로>/scripts/cleanup.sh
```

서버를 내리고 worktree를 제거한다. 산출물은 남긴다. 중간에 실패했더라도 **반드시 실행한다** — dev 서버가 백그라운드에 남으면 다음 실행의 포트 감지가 꼬인다.

## 하지 말 것

- 대상 레포에 의존성을 설치하거나 파일을 만들지 않는다 (`.claude/ui-review.json` 제외, 그것도 승인 후에)
- 사용자 확인 없이 PR 코멘트를 올리거나 orphan 브랜치를 푸시하지 않는다
- 캡처가 실패한 라우트를 조용히 건너뛰지 않는다 — 무엇이 왜 빠졌는지 보고한다
- 박스 설명을 코드 diff만 보고 쓰지 않는다. 크롭 이미지를 확인한다
- 노이즈를 임계값으로 덮지 않는다. 마스크로 해결한다
