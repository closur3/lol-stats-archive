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
    "no-empty": "off",
    "no-unused-vars": "off",
    "no-case-declarations": "off",
    "no-constant-condition": "off"
  }
};
