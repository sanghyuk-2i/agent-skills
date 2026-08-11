// 위반이 하나도 없어야 하는 파일.
// 오탐(false positive)이 나면 스킬이 멀쩡한 코드를 "고치려" 들기 때문에
// 이 파일이 조용한지가 위반 탐지만큼 중요하다.
import type { CartItem } from "../data/types";
import { FREE_SHIPPING_THRESHOLD } from "../data/types";
import { shipping, tax } from "../../../shared/domain/money";

export const subtotal = (items: readonly CartItem[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const total = (items: readonly CartItem[]): number => {
  const base = subtotal(items);
  return base + tax(base) + shipping(base, FREE_SHIPPING_THRESHOLD);
};

// 카피-온-라이트: 원본을 두고 복사본을 바꾼다
export const addItem = (
  items: readonly CartItem[],
  item: CartItem,
): readonly CartItem[] => [...items, item];

export const removeItem = (
  items: readonly CartItem[],
  id: string,
): readonly CartItem[] => items.filter((item) => item.id !== id);

// 시간·난수는 인자로 주입받는다 — 그래서 이 함수는 계산으로 남는다
export const expiresAt = (now: number, ttlMs: number): number => now + ttlMs;

// 정렬도 복사본에 대해서만. `[...items]`가 앞에 있으므로 원본은 안전하다
export const sortedByPrice = (
  items: readonly CartItem[],
): readonly CartItem[] => [...items].sort((a, b) => a.price - b.price);
