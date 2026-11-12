// Workspace rules that ESLint can't check (module-boundaries skill). Run: npm run lint:workspace
//
// - Every project has exactly one scope:* and one type:* tag, so the module-boundary lint rule
//   applies to it.
// - Apps and e2e projects live in apps/. Libraries live in packages/<scope>/<name>, carry the
//   matching scope tag, and are imported only as @lister/<scope>/<name>, which points at their
//   src/index.ts (no aliases into a library's internals).
// - Every project is linted, and Angular projects include the shared Angular best-practice rules.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import devkit from '@nx/devkit';

const { createProjectGraphAsync, workspaceRoot } = devkit;

const SCOPES = ['web', 'api', 'shared'];
const TYPES = ['app', 'e2e', 'feature', 'ui', 'data-access', 'util'];

const graph = await createProjectGraphAsync({ exitOnError: true });
const { paths = {} } = JSON.parse(
  readFileSync(join(workspaceRoot, 'tsconfig.base.json'), 'utf8'),
).compilerOptions;

const problems = [];
const libraryAliases = new Set();

for (const { name, data } of Object.values(graph.nodes)) {
  const fail = (message) => problems.push(`${name} (${data.root}): ${message}`);
  const tags = data.tags ?? [];
  const scopes = tags
    .filter((t) => t.startsWith('scope:'))
    .map((t) => t.slice(6));
  const types = tags
    .filter((t) => t.startsWith('type:'))
    .map((t) => t.slice(5));

  if (scopes.length !== 1 || !SCOPES.includes(scopes[0])) {
    fail(
      `needs exactly one of scope:${SCOPES.join(', scope:')}; has [${tags}]`,
    );
  }
  if (types.length !== 1 || !TYPES.includes(types[0])) {
    fail(`needs exactly one of type:${TYPES.join(', type:')}; has [${tags}]`);
  }

  const [top, dirScope, dirName, ...deeper] = data.root.split('/');
  if (types[0] === 'app' || types[0] === 'e2e') {
    if (top !== 'apps') fail(`type:${types[0]} projects belong in apps/`);
  } else if (top !== 'packages' || !dirName || deeper.length > 0) {
    fail('libraries belong in packages/<scope>/<name>');
  } else {
    if (dirScope !== scopes[0]) {
      fail(`lives in packages/${dirScope}/ but is tagged scope:${scopes[0]}`);
    }
    const alias = `@lister/${dirScope}/${dirName}`;
    libraryAliases.add(alias);
    const target = paths[alias]?.[0]?.replace(/^\.\//, '');
    if (paths[alias]?.length !== 1 || target !== `${data.root}/src/index.ts`) {
      fail(
        `tsconfig.base.json needs "${alias}": ["./${data.root}/src/index.ts"]`,
      );
    }
  }

  const eslintConfig = join(workspaceRoot, data.root, 'eslint.config.mjs');
  if (!existsSync(eslintConfig)) {
    fail('has no eslint.config.mjs; every project is linted');
  } else {
    const source = readFileSync(eslintConfig, 'utf8');
    if (
      source.includes("'flat/angular'") &&
      !source.includes('angularBestPractices')
    ) {
      fail(
        'eslint.config.mjs must spread angularBestPractices from the root config',
      );
    }
  }
}

for (const alias of Object.keys(paths)) {
  if (!libraryAliases.has(alias)) {
    problems.push(
      `tsconfig.base.json: "${alias}" is not a library's public entry point (@lister/<scope>/<name>)`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Workspace check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `Workspace check passed (${Object.keys(graph.nodes).length} projects).`,
);
