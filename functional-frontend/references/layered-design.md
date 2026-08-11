# 계층형 설계 · 추상화 벽 · 어니언 아키텍처

## 왜 계층인가

액션과 계산을 나눴다면 다음 질문은 "그래서 어디에 두나"다. 계층형 설계의 답은 **호출 깊이가 비슷한 것끼리 모으라**는 것이다. 한 함수 안에서 "장바구니 총액"과 "배열 인덱스 계산"이 나란히 있으면 읽는 사람이 추상화 수준을 오르내려야 한다. 그게 코드를 어렵게 만든다.

원칙은 네 가지다.

- **직접 구현** — 한 함수 안의 코드는 같은 추상화 수준이어야 한다
- **추상화 벽** — 계층 사이를 느슨하게 묶어, 아래가 바뀌어도 위가 안 바뀌게 한다
- **작은 인터페이스** — 계층이 밖으로 내보내는 함수는 적을수록 좋다
- **편리한 계층** — 이론적 완결성이 아니라 지금 일하기 편한 만큼만 나눈다

마지막 항목이 중요하다. 계층은 목적이 아니라 도구다. 두 계층으로 충분한 코드에 다섯 계층을 그으면 그냥 파일이 늘어난 것이다.

## layered 프리셋의 구조

전역 계층(옛 방식의 `src/{data,domain,usecase,shell,ui}`)은 프로젝트가 커지면 문제가 생긴다. `domain/`이 장바구니·주문·회원 계산을 전부 떠안게 되고, 파일 하나를 고치려면 관련 없는 기능까지 뒤져야 한다. 그래서 이 프리셋은 **기능(feature) 단위로 먼저 나누고, 그 안에서** 액션/계산/데이터 계층을 적용한다 — Feature-Sliced Design 계열의 요즘 프론트엔드 구조에 이 책의 원칙을 얹은 것이다.

```
src/
├─ app/                앱 진입점 · 라우팅 · 전역 프로바이더. 아무도 이걸 import 하지 않는다
├─ shared/              기능을 몰라도 되는 재사용 코드
│  ├─ data/             공통 타입 · 상수
│  ├─ domain/           공통 계산
│  ├─ shell/            공통 액션 (범용 http 클라이언트 등)
│  └─ ui/               공통 컴포넌트
└─ features/
   └─ cart/              화면 하나가 필요로 하는 모든 것
      ├─ data/           타입 · 상수. 아무것도 import 하지 않는다
      ├─ domain/         계산만. data/만 참조
      ├─ usecase/        계산 조합 + 얇은 액션. domain/을 오케스트레이션
      ├─ shell/          액션 전용. fetch · storage · Date · 라우터
      ├─ ui/             React 컴포넌트. usecase/를 통해서만 세상과 만난다
      └─ index.ts        이 기능이 다른 기능에 공개하는 것 (공개 API)
```

경계는 두 방향이다.

```
   기능 안쪽 (어니언):
   ui ──────► usecase ──────► domain ──────► data
    │             │                            ▲
    │             └──── shell (인터페이스만) ───┘
    │                     ▲
    └─────────  ✗  ───────┘   추상화 벽: ui는 shell을 직접 모른다

   기능 사이 (격리):
   features/cart ────✗───► features/catalog/{data,domain,usecase,shell,ui}
   features/cart ──────►    features/catalog/index.ts   (공개 API만)
```

`shared/`는 두 계층 규칙을 다 적용받는다 — `data → domain → shell/ui`로 안쪽으로만 흐르고, `ui`는 `shell`을 직접 부르지 못한다.

### 각 부분이 하는 일

**`app/`** — 라우팅, 전역 프로바이더, 진입점. 여기서 `features/*`를 조립한다. 다른 어떤 계층도 `app/`을 참조하지 않는다 — 참조하면 그건 진입점이 아니라 그냥 또 하나의 공유 모듈이다.

**`shared/`** — 기능 이름을 몰라도 되는 코드. "장바구니"나 "주문"을 모르고 "날짜 포맷", "HTTP 클라이언트", "버튼"만 아는 것들이 여기 온다. 특정 기능만 알면 되는 걸 여기 두면 `shared/`가 모든 기능의 숨은 의존성이 되어버린다 — 그럴 땐 해당 기능 폴더 안으로 옮긴다.

**`features/<feature>/data`** — 그 기능에 대한 사실. 타입, 상수, 스키마. 함수가 없다.

```ts
// features/cart/data/types.ts
export type CartItem = {
  readonly id: string;
  readonly price: number;
  readonly quantity: number;
};
export const FREE_SHIPPING_THRESHOLD = 50_000;
```

**`features/<feature>/domain`** — 계산만. 이 계층은 시간도 네트워크도 모른다. 필요하면 인자로 받는다. 테스트가 가장 쉬운 계층이라 비즈니스 규칙을 여기 몰아넣는 게 이득이다.

```ts
export const total = (items: readonly CartItem[]): number => { ... };
export const expiresAt = (now: number, ttlMs: number): number => now + ttlMs;
//                        ↑ 시간을 인자로 받아 계산으로 남는다
```

**`features/<feature>/shell`** — 액션. `fetch`, `localStorage`, `Date.now()`가 사는 곳. 여기 함수들은 얇아야 한다 — 로직이 있으면 `domain/`으로 꺼낼 후보다.

**`features/<feature>/usecase`** — 화면 하나가 하는 일 하나. `domain/`의 계산을 조합하고 `shell/`의 액션을 호출한다. 자기가 시간·난수·I/O의 **원천**이 되어서는 안 되고, 주입받는다. 그래야 usecase를 가짜 의존성으로 테스트할 수 있다.

```ts
// features/cart/usecase/checkout.ts
type Deps = {
  readonly postOrder: (payload: string) => Promise<Response>;
  readonly now: () => number;
};

export const placeOrder =
  ({ postOrder, now }: Deps) =>
  (items: readonly CartItem[]) =>
    postOrder(JSON.stringify({ amount: total(items), placedAt: now() }));
```

의존성을 인자로 받으면 테스트에서 `{ postOrder: fake, now: () => 0 }`을 넘기면 끝이다. 모듈 모킹이 필요 없다.

**`features/<feature>/ui`** — React 컴포넌트. 그리기와 이벤트 연결만 한다. `usecase/`를 부르고, `domain/`의 계산을 쓰고, `shell/`은 직접 모른다.

**`features/<feature>/index.ts`** — 이 기능의 공개 API. 다른 기능이 이 기능의 무언가가 필요하면 여기서 내보낸 것만 가져다 쓴다. 아무것도 내보내지 않으면 그 기능은 다른 기능에서 접근할 수 없다는 뜻이고, 그게 기본값이어야 한다.

## 추상화 벽

`ui/`가 `shell/`을 직접 import 하지 못하게 막는 것이 기능 내부에서 가장 값을 하는 규칙이다.

벽이 없으면 컴포넌트가 `fetch('/api/orders')`를 직접 안다. API 경로가 바뀌면 컴포넌트를 고쳐야 하고, 테스트하려면 네트워크를 흉내내야 하고, REST를 GraphQL로 바꾸면 화면 코드를 전부 건드려야 한다.

벽이 있으면 `usecase/placeOrder`라는 이름만 안다. 그 아래가 REST든 GraphQL든 localStorage든 컴포넌트는 모른다.

```tsx
// ❌ 벽을 넘음 — 컴포넌트가 전송 방식을 안다
import { postOrder } from "../shell/orderApi";
const onCheckout = () => postOrder(JSON.stringify({ ... }));

// ✅ 벽 안쪽 — 컴포넌트는 "주문한다"만 안다
import { placeOrder } from "../usecase/checkout";
const onCheckout = () => placeOrder(items);
```

## 기능 격리 — 두 번째 벽

계층 벽이 "기능 안에서 위아래로 새지 않게" 막는다면, 기능 격리는 "기능끼리 옆으로 새지 않게" 막는다.

```tsx
// ❌ 다른 기능의 내부를 직접 참조 — catalog의 domain/ 구현이 바뀌면 cart가 깨진다
import { catalogPrice } from "../../catalog/domain/pricing";

// ✅ catalog가 index.ts로 공개한 것만 참조
import { catalogPrice } from "../../catalog";
```

이게 없으면 기능 폴더는 이름만 남는다. `cart`가 `catalog`의 `domain/`·`shell/`을 직접 뒤지기 시작하면, 사실상 하나의 거대한 전역 계층으로 되돌아간 것과 같다 — 폴더 이름만 여러 개인 모놀리스다. 공개 API 하나로 좁히면 `catalog` 내부를 자유롭게 리팩토링해도 `cart`가 안 깨진다.

기능이 서로의 `index.ts`조차 자주 참조해야 한다면, 그건 두 기능이 사실 하나라는 신호다 — 합치는 것도 고려한다.

## 반응형 아키텍처

액션 사이의 결합을 줄이는 방법. n개의 원인이 m개의 결과에 각각 연결되면 n×m개의 연결이 생긴다. 원인과 결과 사이에 상태를 두면 n+m개로 줄어든다.

```
❌ 직접 호출:  장바구니 담기 ─┬─► 배지 갱신
                             ├─► 총액 갱신
                             └─► 추천 갱신
   (담는 곳이 3개면 연결 9개. 결과 하나 추가할 때마다 3곳을 고친다)

✅ 상태 구독:  장바구니 담기 ──► [cart 상태] ──┬─► 배지
                                              ├─► 총액
                                              └─► 추천
   (원인 3 + 결과 3 = 6. 결과를 추가해도 원인 쪽은 안 바뀐다)
```

React에서 이건 상태 관리 라이브러리(zustand, jotai, Context)를 쓰는 것과 같다. 중요한 건 도구가 아니라 **상태 갱신 함수가 계산이어야** 한다는 것이다. 그 상태가 한 기능 안에서만 쓰이면 `features/cart/shell/cartStore.ts`에, 여러 기능이 구독하면 `shared/shell/`에 둔다.

```ts
// features/cart/domain/cart.ts — 계산. 스토어 밖에서 단독으로 테스트된다.
export const addItem = (items: readonly CartItem[], item: CartItem) =>
  [...items, item];

// features/cart/shell/cartStore.ts — 액션은 계산을 부르기만 한다
export const useCart = create<CartState>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: addItem(s.items, item) })),
}));
```

## 관련 ESLint 규칙

| 규칙 | 잡는 것 |
|---|---|
| `import-x/no-restricted-paths` | 기능 안 계층 경계 위반 + 기능 간 내부 참조 |

**주의**: `no-restricted-paths`는 import 경로를 실제 파일로 해석해야 동작하고, 해석에 실패하면 조용히 넘어간다. 규칙이 켜져 있는데 아무것도 안 잡히면 resolver 설정을 의심한다. 프리셋이 TS 확장자 resolver를 기본으로 깔아두지만, `tsconfig`의 path 별칭(`@/features/...`)을 쓴다면 `eslint-import-resolver-typescript`를 설치해 프리셋 뒤에서 덮어써야 한다.

기능 격리 규칙은 `${src}/features`를 스캔해 실제로 존재하는 기능 폴더 목록으로 zone을 만든다. 새 기능을 추가하면 설정을 손대지 않아도 다음 lint 실행부터 그 기능도 격리된다.
