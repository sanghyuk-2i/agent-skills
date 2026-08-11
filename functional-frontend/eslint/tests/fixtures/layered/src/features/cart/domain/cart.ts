// 의도적 위반 모음. 표시 주석 다음 줄에 그 규칙의 위반이 있어야 한다.
import type { CartItem } from "../data/types";

// 모듈 스코프 가변 변수 — 이 파일 모든 함수의 숨은 인자
// @expect functional-frontend/no-implicit-input
let taxRate = 0.1;

export const setTaxRate = (rate: number): void => {
  taxRate = rate;
};

export const withTax = (price: number): number => price * (1 + taxRate);

export const addItem = (items: CartItem[], item: CartItem): CartItem[] => {
  // @expect functional-frontend/prefer-copy-on-write
  items.push(item);
  return items;
};

export const newId = (): string =>
  // @expect functional-frontend/no-impure-in-calculation
  Math.random().toString(36).slice(2);

export const stampedAt = (item: CartItem) => ({
  ...item,
  // @expect functional-frontend/no-impure-in-calculation
  at: Date.now(),
});
