import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/postgres.setup.ts'],
    setupFiles: ['./test/environment.setup.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
