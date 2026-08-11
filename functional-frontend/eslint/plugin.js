import noImpureInCalculation from "./rules/no-impure-in-calculation.js";
import noImplicitInput from "./rules/no-implicit-input.js";
import noActionCalculationMix from "./rules/no-action-calculation-mix.js";
import preferCopyOnWrite from "./rules/prefer-copy-on-write.js";

/**
 * "쏙쏙 들어오는 함수형 코딩"의 원칙 중 기존 ESLint 플러그인으로
 * 표현할 수 없는 것만 담은 플러그인.
 *
 * 불변성(`functional/immutable-data`)이나 계층 경계(`import-x/no-restricted-paths`)처럼
 * 이미 잘 만들어진 규칙이 있는 것은 여기서 다시 만들지 않는다.
 */
const plugin = {
  meta: {
    name: "eslint-plugin-functional-frontend",
    version: "0.1.0",
  },
  rules: {
    "no-impure-in-calculation": noImpureInCalculation,
    "no-implicit-input": noImplicitInput,
    "no-action-calculation-mix": noActionCalculationMix,
    "prefer-copy-on-write": preferCopyOnWrite,
  },
};

export default plugin;
