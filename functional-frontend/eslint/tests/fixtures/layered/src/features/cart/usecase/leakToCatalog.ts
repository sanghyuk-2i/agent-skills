// 기능 격리 위반: catalog의 공개 API(index.ts)가 아니라 내부 domain/을 직접 참조한다.
// @expect import-x/no-restricted-paths
import { catalogPrice } from "../../catalog/domain/pricing";

export const addCatalogFee = (amount: number): number => amount + catalogPrice;
