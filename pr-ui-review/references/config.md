# `.claude/ui-review.json` 스키마

대상 레포 루트의 `.claude/ui-review.json`. 모든 필드가 선택이지만 `dev.command`와 `routes`가 없으면 스킬이 동작하지 않는다.

## 전체 필드

| 필드 | 기본값 | 설명 |
|---|---|---|
| `install` | `null` | base worktree에서 실행할 설치 명령. lockfile이 head와 같으면 자동으로 건너뛴다 |
| `dev.command` | — | dev 서버 실행 명령. **필수** |
| `dev.port` | `3000` | 시작 포트. 사용 중이면 +1씩 올려 찾는다 |
| `dev.portEnv` | `"PORT"` | 포트를 주입할 환경변수 이름 |
| `dev.readyPath` | `"/"` | 헬스체크 경로. 200을 주는 가장 가벼운 경로가 좋다 |
| `dev.timeoutMs` | `120000` | 서버 기동 대기 상한. 콜드 빌드가 느린 프로젝트는 늘린다 |
| `viewport.width` / `height` | `1440` / `900` | 브라우저 뷰포트 |
| `viewport.deviceScaleFactor` | `2` | 2면 레티나 선명도. 이미지가 4배 무거워지니 긴 페이지가 많으면 1 |
| `auth.storageStatePath` | `null` | Playwright storageState JSON 경로 (로그인 상태). 레포 기준 상대경로 |
| `stabilize.disableAnimations` | `true` | 애니메이션·트랜지션·캐럿 무력화 |
| `stabilize.mask` | `[]` | 매번 달라지는 요소의 CSS 셀렉터. 마젠타로 덮여 diff에서 빠진다 |
| `diff.threshold` | `0.1` | 색차 민감도(0~1). 낮을수록 예민 |
| `diff.minArea` | `400` | 이 면적(px²) 미만 박스는 버린다 |
| `diff.maxBoxes` | `8` | 박스 상한. 넘으면 면적순으로 자르고 "그 외 N곳" 표시 |
| `diff.mergeGap` | `24` | 이 거리(px) 안의 박스들을 하나로 합친다 |
| `routes[].name` | — | 파일명·코멘트 제목에 쓰인다. **필수**, 고유해야 함 |
| `routes[].path` | — | 캡처할 경로. 쿼리스트링 포함 가능. **필수** |
| `routes[].match` | `[]` | 이 라우트를 캡처할 조건이 되는 파일 glob |
| `routes[].waitFor` | — | 이 셀렉터가 나타날 때까지 대기 |
| `routes[].waitMs` | — | 위 조건 후 추가 고정 대기(ms). 최후의 수단 |

## `match` 작성법

라우트가 **실제로 렌더하는** 파일을 가리켜야 한다. 넓게 잡으면 매번 전 라우트를 캡처해서 느려지고, 좁게 잡으면 변경을 놓친다.

```json
"match": [
  "src/features/checkout/**",        // 이 라우트 전용 코드
  "src/components/PayButton.tsx",    // 이 라우트가 쓰는 공용 컴포넌트
  "src/styles/tokens.css"            // 전역 토큰 — 여러 라우트에 중복 등장해도 된다
]
```

디자인 토큰이나 전역 CSS는 여러 라우트의 `match`에 동시에 넣는다. 그게 정상이다 — 토큰이 바뀌면 실제로 여러 화면이 바뀐다.

## 프레임워크별 `dev`

| 프레임워크 | command | portEnv | 비고 |
|---|---|---|---|
| Next.js | `npm run dev` | `PORT` | `next dev`가 `PORT`를 읽는다 |
| Vite | `npm run dev -- --strictPort` | `PORT` | Vite 5+는 `PORT`를 읽는다. 안 되면 `--port $PORT` |
| CRA | `npm start` | `PORT` | `BROWSER=none`도 같이 주면 브라우저가 안 뜬다 |
| Remix | `npm run dev` | `PORT` | |
| Nuxt | `npm run dev` | `PORT` | |
| SvelteKit | `npm run dev -- --port $PORT` | `PORT` | |
| Storybook | `npm run storybook -- --ci` | `PORT` | `path`는 `/iframe.html?id=<story-id>` |

## Storybook으로 컴포넌트 단위 비교

라우트 대신 스토리를 캡처하면 노이즈가 훨씬 적다. 페이지 데이터·레이아웃 리플로우가 없기 때문이다.

```json
{
  "dev": { "command": "npm run storybook -- --ci --quiet", "port": 6006, "readyPath": "/iframe.html" },
  "routes": [
    { "name": "Button-primary", "path": "/iframe.html?id=button--primary&viewMode=story",
      "match": ["src/components/Button.tsx"] }
  ]
}
```

## 로그인이 필요한 화면

Playwright storageState를 한 번 만들어 두면 두 서버 모두에 주입된다.

```bash
npx playwright open --save-storage=.claude/ui-review.auth.json http://localhost:3000
# 브라우저에서 로그인 → 창을 닫으면 저장된다
```

`.gitignore`에 반드시 추가한다. 세션이 만료되면 다시 만들어야 한다 — 캡처가 로그인 화면으로 찍히면 그게 원인이다.

base와 head의 세션 쿠키 도메인이 `localhost`로 같아야 두 포트에 함께 적용된다. 포트별로 세션을 분리하는 앱이라면 storageState 대신 각 서버에서 로그인 절차를 밟아야 하고, 이건 현재 스킬 범위 밖이다.
