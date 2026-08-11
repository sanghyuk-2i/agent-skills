import rule from "../rules/no-impure-in-calculation.js";
import { createRuleTester } from "./rule-tester.js";

const ruleTester = createRuleTester();

ruleTester.run("no-impure-in-calculation", rule, {
  valid: [
    // 순수한 계산은 통과한다
    "export const total = (items) => items.reduce((sum, i) => sum + i.price, 0);",
    // Math의 순수한 멤버는 액션이 아니다 — 멤버 단위 구분이 동작하는지 확인
    "export const round = (n) => Math.floor(n * 100) / 100;",
    // 인자가 있는 new Date는 계산이다
    "export const parse = (iso) => new Date(iso).getTime();",
    // 지역 변수로 가려진 이름은 전역 액션이 아니다
    "const fetch = (url) => cache[url]; export const get = (u) => fetch(u);",
    // allow 옵션으로 허용한 것은 통과
    {
      code: "export const log = (m) => console.warn(m);",
      options: [{ allow: ["console.warn"] }],
    },
    // 전역 단위 허용
    {
      code: "export const t = () => Date.now();",
      options: [{ allow: ["Date.now"] }],
    },
  ],
  invalid: [
    {
      code: "export const id = () => Math.random().toString(36);",
      errors: [{ messageId: "impure" }],
    },
    {
      code: "export const stamp = (e) => ({ ...e, at: Date.now() });",
      errors: [{ messageId: "impure" }],
    },
    {
      code: "export const now = () => new Date();",
      errors: [{ messageId: "impure" }],
    },
    {
      code: "export const load = (url) => fetch(url).then((r) => r.json());",
      errors: [{ messageId: "impure" }],
    },
    {
      code: "export const theme = () => localStorage.getItem('theme');",
      errors: [{ messageId: "impure" }],
    },
    {
      code: "export const w = () => window.innerWidth;",
      errors: [{ messageId: "impure" }],
    },
    // 메시지가 실제로 다음 행동을 안내하는지 (이 규칙의 존재 이유)
    {
      code: "export const id = () => Math.random();",
      options: [{ actionLayer: "shell/" }],
      errors: [
        {
          message:
            "`Math.random`은(는) 액션입니다 (난수 — 호출마다 값이 달라짐). 이 파일은 계산 영역이라 순수해야 합니다. 이 값을 함수 인자로 주입받거나, 이 로직을 shell/(으)로 옮기세요.",
        },
      ],
    },
  ],
});
