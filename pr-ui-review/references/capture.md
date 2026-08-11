# 안정적인 캡처

두 스크린샷의 차이가 **코드 변경 때문**이어야 한다. 나머지가 조금이라도 다르면 그게 전부 빨간 박스로 나와 진짜 변경을 덮는다.

`capture.mjs`가 기본으로 처리하는 것:

| 노이즈원 | 대응 |
|---|---|
| CSS 애니메이션·트랜지션 | `animation-duration:0s`, `transition-duration:0s` 주입 + Playwright `animations:'disabled'` |
| 텍스트 커서 깜빡임 | `caret-color:transparent` + `caret:'hide'` |
| 웹폰트 늦은 로딩 | `document.fonts.ready` 대기 |
| lazy 이미지 / 무한스크롤 | 페이지 끝까지 스크롤 후 맨 위로 복귀 |
| 스크롤바 렌더 차이 | `::-webkit-scrollbar { display:none }` |
| 모션 민감 분기 | 컨텍스트 `reducedMotion: 'reduce'` |

## 남는 노이즈 처리 — `stabilize.mask`

매번 값이 달라지는 요소는 마스킹한다. 마젠타로 덮여 양쪽 모두 같은 색이 되므로 diff에서 빠진다.

```json
"stabilize": {
  "mask": [
    "[data-testid='relative-time']",   // "3분 전"
    ".chart-canvas",                   // 랜덤 데이터 차트
    "img.gravatar",                    // 해시 기반 아바타
    "[data-testid='session-id']"
  ]
}
```

**임계값을 올려서 덮지 말 것.** `diff.threshold`를 키우면 노이즈와 함께 진짜 변경(미세한 색상·간격 조정)도 사라진다. 노이즈는 마스크로, 민감도는 그대로 둔다.

## 증상별 원인

| 증상 | 원인 | 해결 |
|---|---|---|
| 화면 전체가 박스 (`wholePageChanged`) | base와 head의 시드 데이터가 다름 | 고정 데이터로 만들거나 mock 서버 사용 |
| 캡처가 로그인 화면 | storageState 만료/누락 | `references/config.md`의 storageState 재생성 |
| 캡처가 에러 화면 | base에 `.env`가 없음 | worktree에 `.env` 복사(`cp .env $TMPDIR/pr-ui-review/*/base/`) 후 재시도 |
| 텍스트가 미묘하게 어긋남 | 폰트가 아직 안 붙은 상태로 찍힘 | `routes[].waitFor`에 실제 콘텐츠 셀렉터 지정 |
| 매번 다른 위치에 박스 | 애니메이션이 JS 기반(CSS 아님) | `waitMs`로 완료 대기, 또는 해당 요소 마스킹 |
| base 서버만 계속 실패 | 그 시점 코드가 지금 Node 버전과 안 맞음 | 그 라우트를 포기하고 **왜 못 찍었는지 보고**한다 |

## 재현성 체크

의심스러우면 같은 서버를 두 번 찍어 비교한다. 박스가 나오면 그건 코드가 아니라 환경 문제다.

```bash
node scripts/capture.mjs --base-url http://localhost:3000 --head-url http://localhost:3000 \
  --out-dir /tmp/selfcheck --routes checkout
node scripts/annotate.mjs --before /tmp/selfcheck/checkout.before.png \
  --after /tmp/selfcheck/checkout.after.png --out-dir /tmp/selfcheck --name selfcheck
```

`boxes: []`가 나와야 정상이다. 안 나오면 그 라우트는 아직 캡처할 준비가 안 된 것이고, 마스크를 추가한 뒤 다시 확인한다.

## 세로 이동 보정 (`shifted`)

`annotate.mjs`는 각 diff 영역에 대해 "before의 같은 내용이 dy만큼 위/아래에 그대로 있는가"를 ±400px 범위에서 찾는다. 찾으면 변경이 아니라 **이동**으로 분류해 빨간 박스에서 빼고 `shifted: [{y, height, dy}]`로 보고한다.

버튼 하나가 8px 높아지면 그 아래 모든 요소가 8px씩 밀린다. 보정이 없으면 박스가 10개 나오고 리뷰어는 어디를 봐야 할지 모른다. 보정 후에는 박스 1개 + "그 아래 영역이 8px 내려감" 한 줄이 된다.

가로 이동은 보정하지 않는다. 세로 리플로우가 압도적으로 흔하고, 양방향 탐색은 오탐(비슷한 반복 요소를 이동으로 오인)이 늘어난다.
