# 타임라인 — 비동기와 동시성

여기부터는 ESLint가 잡아주지 못한다. 정적 분석은 "이 두 액션이 어떤 순서로 실행되는가"를 알 수 없다. 비동기 코드를 쓸 때는 직접 따져봐야 한다.

## 타임라인 그리기

**타임라인은 시간 순으로 나열한 액션들이다.** 계산은 그리지 않는다 — 언제 실행되든 결과가 같으므로 순서 문제를 일으키지 않는다. 이것만으로 봐야 할 것이 크게 줄어든다.

1. **액션만 나열한다** (계산 제외)
2. **동시에 진행되는 것을 나란히 그린다** — `await` 없는 호출, 이벤트 핸들러, 각각의 `useEffect`는 서로 다른 타임라인이다
3. **공유 자원을 표시한다** — 두 타임라인이 같은 상태·DOM·서버 레코드를 건드리면 거기가 문제 지점이다

```
사용자가 "저장"을 두 번 빠르게 누른 경우

타임라인 A            타임라인 B
─────────            ─────────
POST /save (1차)
                     POST /save (2차)
응답 도착 (1차)
setState(A)  ◄─── 공유 자원: 컴포넌트 상태
                     응답 도착 (2차)
                     setState(B)  ◄─── 여기
```

## 좋은 타임라인의 조건

**적고, 짧고, 공유하지 않을수록** 이해하기 쉽다.

- **개수를 줄인다** — 병렬로 안 해도 되는 걸 병렬로 하지 않는다
- **길이를 줄인다** — 한 타임라인 안의 액션 수를 줄인다. 계산을 빼내는 게 여기에도 효과가 있다
- **공유를 줄인다** — 지역 변수로 만들 수 있으면 만든다. 공유 자원이 없으면 순서가 섞여도 문제가 없다

## 두 가지 문제

### 1. 순서가 섞임

두 타임라인이 공유 자원에 접근하는데 순서가 보장되지 않는다.

**증상**: 검색어를 빠르게 바꿨을 때 이전 요청의 응답이 나중에 도착해 화면을 덮어쓴다.

```tsx
// ❌ 응답 도착 순서가 요청 순서와 같다는 보장이 없다
useEffect(() => {
  fetch(`/api/search?q=${query}`)
    .then((r) => r.json())
    .then(setResults);
}, [query]);

// ✅ 낡은 응답을 버린다 (React의 cleanup을 이용한 Cut)
useEffect(() => {
  let current = true;
  fetch(`/api/search?q=${query}`)
    .then((r) => r.json())
    .then((data) => { if (current) setResults(data); });
  return () => { current = false; };
}, [query]);

// ✅✅ AbortController로 요청 자체를 취소하면 서버 부하도 준다
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setResults)
    .catch((e) => { if (e.name !== "AbortError") throw e; });
  return () => controller.abort();
}, [query]);
```

### 2. 같은 것이 여러 번 실행됨

**증상**: 결제 버튼 연타로 주문이 두 번 들어간다.

```tsx
// ❌ 두 번 누르면 두 번 간다
const onCheckout = () => placeOrder(items);

// ✅ 진행 중이면 무시한다 (JustOnce)
const [pending, setPending] = useState(false);
const onCheckout = async () => {
  if (pending) return;
  setPending(true);
  try { await placeOrder(items); }
  finally { setPending(false); }
};
```

`useState`가 아니라 `useRef`를 써야 할 때가 있다. `setPending(true)` 직후의 동기 코드에서는 `pending`이 아직 옛 값이라, 정말 빠른 연타는 통과할 수 있다. 확실히 막으려면 `useRef(false)`로 즉시 반영되는 플래그를 쓴다.

## 동시성 기본형

반복되는 조율 패턴은 이름을 붙여 재사용한다.

### Queue — 순서대로 하나씩

```ts
export const createQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => {});   // 실패해도 줄이 멈추지 않게
    return result;
  };
};

const enqueue = createQueue();
const save = (draft: Draft) => enqueue(() => postDraft(draft));
```

이 함수 자체는 액션이다 (`shell/`에 둔다). 하지만 이걸 쓰는 쪽은 순서를 신경 쓰지 않아도 된다.

### Cut — 여럿이 다 끝나면

```ts
const [user, orders] = await Promise.all([fetchUser(id), fetchOrders(id)]);
```

`Promise.all`이 곧 Cut이다. 두 타임라인이 만나는 지점을 만든다. 순차로 `await` 두 번 하는 것보다 빠르고, 서로 독립적이라면 이게 맞다.

### JustOnce — 최초 한 번만

```ts
export const once = <T>(action: () => T) => {
  let called = false;
  let result: T;
  return (): T => {
    if (!called) { called = true; result = action(); }
    return result;
  };
};
```

## React가 이미 해주는 것

직접 만들기 전에 확인한다.

| 문제 | React / 라이브러리의 답 |
|---|---|
| 낡은 응답이 덮어씀 | `useEffect` cleanup, `AbortController` |
| 중복 요청 | TanStack Query의 요청 중복 제거 |
| 재시도·캐시·무효화 | TanStack Query / SWR |
| 낙관적 업데이트 후 롤백 | `useOptimistic` (React 19) |
| 입력 중 과도한 요청 | debounce + cleanup |

서버 상태를 다루고 있다면 대부분 TanStack Query 같은 도구가 이미 푼 문제다. 직접 Queue를 짜기 전에 그쪽을 본다.

## 점검 순서

비동기 코드를 쓰거나 고쳤다면 이 순서로 따져본다.

1. 이 코드의 액션을 나열한다 (계산은 뺀다)
2. 동시에 진행될 수 있는 것들을 묶는다 — 이게 타임라인 개수다
3. 타임라인이 둘 이상이면, 공유 자원을 표시한다
4. 공유 자원이 있으면 두 가지를 묻는다
   - 순서가 뒤집히면 뭐가 깨지나? → Cut / cleanup
   - 두 번 실행되면 뭐가 깨지나? → JustOnce / 큐
5. 공유 자원을 지역 변수로 바꿀 수 있으면 그게 가장 좋은 해결이다
