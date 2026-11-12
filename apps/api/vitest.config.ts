import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', '../web/src/**/*.spec.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    // Load .env so tests that use createKnex() (which reads process.env.DATABASE_URL)
    // can connect to the dev/test database.
    setupFiles: ['./vitest.setup.ts'],
  },
});
