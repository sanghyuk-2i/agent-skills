import { RuleTester } from "eslint";
import { describe, it } from "node:test";

// RuleTester는 전역 `describe`/`it`이 있으면 그걸 쓰고 없으면 즉시 throw 한다.
// node:test는 이들을 전역으로 노출하지 않으므로 직접 연결해줘야
// 실패한 케이스가 개별 테스트로 보고된다.
RuleTester.describe = describe;
RuleTester.it = it;

/** 프리셋이 실제로 적용될 환경(ESM + 브라우저 전역)에 맞춘 기본 RuleTester. */
export function createRuleTester(overrides = {}) {
  return new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
      },
      ...overrides,
    },
  });
}
