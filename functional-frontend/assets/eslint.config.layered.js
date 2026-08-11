// 프로젝트 루트에 `eslint.config.js`로 복사해 쓴다.
//
// 전제: 이 스킬의 `eslint/` 디렉터리를 프로젝트에 복사해 둔다.
//   cp -r <스킬경로>/eslint <프로젝트>/eslint-functional-frontend
//   rm -rf eslint-functional-frontend/{tests,node_modules,package-lock.json}
//   (tests/에는 규칙 검증용으로 일부러 깨뜨린 파일이 들어 있다)
//
// 의존성:
//   npm i -D eslint eslint-plugin-functional eslint-plugin-import-x typescript-eslint
import tseslint from "typescript-eslint";
import fp from "./eslint-functional-frontend/index.js";

export default [
  { ignores: ["dist/**", "build/**", "coverage/**", "eslint-functional-frontend/**"] },

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        location: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        crypto: "readonly",
        Response: "readonly",
        Request: "readonly",
        AbortController: "readonly",
        structuredClone: "readonly",
      },
    },
  },

  // ── 함수형 프론트엔드 규칙 ────────────────────────────────────────
  ...fp.layered({
    src: "src",       // 소스 루트
    strict: true,     // false로 두면 전부 warn — 도입 초기에 유용
    allow: [],        // 계산 영역에서 예외로 허용할 액션. 예: ["console.warn"]
    typeAware: false, // true면 tsconfig 연결(아래 주석)이 필요하고 느려진다
  }),

  // ── 테스트 파일은 예외 ────────────────────────────────────────────
  // 테스트는 시간을 고정하고 가짜 응답을 만드는 게 일이라 순수할 수 없다.
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**"],
    rules: {
      "functional-frontend/no-impure-in-calculation": "off",
      "functional-frontend/no-implicit-input": "off",
      "functional-frontend/no-action-calculation-mix": "off",
    },
  },

  // ── tsconfig의 path 별칭(`@/features/...`)을 쓴다면 ──────────────
  // npm i -D eslint-import-resolver-typescript
  // 아래 주석을 풀면 프리셋의 기본 resolver를 덮어쓴다.
  // { settings: { "import-x/resolver": { typescript: true } } },

  // ── typeAware: true로 켤 때 함께 필요한 설정 ─────────────────────
  // {
  //   files: ["**/*.{ts,tsx}"],
  //   languageOptions: {
  //     parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  //   },
  // },
];
