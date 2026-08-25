/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup/env.setup.ts'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/modules/patient-identity/**/*.ts',
    'src/middlewares/**/*.ts',
    'src/utils/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
