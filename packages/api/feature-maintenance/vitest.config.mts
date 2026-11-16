import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/api/feature-maintenance',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-feature-maintenance',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/packages/api/feature-maintenance',
      provider: 'v8' as const,
    },
  },
}));
