# 모듈: UI 변경

화면이 바뀌는 PR에 붙는다. 본문에는 짧은 섹션만 두고, **before/after 이미지는 PR 생성 뒤 별도 코멘트로 게시한다.** 본문은 안정적으로 두고 이미지 코멘트는 캡처를 다시 하면 갱신되는 편이 낫기 때문이다.

## 감지

변경 파일 중 하나라도 해당하면 UI 모듈을 붙인다.

- 확장자: `.tsx` `.jsx` `.vue` `.svelte` `.css` `.scss` `.sass` `.less` `.styl`
- 설정·토큰: `tailwind.config.*`, 디자인 토큰 파일
- 정적 자산: `public/`, `assets/`의 이미지·폰트
- 컴포넌트·스타일 디렉터리: `components/`, `styles/`, `ui/`

테스트·스토리 파일(`*.test.*`, `*.spec.*`, `*.stories.*`)만 바뀐 경우는 제외한다. 렌더 결과가 바뀌지 않는 리팩토링은 감지되더라도 사용자 확인에서 뺄 수 있다.

## 본문 섹션

```markdown
## UI 변경

화면 비교(before/after)는 아래 코멘트를 참고해 주세요.
<변경된 화면을 라우트 단위로 한 줄씩: `/checkout` 결제 버튼 스타일 변경>
```

이미지는 본문에 넣지 않는다. 본문 한 줄 요약은 diff에서 알 수 있는 것만 쓴다.

## PR 생성 뒤: 화면 비교 게시

입력은 `pr-ui-review`가 만든 `<outDir>/manifest.json`이다 (계약: `pr-ui-review/references/manifest.md`).

0. **순서** — `pr-ui-review`는 PR을 만들기 전에 돌려도 된다(그때 manifest는 `mode: "branch"`). PR을 만든 뒤 PR 번호를 알게 되면 같은 meta로 `manifest.mjs --pr <번호>`만 다시 실행해 `mode: "pr"`로 바꾼다. 캡처는 다시 하지 않는다.
1. **manifest 확인** — 없으면 `pr-ui-review`를 먼저 하라고 안내하고 모듈을 건너뛴다(PR 자체는 이미 만들어졌다).
   - `head.sha`가 현재 `git rev-parse --short=7 HEAD`와 다르면 **낡은 캡처**다. 게시하지 말고 다시 캡처할지 묻는다.
   - `routes[].boxes[].description`이 비어 있는 박스가 있으면 게시하지 않는다. `pr-ui-review`의 6단계로 되돌린다.
   - `skipped`가 있으면 코멘트에 무엇이 왜 빠졌는지 적는다.
   - `head.dirty`가 `true`면 "커밋되지 않은 변경 포함"을 밝힌다.
   - `mode`가 `branch`면 게시할 PR이 없다. 본문 초안만 보여 주고 끝낸다.
2. **코멘트 본문 작성** — `references/modules/ui-publishing.md`의 형식. 박스 설명은 manifest의 `description`을 그대로 쓰고, 번호는 이미지의 번호와 일치시킨다. 새로 지어내지 않는다.
3. **사용자 확인** — 코멘트 초안을 보여 주고 승인받는다. 이미지 업로드용 브랜치 푸시와 코멘트는 팀 전체에 보이는 외부 동작이다. 승인은 그 PR 한 번에만 유효하다. (본문 승인과 별개로 받는다.)
4. **게시** — 게시할 레포 안에서 실행한다 (`git`/`gh`가 현재 디렉터리의 레포를 기준으로 동작한다).
   ```bash
   <스킬경로>/scripts/publish.sh check                                  # public/private 판별
   <스킬경로>/scripts/publish.sh upload --out-dir <out> --pr <n>        # → 파일명:URL 매핑
   <스킬경로>/scripts/publish.sh comment --pr <n> --body-file <md>      # 마커로 upsert
   ```
   private 레포도 같은 방식으로 올라간다(`blob/…?raw=true` URL — 레포 접근 권한이 있는 리뷰어에게 렌더된다, 자세한 내용은 `ui-publishing.md`). 레포에 브랜치를 만들고 싶지 않다고 하면 `upload --local`로 로컬 폴백(`ui-publishing.md`)을 쓴다. 계정이 여러 개면 `ui-publishing.md`의 계정 지정 방법을 따른다.

`<스킬경로>`는 이 스킬의 `SKILL.md`가 있는 디렉터리다. 심볼릭 링크일 수 있으니 `realpath`로 실제 경로를 확인해서 쓴다.

## 하지 말 것

- `description`이 비어 있는 채로, 또는 크롭을 보지 않고 쓴 설명으로 게시하지 않는다.
- manifest에 없는 이미지나 내용을 코멘트에 넣지 않는다.
- 낡은 캡처(`head.sha` 불일치)를 현재 PR의 화면인 것처럼 올리지 않는다.
