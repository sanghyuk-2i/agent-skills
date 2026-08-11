// shell/: 액션 계층. fetch·시간·난수가 허용된다.
import type { CartItem } from "../data/types";

export const postOrder = (payload: string): Promise<Response> =>
  fetch("/api/orders", { method: "POST", body: payload });

// 액션 안에 계산이 쌓여 있다 — 추출 신호가 떠야 한다
// @expect functional-frontend/no-action-calculation-mix
export const checkout = async (items: CartItem[]): Promise<Response> => {
  const base = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(base * 0.1);
  const shipping = base >= 50_000 ? 0 : 3000;
  const total = base + tax + shipping;
  return fetch("/api/orders", { method: "POST", body: String(total) });
};

// 시간을 읽는 것은 shell/에서는 정상이다 — 위반이 없어야 한다
export const nowMs = (): number => Date.now();
