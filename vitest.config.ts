import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    // A few tests play a whole game for several seeds. On a busy machine they need more than the 5
    // seconds a test gets by default (the climb tests took about 20 each at a load average of 143).
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
