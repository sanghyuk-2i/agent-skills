import rule from "../rules/no-action-calculation-mix.js";
import { createRuleTester } from "./rule-tester.js";

const ruleTester = createRuleTester();

ruleTester.run("no-action-calculation-mix", rule, {
  valid: [
    // 부수효과가 없으면 섞임이 아니다 (계산 파일은 다른 규칙이 담당)
    `export const total = (items) => {
       const subtotal = items.reduce((s, i) => s + i.price, 0);
       const tax = subtotal * 0.1;
       const shipping = subtotal > 50000 ? 0 : 3000;
       return subtotal + tax + shipping;
     };`,
    // 계산이 이미 추출된 이상적인 액션 — 이게 우리가 원하는 형태다
    `import { total } from './total.js';
     export const checkout = async (items) => {
       await fetch('/api/order', { method: 'POST', body: String(total(items)) });
     };`,
    // 부수효과 + 순수 구문 2줄 = 임계치(3) 미만
    `export const save = async (items) => {
       const subtotal = items.reduce((s, i) => s + i.price, 0);
       const tax = subtotal * 0.1;
       await fetch('/api/order', { method: 'POST', body: String(subtotal + tax) });
     };`,
    // 임계치를 올리면 보고하지 않는다
    {
      code: `export const save = async (items) => {
         const subtotal = items.reduce((s, i) => s + i.price, 0);
         const tax = subtotal * 0.1;
         const shipping = subtotal > 50000 ? 0 : 3000;
         const total = subtotal + tax + shipping;
         await fetch('/api/order', { method: 'POST', body: String(total) });
       };`,
      options: [{ threshold: 10 }],
    },
  ],
  invalid: [
    // 액션 하나에 계산 4줄이 붙어 있다 — 추출 대상
    {
      code: `export const checkout = async (items) => {
         const subtotal = items.reduce((s, i) => s + i.price, 0);
         const tax = subtotal * 0.1;
         const shipping = subtotal > 50000 ? 0 : 3000;
         const total = subtotal + tax + shipping;
         await fetch('/api/order', { method: 'POST', body: String(total) });
       };`,
      errors: [{ messageId: "mixed" }],
    },
    {
      code: `export function report(events) {
         const valid = events.filter((e) => e.ok);
         const names = valid.map((e) => e.name);
         const unique = [...new Set(names)];
         console.log(unique.join(', '));
       }`,
      errors: [{ messageId: "mixed" }],
    },
  ],
});
