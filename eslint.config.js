const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const jsxA11yPlugin = require("eslint-plugin-jsx-a11y");
const typescriptPlugin = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const globals = require("globals");

/**
 * A unit's stored geometry is the CENTRE of its W x H block, and its identity on the board is the ANCHOR
 * (the top-right cell). `getCellForPosition(gs, unit.getPosition())` names the cell that centre falls in,
 * which IS the anchor only while both sides are at most 2 — for a 2x1 / 1x2 merely because the centre lands
 * exactly on a cell boundary and `floor` breaks the tie towards the anchor. A body three cells deep centres
 * on its MIDDLE cell, so the shortcut silently returns the wrong cell.
 *
 * That reads so naturally as "the unit's cell" that it was written independently in a dozen places across
 * the engine, the server and the client, and every one of them had to be found and fixed by hand. This rule
 * is the guard: ask the unit for `getBaseCell()`, or convert explicitly with
 * `GridMath.getFootprintAnchorForPosition(gs, position, width, height)`.
 */
const FOOTPRINT_GEOMETRY_RESTRICTIONS = [
    {
        selector:
            "CallExpression[callee.property.name='getCellForPosition'] > CallExpression.arguments[callee.property.name='getPosition']",
        message:
            "A unit's position is its footprint CENTRE, not its anchor cell. Use unit.getBaseCell() (or GridMath.getFootprintAnchorForPosition) so a body deeper than 2 cells resolves to the right cell.",
    },
    {
        selector:
            "CallExpression[callee.name='getCellForPosition'] > CallExpression.arguments[callee.property.name='getPosition']",
        message:
            "A unit's position is its footprint CENTRE, not its anchor cell. Use unit.getBaseCell() (or getFootprintAnchorForPosition) so a body deeper than 2 cells resolves to the right cell.",
    },
];

module.exports = [
    {
        files: ["game/**/src/**/*.{ts,tsx}"],
        ignores: [
            "game/engine/**/*.ts",
            "docs/**/*.js",
            "game/heroes-of-crypto-common/**/*.{ts,js}",
            "game/**/dist/**",
            "game/core/src/generated/**",
            "node_modules/**", // Added to ignore node_modules contents
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
                ...globals.node,
                AudioWorkletGlobalScope: "readonly",
                Bun: "readonly",
                console: "readonly",
                expect: "readonly", // silence "console not defined" in non-DOM libs
                describe: "readonly", // silence "console not defined" in non-DOM libs
                it: "readonly", // silence "console not defined" in non-DOM libs
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
            "lines-between-class-members": ["error", "never"],
            "no-restricted-syntax": ["error", ...FOOTPRINT_GEOMETRY_RESTRICTIONS],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
];
