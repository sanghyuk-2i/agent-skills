# AGENTS.md — 이 레포 자체를 다룰 때

이 레포는 여러 AI 코딩 도구(Claude Code, Cursor, Codex CLI 등)에서 쓰는 스킬을 모아둔 곳이다. 각 스킬 사용법은 `README.md`와 스킬별 `AGENTS.md`를 보면 된다. 이 파일은 **레포 자체를 유지보수하거나 새 스킬을 추가할 때**를 위한 것이다.

## 스킬 하나의 구조

```
<스킬>/
├── AGENTS.md          워크플로우 본문. 소스 오브 트루스 — 도구 이름을 언급하지 않는다
├── SKILL.md            Claude Code 어댑터: frontmatter(name, description) + "AGENTS.md를 읽고 따르라" + 도구 매핑 표
├── .cursor-rule.mdc     Cursor 어댑터: description frontmatter + "AGENTS.md를 읽고 따르라"
├── references/          필요할 때만 읽는 세부 문서
└── (스킬별: scripts/, eslint/, assets/ 등)
```

## 새 스킬을 추가할 때

1. 워크플로우를 `<스킬>/AGENTS.md`에 쓴다. **도구별 도구 이름(AskUserQuestion, Read 도구 등)을 직접 언급하지 않는다** — "사용자에게 질문해 확인한다", "파일을 직접 열어서 확인한다"처럼 도구 중립적으로 쓴다. 맨 끝에 "도구별 실행 방법" 표를 추가해 도구별 매핑을 안내한다.
2. `SKILL.md`는 frontmatter만 채우고 본문은 AGENTS.md로 안내하는 몇 줄로 유지한다. frontmatter의 `description`은 Claude Code가 스킬을 트리거하는 유일한 근거이므로, 언제 쓰는지·트리거 문구를 충분히 구체적으로 쓴다.
3. `.cursor-rule.mdc`는 `description`에 SKILL.md와 같은 문구를 쓰고, `alwaysApply: false`로 두어 Cursor가 관련성 기반으로 자동 첨부하게 한다.
4. 이 파일의 스킬 표와 `README.md`의 스킬 표에 새 항목을 추가한다.
5. `node_modules`가 생기는 스킬(예: 스크립트가 있는 스킬)은 `.gitignore`에 이미 잡혀 있는지 확인한다 — 커밋하지 않는다.

## 원칙 하나 고칠 때

내용은 항상 `AGENTS.md`에서만 고친다. `SKILL.md`/`.cursor-rule.mdc`는 어댑터이므로 워크플로우 내용을 중복해서 넣지 않는다 — 두 곳에 같은 내용이 있으면 나중에 하나만 고치고 잊어버리는 사고가 난다.
