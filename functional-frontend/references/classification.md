# 액션 · 계산 · 데이터 분류

이 책의 출발점이자, 나머지 모든 원칙이 딛고 서는 구분이다.

| | 정의 | 판별 질문 | 비용 |
|---|---|---|---|
| **액션** | 호출 시점·횟수에 따라 결과가 달라지는 것 | "두 번 부르면 뭔가 달라지나?" | 테스트하려면 환경을 흉내내야 함 |
| **계산** | 입력으로 출력을 만드는 것 | "같은 입력에 항상 같은 출력인가?" | 그냥 부르고 결과만 보면 됨 |
| **데이터** | 사건에 대한 사실의 기록 | "이건 그냥 값인가?" | 없음 |

목표는 액션을 없애는 게 아니다 — 없앨 수 없다. 화면에 그리고, 서버를 부르고, 저장하는 게 프론트엔드가 하는 일의 전부다. 목표는 **액션을 최소한으로 좁히고, 그 안에 섞여 있던 계산을 밖으로 꺼내는 것**이다. 꺼낸 계산은 테스트할 수 있고, 다른 데서 다시 쓸 수 있고, 읽을 때 머릿속에 실행 환경을 시뮬레이션하지 않아도 된다.

## 액션이 코드에 드러나는 지점

프론트엔드에서 액션은 결국 이 목록으로 수렴한다. 함수 안에 이게 있으면 그 함수는 액션이다.

- **시간** — `Date.now()`, `new Date()`, `performance.now()`
- **난수** — `Math.random()`, `crypto.randomUUID()`
- **I/O** — `fetch`, WebSocket, `localStorage`, IndexedDB
- **전역 환경** — `document`, `window`, `location`, `navigator`, `process.env`
- **출력** — `console.*`, `alert`
- **상태 변경** — `setState`, 스토어 `dispatch`, 인자로 받은 객체 수정
- **암묵적 입력** — 모듈 스코프의 가변 변수, 클로저에 가둔 가변 상태

마지막 두 개가 놓치기 쉽다. 겉보기엔 순수한 함수도 바깥의 가변 상태를 읽으면 계산이 아니다.

```ts
// 액션이다. taxRate가 언제 바뀌었느냐에 따라 결과가 달라진다.
let taxRate = 0.1;
const withTax = (price: number) => price * (1 + taxRate);

// 계산이다. 숨은 입력이 시그니처로 올라왔다.
const withTax = (price: number, taxRate: number) => price * (1 + taxRate);
```

## 암묵적 입출력

액션을 알아보는 가장 실용적인 기준은 **입출력이 시그니처에 드러나 있는가**다.

|  | 명시적 (계산) | 암묵적 (액션) |
|---|---|---|
| 입력 | 함수 인자 | 모듈 스코프 변수, 클로저 상태, 전역, `Date.now()` |
| 출력 | 반환값 | `setState`, 스토어 `dispatch`, 인자로 받은 객체 수정, `console.log` |

둘은 짝이다. 입력만 보고 넘어가기 쉬운데, **출력 쪽이 React에서 더 자주 문제가 된다** — 계산해서 바로 `setState`까지 해버리는 핸들러가 그렇다.

```tsx
// ❌ 계산과 암묵적 출력(setState)이 한 함수에 있다
const onClickVoteExample = () => {
  const reflected = voteResults.map((v) => ({ ...v, vote: v.agenda.defaultVote }));
  setVoteResults(reflected);   // ← 암묵적 출력
};

// ✅ 계산을 명시적 입출력으로 꺼낸다
const applyDefaultVotes = (results: readonly VoteResult[]): readonly VoteResult[] =>
  results.map((v) => ({ ...v, vote: v.agenda.defaultVote }));   // 계산

const onClickVoteExample = () =>
  setVoteResults(applyDefaultVotes(voteResults));                // 액션
```

코드는 한 줄 늘었지만 `applyDefaultVotes`는 이제 React 없이 테스트되고, 다른 화면에서도 쓰인다. 꺼낸 함수가 `voteResults`를 클로저로 읽지 않고 **인자로 받는 것**이 핵심이다 — 클로저로 읽으면 암묵적 입력이 남아 계산이 되지 못한다.

**전염된다는 점이 중요하다.** 액션을 부르는 함수는 액션이 된다. 그래서 액션은 위쪽(shell) 계층에 몰아두고, 아래쪽은 계산만 남겨야 한다. 계산이 액션을 부르는 순간 그 계산도 액션이 되고, 그 아래 전부가 오염된다.

## 액션에서 계산 빼내기

가장 자주 쓰게 될 리팩터링. 세 단계다.

1. 함수 안에서 "값을 계산하는 부분"을 찾는다
2. 그 부분을 별도 함수로 꺼낸다 — 필요한 값은 전부 **인자로** 받는다
3. 원래 함수는 그 계산을 부르고, 결과를 가지고 부수효과만 수행한다

```ts
// ── Before: 액션 하나에 계산 네 줄이 갇혀 있다 ────────────────
const checkout = async (items: CartItem[]) => {
  const base = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = Math.round(base * 0.1);
  const shipping = base >= 50_000 ? 0 : 3000;
  const total = base + tax + shipping;
  await fetch("/api/orders", { method: "POST", body: String(total) });
};

// ── After ────────────────────────────────────────────────────
// domain/pricing.ts — 계산. 테스트에 서버가 필요 없다.
export const subtotal = (items: readonly CartItem[]) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);
export const tax = (amount: number) => Math.round(amount * TAX_RATE);
export const shipping = (amount: number) =>
  amount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
export const total = (items: readonly CartItem[]) => {
  const base = subtotal(items);
  return base + tax(base) + shipping(base);
};

// shell/orderApi.ts — 액션. 남은 건 fetch 한 줄뿐이다.
export const checkout = (items: readonly CartItem[]) =>
  fetch("/api/orders", { method: "POST", body: String(total(items)) });
```

빼낸 뒤 `total`은 어디서든 쓸 수 있다 — 결제 버튼, 장바구니 배지, 주문 확인 화면. 전에는 `checkout`을 부르지 않으면 총액을 알 수 없었다.

## React에서 자주 마주치는 형태

### 이벤트 핸들러

```tsx
// ❌ 계산과 액션이 한 덩어리
const onClick = () => setCount(count + 1);

// ✅ 계산을 이름 있는 함수로 꺼낸다
const increase = (n: number) => n + 1;          // 계산
const onClick = () => setCount(increase);        // 액션
```

`count + 1` 정도로 이걸 해야 하나 싶겠지만, 규칙이 붙는 로직은 항상 자란다 — 최대치 제한, 단위 조정, 재고 확인. 자란 뒤에 꺼내는 것보다 처음부터 나눠두는 게 싸다.

### useEffect

`useEffect` 안은 액션과 계산이 가장 흔하게 뒤엉키는 자리다.

```tsx
// ❌ 필터·정렬·집계가 effect 안에 갇혀 있다
useEffect(() => {
  fetch(`/api/orders?user=${userId}`)
    .then((r) => r.json())
    .then((orders: Order[]) => {
      const recent = orders.filter((o) => o.placedAt > Date.now() - WEEK);
      const sorted = [...recent].sort((a, b) => b.placedAt - a.placedAt);
      setOrders(sorted.slice(0, 10));
    });
}, [userId]);

// ✅ 계산은 domain으로 — effect는 부르기만 한다
// domain/orders.ts
export const recentTop10 = (orders: readonly Order[], now: number) =>
  [...orders]
    .filter((o) => o.placedAt > now - WEEK)
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 10);

// ui/OrderList.tsx
useEffect(() => {
  fetchOrders(userId).then((orders) => setOrders(recentTop10(orders, Date.now())));
}, [userId]);
```

`recentTop10`은 이제 서버도 React도 없이 테스트된다. `now`를 인자로 받는 게 핵심이다 — 안에서 `Date.now()`를 부르면 다시 액션이 된다.

### 파생 상태는 계산이다

```tsx
// ❌ 상태를 하나 더 만들고 effect로 동기화 — 두 상태가 어긋날 수 있다
const [items, setItems] = useState<CartItem[]>([]);
const [total, setTotal] = useState(0);
useEffect(() => { setTotal(calcTotal(items)); }, [items]);

// ✅ 계산이면 계산으로 두면 된다. 어긋날 상태 자체가 없다.
const [items, setItems] = useState<readonly CartItem[]>([]);
const total = calcTotal(items);
```

React가 말하는 "불필요한 state를 만들지 마라"와 이 책이 말하는 "계산은 계산으로 두라"는 같은 이야기다.

## 분류표 쓰기

코드를 쓰기 전에 요구사항의 각 동작을 이 표로 정리한다. 순서를 뒤집으면 — 코딩 먼저, 분류 나중에 — 이미 섞여버린 함수를 나중에 풀어야 한다.

| 동작 | 분류 | 배치 | 이유 |
|---|---|---|---|
| 장바구니 항목 목록 | 데이터 | `features/cart/data/cart.ts` | 사실의 기록 |
| 총액 계산 | 계산 | `features/cart/domain/pricing.ts` | 같은 항목 → 같은 총액 |
| 항목 추가 | 계산 | `features/cart/domain/cart.ts` | 새 배열을 돌려주면 계산 |
| 서버에 주문 전송 | 액션 | `features/cart/shell/orderApi.ts` | 네트워크 I/O |
| 주문 시각 기록 | 액션 | `features/cart/shell/clock.ts` | 부를 때마다 다름 |
| 결제 흐름 조율 | 액션 (얇게) | `features/cart/usecase/checkout.ts` | 계산 조합 + 액션 호출 |

액션 칸이 계산 칸보다 길면 아직 덜 쪼갠 것이다. 각 액션을 다시 보고 "이 안에 계산할 게 있나?" 물어본다.
