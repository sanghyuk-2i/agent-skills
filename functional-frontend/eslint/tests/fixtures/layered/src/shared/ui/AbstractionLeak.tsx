// 추상화 벽 위반: shared/ui/가 shared/shell/의 구현을 직접 안다.
// @expect import-x/no-restricted-paths
import { postJson } from "../shell/http";

export const PingButton = () => {
  const onClick = () => postJson("/api/ping", "{}");
  return { onClick };
};
