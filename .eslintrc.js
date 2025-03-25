module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'security'],
    extends: ['plugin:@typescript-eslint/recommended'],
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': ['error', {
            allowExpressions: true
        }],
        'security/detect-object-injection': 'warn',
        'security/detect-non-literal-fs-filename': 'warn',
        'security/detect-non-literal-regexp': 'warn',
        'security/detect-unsafe-regex': 'error',
        'security/detect-buffer-noassert': 'error',
        'security/detect-child-process': 'warn',
        'security/detect-eval-with-expression': 'error'
    }
};
