# 불변성 — 카피-온-라이트와 방어적 복사

계산의 정의는 "같은 입력에 같은 출력"이다. 그런데 인자로 받은 배열을 함수가 고쳐버리면, 그 배열을 들고 있던 호출자 입장에서는 **입력 자체가 바뀐다**. 그러면 다음 호출은 다른 입력을 받는다. 데이터를 제자리에서 바꾸는 순간 계산은 조용히 액션이 된다.

불변성은 그래서 스타일 취향이 아니라 액션/계산 분리를 지탱하는 전제다.

## 카피-온-라이트: 내가 만든 데이터

**원본은 두고, 복사본을 바꾼다.** 세 단계다.

1. 복사본을 만든다
2. 복사본을 바꾼다
3. 복사본을 돌려준다

```ts
// ❌ 원본을 바꾼다 — 이 함수는 액션이다
export const addItem = (items: CartItem[], item: CartItem) => {
  items.push(item);
  return items;
};

// ✅ 복사 후 변경 — 계산이다
export const addItem = (
  items: readonly CartItem[],
  item: CartItem,
): readonly CartItem[] => [...items, item];
```

### 자주 쓰는 변환

| 하려는 일 | ❌ 원본 변경 | ✅ 카피-온-라이트 |
|---|---|---|
| 추가 | `xs.push(x)` | `[...xs, x]` |
| 앞에 추가 | `xs.unshift(x)` | `[x, ...xs]` |
| 제거 | `xs.splice(i, 1)` | `xs.filter((_, j) => j !== i)` |
| 조건부 제거 | `xs.splice(...)` | `xs.filter((x) => x.id !== id)` |
| 정렬 | `xs.sort(f)` | `[...xs].sort(f)` 또는 `xs.toSorted(f)` |
| 뒤집기 | `xs.reverse()` | `[...xs].reverse()` / `xs.toReversed()` |
| 한 개 교체 | `xs[i] = x` | `xs.with(i, x)` 또는 `xs.map((v, j) => j === i ? x : v)` |
| 필드 수정 | `o.name = n` | `{ ...o, name: n }` |
| 필드 제거 | `delete o.k` | `const { k, ...rest } = o` |

`toSorted`/`toReversed`/`with`은 ES2023이다. 타깃 브라우저가 받쳐주면 이쪽이 의도가 더 분명하다.

### 얕은 복사로 충분한 이유

`[...items]`는 배열만 복사하고 안의 객체는 공유한다. 그래도 괜찮은데, **안쪽 객체도 아무도 바꾸지 않는다는 규칙을 모두가 지키기 때문**이다. 규칙이 지켜지는 한 얕은 복사면 되고, 깊은 복사는 비싸다. 이 규칙을 강제하는 게 `prefer-copy-on-write`와 `no-param-reassign` 규칙이다.

### 중첩 객체 수정

깊어질수록 스프레드가 지저분해진다. `update` 헬퍼를 만들어 쓴다.

```ts
// 한 단계
export const update = <T, K extends keyof T>(
  obj: T,
  key: K,
  modify: (value: T[K]) => T[K],
): T => ({ ...obj, [key]: modify(obj[key]) });

// 중첩 — 재귀적으로 update를 적용한다
export const updateIn = <T>(
  obj: T,
  [head, ...rest]: readonly string[],
  modify: (value: any) => any,
): T =>
  rest.length === 0
    ? update(obj, head as keyof T, modify)
    : update(obj, head as keyof T, (inner) => updateIn(inner, rest, modify));

// 쓰는 쪽
const next = updateIn(state, ["cart", "items"], (items) => [...items, item]);
```

경로가 세 단계를 넘어가면 헬퍼 문제가 아니라 **데이터 구조 문제**인 경우가 많다. 중첩을 펴서 id로 참조하는 편이 낫다.

## 방어적 복사: 남의 코드와 만나는 경계

카피-온-라이트는 내가 규칙을 지킨다는 전제 위에 있다. 그런데 규칙 밖의 코드 — 서드파티 라이브러리, 레거시 모듈, 서버 응답 — 는 내 데이터를 마음대로 바꿀 수 있다. 그 경계에서는 **깊은 복사**로 막는다.

- **들어올 때** 복사한다 — 밖에서 온 데이터가 나중에 밖에서 바뀌어도 내 쪽은 안전하다
- **나갈 때** 복사한다 — 내가 넘긴 데이터를 상대가 바꿔도 내 원본은 안전하다

```ts
// shell/legacyBridge.ts — 신뢰 경계
import { legacyCart } from "some-legacy-lib";

export const readCart = (): CartItem[] =>
  structuredClone(legacyCart.getItems());   // 들어올 때 복사

export const pushToLegacy = (items: readonly CartItem[]): void => {
  legacyCart.replace(structuredClone(items) as CartItem[]);  // 나갈 때 복사
};
```

**둘의 차이**: 카피-온-라이트는 얕은 복사로 충분하고 값싸며, 규칙을 지키는 코드끼리 쓴다. 방어적 복사는 깊은 복사라 비싸고, 규칙 밖 코드와의 **경계에서만** 쓴다. 경계는 `shell/`이다 — 방어적 복사가 `domain/` 안에 나타난다면 계층이 잘못 그어진 것이다.

## TypeScript로 강제하기

린터보다 타입이 먼저 막아주면 더 빠르다.

```ts
// data/types.ts — 데이터 타입은 처음부터 readonly로
export type CartItem = {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
};

// 함수 시그니처에서도 readonly를 받는다
export const total = (items: readonly CartItem[]): number => ...;
```

`readonly CartItem[]`를 받으면 `items.push(...)`가 **컴파일 에러**다. 시그니처만으로 "나는 이걸 안 바꾼다"는 약속이 문서화되기도 한다.

상수 객체는 `as const`로 굳힌다.

```ts
export const SHIPPING = { standard: 3000, express: 8000 } as const;
```

## 관련 ESLint 규칙

| 규칙 | 잡는 것 |
|---|---|
| `functional-frontend/prefer-copy-on-write` | `push`·`sort`·`splice` 등 원본 변경 메서드 (복사본 대상은 허용) |
| `no-param-reassign` (`props: true`) | 인자로 받은 객체의 필드 대입·`delete` |
| `functional/immutable-data` | 위를 타입 정보로 더 정확히. `typeAware: true`일 때만 |

`prefer-copy-on-write`가 `[...xs].sort()`를 통과시키는 이유는, 방금 만든 복사본을 바꾸는 건 원본에 영향이 없어서다. 다만 복사본을 **바깥 함수에서** 만들어 넘겨받았다면 다른 곳에서도 볼 수 있으므로 보고한다.
