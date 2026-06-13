import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['integration', 'isolation', 'smoke', 'e2e-full'],
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }],
  },
  moduleNameMapper: {
    '^@vspro/database(.*)$': '<rootDir>/../../../packages/database/src$1',
    '^@vspro/shared(.*)$': '<rootDir>/../../../packages/shared/src$1',
  },
  testEnvironment: 'node',
};

export default config;
