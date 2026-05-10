import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import noOnlyTests from "eslint-plugin-no-only-tests";
import tseslint from "typescript-eslint";

const strictTypeChecked = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts"],
}));

export default tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-console": "error",
    },
  },
  ...strictTypeChecked,
  {
    files: ["**/*.ts"],
    plugins: {
      import: importPlugin,
      "no-only-tests": noOnlyTests,
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-only-tests/no-only-tests": [
        "error",
        { block: ["test", "it", "describe"], focus: ["only", "skip"] },
      ],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      "import/no-restricted-paths": [
        "error",
        {
          zones: [{ target: "./src/features/*", from: "./src/features/*", except: ["./index.ts"] }],
        },
      ],
      "no-console": "error",
    },
  },
);
