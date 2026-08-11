import rule from "../rules/prefer-copy-on-write.js";
import { createRuleTester } from "./rule-tester.js";

const ruleTester = createRuleTester();

ruleTester.run("prefer-copy-on-write", rule, {
  valid: [
    // 새 값을 돌려주는 함수들 — 원본은 그대로다
    "export const add = (xs, x) => [...xs, x];",
    "export const drop = (xs, id) => xs.filter((x) => x.id !== id);",
    // 즉석 복사본을 바꾸는 건 원본에 영향이 없다
    "export const sorted = (xs) => [...xs].sort((a, b) => a - b);",
    "export const rev = (xs) => xs.slice().reverse();",
    "export const s = (xs) => xs.map((x) => x.n).sort();",
    // 같은 함수 안에서 만든 복사본을 지역 변수에 담아 바꾸는 것도 같은 이야기
    `export const sorted = (xs) => {
       const copy = [...xs];
       copy.sort((a, b) => a - b);
       return copy;
     };`,
    // 새로 만든 배열
    "export const range = (n) => { const out = []; return out; };",
    // ES2023의 비파괴 메서드
    "export const s = (xs) => xs.toSorted();",
    // Map/Set은 기본적으로 검사하지 않는다 (이름 충돌이 잦아서)
    "export const h = (headers, v) => headers.set('x', v);",
  ],
  invalid: [
    // 인자로 받은 배열은 호출자의 것이다
    {
      code: "export const add = (xs, x) => { xs.push(x); return xs; };",
      errors: [{ messageId: "mutation" }],
    },
    {
      code: "export const s = (xs) => xs.sort((a, b) => a - b);",
      errors: [{ messageId: "mutation" }],
    },
    {
      code: "export const r = (xs) => { xs.splice(0, 1); };",
      errors: [{ messageId: "mutation" }],
    },
    // 모듈 스코프 배열은 파일 전체가 공유하므로 소유가 아니다
    {
      code: "const log = []; export const record = (e) => log.push(e);",
      errors: [{ messageId: "mutation" }],
    },
    // 바깥 함수에서 만든 복사본은 다른 곳에서도 볼 수 있다
    {
      code: `export const make = (xs) => {
         const copy = [...xs];
         return () => copy.push(1);
       };`,
      errors: [{ messageId: "mutation" }],
    },
    // 옵션을 켜면 Map/Set도 검사한다
    {
      code: "export const put = (m, k, v) => m.set(k, v);",
      options: [{ checkCollections: true }],
      errors: [{ messageId: "mutation" }],
    },
    // 메시지가 대안을 제시하는지
    {
      code: "export const add = (items, x) => items.push(x);",
      errors: [
        {
          message:
            "`push`는 원본을 제자리에서 바꿉니다. 원본은 두고 복사본을 바꾸세요 — 예: `[...items].push(…)` 또는 `items.filter(…)` 같은 새 값을 돌려주는 함수.",
        },
      ],
    },
  ],
});
