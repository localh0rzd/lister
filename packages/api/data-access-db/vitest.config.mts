import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/api/data-access-db',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-data-access-db',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/packages/api/data-access-db',
      provider: 'v8' as const,
    },
  },
}));
