import rule from "../rules/no-implicit-input.js";
import { createRuleTester } from "./rule-tester.js";

const ruleTester = createRuleTester();

ruleTester.run("no-implicit-input", rule, {
  valid: [
    // 모든 입력이 인자로 드러난 계산
    "export const applyDiscount = (price, rate) => price * (1 - rate);",
    // const 상수는 재할당될 수 없으니 암묵적 "입력"이 아니다
    "const TAX = 0.1;\nexport const withTax = (p) => p * (1 + TAX);",
    "const RATES = { gold: 0.2 };\nexport const rate = (t) => RATES[t];",
    // 함수 안에서만 쓰이는 가변 변수는 밖에서 보이지 않으므로 문제없다
    "export const sum = (xs) => { let acc = 0; for (const x of xs) acc += x; return acc; };",
    // 인자로 받은 값을 쓰는 중첩 함수는 클로저지만 암묵적 입력이 아니다
    "export const make = (rate) => (p) => p * rate;",
    // ignorePattern
    {
      code: "let _debug = false;",
      options: [{ ignorePattern: "^_" }],
    },
  ],
  invalid: [
    // 모듈 스코프 가변 변수 — 파일 전체의 숨은 인자
    {
      code: "let taxRate = 0.1;\nexport const withTax = (p) => p * (1 + taxRate);",
      errors: [{ messageId: "moduleScopeMutable" }],
    },
    {
      code: "var cache = {};\nexport const get = (k) => cache[k];",
      errors: [{ messageId: "moduleScopeMutable" }],
    },
    // 선언 지점에서 한 번만 보고해야 한다 — 참조마다 보고하면 노이즈가 된다
    {
      code: "let n = 0;\nexport const a = () => n;\nexport const b = () => n;\nexport const c = () => n;",
      errors: [{ messageId: "moduleScopeMutable" }],
    },
    // 클로저로 가둔 가변 상태 = 숨은 인자
    {
      code: "export const makeCounter = () => { let n = 0; return () => ++n; };",
      errors: [{ messageId: "closureMutable" }],
    },
  ],
});
