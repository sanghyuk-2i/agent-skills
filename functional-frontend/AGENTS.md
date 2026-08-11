# functional-frontend — 함수형 프론트엔드

"쏙쏙 들어오는 함수형 코딩(Grokking Simplicity)"의 원칙 — 액션/계산/데이터 분리, 카피-온-라이트, 계층형 설계, 타임라인 — 으로 React + TypeScript 코드를 작성하고 리팩토링하는 워크플로우다. ESLint 프리셋이 함께 있어 작성한 코드를 기계적으로 검증한다.

**언제 쓰나**: 프론트엔드 기능을 새로 만들거나, 코드 구조·관심사 분리·상태 관리를 정리하거나, `useEffect`나 이벤트 핸들러가 지저분해서 손보거나, 부수효과와 로직이 엉킨 코드를 풀거나, 새 React 프로젝트의 코드 규칙을 세울 때. 사용자가 "함수형"이라는 말을 쓰지 않아도, 리팩토링·구조 개선·테스트하기 어려운 코드에 관한 요청이면 적용한다.

함수형 **언어**를 쓰자는 게 아니라, 액션과 계산을 나눠 코드를 단순하게 만드는 실용적 방법이다.

**핵심 아이디어 하나**: 프로그램은 액션(호출 시점에 따라 결과가 달라지는 것), 계산(같은 입력에 같은 출력), 데이터(사실의 기록)로 나뉜다. 액션은 없앨 수 없지만 **좁힐 수 있다**. 액션 안에 섞인 계산을 밖으로 꺼내면 그 부분은 테스트되고, 재사용되고, 읽을 때 실행 환경을 머릿속에 시뮬레이션하지 않아도 된다.

## 0단계 — 모드를 정한다

| 사용자 요청 | 모드 | 진행 |
|---|---|---|
| "새 프로젝트 세팅해줘", "코드 규칙 잡아줘" | **셋업** | 1단계 건너뛰고 [셋업](#셋업-모드)으로 |
| "이런 기능 만들어줘" | **신규 작성** | 1 → 2 → 3 → 4 → 5 |
| "이 코드 정리해줘", "리팩토링" | **리팩토링** | [리팩토링](#리팩토링-모드) 먼저, 그다음 1 → 3 → 4 |

프로젝트에 `eslint.config.*`가 있으면 먼저 읽어서 이 프리셋이 이미 깔려 있는지 확인한다. 있으면 `src/features/<feature>/{data,domain,usecase,shell,ui}` 구조를 따르고, 없으면 셋업을 제안한다.

## 1단계 — 분류한다 (코드 쓰기 전)

**코드를 쓰기 전에 이 표를 먼저 만든다.** 순서가 중요하다. 바로 코딩에 들어가면 액션과 계산이 섞인 함수가 자연스럽게 나오고, 그걸 나중에 푸는 건 처음부터 나누는 것보다 훨씬 비싸다. 표를 먼저 쓰면 어디에 무엇을 둘지 정해진 상태로 코딩을 시작한다.

요구사항의 각 동작에 대해:

| 동작 | 분류 | 배치 | 이유 |
|---|---|---|---|
| 장바구니 항목 목록 | 데이터 | `features/cart/data/cart.ts` | 사실의 기록 |
| 총액 계산 | 계산 | `features/cart/domain/pricing.ts` | 같은 항목 → 같은 총액 |
| 항목 추가 | 계산 | `features/cart/domain/cart.ts` | 새 배열을 돌려주므로 |
| 서버에 주문 전송 | 액션 | `features/cart/shell/orderApi.ts` | 네트워크 I/O |
| 결제 흐름 조율 | 액션(얇게) | `features/cart/usecase/checkout.ts` | 계산 조합 + 액션 호출 |

**판별 질문은 하나다**: "두 번 부르면 뭔가 달라지나?" 달라지면 액션이다.

더 실용적인 기준은 **입출력이 시그니처에 드러나 있는가**다.

| | 명시적 (계산) | 암묵적 (액션) |
|---|---|---|
| 입력 | 함수 인자 | 모듈 스코프 변수, 클로저 상태, 전역, `Date.now()`, `Math.random()`, `fetch` |
| 출력 | 반환값 | `setState`, 스토어 `dispatch`, 인자로 받은 객체 수정, `console.log` |

**암묵적 출력이 React에서 가장 자주 문제가 된다** — 계산해놓고 곧바로 `setState`까지 해버리는 핸들러가 그렇다. 계산을 꺼낼 때는 필요한 값을 클로저로 읽지 말고 **인자로 받아야** 한다. 클로저로 읽으면 암묵적 입력이 남아 여전히 계산이 아니다.

**표를 다 만든 뒤 점검한다**: 액션 칸이 계산 칸보다 길면 아직 덜 쪼갠 것이다. 각 액션을 다시 보고 "이 안에 계산할 게 있나?" 물어본다. 판별이 애매하면 [`references/classification.md`](./references/classification.md)를 읽는다.

## 2단계 — 배치한다

분류 결과를 프로젝트의 구조에 매핑한다. 기능(feature) 폴더 아래에 계층을 두는 것이 기본값이다.

```
src/
├─ app/                    진입점·라우팅·전역 프로바이더. 아무도 참조하지 않음
├─ shared/                  기능을 몰라도 되는 재사용 코드
│  ├─ data/ domain/ shell/ ui/
└─ features/
   └─ cart/
      ├─ data/             타입·상수.        아무것도 import 하지 않음
      ├─ domain/           계산만.           data/ 만 참조
      ├─ usecase/          계산 조합 + 얇은 액션
      ├─ shell/            액션 전용.         fetch·storage·Date
      ├─ ui/               React 컴포넌트.    usecase/ 를 통해서만 세상과 만남
      └─ index.ts          다른 기능에 공개하는 것
```

경계는 두 가지다. 기능 안에서는 **import가 안쪽으로만** 흐른다 — 특히 `ui/`가 `shell/`을 직접 부르지 못하게 하는 것이 추상화 벽이다. 기능 사이에서는 **서로의 내부를 직접 참조할 수 없고** `index.ts`가 공개한 것만 쓴다 — 안 그러면 폴더만 나뉘었을 뿐 사실상 하나의 거대한 계층이 된다. 자세한 것은 [`references/layered-design.md`](./references/layered-design.md).

새 프로젝트가 아니라 기존 코드에 점진적으로 도입할 때도 구조는 같다 — 한 기능부터 `features/`로 옮기고, 나머지는 그대로 둔다. [리팩토링 모드](#리팩토링-모드) 참고.

## 3단계 — 작성한다

### 지켜야 할 것

**계산은 필요한 것을 전부 인자로 받는다.** 시간이 필요하면 `now: number`를 받는다. 안에서 `Date.now()`를 부르면 그 순간 액션이 된다.

**데이터는 복사해서 바꾼다.** `items.push(x)` 대신 `[...items, x]`. 변환표는 [`references/immutability.md`](./references/immutability.md).

**타입은 `readonly`로 시작한다.** `readonly CartItem[]`을 받으면 `push`가 컴파일 에러다. 린터보다 타입이 먼저 막는 게 빠르다.

### React에서 특히

**이벤트 핸들러** — 계산을 이름 있는 함수로 꺼낸다.
```tsx
const increase = (n: number) => n + 1;        // 계산
const onClick = () => setCount(increase);      // 액션
```

**useEffect** — 액션과 계산이 가장 흔히 엉키는 자리다. 안에 있는 필터·정렬·집계는 전부 밖으로 꺼낼 후보다.
```tsx
// features/orders/domain/orders.ts — 순수. now를 인자로 받는 게 핵심이다.
export const recentTop10 = (orders: readonly Order[], now: number) => ...;

// ui/ — effect는 부르기만 한다
useEffect(() => {
  fetchOrders(userId).then((os) => setOrders(recentTop10(os, Date.now())));
}, [userId]);
```

**파생 상태는 state로 만들지 않는다.** `total`을 `useState` + `useEffect`로 동기화하면 두 상태가 어긋날 수 있다. 계산이면 그냥 계산으로 둔다.

**상태 관리 = 반응형 아키텍처.** 원인과 결과를 직접 연결하면 n×m개의 연결이 생긴다. 사이에 상태를 두면 n+m으로 준다. 중요한 건 도구(zustand/jotai/Context)가 아니라 **갱신 함수가 계산이어야** 한다는 것이다.
```ts
// features/cart/domain/cart.ts — 스토어 밖에서 단독으로 테스트된다
export const addItem = (items: readonly CartItem[], item: CartItem) => [...items, item];
// features/cart/shell/cartStore.ts — 액션은 계산을 부르기만 한다
add: (item) => set((s) => ({ items: addItem(s.items, item) })),
```

패턴이 더 필요하면 [`references/functional-tools.md`](./references/functional-tools.md) (map/filter/reduce, 고차 함수, 계산 조합).

## 4단계 — 검증한다

**이 단계를 건너뛰지 않는다.** 원칙을 지켰다고 믿는 것과 확인하는 것은 다르고, 확인하는 데는 몇 초밖에 안 걸린다.

```bash
npx eslint <변경한 파일들>
```

위반이 나오면:
1. 규칙 이름으로 [`references/eslint-rules.md`](./references/eslint-rules.md)를 찾는다 — 왜 막는지와 어떻게 고치는지가 있다
2. 고친다. 대부분 "값을 인자로 주입" 또는 "복사 후 변경"이다
3. 다시 돌린다

`no-action-calculation-mix`와 `no-loop-statements`는 warn이다. 판단은 사람이 한다 — 꺼낼 계산이 이름 붙일 만한 개념이 아니면 넘어가도 된다. 다만 **넘어간 이유를 사용자에게 한 줄로 말한다.**

규칙을 끄는 게 맞을 때도 있다 (측정된 성능 문제, 외부 API 요구). 끌 때는 파일 전체가 아니라 해당 줄만, 그리고 이유를 주석에 남긴다.

프리셋이 아직 안 깔려 있으면 이 단계에서 설치를 제안한다 — [셋업](#셋업-모드) 참고.

## 5단계 — 타임라인 점검 (비동기가 있을 때만)

ESLint가 못 잡는 영역이다. 정적 분석은 두 액션의 실행 순서를 알 수 없다.

비동기 코드를 썼거나 고쳤다면:

1. **액션만 나열한다** (계산은 뺀다 — 순서가 결과를 안 바꾸므로)
2. **동시에 진행될 수 있는 것을 묶는다** = 타임라인 개수
3. 타임라인이 둘 이상이면 **공유 자원**(상태·DOM·서버 레코드)을 표시한다
4. 공유 자원이 있으면 두 가지를 묻는다
   - **순서가 뒤집히면?** → cleanup / `AbortController` / `Promise.all`
   - **두 번 실행되면?** → 진행 중 플래그 / 큐
5. 공유 자원을 지역 변수로 바꿀 수 있으면 그게 가장 좋은 해결이다

가장 흔한 두 가지: **낡은 응답이 새 응답을 덮어씀**(검색어 빠르게 변경), **중복 제출**(버튼 연타). 코드와 함께 [`references/timeline.md`](./references/timeline.md)에 있다.

React/TanStack Query가 이미 푼 문제인지 먼저 확인한다. 직접 큐를 짜기 전에 그쪽을 본다.

---

## 리팩토링 모드

기존 코드 전체를 한 번에 옮기지 않는다. **기능 하나씩, 안전한 변경부터.**

프리셋(`fp.layered()`)은 `${src}/features` 아래에 실제로 존재하는 폴더만 스캔해서 규칙을 건다. 즉 기능 하나를 `features/<name>/`으로 옮기기 전까지는 그 파일들에 규칙이 걸리지 않는다 — 폴더를 옮기는 순간이 "이 코드를 규칙 아래로 들인다"는 선언이 된다. 나머지 레거시 코드는 그대로 조용하다.

### 1. 기능 하나를 고른다

가장 작고, 다른 코드와 얽힘이 적은 것부터. 첫 이관에서 큰 기능을 고르면 import 경로가 대량으로 깨지고 리뷰가 불가능해진다.

### 2. 분류부터 한다

그 기능 안 함수들을 열어 액션인지 계산인지 표로 만든다. 코드를 옮기기 전에 이걸 먼저 한다.

### 3. 계산 추출 (가장 안전)

액션 안에 갇힌 계산을 순수 함수로 꺼낸다. 파일을 옮기기 전, 같은 파일 안에서 함수만 분리하므로 되돌리기 쉽다. 꺼낸 계산에 테스트를 붙이면 이후 작업의 안전망이 된다.

### 4. 불변성 정리

`push`/`sort`/필드 대입을 카피-온-라이트로 바꾼다. 타입을 `readonly`로 조이면 컴파일러가 남은 곳을 찾아준다.

### 5. `features/<name>/`으로 옮긴다

분류표대로 `data/`·`domain/`·`usecase/`·`shell/`·`ui/` 서브폴더에 나눠 담고, 다른 기능이 써야 할 것만 `index.ts`로 내보낸다. 여기서 처음으로 import 경계 규칙과 기능 격리 규칙이 이 기능에 대해 의미를 갖는다.

프리셋을 `strict: false`로 얹어두면 이관 직후엔 위반이 warn으로만 뜬다.

```js
// eslint.config.js
import fp from "./eslint-functional-frontend/index.js";
export default [...fp.layered({ src: "src", strict: false })];
```

### 6. 다음 기능으로 반복한다

한 기능이 끝나면 커밋하고 다음 기능으로 넘어간다. 모든 기능을 옮길 필요는 없다 — 자주 만지는 곳부터 옮기고 나머지는 레거시로 둬도 프리셋은 조용하다.

**한 번에 다 하지 않는다.** 각 단계마다 테스트를 돌리고 커밋한다. 대규모 리팩토링이 실패하는 이유는 대개 한 번에 너무 많이 바꿔서다.

---

## 셋업 모드

### 1. 프리셋을 복사한다

이 스킬의 `eslint/` 디렉터리를 프로젝트로 복사한다.

```bash
cp -r <스킬경로>/eslint <프로젝트>/eslint-functional-frontend
# tests/에는 규칙 검증용으로 일부러 깨뜨린 파일이 들어 있다. 프로젝트로 가면
# 사람과 도구 양쪽을 혼란시키므로 반드시 지운다.
rm -rf <프로젝트>/eslint-functional-frontend/{tests,node_modules,package-lock.json}
```

의존성을 설치한다.

```bash
npm i -D eslint eslint-plugin-functional eslint-plugin-import-x typescript-eslint
```

### 2. 설정 파일

`assets/eslint.config.layered.js`를 프로젝트 루트에 `eslint.config.js`로 복사하고, 안의 주석에 따라 경로만 맞춘다. 신규 프로젝트라면 `src/features/`가 아직 비어 있어도 된다 — 프리셋은 존재하는 기능 폴더만 스캔하므로 첫 기능을 추가하는 순간부터 규칙이 걸린다.

옵션:

| 옵션 | 기본 | 설명 |
|---|---|---|
| `src` | `"src"` | 소스 루트 |
| `strict` | `true` | `false`면 전부 warn — 기존 코드베이스에 처음 얹을 때 |
| `allow` | `[]` | 계산 영역에서 예외로 허용할 액션. 예: `["console.warn"]` |
| `typeAware` | `false` | 타입 정보가 필요한 규칙까지. 느려지지만 깊은 불변성까지 잡는다 |

기존 코드베이스라면 `strict: false`로 시작해 [리팩토링 모드](#리팩토링-모드)대로 기능 하나씩 `features/`로 옮긴다.

### 3. 구조를 프로젝트에 각인한다

`assets/CLAUDE.md.snippet`의 내용을, 프로젝트가 쓰는 에이전트 지침 파일에 붙인다 — Claude Code라면 `CLAUDE.md`, Codex CLI라면 `AGENTS.md`, Cursor라면 `.cursor/rules/`의 always-apply 규칙. 이래야 이 스킬 없이 작업하는 세션에서도 구조가 유지된다.

### 4. 확인한다

```bash
npx eslint src
```

첫 실행에서 위반이 수백 개 나오면 `strict: false`로 낮춘다. 빌드가 깨지면 팀은 코드가 아니라 규칙을 끈다.

---

## 참고 문서

필요할 때만 읽는다.

| 파일 | 언제 |
|---|---|
| [`classification.md`](./references/classification.md) | 액션/계산 판별이 애매할 때, 분류표를 만들 때 |
| [`layered-design.md`](./references/layered-design.md) | 계층을 나눌 때, 어디에 둘지 정할 때 |
| [`immutability.md`](./references/immutability.md) | 카피-온-라이트 변환표, 방어적 복사 |
| [`functional-tools.md`](./references/functional-tools.md) | 반복문 정리, 고차 함수, 계산 조합 |
| [`timeline.md`](./references/timeline.md) | 비동기·동시성 문제 |
| [`eslint-rules.md`](./references/eslint-rules.md) | **위반이 나왔을 때** — 규칙별 이유와 고치는 법 |

## 마지막으로

원칙은 도구지 목표가 아니다. 완벽한 순수성보다 **읽기 쉽고 테스트 가능한 코드**가 목적이다. 계산을 억지로 만들다 코드가 더 복잡해지면 그건 잘못 적용한 것이다.

사용자가 규칙을 지키지 않는 코드를 요청하면, 이유를 한 문장으로 말하고 요청대로 해준다. 이건 사용자의 코드베이스다.

## 도구별 실행 방법

이 문서는 도구 중립적인 워크플로우다. 에이전트가 파일 읽기/쓰기와 셸 실행 도구를 갖고 있으면 그대로 따라 실행할 수 있다. 도구별 진입점:

| 도구 | 진입점 | 비고 |
|---|---|---|
| Claude Code | `SKILL.md` (frontmatter로 자동 트리거) | 이 문서를 그대로 읽고 따른다 |
| Cursor | `.cursor-rule.mdc`를 대상 프로젝트의 `.cursor/rules/`에 복사 | description 기반으로 관련 있을 때 자동 첨부됨(Agent Requested) |
| Codex CLI / 기타 | 이 파일을 직접 참조 | 조건부 자동 로딩이 없으므로, 필요한 시점에 "`functional-frontend/AGENTS.md`를 읽고 그대로 따라줘"처럼 명시적으로 지시하거나, 대상 프로젝트의 `AGENTS.md`에 이 파일에 대한 링크를 남겨둔다 |
