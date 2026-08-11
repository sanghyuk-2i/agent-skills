# functional-frontend

"쏙쏙 들어오는 함수형 코딩"(Grokking Simplicity)의 원칙으로 React + TypeScript 코드를 작성·리팩토링하는 Claude Code 스킬. ESLint 프리셋이 함께 들어 있다.

## 왜 스킬 + ESLint인가

이 책의 원칙은 둘로 나뉜다.

| | 담당 |
|---|---|
| 카피-온-라이트, 계층 경계, 액션/계산 분리, 암묵적 입력 | **ESLint** — 기계적으로 검증 가능 |
| 타임라인 분석, 어니언 설계 판단, 무엇을 계산으로 꺼낼지 | **스킬** — 정적 분석 불가 |

스킬만 있으면 모델은 코드를 쓴 뒤 원칙 준수를 확인할 방법이 없다. ESLint가 있으면 **작성 → 검증 → 수정**의 폐루프가 생기고, 규칙이 프로젝트에 남아 사람과 에이전트 모두에게 같은 기준이 적용된다.

## 설치

워크플로우 본문은 [`AGENTS.md`](./AGENTS.md)에 있다. 도구마다 이 문서를 트리거하는 방식만 다르다.

### Claude Code

```bash
ln -s "$PWD/functional-frontend" ~/.claude/skills/functional-frontend
```

`SKILL.md`의 frontmatter(`description`)를 보고 "장바구니 기능 만들어줘", "이 useEffect 정리해줘" 같은 요청에 자동으로 걸린다. `SKILL.md`는 `AGENTS.md`를 읽으라고 안내하는 얇은 어댑터다.

### Cursor

```bash
mkdir -p <프로젝트>/.cursor/skills
cp -r functional-frontend <프로젝트>/.cursor/skills/functional-frontend
mkdir -p <프로젝트>/.cursor/rules
cp <프로젝트>/.cursor/skills/functional-frontend/.cursor-rule.mdc \
   <프로젝트>/.cursor/rules/functional-frontend.mdc
# .mdc 안의 {SKILL_PATH}를 .cursor/skills/functional-frontend 로 치환
```

`description` frontmatter를 근거로 관련 있는 요청에서 Cursor가 자동으로 규칙을 붙인다(Agent Requested).

### Codex CLI / 그 외

조건부 자동 로딩이 없는 도구는 필요할 때 직접 지시한다: "`functional-frontend/AGENTS.md`를 읽고 그대로 따라줘." 자주 쓴다면 프로젝트의 `AGENTS.md`에 이 파일 링크를 남겨둔다.

## ESLint 프리셋만 따로 쓰기

```bash
cp -r functional-frontend/eslint <프로젝트>/eslint-functional-frontend
# tests/에는 규칙 검증용으로 일부러 깨뜨린 파일이 들어 있다. 프로젝트로 가면 안 된다.
rm -rf <프로젝트>/eslint-functional-frontend/{tests,node_modules,package-lock.json}

npm i -D eslint eslint-plugin-functional eslint-plugin-import-x typescript-eslint
cp functional-frontend/assets/eslint.config.layered.js <프로젝트>/eslint.config.js
```

```js
import fp from "./eslint-functional-frontend/index.js";

export default [...fp.layered({ src: "src", strict: true })];
```

### 구조

기능(feature) 단위로 먼저 나누고, 그 안에서 액션/계산/데이터 계층을 적용한다 (Feature-Sliced Design 계열).

```
src/
├─ app/                진입점·라우팅·전역 프로바이더
├─ shared/              기능을 몰라도 되는 재사용 코드 ({data,domain,shell,ui})
└─ features/
   └─ cart/
      ├─ data/          타입·상수
      ├─ domain/        계산
      ├─ usecase/       계산 조합 + 얇은 액션
      ├─ shell/         액션 (fetch·storage·Date)
      ├─ ui/            React 컴포넌트
      └─ index.ts       다른 기능에 공개하는 것
```

경계는 두 가지다. 기능 안에서는 import가 안쪽으로만 흐르고 `ui/`는 `shell/`을 직접 import 할 수 없다(추상화 벽). 기능 사이에서는 서로의 내부를 직접 import 할 수 없고 `index.ts`가 공개한 것만 쓸 수 있다(기능 격리). 기능 목록은 `${src}/features`를 스캔해서 얻으므로 새 기능을 추가해도 설정을 고칠 필요가 없다.

기존 코드베이스에 점진 도입할 때는 폴더를 한꺼번에 옮기지 않는다 — `features/` 아래에 아직 없는 코드는 검사되지 않으므로, 기능 하나씩 그 아래로 옮기면서 넓혀간다.

### 옵션

| 옵션 | 기본 | 설명 |
|---|---|---|
| `src` | `"src"` | 소스 루트 |
| `strict` | `true` | `false`면 전부 warn |
| `allow` | `[]` | 계산 영역에서 허용할 액션. 예: `["console.warn"]` |
| `typeAware` | `false` | 타입 정보가 필요한 규칙까지. 느리지만 깊은 불변성을 잡는다 |

## 커스텀 규칙

기존 플러그인으로 표현 가능한 것은 만들지 않았다. 아래 4개만 자체 구현이다.

| 규칙 | 하는 일 |
|---|---|
| `no-impure-in-calculation` | 계산 영역의 시간·난수·I/O·전역 접근. 멤버 단위로 구분한다 (`Math.floor` ✅ / `Math.random` ❌) |
| `no-implicit-input` | 모듈 스코프 가변 변수, 클로저에 가둔 가변 상태 |
| `prefer-copy-on-write` | `push`·`sort`·`splice` 등 원본 변경. 방금 만든 복사본은 허용 |
| `no-action-calculation-mix` | 액션에 계산이 쌓여 있을 때 추출 제안 (항상 warn) |

나머지는 `eslint-plugin-functional`, `eslint-plugin-import-x`, ESLint 코어 규칙에 위임한다.

`prefer-copy-on-write`가 `functional/immutable-data`와 별도로 있는 이유: 후자는 `a.push(x)`를 볼 때 `a`가 배열인지 알아야 해서 타입 정보를 요구하고, 없으면 보고를 거르는 게 아니라 **린트 실행을 크래시시킨다**. 카피-온-라이트는 이 책의 중심 개념이라 타입 인식 린팅을 전제로 깔 수 없어 타입 없이 동작하는 규칙을 기본값으로 뒀다. `typeAware: true`를 켜면 `immutable-data`도 함께 켜진다.

## 개발

```bash
cd eslint
npm install
npm test              # 규칙 단위 테스트 (RuleTester)
npm run test:fixtures # 프리셋 통합 검증 — 실제 파일에 실제 eslint 실행
```

`test:fixtures`는 `tests/fixtures/`의 파일에 달린 `// @expect <ruleId>` 주석과 실제 보고를 대조한다. **표시 없는 줄의 위반은 오탐으로 간주해 실패시킨다** — 오탐이 있으면 스킬이 멀쩡한 코드를 고치려 들기 때문이다.

## 구조

```
functional-frontend/
├── AGENTS.md              워크플로우 본문 (0~5단계 + 리팩토링/셋업 모드) — 도구 중립
├── SKILL.md               Claude Code 어댑터 (frontmatter + AGENTS.md로 안내)
├── .cursor-rule.mdc        Cursor 어댑터 템플릿
├── references/            필요할 때 읽는 문서 6종
├── eslint/                ESLint 프리셋 + 커스텀 규칙 + 테스트
└── assets/                프로젝트에 복사할 설정 템플릿, CLAUDE.md 스니펫
```
