import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/api/feature-spaces',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-feature-spaces',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/packages/api/feature-spaces',
      provider: 'v8' as const,
    },
  },
}));
