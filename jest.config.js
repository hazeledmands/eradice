const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  // `jose` (v6) ships ESM only — there is no CJS build to fall back to — so it
  // has to be transformed rather than ignored like the rest of node_modules.
  // This replaces next/jest's default, whose first entry is a bare
  // '/node_modules/'; the second entry is that default's CSS-module rule and
  // must be kept.
  transformIgnorePatterns: [
    '/node_modules/(?!jose/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)

