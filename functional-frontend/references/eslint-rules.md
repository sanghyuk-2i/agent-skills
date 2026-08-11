# ESLint 규칙 치트시트

`npx eslint`가 뱉은 규칙 이름으로 여기를 찾는다. 각 항목은 **왜 막는지**와 **어떻게 고치는지**를 담는다. 이유를 알아야 규칙을 우회하지 않고 고칠 수 있다.

## 목차

- [`functional-frontend/no-impure-in-calculation`](#functional-frontendno-impure-in-calculation)
- [`functional-frontend/no-implicit-input`](#functional-frontendno-implicit-input)
- [`functional-frontend/prefer-copy-on-write`](#functional-frontendprefer-copy-on-write)
- [`functional-frontend/no-action-calculation-mix`](#functional-frontendno-action-calculation-mix)
- [`import-x/no-restricted-paths` · `no-restricted-imports`](#계층-경계)
- [`no-param-reassign`](#no-param-reassign)
- [`functional/no-loop-statements`](#functionalno-loop-statements)
- [`functional/no-classes` · `functional/no-this-expressions`](#functionalno-classes--functionalno-this-expressions)
- [규칙을 끄는 게 맞을 때](#규칙을-끄는-게-맞을-때)

---

## `functional-frontend/no-impure-in-calculation`

> `Math.random`은(는) 액션입니다 (난수 — 호출마다 값이 달라짐). 이 파일은 계산 영역이라 순수해야 합니다.

**왜**: 계산은 "같은 입력에 같은 출력"이어야 한다. 시간·난수·I/O·전역 환경을 읽는 순간 그 함수는 부를 때마다 다른 값을 낼 수 있고, 테스트하려면 환경을 흉내내야 한다.

**고치는 법 — 우선순위 순**

1. **인자로 주입받는다.** 대부분 이걸로 해결된다.

```ts
// ❌ domain/order.ts
export const isExpired = (order: Order) => order.expiresAt < Date.now();

// ✅ 시간이 시그니처로 올라온다. 테스트에서 아무 시각이나 넣을 수 있다.
export const isExpired = (order: Order, now: number) => order.expiresAt < now;
```

2. **호출부를 액션 계층으로 옮긴다.** 값을 만드는 쪽이 액션이면 그쪽에서 만들어 넘긴다.

```ts
// shell/clock.ts
export const now = (): number => Date.now();

// usecase에서 조합
const expired = isExpired(order, now());
```

3. **정말 예외라면 `allow`로 명시한다.** 프리셋 설정에 남기면 "왜 예외인지"가 기록으로 남는다.

```js
...fp.layered({ allow: ["console.warn"] })
```

**흔한 경우**

| 잡힌 것 | 고침 |
|---|---|
| `Date.now()` | `now: number` 인자로 |
| `new Date()` | `now: number` 인자로. `new Date(iso)`는 인자가 있어 통과한다 |
| `Math.random()` | `seed`/`id`를 인자로. id 생성은 `shell/`에서 |
| `crypto.randomUUID()` | 위와 동일 |
| `localStorage.getItem` | `shell/`에서 읽어 값으로 전달 |
| `window.innerWidth` | `shell/`이나 훅에서 읽어 값으로 전달 |
| `process.env` / `import.meta.env` | `data/config.ts`에 한 번 읽어 상수로 export |

---

## `functional-frontend/no-implicit-input`

> 모듈 스코프의 가변 변수 `taxRate`은(는) 이 파일 모든 함수의 암묵적 입력입니다.

**왜**: 함수가 자기 바깥의 가변 상태를 읽으면 그 상태는 시그니처에 없는 **숨은 인자**가 된다. 같은 인자로 불러도 다른 값이 나올 수 있다.

```ts
// ❌ withTax의 결과가 setTaxRate 호출 여부에 달려 있다
let taxRate = 0.1;
export const setTaxRate = (r: number) => { taxRate = r; };
export const withTax = (price: number) => price * (1 + taxRate);

// ✅ 숨은 입력을 시그니처로 끌어올린다
export const withTax = (price: number, taxRate: number) =>
  price * (1 + taxRate);

// ✅ 값이 진짜 안 변한다면 const로 (그러면 규칙이 통과시킨다)
const TAX_RATE = 0.1;
export const withTax = (price: number) => price * (1 + TAX_RATE);
```

> `n`은(는) 이 함수 바깥에서 선언된 가변 변수라 암묵적 입력입니다.

클로저에 가둔 가변 상태다. 그 상태가 정말 필요하면 계산이 아니라 액션이므로 `shell/`로 옮긴다.

```ts
// ❌ domain/ 안의 카운터 — 부를 때마다 결과가 다르다
export const makeCounter = () => { let n = 0; return () => ++n; };

// ✅ 상태를 밖으로 드러내면 계산이 된다
export const next = (n: number) => n + 1;
```

**통과하는 것**: `const` 선언, 함수 안에서만 쓰이는 `let`(누산기 등), 인자로 받은 값을 쓰는 클로저.

---

## `functional-frontend/prefer-copy-on-write`

> `push`는 원본을 제자리에서 바꿉니다. 원본은 두고 복사본을 바꾸세요.

**왜**: 인자로 받은 배열을 고치면 호출자가 들고 있던 값이 바뀐다. 그러면 그 함수는 계산이 아니라 액션이다.

```ts
// ❌
export const addItem = (items: CartItem[], item: CartItem) => {
  items.push(item);
  return items;
};

// ✅
export const addItem = (items: readonly CartItem[], item: CartItem) =>
  [...items, item];
```

변환표는 [`immutability.md`](./immutability.md#자주-쓰는-변환)에 있다.

**통과하는 것**: 방금 만든 복사본을 바꾸는 것. `[...xs].sort()`, `xs.slice().reverse()`, 그리고 같은 함수 안에서 `const copy = [...xs]`로 만든 뒤 `copy.sort()` 하는 것.

**보고되는 것**: 인자로 받은 배열, 모듈 스코프 배열, 바깥 함수에서 만들어진 배열. 마지막 경우는 그 배열을 다른 곳에서도 볼 수 있기 때문이다.

**오탐이라면**: `.push()` 메서드를 가진 커스텀 객체일 수 있다. 이 규칙은 타입 정보 없이 메서드 이름만 보므로 그런 경우를 구분하지 못한다. 해당 줄만 `eslint-disable-next-line`으로 넘기거나, 프로젝트가 이미 타입 인식 린팅을 쓴다면 `typeAware: true`를 켠다.

---

## `functional-frontend/no-action-calculation-mix`

> 이 함수는 부수효과와 계산 로직 4줄이 섞여 있습니다.

**항상 warn이다.** 판정이 아니라 신호다 — 정적 분석으로 "이건 계산이다"를 정확히 알 수 없으므로, 판단은 사람이 한다.

**왜**: 액션 안에 갇힌 계산은 그 액션을 부르지 않으면 쓸 수 없다. 꺼내면 다른 화면에서도 쓰고, 서버 없이 테스트한다.

```ts
// ❌ 총액 계산이 checkout 안에 갇혀 있다
export const checkout = async (items: CartItem[]) => {
  const base = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = Math.round(base * 0.1);
  const shipping = base >= 50_000 ? 0 : 3000;
  const total = base + tax + shipping;
  return fetch("/api/orders", { method: "POST", body: String(total) });
};

// ✅ domain/pricing.ts로 꺼내면 장바구니 배지에서도 쓸 수 있다
export const checkout = (items: readonly CartItem[]) =>
  fetch("/api/orders", { method: "POST", body: String(total(items)) });
```

**무시해도 될 때**: 꺼낼 계산이 그 액션에서만 의미 있고 이름 붙일 만한 개념이 아닐 때. 그럴 땐 넘어간다 — warn인 이유가 이것이다.

---

## 계층 경계

### `import-x/no-restricted-paths`

> Unexpected path "../shell/orderApi" imported in restricted zone. 추상화 벽: 컴포넌트가 fetch·storage 구현을 직접 알면…

import가 바깥쪽으로 흘렀거나, 다른 기능의 내부를 직접 참조했다. 각 경계의 규칙은 [`layered-design.md`](./layered-design.md)에 있다.

| 위반 | 고침 |
|---|---|
| `domain/` → `shell/` | 필요한 값을 함수 인자로 받는다 |
| `ui/` → `shell/` | `usecase/`에 함수를 만들고 그걸 부른다 |
| `usecase/` → `ui/` | UI 쪽 값을 인자로 받는다 |
| `data/` → 그 외 | `data/`는 아무것도 참조하지 않는다. 그 타입이 정말 필요하면 `data/`로 옮긴다 |
| `features/catalog/domain/...` → 다른 기능이 직접 import | 그 기능의 `index.ts`가 공개하도록 export를 옮기고, 호출부는 `index.ts`에서 가져온다 |

**규칙이 아무것도 안 잡힌다면** resolver 문제다. `tsconfig` path 별칭(`@/features/...`)을 쓰면 `eslint-import-resolver-typescript`를 설치하고 프리셋 **뒤에** 설정을 얹어야 한다.

```js
export default [
  ...fp.layered({ src: "src" }),
  { settings: { "import-x/resolver": { typescript: true } } },
];
```

---

## `no-param-reassign`

> Assignment to property of function parameter.

인자로 받은 객체의 필드를 바꿨다. 호출자는 자기 데이터가 바뀐 걸 모른다.

```ts
// ❌
const applyDiscount = (order: Order, rate: number) => {
  order.total = order.total * (1 - rate);
  return order;
};

// ✅
const applyDiscount = (order: Order, rate: number): Order => ({
  ...order,
  total: order.total * (1 - rate),
});
```

---

## `functional/no-loop-statements`

**항상 warn.** `for`/`while`은 순회 방식과 목적을 뒤섞는다. `map`/`filter`/`reduce`는 이름에 목적이 드러난다. 변환표는 [`functional-tools.md`](./functional-tools.md#반복문을-도구로)에 있다.

**무시해도 될 때**: 성능이 실제로 문제인 큰 배열, 중간에 빠져나가야 하는 순회(`find`/`some`으로 안 되는 경우). 이유를 주석에 남기고 `eslint-disable-next-line`한다.

---

## `functional/no-classes` · `functional/no-this-expressions`

계산·데이터 영역에 클래스나 `this`가 있다.

**왜**: OOP가 나빠서가 아니다. 메서드가 데이터에 붙으면 "이 데이터를 다루는 방법"이 그 클래스 안으로 고정되어, 함수형 도구로 자유롭게 변환할 수 없게 된다. 계산 영역의 데이터는 평범한 객체·배열이어야 어떤 함수든 받아 처리한다.

```ts
// ❌ domain/Cart.ts
export class Cart {
  constructor(private items: CartItem[]) {}
  get total() { return this.items.reduce((s, i) => s + i.price, 0); }
  add(item: CartItem) { this.items.push(item); }
}

// ✅ 데이터와 계산을 분리한다
export type Cart = { readonly items: readonly CartItem[] };
export const total = (cart: Cart) => cart.items.reduce((s, i) => s + i.price, 0);
export const add = (cart: Cart, item: CartItem): Cart =>
  ({ items: [...cart.items, item] });
```

클래스가 꼭 필요하다면 (외부 SDK 상속 등) `shell/`에 둔다. 거기서는 허용된다.

---

## 규칙을 끄는 게 맞을 때

규칙을 우회하는 게 정답일 때가 실제로 있다. 억지로 맞추면 코드가 더 나빠진다.

- **성능이 측정으로 확인된 경우** — 루프가 정말 빠르다면 루프를 쓴다
- **외부 API가 변경을 요구하는 경우** — 서드파티가 배열을 제자리에서 정렬하라고 하면 방법이 없다
- **한 번 쓰고 버리는 코드** — 프로토타입, 스파이크

끌 때는 **파일 전체가 아니라 해당 줄만**, 그리고 **이유를 적는다**.

```ts
// 10만 건 이상에서 map 체인이 프레임을 넘겨 루프로 대체 (#1234)
// eslint-disable-next-line functional/no-loop-statements
for (let i = 0; i < points.length; i += 1) { ... }
```

이유 없는 `eslint-disable`은 나중에 아무도 지울 수 없다. 이유가 적혀 있으면 그 이유가 사라졌을 때 지울 수 있다.
