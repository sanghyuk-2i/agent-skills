// data/ 계층: 사실의 기록. 타입과 상수만 있고 아무것도 import 하지 않는다.
export type CartItem = {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
};

export type Order = {
  readonly id: string;
  readonly items: readonly CartItem[];
  readonly placedAt: number;
};

export const FREE_SHIPPING_THRESHOLD = 50_000;
