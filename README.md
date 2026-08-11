# agent-skills

에이전트 코딩 도구용 스킬 모음. [Claude Code](https://claude.com/claude-code)에서 네이티브로 시작했지만, 각 스킬의 핵심 워크플로우는 `AGENTS.md`에 도구 중립적으로 정리되어 있어 [Cursor](https://cursor.com), [Codex CLI](https://developers.openai.com/codex) 등 다른 에이전트 도구에서도 쓸 수 있다.

| 스킬 | 설명 |
|---|---|
| [`functional-frontend`](functional-frontend) | "쏙쏙 들어오는 함수형 코딩"(Grokking Simplicity)의 원칙 — 액션/계산/데이터 분리, 카피-온-라이트, 계층형 설계 — 으로 React + TypeScript 코드를 작성·리팩토링. 원칙을 기계적으로 검증하는 ESLint 프리셋 포함 |
| [`pr-ui-review`](pr-ui-review) | GitHub PR의 UI 변경을 base/head 스크린샷으로 비교하고, 실제로 달라진 영역에만 박스를 그려 PR 코멘트로 게시 |
| [`doodle-status-prompt`](doodle-status-prompt) | 미니멀 흑백 손그림 캐릭터(원형 얼굴·점 눈·헤드셋)가 특정 상황에 놓인 모습을 그리게 하는 이미지 생성 프롬프트(Nano Banana, Midjourney 등용)를 생성. 블로그 삽화, Slack/Notion 상태 아이콘용 |

## 구조

각 스킬 디렉터리는 같은 3층 구조를 따른다.

```
<스킬>/
├── AGENTS.md          워크플로우 본문. 도구 중립 — 이게 소스 오브 트루스
├── SKILL.md            Claude Code 어댑터 (frontmatter로 자동 트리거 + AGENTS.md로 안내)
├── .cursor-rule.mdc     Cursor 어댑터 템플릿 (description 기반 자동 첨부)
├── references/          필요할 때만 읽는 세부 문서
└── (스킬별 scripts/ · eslint/ · assets/ 등)
```

`AGENTS.md`가 실제 지침을 담고, `SKILL.md`와 `.cursor-rule.mdc`는 "이 도구에서는 언제/어떻게 트리거되는지"만 얇게 얹은 어댑터다. 내용을 두 번 쓰지 않기 위한 구조이므로, 워크플로우를 고칠 땐 `AGENTS.md`만 고치면 된다.

## 설치

### Claude Code

스킬 디렉터리를 `~/.claude/skills/`에 심볼릭 링크로 등록한다. `SKILL.md`의 frontmatter를 읽고 관련된 요청에서 자동으로 트리거된다.

```bash
git clone <이 레포 URL>
cd agent-skills

ln -s "$PWD/functional-frontend" ~/.claude/skills/functional-frontend
ln -s "$PWD/pr-ui-review" ~/.claude/skills/pr-ui-review
ln -s "$PWD/doodle-status-prompt" ~/.claude/skills/doodle-status-prompt
```

### Cursor

스킬 폴더를 대상 프로젝트로 복사하고, 그 안의 `.cursor-rule.mdc`를 프로젝트의 `.cursor/rules/`로 복사한다. Cursor는 `.mdc`의 `description`을 보고 관련 있는 요청에서 규칙을 자동으로 첨부한다(Agent Requested Rule).

```bash
cd <대상 프로젝트>
mkdir -p .cursor/skills .cursor/rules
cp -r <이 레포>/pr-ui-review .cursor/skills/pr-ui-review
cp .cursor/skills/pr-ui-review/.cursor-rule.mdc .cursor/rules/pr-ui-review.mdc
# .mdc 안의 {SKILL_PATH} 를 .cursor/skills/pr-ui-review 로 치환
```

### Codex CLI / 그 외

이 도구들엔 Claude Code의 스킬 트리거나 Cursor의 Agent Requested Rule 같은 "설명 기반 자동 로딩"이 없다. 두 가지 방법 중 하나로 쓴다.

1. **필요할 때 직접 지시한다**: "`pr-ui-review/AGENTS.md`를 읽고 그대로 따라줘."
2. **프로젝트의 `AGENTS.md`에 링크를 남겨둔다**: 이 도구들이 자동으로 읽는 루트 `AGENTS.md`(또는 가장 가까운 디렉터리의 `AGENTS.md`)에, 상황별로 어떤 스킬의 `AGENTS.md`를 참고해야 하는지 한 줄씩 적어 둔다.

   ```markdown
   ## 관련 워크플로우
   - PR에 UI 변경이 있으면 `pr-ui-review/AGENTS.md` 참고
   - React/TS 리팩토링·신규 기능은 `functional-frontend/AGENTS.md` 참고
   ```

세부 사용법은 각 스킬 디렉터리의 `AGENTS.md`(전체 워크플로우)와 `README.md`(있는 경우, 설치·배경 설명)를 참고한다.

각 스킬은 독립적으로 설치·사용 가능하다.
