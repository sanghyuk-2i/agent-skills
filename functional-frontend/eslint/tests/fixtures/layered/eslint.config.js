import tseslint from "typescript-eslint";
import fp from "../../../index.js";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        fetch: "readonly",
        Response: "readonly",
        console: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
      },
    },
  },
  ...fp.layered({ src: "src", strict: true }),
];
