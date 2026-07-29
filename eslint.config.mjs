import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["apps/**/*.ts", "packages/**/*.ts"],
  ignores: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
  ],
  extends: [tseslint.configs.recommended],
  rules: {
    // Relax rules that produce too much noise on an existing codebase
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/ban-ts-comment": "off",
  },
});
