---
name: pr-write
description: 현재 브랜치의 커밋·diff를 읽고 일관된 형식의 PR 제목과 본문을 작성해 PR을 만들거나 갱신합니다. 변경 종류를 분류해 해당하는 모듈을 붙입니다 — UI가 바뀌면 화면 비교 결과(pr-ui-review의 manifest)를 PR 코멘트로 게시하고, 서버 코드가 바뀌면 API·DB·설정·배포 영향 섹션을 씁니다. 레포에 .github/pull_request_template.md가 있으면 그 양식을 채우고, 없으면 기본 양식을 씁니다. 제목은 레포의 커밋 관례를 따릅니다. "PR 만들어줘", "PR 설명 써줘", "PR 올려줘", "PR에 스크린샷 올려줘", "UI 리뷰 코멘트 달아줘" 같은 요청에 사용하세요. 화면을 새로 캡처·비교하는 일은 pr-ui-review의 몫입니다.
---

# PR 작성

전체 워크플로우(순서, 작성 원칙, 하지 말 것)는 이 디렉터리의 [`AGENTS.md`](./AGENTS.md)에 있다. **그 문서를 읽고 순서대로 따른다.** 아래는 Claude Code에서 실행할 때의 도구 매핑이다.

| AGENTS.md의 표현 | Claude Code에서 |
|---|---|
| "사용자에게 질문해 확인한다" (초안 승인, draft 여부, 감지된 변경 종류) | `AskUserQuestion` 도구 사용 |
| "직접 열어서 확인" (diff, 크롭 이미지) | `Read` 도구로 직접 본다 |

모듈 문서(`references/modules/*.md`), 양식(`references/default-template.md`), 스크립트(`scripts/*`)는 AGENTS.md에서 지칭하는 그대로 이 디렉터리 안에 있다.

**`<스킬경로>`는 이 `SKILL.md`가 있는 디렉터리다.** `~/.claude/skills/pr-write`는 심볼릭 링크일 수 있으니, 스크립트를 실행하기 전에 `realpath`로 실제 경로를 확인해 그 절대경로를 쓴다.

> 이 스킬의 `description`을 고치면 `scripts/sync-description.sh`로 `.cursor-rule.mdc`에 반영한다. `SKILL.md`가 원본이다.
