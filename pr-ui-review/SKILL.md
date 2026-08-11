---
name: pr-ui-review
description: GitHub PR의 UI 변경을 before/after 스크린샷으로 비교하고, 실제로 달라진 영역에만 번호 붙은 박스를 그려 PR 코멘트로 게시합니다. base 브랜치를 git worktree로 띄워 현재 브랜치와 같은 화면을 캡처하고, 픽셀 diff로 변경 영역을 찾은 뒤 각 박스에 설명을 답니다. PR을 올릴 때, UI/스타일/컴포넌트를 수정했을 때, "화면 뭐가 바뀌었는지 보여줘", "스크린샷 붙여줘", "리뷰어가 보기 쉽게" 같은 요청에 사용하세요. 사용자가 "스크린샷"이라는 말을 쓰지 않아도 프론트엔드 변경을 PR로 올리는 맥락이면 사용하세요.
---

# PR UI 리뷰 스크린샷

전체 워크플로우(0~8단계, 하지 말 것)는 이 디렉터리의 [`AGENTS.md`](./AGENTS.md)에 있다. **그 문서를 읽고 순서대로 따른다.** 아래는 Claude Code에서 실행할 때의 도구 매핑이다.

| AGENTS.md의 표현 | Claude Code에서 |
|---|---|
| "사용자에게 질문해 확인한다" | `AskUserQuestion` 도구 사용 |
| "직접 열어서 확인" (박스 크롭 이미지) | `Read` 도구로 PNG 파일을 직접 본다 |
| "사용자 승인 후 생성/게시" | 코드 실행 없이 텍스트로 먼저 확인받고 진행 |

레퍼런스 문서(`references/config.md`, `references/capture.md`, `references/publishing.md`)와 스크립트(`scripts/*.mjs`, `scripts/*.sh`)는 AGENTS.md에서 지칭하는 그대로 이 디렉터리 안에 있다.
