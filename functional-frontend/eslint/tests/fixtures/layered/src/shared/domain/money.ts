// shared/domain/: 계산만. 위반이 없어야 하는 파일이다.
import { SHIPPING_FEE, TAX_RATE } from "../data/money";

export const tax = (amount: number): number => Math.round(amount * TAX_RATE);

export const shipping = (amount: number, freeThreshold: number): number =>
  amount >= freeThreshold ? 0 : SHIPPING_FEE;
