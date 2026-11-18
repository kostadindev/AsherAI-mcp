import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The bin files are three-line entry points, exercised by the stdio test in a child process.
      exclude: ['src/bin/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, branches: 80, functions: 90, statements: 90 },
    },
  },
});
