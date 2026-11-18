---
name: best-practices
description: Current best practices and the newest stable framework features for Lister's installed versions (Angular 22, NestJS 11 on Express 5, TypeScript 6, Node 26, Vitest 4, Playwright 1.65, Nx 24, Zod 4). Use every time you write or change code, before you pick an API, pattern or package, and when reviewing code for outdated patterns.
---

# Best practices for the installed stack

Frameworks move faster than training data. Write code for the versions installed here, not the
ones you remember, and use the newest **stable** way of doing things.

## Before you write code

1. **Check the installed version** of what you're about to use:
   `node -p "require('<pkg>/package.json').version"`. Planned packages arrive with their task
   (CLAUDE.md lists them); take their current major unless the design pins one.
2. **Read the version-matched guidance shipped in `node_modules`:**
   - Angular: `node_modules/@angular/core/resources/best-practices.md`. Read it before any Angular
     work. It's written for the installed version and beats habit. For example: OnPush is the
     default, new singleton services use `@Service()`, and Signal Forms are stable.
   - Nx: `node_modules/@nx/<plugin>/PLUGIN.md` where it exists, and the `nx_docs` MCP tool for
     configuration questions.
3. **Check the API in its typings** (`node_modules/<pkg>/**/*.d.ts`). Is it exported, and is it
   marked `@deprecated`, `@experimental` or `@developerPreview`? Angular marks stable APIs with
   `@publicApi <version>`.
4. **When unsure what's current**, read the official docs for the installed major (angular.dev,
   material.angular.dev, docs.nestjs.com, vitest.dev, playwright.dev, zod.dev, orm.drizzle.team,
   dexie.org, socket.io/docs/v4), or the release notes for versions newer than you know. Use
   WebFetch rather than guessing.

## Rules

- Stable APIs first. Use a developer-preview or experimental API only when nothing stable does
  the job, and say so in the commit message and the task's notes.
- When the framework offers an old way and a new way, use the new one (signal inputs over
  `@Input`, `@for` over `*ngFor`, and so on). Never add anything deprecated.
- Don't add a dependency for something the platform or an installed package already does
  (`fetch`, `structuredClone`, `crypto.randomUUID()`, `AbortSignal.timeout()`, Web Locks,
  `Intl`). A dependency that isn't on CLAUDE.md's planned list needs the user's OK. It must be
  maintained, typed and ESM, and it must install without peer conflicts.
- Lint is part of the standard: `@nx/enforce-module-boundaries`, the Angular rules in
  `angularBestPractices` (root `eslint.config.mjs`), and Prettier. Fix what they report. Never
  disable a rule inline to get green.
- When you touch code that causes a deprecation warning in the build, tests or lint, fix the
  warning.

## Reading code and command output (keeps sessions small)

Every call resends the whole session, so whatever you read stays expensive until the session
ends.

- Find the place first (`grep -n`, `nx show project`), then read about 80 lines around it
  (`Read` with `offset`/`limit`). Don't `cat` or `sed -n` a whole file over 300 lines, and
  don't read the same file or report twice.
- Pipe long command output through `tail -40` or `grep` for the failures (tests, e2e, builds,
  `git log`: `--oneline`, `-n`). Use `git diff --stat` before a full diff.
- `TASKS.md` and `docs/design.md` are long: read them by heading (`grep -n '^#'`).

## Where the framework rules are

- Angular: the `angular-feature` skill (and the bundled best-practices file above).
- NestJS 11 on Express 5: the `nest-feature` skill.
- Writing tests: the `testing` skill.
- Zod 4 (`zod/mini`), Drizzle, Dexie and Socket.IO: [libraries.md](libraries.md), when you
  touch one of them.

## TypeScript 6 and Node 26

- Strict mode with no escape hatches:
  - No `any`: use `unknown` and narrow it.
  - No `@ts-ignore`; at most an `@ts-expect-error` with an explanation.
  - `!` only when it's provably safe.
- **Idioms:**
  - `satisfies` for typed literals, and `import type` for type-only imports.
  - `as const` objects or string-literal unions instead of `enum`.
  - `readonly` by default.
  - Discriminated unions for states: `{ status: 'loading' } | { status: 'ready'; value: T }`.
- **Built-ins:**
  - Use the ones the target supports. `lib` in `tsconfig.base.json` is es2022 today.
  - Check Angular's supported browsers before reaching for newer built-ins such as
    `Object.groupBy`, `Set` methods or iterator helpers.
  - Raise `lib` in the task that needs it, if the supported browsers have the feature.
- **Node 26 on the server:**
  - Global `fetch`.
  - `crypto.argon2` for password hashes.
  - `node:` prefixes for built-ins.
  - `AbortSignal` for timeouts.

## Nx 24

- Use generators instead of hand-written project config, with a dry run first.
- `nx show project <name>` lists the inferred targets, and `nx affected` scopes work to the
  change.
- `nx graph` shows the dependencies.
- Upgrade only with `nx migrate`.
- Where code goes is in the `module-boundaries` skill.
