# claude-skills

[Claude Code](https://claude.com/claude-code) 스킬 모음.

| 스킬 | 설명 |
|---|---|
| [`functional-frontend`](functional-frontend) | "쏙쏙 들어오는 함수형 코딩"(Grokking Simplicity)의 원칙 — 액션/계산/데이터 분리, 카피-온-라이트, 계층형 설계 — 으로 React + TypeScript 코드를 작성·리팩토링. 원칙을 기계적으로 검증하는 ESLint 프리셋 포함 |
| [`pr-ui-review`](pr-ui-review) | GitHub PR의 UI 변경을 base/head 스크린샷으로 비교하고, 실제로 달라진 영역에만 박스를 그려 PR 코멘트로 게시 |

## 설치

각 스킬을 `~/.claude/skills/`에 심볼릭 링크로 등록한다.

```bash
git clone <이 레포 URL>
cd claude-skills

ln -s "$PWD/functional-frontend" ~/.claude/skills/functional-frontend
ln -s "$PWD/pr-ui-review" ~/.claude/skills/pr-ui-review
```

Claude Code를 재시작하면 스킬 목록에 나타난다. 세부 사용법은 각 스킬 디렉터리의 `SKILL.md`와 `README.md`(있는 경우)를 참고한다.

## 구조

```
claude-skills/
├── functional-frontend/   React/TS 함수형 리팩토링 + ESLint 프리셋
└── pr-ui-review/           PR UI 스크린샷 diff + 코멘트 게시
```

각 스킬은 독립적으로 설치·사용 가능하다.
