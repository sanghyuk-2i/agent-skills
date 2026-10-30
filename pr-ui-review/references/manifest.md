# `manifest.json` — 이 스킬의 산출물 계약

이 스킬은 **이미지와 `manifest.json`을 만들고 끝난다.** PR 코멘트 작성·이미지 업로드·게시는 하지 않는다 (`pr-write` 스킬의 일). 그 스킬은 이 파일만 읽고 동작해야 하므로, 아래 필드는 계약이다.

위치: `<outDir>/manifest.json` (outDir은 `prepare.sh`의 `state.json`이 알려준다)

## 스키마

```json
{
  "version": 1,
  "createdAt": "2026-10-30T12:34:56Z",
  "repo": "owner/name",
  "mode": "pr",
  "pr": 42,
  "base": { "ref": "main", "sha": "1d1a81a" },
  "head": { "sha": "9f3c2b1", "dirty": false },
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 2 },
  "routes": [
    {
      "name": "home",
      "path": "/",
      "status": "changed",
      "files": {
        "sideBySide": "home.sidebyside.png",
        "before": "home.before.annotated.png",
        "after": "home.after.annotated.png",
        "raw": { "before": "home.before.png", "after": "home.after.png" }
      },
      "sizes": { "before": [2880, 13910], "after": [2880, 13910] },
      "heightChanged": false,
      "wholePageChanged": false,
      "truncated": 5,
      "shifted": "요약 한 줄 또는 null",
      "boxes": [
        {
          "n": 1,
          "x": 1708, "y": 4296, "width": 220, "height": 84,
          "crop": "home.box-1.png",
          "description": "앱 화면 이미지 — 이미지 로드 실패로 alt 텍스트만 표시"
        }
      ],
      "notes": ["캡처에 포함되지 않은 변경: 다크모드 스타일"]
    }
  ],
  "skipped": [
    { "name": "cart", "reason": "캡처 실패: waitFor 셀렉터 타임아웃" }
  ]
}
```

## 필드 규칙

| 필드 | 규칙 |
|---|---|
| `mode` | `"pr"` 또는 `"branch"`(PR 없이 브랜치 비교). `pr`은 `mode`가 `pr`일 때만 있다 |
| `head.dirty` | 커밋되지 않은 변경이 head에 포함됐으면 `true`. `pr-write`가 코멘트에 밝혀야 한다 |
| `routes[].status` | `changed` / `unchanged` / `layout-only`(박스 없이 위 `shifted` 기준을 넘는 이동만 있음) / `whole-page`(전면 개편) |
| `files.*` | `outDir` 기준 상대경로. `status`가 `unchanged`·`layout-only`면 `sideBySide`·`before`·`after`는 없다 (`raw`는 항상 있다) |
| `boxes[].x,y,width,height` | 이미지 픽셀 좌표 (deviceScaleFactor가 곱해진 값) |
| `shifted` | 이동 요약 한 줄. **같은 이동량(±1px)을 가진 조각들의 높이 합이 페이지 높이의 5% 이상일 때만** 낸다 — 비슷한 글줄끼리 우연히 맞아 생기는 제각각의 파편은 버린다. 이동량은 CSS px(이미지 px ÷ deviceScaleFactor), 2px 미만은 무시. 없으면 `null`. 원본 조각 목록은 `<name>.analysis.json`의 `shifted`에 그대로 있다 |
| `base.sha` | `state.json`이 없으면 `null` — HEAD로 추측하지 않는다 |
| `boxes[].description` | 크롭을 **직접 보고** 쓴 한 줄. 확인되지 않은 변화는 쓰지 않는다. 아직 안 썼으면 필드가 없다 |
| `minorShifts` | 글줄이 가로로 몇 px(최대 12px) 밀렸을 뿐 내용은 같다고 판정해 박스에서 뺀 영역 수. 0보다 크면 코멘트에 "N곳은 가로로 몇 px 이동(변경 없음으로 판정)"을 밝힐 수 있다. 판정이 틀려 작은 글자 수정이 가려졌을 가능성의 단서다 |
| `truncated` | 상한을 넘어 그려지지 않은 박스 수. 0보다 크면 `pr-write`가 "그 외 N곳"을 밝힌다 |
| `skipped` | 캡처에 실패했거나 제외한 라우트. **조용히 빼지 않고** 여기에 이유를 남긴다 |
| `notes` | 코드 diff에는 있는데 스크린샷에 안 잡힌 변경 등 리뷰어가 알아야 할 단서 |

## 소비하는 쪽의 약속

- `description`이 비어 있는 박스가 있으면 게시하지 않는다 (설명 작성은 이 스킬의 6단계).
- 이미지에는 번호와 `BEFORE`/`AFTER` 라벨뿐이므로, 박스 설명은 PR 본문에 `n`과 짝지어 적는다.
- 스키마를 바꿀 때는 `version`을 올린다.

## 생성

`scripts/manifest.mjs`가 만든다. 판단은 하지 않고, 라우트마다 `analyze.mjs`/`render.mjs`가 남긴 `<name>.analysis.json`을 모아 위 모양으로 적는다.

```bash
node <스킬경로>/scripts/manifest.mjs --out-dir <out> --meta <meta.json> \
  [--pr 42] [--base-ref main] [--strict]
```

`--meta`는 에이전트가 6단계에서 쓰는 파일이다 (모든 키 선택):

```json
{
  "descriptions": { "home": { "1": "결제 버튼 — 높이 40→48px, 색 파랑→검정" } },
  "notes": { "home": ["다크모드 스타일도 바뀌었으나 이번 캡처에는 포함되지 않음"] },
  "skipped": [ { "name": "cart", "reason": "캡처 실패: waitFor 셀렉터 타임아웃" } ]
}
```

조용히 넘기지 않는 것:
- config의 라우트인데 분석 결과도 `skipped` 기록도 없으면 `skipped`에 "분석 결과 없음"으로 넣는다.
- 박스에 `description`이 없거나 `changed`/`whole-page` 라우트의 이미지가 없으면(render 미실행) 경고를 낸다. `--strict`면 exit 1.
