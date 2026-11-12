import nx from '@nx/eslint-plugin';

// npm packages that belong to one side only. They are banned on the other side and in shared
// code, so frameworks can't leak across scopes, not even through a library in between
// (module-boundaries skill).
const apiOnlyPackages = [
  '@nestjs/*',
  'express',
  'better-sqlite3',
  'drizzle-orm*',
  'drizzle-kit',
  'socket.io',
  'class-validator',
  'class-transformer',
  '@simplewebauthn/server',
];
const webOnlyPackages = ['@angular/*', 'dexie*', '@simplewebauthn/browser'];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // Strict on purpose: when this rule complains, move the code, don't relax the rule
      // (module-boundaries skill).
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          // Every npm package a project imports must be a direct dependency in package.json.
          banTransitiveDependencies: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // scope: which side a project belongs to. shared is usable by everyone.
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
              bannedExternalImports: apiOnlyPackages,
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
              bannedExternalImports: webOnlyPackages,
            },
            {
              // Plain TypeScript and Zod only (CLAUDE.md, docs/design.md §5).
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
              bannedExternalImports: [
                ...apiOnlyPackages,
                ...webOnlyPackages,
                'rxjs*',
                'reflect-metadata',
                'socket.io-client',
                'axios',
              ],
            },
            // type: layering. apps -> feature -> ui/data-access -> util.
            { sourceTag: 'type:e2e', onlyDependOnLibsWithTags: ['type:util'] },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:util',
              ],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:util',
              ],
            },
            {
              // Presentational only: inputs and outputs, no fetching, storage or sync.
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:util'],
              bannedExternalImports: [
                '@angular/common/http*',
                'dexie*',
                'socket.io-client',
              ],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:data-access', 'type:util'],
            },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
            {
              // Web features reach the local database and the sync engine only through the
              // data-access libraries.
              allSourceTags: ['scope:web', 'type:feature'],
              bannedExternalImports: ['dexie*', 'socket.io-client'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];

// Angular 22 best practices that lint can check without type information (best-practices
// skill). Every Angular project's eslint.config.mjs spreads this after the Nx Angular configs;
// `npm run lint:workspace` fails if one doesn't.
export const angularBestPractices = [
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-signal-model': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-service-decorator': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/computed-must-return': 'error',
      '@angular-eslint/no-async-lifecycle-method': 'error',
      '@angular-eslint/no-lifecycle-call': 'error',
    },
  },
  {
    files: ['**/*.html'],
    rules: {
      '@angular-eslint/template/prefer-ngsrc': 'error',
      '@angular-eslint/template/prefer-class-binding': 'error',
      '@angular-eslint/template/prefer-style-binding': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/prefer-at-else': 'error',
      '@angular-eslint/template/prefer-contextual-for-variables': 'error',
      '@angular-eslint/template/button-has-type': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'error',
      '@angular-eslint/template/no-any': 'error',
    },
  },
];
