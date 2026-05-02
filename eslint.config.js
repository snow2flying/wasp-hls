const path = require("path");
const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");
const tsParser = require("@typescript-eslint/parser");

const baseConfig = require("./.eslintrc.js");
const tsTransmuxConfig = require("./src/ts-transmux/.eslintrc.js");
const demoConfig = require("./demo/.eslintrc.js");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const {
  parserOptions: _ignoredParserOptions,
  ...baseConfigWithoutParserOptions
} = baseConfig;

module.exports = [
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "demo/build/**",
      "**/.eslintrc.js",
      "**/tsconfig.json",
    ],
  },
  ...compat.config(baseConfigWithoutParserOptions),
  {
    files: ["src/ts-main/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        tsconfigRootDir: path.join(__dirname, "src/ts-main"),
      },
    },
  },
  {
    files: ["src/ts-worker/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        tsconfigRootDir: path.join(__dirname, "src/ts-worker"),
      },
    },
  },
  {
    files: ["src/ts-transmux/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        tsconfigRootDir: path.join(__dirname, "src/ts-transmux"),
      },
    },
    rules: tsTransmuxConfig.rules,
  },
  {
    files: ["src/ts-common/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "../ts-worker/tsconfig.json",
        sourceType: "module",
        tsconfigRootDir: path.join(__dirname, "src/ts-common"),
      },
    },
  },
  {
    files: ["demo/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        tsconfigRootDir: path.join(__dirname, "demo"),
      },
    },
    rules: demoConfig.rules,
  },
];
