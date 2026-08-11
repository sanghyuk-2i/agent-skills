// shared/shell/: 공통 액션. fetch·시간이 허용된다.
export const postJson = (url: string, body: string): Promise<Response> =>
  fetch(url, { method: "POST", body });
