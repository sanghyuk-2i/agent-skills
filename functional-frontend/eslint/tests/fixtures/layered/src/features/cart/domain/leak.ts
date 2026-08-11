// 계층 경계 위반: domain/이 shell/을 참조하면 순수성이 무너진다.
// @expect import-x/no-restricted-paths
import { postOrder } from "../shell/orderApi";

export const send = (payload: string) => postOrder(payload);
