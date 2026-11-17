import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/shared/list-transfer',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'shared-list-transfer',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/packages/shared/list-transfer',
      provider: 'v8' as const,
    },
  },
}));
