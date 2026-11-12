// @ts-check
/**
 * Local Nx plugin: infers a `typecheck` target for every project.
 *
 * Builds type-check only through an app's own tsconfig, and Vitest doesn't type-check at all,
 * so a library's stricter options and stale types in specs could go unnoticed. The target runs
 * `tsc --noEmit` on each `tsconfig.*.json` of the project (lib/app and spec), or on its
 * `tsconfig.json` when there are no others (e.g. the Playwright project). New libraries get it
 * without any configuration.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** @type {import('nx/src/project-graph/plugins').CreateNodes<{ targetName?: string }>} */
export const createNodes = [
  '**/project.json',
  (projectFiles, options, context) => {
    const targetName = options?.targetName ?? 'typecheck';
    return projectFiles.flatMap((projectFile) => {
      const root = dirname(projectFile);
      const files = readdirSync(join(context.workspaceRoot, root));
      let configs = files.filter((f) => /^tsconfig\..+\.json$/.test(f)).sort();
      if (configs.length === 0 && files.includes('tsconfig.json')) {
        configs = ['tsconfig.json'];
      }
      if (configs.length === 0) return [];
      return [
        [
          projectFile,
          {
            projects: {
              [root]: {
                targets: {
                  [targetName]: {
                    executor: 'nx:run-commands',
                    cache: true,
                    inputs: [
                      'default',
                      '^production',
                      '{workspaceRoot}/tsconfig.base.json',
                      { externalDependencies: ['typescript'] },
                    ],
                    outputs: [],
                    options: {
                      cwd: root,
                      commands: configs.map((c) => `tsc --noEmit -p ${c}`),
                      parallel: false,
                    },
                    metadata: {
                      description: `Type-checks ${configs.join(', ')} with tsc --noEmit.`,
                    },
                  },
                },
              },
            },
          },
        ],
      ];
    });
  },
];
