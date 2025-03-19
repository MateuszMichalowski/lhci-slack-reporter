module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: [],
    extends: ['plugin:@typescript-eslint/recommended'],
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': ['error', {
            allowExpressions: true
        }]
    }
};
