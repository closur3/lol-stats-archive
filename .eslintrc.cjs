module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  globals: {
    HTMLRewriter: "readonly",
    caches: "readonly"
  },
  rules: {
    "no-empty": ["warn", { "allowEmptyCatch": true }],
    "no-unused-vars": "error",
    "no-case-declarations": "warn",
    "no-constant-condition": ["warn", { "checkLoops": false }]
  }
};
