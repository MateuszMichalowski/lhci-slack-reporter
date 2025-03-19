module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.ts'],
    collectCoverage: true,
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1'
    }
};
