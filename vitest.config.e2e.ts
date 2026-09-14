import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Suites share the disposable database; auth exercises first-user registration.
    fileParallelism: false,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/postgres.setup.ts'],
    setupFiles: ['./test/environment.setup.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
