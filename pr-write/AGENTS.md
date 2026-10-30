# pr-write — 일관된 PR 작성

브랜치의 변경을 읽고 **같은 모양의 PR**을 만든다. 모든 PR은 같은 뼈대(개요·변경 내용·테스트)를 갖고, 변경 종류에 따라 **모듈 섹션**이 붙는다.

| 변경 종류 | 모듈 | 하는 일 |
|---|---|---|
| UI | `references/modules/ui.md` | 본문에 "UI 변경" 섹션, PR 생성 뒤 화면 비교를 코멘트로 게시 |
| 서버 코드 | `references/modules/server.md` | 본문에 "서버 변경" 섹션 (API·DB·설정·배포 영향) |

모듈은 파일 하나가 한 종류다. 새 종류(인프라, 의존성 등)는 `references/modules/`에 같은 형식으로 추가하고 이 표에 한 줄 더하면 된다.

**언제 쓰나**: "PR 만들어줘", "PR 설명 써줘", "PR 올려줘", "PR에 스크린샷 올려줘" 같은 요청. 화면을 새로 캡처·비교하는 일은 `pr-ui-review`의 몫이다.

## 순서

1. **맥락 수집**
   ```bash
   gh pr view --json number,title,body,baseRefName,isDraft 2>/dev/null   # 이미 PR이 있는지
   gh pr list --state all --limit 10 --json number,title,state,author       # 이 레포의 PR 제목 관례
   BASE=$(gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
   git fetch origin "$BASE" --quiet
   git log --format='%h %s' "origin/$BASE..HEAD"
   git diff --name-only "origin/$BASE...HEAD"
   git diff --stat "origin/$BASE...HEAD"
   ```
   필요하면 핵심 파일의 diff를 열어 읽는다. 브랜치명과 커밋 메시지에서 이슈 번호(`#123`, `ABC-123` 같은 키)를 찾는다.
   커밋되지 않은 변경이나 푸시되지 않은 커밋이 있으면 사용자에게 알린다 — PR에는 푸시된 것만 들어간다.
   **GitHub 계정이 여러 개 로그인돼 있으면** `gh`와 `git fetch/push`는 활성 계정을 쓴다. 다른 계정 소유의 private 레포에서는 `repository not found`로 실패한다(`git fetch --quiet`가 이 오류를 가려 낡은 `origin/<base>`로 진행할 수 있다). 활성 계정을 바꾸지 말고 **명령마다** 토큰을 지정한다: `GH_TOKEN=$(gh auth token --user <계정>) gh …`, 푸시는 `git -c http.extraHeader="Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64)" push …`. 쓸 계정은 사용자가 정한 것만 쓴다.

2. **변경 종류 분류** — 변경 파일 목록을 각 모듈의 "감지" 규칙에 대 본다(규칙은 오분류가 흔하다 — 특히 클라이언트 코드의 `services/` 같은 경로). 한 PR에 여러 종류가 있을 수 있다. 결과는 초안과 함께 사용자에게 보여 준다 ("감지: UI, 서버 — 맞나요?"). 경로 규칙은 프로젝트마다 다르므로 자동 감지를 믿지 않고 확인받는다.

3. **양식 고르기** — 우선순위:
   1. 레포의 `.github/pull_request_template.md`(대소문자 변형 포함)가 있으면 **그 구조를 그대로** 채운다. 섹션을 빼거나 순서를 바꾸지 않는다. 팀이 정한 양식이다. 모듈 섹션은 템플릿 **맨 끝에 덧붙인다**.
   2. 없으면 `references/default-template.md`. 모듈 섹션이 자리가 정해져 들어 있다.
      다만 최근 PR 본문들이 같은 소제목 구성을 일관되게 쓰고 있다면(파일 템플릿은 없지만 팀 관례가 있는 경우) 기본 양식 대신 그 구성을 따를지 사용자에게 묻는다. 묻지 않고 바꾸지 않는다.
   어느 쪽을 썼는지 한 줄로 밝힌다.

4. **제목 정하기** — **최근 PR 제목**(`gh pr list`)이 일관된 형식이면 그것을 우선한다. 커밋 제목과 PR 제목은 관례가 다를 수 있다(예: 커밋은 `feat: …`, PR은 `[과정 N기 이름] 미션 STEP N`). PR 제목 관례가 없으면 커밋 제목(`git log`)의 형식을 따른다 — `✨ Feat: …`(gitmoji)면 그 형식, `feat: …`면 그 형식. 둘 다 안 보이면 `type: 요약`(type은 feat/fix/refactor/style/docs/test/chore). 70자 안쪽, 마침표 없이, 한 가지 변경만 말한다.
   제목에 이름·기수 같은 개인 정보 칸이 있으면 **이 사용자의 이전 PR/커밋에서 확인된 값만** 쓰고, 확인되지 않으면 묻는다. 다른 사람의 값을 가져오지 않는다.

5. **본문 작성** — 아래 원칙과 해당 모듈 문서를 따른다.

6. **확인** — 제목·본문 초안과 감지된 변경 종류를 보여 주고 승인받는다. **draft PR로 열지**도 함께 묻는다. 또한 PR이 **어느 GitHub 계정으로** 만들어지는지(`gh api user --jq .login`)를 함께 보여 준다 — 계정이 여러 개일 때 이전 PR의 작성자와 다르면 반드시 짚는다.

7. **생성/갱신** — 승인 뒤에만:
   ```bash
   gh pr create --base "$BASE" --title "<제목>" --body-file <본문.md> [--draft]
   gh pr edit <번호> --title "<제목>" --body-file <본문.md>      # 이미 PR이 있으면
   ```
   브랜치가 원격에 없으면 푸시가 필요하다. 푸시도 외부에 보이는 동작이므로 따로 확인받는다. 결과 URL을 알려준다.

8. **모듈 후처리** — 감지된 모듈 중 PR 생성 뒤에 할 일이 있는 것만 한다. 현재는 UI 모듈의 화면 비교 게시. 각 모듈 문서의 절차를 따르고, 외부 동작은 그 문서가 정한 확인을 거친다.

## 작성 원칙

- **무엇을, 왜.** "어떻게"는 diff가 말한다. 개요는 리뷰어가 코드를 열기 전에 변경의 목적을 알게 해야 한다.
- **근거는 diff와 커밋에서만.** 변경 이유가 코드에서 드러나지 않으면 지어내지 않는다. 사용자에게 묻거나, 이유 칸을 비워 두고 표시한다.
- **테스트는 실제로 한 것만.** `테스트` 섹션에는 이 세션에서 실제로 실행했거나 사용자가 했다고 말한 것만 쓴다. 모르면 "테스트하지 않음"이라고 쓴다. 레포 템플릿에 체크박스가 있으면 같은 기준으로만 체크하고, 항목 자체는 임의로 고치지 않는다.
- **이슈 연결.** 이슈 번호를 찾았으면 `Resolves: #번호`(템플릿이 정한 문구가 있으면 그것)로 적는다. 찾지 못하면 비워 두고 사용자에게 묻는다.
- **분량.** 변경이 작으면 본문도 짧게. 해당 없는 모듈 섹션과 선택 섹션은 삭제한다. 섹션을 채우려고 내용을 부풀리지 않는다.
- **비밀 값은 본문에 쓰지 않는다.** 환경변수는 이름만, 토큰·URL의 키·비밀번호는 어디에도 적지 않는다.

## 하지 말 것

- 승인 없이 `gh pr create`/`gh pr edit`나 푸시, 코멘트 게시를 하지 않는다.
- 레포 템플릿이 있는데 다른 양식으로 바꾸지 않는다.
- 실행하지 않은 테스트를 체크하지 않는다. diff에서 확인되지 않은 이유·효과·하위 호환 여부를 쓰지 않는다.
- 이미 있는 PR의 본문을 덮어쓰기 전에 기존 본문을 보여주고 무엇이 바뀌는지 말한다.
- 화면 캡처·diff를 이 스킬에서 하지 않는다. `pr-ui-review`의 일이다.

## 도구별 실행 방법

이 문서는 도구 중립적인 워크플로우다. 에이전트가 파일 읽기/쓰기와 셸 실행 도구를 갖고 있으면 그대로 따라 실행할 수 있다.

| 도구 | 진입점 | 비고 |
|---|---|---|
| Claude Code | `SKILL.md` (frontmatter로 자동 트리거) | "사용자에게 질문해 확인"은 `AskUserQuestion`으로 수행 |
| Cursor | `.cursor-rule.mdc`를 대상 프로젝트의 `.cursor/rules/`에 복사 | description 기반으로 관련 있을 때 자동 첨부됨(Agent Requested) |
| Codex CLI / 기타 | 이 파일을 직접 참조 | "`pr-write/AGENTS.md`를 읽고 그대로 따라줘"처럼 명시적으로 지시한다 |
