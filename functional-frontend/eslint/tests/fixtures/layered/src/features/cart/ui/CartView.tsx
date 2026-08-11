// 추상화 벽 위반: 컴포넌트가 shell/의 구현을 직접 안다.
// @expect import-x/no-restricted-paths
import { postOrder } from "../shell/orderApi";
import { total } from "../domain/pricing";
import type { CartItem } from "../data/types";

export const CartView = ({ items }: { items: readonly CartItem[] }) => {
  const onCheckout = () => postOrder(String(total(items)));
  return { items, onCheckout };
};
