# 일급 함수와 함수형 도구

## 일급 함수

값처럼 다룰 수 있는 것을 "일급"이라 한다. 변수에 담고, 인자로 넘기고, 반환할 수 있으면 일급이다. JavaScript에서 함수는 일급이고, 이게 아래 모든 패턴의 토대다.

**고차 함수**는 함수를 인자로 받거나 반환하는 함수다. 이걸로 "반복되지만 가운데만 다른" 코드에서 그 다른 부분을 뽑아낸다.

## 암묵적 인자를 드러내기

함수 이름에 값이 박혀 있으면 그 값은 인자여야 한다는 신호다.

```ts
// ❌ 이름에 필드명이 박혀 있다 — 필드가 늘 때마다 함수가 는다
const setPrice = (item, value) => ({ ...item, price: value });
const setQuantity = (item, value) => ({ ...item, quantity: value });
const setName = (item, value) => ({ ...item, name: value });

// ✅ 박혀 있던 것을 인자로 끌어올린다
const setField = <T, K extends keyof T>(item: T, field: K, value: T[K]): T =>
  ({ ...item, [field]: value });
```

## 함수 본문을 콜백으로 바꾸기

앞뒤는 같고 가운데만 다른 코드가 반복되면, 그 가운데를 콜백으로 받는다.

```ts
// ❌ try/catch가 매번 복제된다
const saveCart = (cart) => {
  try { return storage.set("cart", cart); }
  catch (e) { report(e); return null; }
};
const saveUser = (user) => {
  try { return storage.set("user", user); }
  catch (e) { report(e); return null; }
};

// ✅ 감싸는 부분을 고차 함수로, 다른 부분을 콜백으로
const withReport = <T>(run: () => T): T | null => {
  try { return run(); }
  catch (e) { report(e); return null; }
};

const saveCart = (cart) => withReport(() => storage.set("cart", cart));
const saveUser = (user) => withReport(() => storage.set("user", user));
```

## 반복문을 도구로

`for`는 순회 방식(인덱스 증가)과 목적(변환·거르기·모으기)을 뒤섞는다. 함수형 도구는 목적이 이름에 드러나므로 본문을 안 읽어도 뭘 하는지 안다.

| 목적 | 도구 |
|---|---|
| 각 항목을 변환해 같은 개수 | `map` |
| 조건에 맞는 것만 남김 | `filter` |
| 하나의 값으로 모음 | `reduce` |
| 조건에 맞는 첫 항목 | `find` |
| 하나라도/전부 만족하는지 | `some` / `every` |
| 그룹으로 묶음 | `Object.groupBy` (ES2024) |

```ts
// ❌ 인덱스가 목적을 가린다
const names: string[] = [];
for (let i = 0; i < orders.length; i += 1) {
  if (orders[i].status === "paid") names.push(orders[i].customer);
}

// ✅ 무엇을 하는지 첫 줄에서 보인다
const names = orders
  .filter((order) => order.status === "paid")
  .map((order) => order.customer);
```

### reduce는 마지막 수단

`reduce`는 강력해서 뭐든 되지만, 그래서 읽기 어렵다. `map`/`filter`로 표현되면 그쪽을 쓴다. `reduce`가 정말 맞는 건 **누적**할 때다.

```ts
// 이건 reduce가 맞다 — 하나의 값으로 모으는 게 목적
const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

// 이건 map이 맞다 — reduce로 쓰면 의도가 묻힌다
const names = items.reduce((acc, i) => [...acc, i.name], []);  // ❌
const names = items.map((item) => item.name);                   // ✅
```

## 체인 최적화

`filter → map → filter`처럼 이으면 중간 배열이 매번 생긴다. 대부분은 문제가 안 된다 — 프론트엔드에서 다루는 배열은 보통 수백 개 수준이고, 읽기 쉬움이 더 값지다.

**측정해서 문제가 확인됐을 때만** 손댄다.

1. 연속된 `map`은 하나로 합친다: `.map(f).map(g)` → `.map(x => g(f(x)))`
2. `filter`를 앞으로 당겨 이후 단계가 처리할 개수를 줄인다
3. 그래도 부족하면 `reduce` 한 번으로 합친다 (가독성을 내주는 거래다)

먼저 재는 게 순서다. 대부분의 "체인이 느려서"는 사실 렌더링 문제다.

## 계산 조합

작은 계산을 이어 붙이는 게 계층형 설계의 실제 모습이다.

```ts
// domain/pricing.ts — 각각 따로 테스트되는 작은 계산들
export const subtotal = (items: readonly CartItem[]) => ...;
export const tax = (amount: number) => ...;
export const shipping = (amount: number) => ...;

// 위 계층에서 조합한다
export const total = (items: readonly CartItem[]) => {
  const base = subtotal(items);
  return base + tax(base) + shipping(base);
};
```

`total` 본문의 모든 줄이 같은 추상화 수준에 있다. 이게 "직접 구현" 원칙이다 — 여기에 `items[i].price * items[i].quantity` 같은 한 단계 낮은 코드가 섞이면 읽는 사람이 오르내려야 한다.

## React에서

```tsx
// 컴포넌트 밖의 계산 — 렌더마다 다시 만들지 않고, 따로 테스트된다
const visibleRows = (rows: readonly Row[], query: string, sortKey: keyof Row) =>
  [...rows]
    .filter((row) => row.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));

// 컴포넌트는 부르기만 한다
export const Table = ({ rows, query, sortKey }: Props) => {
  const visible = visibleRows(rows, query, sortKey);
  return <tbody>{visible.map((row) => <Row key={row.id} {...row} />)}</tbody>;
};
```

`useMemo`는 이 계산이 실제로 비쌀 때만 얹는다. 계산을 컴포넌트 밖으로 꺼내는 것 자체가 먼저이고, 메모이제이션은 그다음의 성능 문제다.

## 관련 ESLint 규칙

| 규칙 | 잡는 것 |
|---|---|
| `functional/no-loop-statements` | 계산 영역의 `for`/`while` (항상 warn) |
| `functional/no-classes` | 계산·데이터 영역의 클래스 |
| `functional/no-this-expressions` | 계산 영역의 `this` |

`no-loop-statements`가 warn인 이유는, 성능상 루프가 정말 나은 경우가 실제로 있어서다. 그럴 땐 이유를 주석으로 남기고 `// eslint-disable-next-line`으로 넘긴다.

클래스를 막는 건 OOP가 나빠서가 아니다. 메서드가 데이터에 붙으면 "이 데이터를 다루는 방법"이 그 클래스 안으로 고정되고, 함수형 도구로 자유롭게 변환할 수 없게 된다. 계산 영역의 데이터는 평범한 객체와 배열이어야 어떤 함수든 받아 처리할 수 있다.
