// usecase/: 계산을 조합하고 액션을 오케스트레이션한다.
// 시간·난수·I/O는 직접 만들지 않고 shell/에서 주입받는다 — 그래야 테스트할 수 있다.
import { total } from "../domain/pricing";
import type { CartItem } from "../data/types";
import { catalogPrice } from "../../catalog";

type Deps = {
  readonly postOrder: (payload: string) => Promise<Response>;
  readonly now: () => number;
};

export const placeOrder =
  ({ postOrder, now }: Deps) =>
  (items: readonly CartItem[]): Promise<Response> =>
    postOrder(
      JSON.stringify({ amount: total(items) + catalogPrice, placedAt: now() }),
    );

// usecase가 직접 시간을 읽으면 이 함수를 테스트할 때 시계를 조작해야 한다
export const stampNow = () =>
  // @expect functional-frontend/no-impure-in-calculation
  Date.now();
