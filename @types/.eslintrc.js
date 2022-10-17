module.exports = {
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:@typescript-eslint/strict"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": [`$(__dirname)/../tsconfig.json`]
  },
  "plugins": ["@typescript-eslint"],
  "rules": {
    "comma-dangle": "off",
    "@typescript-eslint/comma-dangle": ["error", "always-multiline"],

    "indent": "off",
    "@typescript-eslint/indent": ["error", 2, {"SwitchCase": 1}],

    "no-console": "error",
    "no-empty": ["error", {"allowEmptyCatch": true}],
    "@typescript-eslint/no-explicit-any": "off",
    "no-var": "off",

    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", {"argsIgnorePattern": "^_"}],

    "quotes": "off",
    "@typescript-eslint/quotes": ["error", "double"],

    "semi": "off",
    "@typescript-eslint/semi": ["error", "always"]
  }
};
