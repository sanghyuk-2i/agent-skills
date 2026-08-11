# PR에 게시하기

## GitHub의 제약

GitHub API로는 코멘트에 이미지를 **첨부할 수 없다**. 웹 UI의 드래그앤드롭만 `user-images.githubusercontent.com`에 업로드하고, 그 엔드포인트는 공개 API가 아니다.

그래서 이미지를 어딘가에 두고 URL로 임베드해야 한다. 이 스킬은 같은 레포의 `ui-review-assets` orphan 브랜치를 쓴다 — 외부 서비스 없이, 레포 접근 권한이 있는 사람이면 누구나 볼 수 있다.

**public 레포에서만 동작한다.** private 레포는 `raw.githubusercontent.com`이 만료되는 토큰 쿼리 없이는 404라, 코멘트에 깨진 이미지가 뜬다. `publish.sh upload`가 `mode: "local"`을 돌려주면 게시하지 말고 로컬 폴백으로 간다.

## orphan 브랜치가 안전한 이유

`publish.sh upload`는 워킹트리도 HEAD도 건드리지 않는다. git plumbing만 쓴다:

```
git hash-object -w <png>              # 블롭 생성
GIT_INDEX_FILE=<임시> git read-tree origin/ui-review-assets
git update-index --add --cacheinfo ...
git write-tree → git commit-tree → git push origin <sha>:refs/heads/ui-review-assets
```

임시 인덱스를 쓰므로 사용자가 스테이징해 둔 내용도 그대로다. 경로는 `pr-<번호>/<head sha 7자리>/<파일명>`이라 커밋마다 이력이 쌓이고, 예전 리뷰의 이미지 링크도 계속 살아 있다.

용량이 걱정되면 주기적으로 브랜치를 통째로 다시 만든다(orphan이라 히스토리를 버려도 메인 히스토리에 영향이 없다).

## 코멘트 형식

`<!-- pr-ui-review -->` 마커로 시작한다. `publish.sh comment`가 이 마커로 기존 코멘트를 찾아 갱신하므로 재실행해도 코멘트가 쌓이지 않는다.

```markdown
<!-- pr-ui-review -->
## 🖼 UI 변경 리뷰

`abc1234` 기준 · base `main` · 뷰포트 1440×900

### 결제 (`/checkout`)

![checkout](https://raw.githubusercontent.com/OWNER/REPO/ui-review-assets/pr-42/abc1234/checkout.sidebyside.png)

| # | 변경 |
|---|---|
| ① | 결제 버튼 — 높이 40→48px, 라운딩 4→12px, 배경 `#2563eb`→`#111827`, 문구 "결제하기"→"안전하게 결제하기" |
| ② | 합계 금액 굵기 600→700 |

그 아래 영역은 내용 변화 없이 8px 아래로 이동했습니다. 페이지 높이 756→764px.

<details><summary>원본 before / after</summary>

| Before | After |
|---|---|
| ![before](.../checkout.before.annotated.png) | ![after](.../checkout.after.annotated.png) |

</details>

---
<sub>base `main`의 worktree와 현재 브랜치를 각각 띄워 자동 캡처했습니다.</sub>
```

원칙:
- **side-by-side를 맨 위에** — 리뷰어가 스크롤 없이 먼저 본다
- 박스 번호와 표의 번호를 일치시킨다
- 원본은 `<details>` 안에. 코멘트가 길면 안 읽힌다
- 라우트가 여러 개면 라우트마다 `###` 섹션. 5개 넘으면 변화가 큰 순으로 정렬하고 나머지는 `<details>`로

## private 레포 폴백

`upload`가 `mode: "local"`이면:

1. PR 코멘트를 올리지 **않는다**
2. 산출물 경로를 알려준다 (`$TMPDIR/pr-ui-review/<repo>/out/`)
3. 위 마크다운을 이미지 경로만 비워 그대로 출력한다
4. "GitHub PR 코멘트 창에 이미지를 드래그해 넣고, 생성된 URL을 아래 마크다운에 채워 넣으세요"라고 안내한다

`open $TMPDIR/pr-ui-review/<repo>/out/` 로 Finder에서 폴더를 열어주면 드래그가 쉽다.

## 게시 전 확인

PR 코멘트와 브랜치 푸시는 팀 전체에게 보이는 외부 행동이다. **항상 사용자에게 확인받는다.** 확인은 그 PR 한 번에만 유효하다 — 다음 PR에서 다시 묻는다.

드래프트 PR이면 그 사실을 언급한다. 리뷰어가 아직 안 보는 상태일 수 있다.
