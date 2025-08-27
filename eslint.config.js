const {
    defineConfig,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const security = require("eslint-plugin-security");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,
    },

    plugins: {
        "@typescript-eslint": typescriptEslint,
        security,
    },

    extends: compat.extends("plugin:@typescript-eslint/recommended"),

    rules: {
        "@typescript-eslint/no-explicit-any": "off",

        "@typescript-eslint/explicit-function-return-type": ["error", {
            allowExpressions: true,
        }],

        "security/detect-object-injection": "warn",
        "security/detect-non-literal-fs-filename": "warn",
        "security/detect-non-literal-regexp": "warn",
        "security/detect-unsafe-regex": "error",
        "security/detect-buffer-noassert": "error",
        "security/detect-child-process": "warn",
        "security/detect-eval-with-expression": "error",
    },
}]);
