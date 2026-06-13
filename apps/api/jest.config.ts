import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@vspro/database(.*)$': '<rootDir>/../../packages/database/src$1',
    '^@vspro/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
  },
  // Grupos de tests separados por tipo
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/**/*.spec.ts'],
      testPathIgnorePatterns: ['integration', 'isolation', 'smoke', 'e2e-full'],
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/**/*.integration.spec.ts'],
      globalSetup: './src/__tests__/setup/integration.setup.ts',
      globalTeardown: './src/__tests__/setup/integration.teardown.ts',
    },
    {
      displayName: 'isolation',
      testMatch: ['<rootDir>/**/*.isolation.spec.ts'],
      globalSetup: './src/__tests__/setup/integration.setup.ts',
      globalTeardown: './src/__tests__/setup/integration.teardown.ts',
    },
  ],
};

export default config;
