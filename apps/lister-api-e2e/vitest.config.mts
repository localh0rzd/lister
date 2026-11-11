import { defineConfig } from 'vitest/config';

// HTTP-level tests against a running lister-api.
// `nx e2e lister-api-e2e` starts the API first (see project.json dependsOn).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/lister-api-e2e',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'lister-api-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['./src/support/global-setup.ts'],
    setupFiles: ['./src/support/test-setup.ts'],
    fileParallelism: false,
    reporters: ['default'],
  },
}));
