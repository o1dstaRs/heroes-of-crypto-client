const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const jsxA11yPlugin = require("eslint-plugin-jsx-a11y");
const typescriptPlugin = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
    {
        files: ["game/**/src/**/*.{ts,tsx}"],
        ignores: [
            "game/engine/**/*.ts",
            "docs/**/*.js",
            "game/heroes-of-crypto-common/**/*.{ts,js}",
            "game/core/dist/*.js",
        ],
        plugins: {
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
            "jsx-a11y": jsxA11yPlugin,
            "@typescript-eslint": typescriptPlugin,
        },
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 12,
                sourceType: "module",
                project: "./tsconfig.json", // Adjust this path if necessary
            },
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
        },
        rules: {
            ...typescriptPlugin.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            "selector-id-pattern": "off",
            "max-classes-per-file": "off",
            "no-useless-constructor": "off",
            "@typescript-eslint/no-parameter-properties": "off",
            "new-cap": "off",
            "@typescript-eslint/naming-convention": "off",
            "no-bitwise": "off",
            "no-multi-assign": "off",
            "@typescript-eslint/no-empty-function": "off",
            // Comment out this rule temporarily to see if it resolves the issue
            "@typescript-eslint/explicit-member-accessibility": "error",
            "@typescript-eslint/ban-ts-comment": [
                "error",
                {
                    "ts-ignore": "allow-with-description",
                    "ts-nocheck": true,
                    "ts-check": false,
                    "ts-expect-error": "allow-with-description",
                },
            ],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
];
