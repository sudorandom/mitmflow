import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
    plugins: {
      "react-refresh": reactRefresh,
      "react": pluginReactConfig
    },
    rules: {
      "react-refresh/only-export-components": "warn",
    },
  },
  ...tseslint.configs.recommended,
  {
    ignores: ["src/gen/**"],
  }
];
