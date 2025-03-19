module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'jest'],
    extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:jest/recommended'
    ],
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': ['error', {
            allowExpressions: true
        }]
    }
};
