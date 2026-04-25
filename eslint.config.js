import eslint from "@eslint/js";

export default [
  {
    ignores: ["node_modules/", ".wrangler/", "tests/", "coverage/"]
  },
  eslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        fetch: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        HTMLRewriter: "readonly",
        caches: "readonly",
        crypto: "readonly"
      }
    },
    rules: {
      "no-empty": ["warn", { "allowEmptyCatch": true }],
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-case-declarations": "warn",
      "no-constant-condition": ["warn", { "checkLoops": false }]
    }
  }
];