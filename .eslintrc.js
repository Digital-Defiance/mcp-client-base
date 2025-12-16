module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    // Allow 'any' in specific contexts where it's necessary
    "@typescript-eslint/no-explicit-any": [
      "warn",
      {
        // Allow 'any' in rest parameters (like ...args: any[])
        ignoreRestArgs: true,
      },
    ],
    // Allow unused vars that start with underscore
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
  overrides: [
    {
      // More lenient rules for test files
      files: ["**/*.test.ts", "**/*.property.test.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
