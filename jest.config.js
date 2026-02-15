/** @type {import('ts-jest').JestConfigWithTsJest} */
require('dotenv').config({ path: '.env.local' }); // Load .env.local first
require('dotenv').config(); // Load .env as fallback

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};