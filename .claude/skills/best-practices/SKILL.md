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

## Angular 22 (`lister-web`, `packages/web/*`)

Follow everything in the bundled best-practices file, plus:

- **Components:**
  - Standalone is the default, so never write `standalone: true`.
  - OnPush is the default, so don't set `changeDetection`, and never use `Eager`.
  - Use `input()`, `input.required()`, `output()` and `model()`, and the signal queries
    `viewChild()`, `viewChildren()` and `contentChild()`.
  - Put host bindings in `host: {}`.
  - Import only what the template uses (no `CommonModule`).
  - Templates and style sheets always live in their own files (`templateUrl`, `styleUrl`), never inline, however small. A component with no styles gets no empty `.scss`.
  - Use `NgOptimizedImage` for images.
- **State:**
  - `signal`, `computed` and `linkedSignal`. Change state with `set` or `update`, never by
    mutating in place.
  - `effect()` only for side effects that leave Angular (storage, logging, DOM APIs).
    `afterRenderEffect()` when the effect touches the DOM.
  - No `NgZone`, and no `setTimeout` to trigger change detection: the app is zoneless.
- **Async data:**
  - `httpResource()` for HTTP reads; `resource()` or `rxResource()` for other async reads. Both
    are stable since v22.
  - `toSignal()` to bridge an observable.
  - Writes go through `HttpClient` in a service.
  - Synced data is different: it goes through repositories and mutations only (CLAUDE.md).
- **DI:** use `inject()`. New singleton services use `@Service()` instead of
  `@Injectable({ providedIn: 'root' })`. `@Service()` registers the service in the root injector
  automatically. Use `@Service({ autoProvided: false })` when a route or component provides it.
- **Templates:**
  - Control flow: `@if`, `@for` with `track` (and `@empty`), `@switch`, `@let`, `@defer`.
  - Use `[class.x]` and `[style.x]` instead of `ngClass` and `ngStyle`.
  - No `$any`, and a `type` on every `<button>`.
- **Forms:**
  - Signal Forms: `form()`, the `FormField` directive (`[formField]`), schema rules such as
    `required()` and `validate()`, and `submit()`.
  - Reuse the shared Zod schemas with `validateStandardSchema()`, so client and server validate
    the same way.
- **Routing:** lazy `loadComponent` and `loadChildren`; functional guards, resolvers and
  interceptors (`withInterceptors`); route params as component inputs.
- **Material 3:**
  - Theme with the `mat.theme()` mixin, and use `--mat-sys-*` tokens instead of hard-coded
    colours.
  - Use the CDK for overlays, drag and drop, and accessibility (`LiveAnnouncer`, focus trap).
  - Fonts and icons are self-hosted only.
- **Accessibility:** the app must pass axe checks and WCAG AA. That means labels, focus
  management, contrast in light and dark, and a keyboard path for everything pointer-driven.

## NestJS 11 on Express 5 (`lister-api`, `packages/api/*`)

- **Express 5:** Nest 11 runs on Express 5.
  - Route wildcards must be named (`*splat`).
  - Optional segments are written `{/:id}`.
  - The query parser is `simple`, so there are no nested query objects.
- **Structure:** one module per feature, with constructor injection through `private readonly`
  parameters. That's Nest's way; `inject()` is Angular's.
- **Validation:**
  - Request bodies are DTO classes with `class-validator`, checked by the global `ValidationPipe`.
  - Socket messages and mutations are checked with the shared Zod schemas: `safeParse`, then a
    human-readable rejection.
- **Config:** comes from env vars and is validated once at startup. Use `@nestjs/config` with a
  schema once there are more than a couple. A missing or invalid value stops the app with a clear
  message.
- **Logging:** structured logs in production (`new ConsoleLogger({ json: true })`). Never log
  passwords, tokens, cookies or full request bodies.
- **Shutdown:** call `app.enableShutdownHooks()`, so the database closes cleanly when Docker stops
  the container.
- **Errors:** throw the built-in HTTP exceptions. Cross-cutting error shaping goes in one exception
  filter, not in try/catch blocks in each controller.

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

## Tests

The `testing` skill says which tests every change needs. How to write them:

- **Vitest 4:**
  - `it.each` for tables of cases.
  - `vi.useFakeTimers()` and `vi.setSystemTime()` for time.
  - `expect.poll()` and `vi.waitFor()` for conditions that become true eventually.
  - `vi.mocked()` for typed mocks, `onTestFinished()` for cleanup, `test.extend()` for fixtures.
  - Snapshots only for small, stable output.
- **Angular TestBed (zoneless):**
  - `fixture.componentRef.setInput()`, then `await fixture.whenStable()`.
  - `TestBed.tick()` to flush effects (`flushEffects()` is deprecated).
  - Material component harnesses (`TestbedHarnessEnvironment`) instead of CSS selectors into
    Material's internals.
  - `RouterTestingHarness` for routed components.
- **Playwright 1.65:**
  - Role, label and text locators (`getByRole`, `getByLabel`).
  - Web-first assertions (`await expect(locator).toBeVisible()`).
  - No `waitForTimeout`.
  - `test.step()` for long flows, and fixtures for setup.
  - `context.setOffline()`, `page.clock` and `toMatchAriaSnapshot()` where they fit.

## Libraries that later tasks add

Check the docs for the installed version when the task adds the library:

- **Zod 4 (`zod/mini` in shared schemas, for bundle size):**
  - `zod/mini` loads no locale: `sync-protocol` calls `z.config(en())` once, so default messages stay readable.
  - `zod/mini` has no method chains: write checks as `.check(z.maxLength(n, 'msg'), z.regex(re, 'msg'))`, wrappers as functions (`z.nullable(s)`, `z._default(s, v)`, `z.partial(s)`), and type schemas as `z.ZodMiniType<T>`.
  - Top-level formats: `z.uuid()`, `z.email()`, `z.iso.datetime()`.
  - `z.strictObject()` for messages, and the `error` option for error messages.
  - `z.infer` for types, and `safeParse` at every boundary.
- **Drizzle 0.45 with `better-sqlite3`:**
  - The schema lives in TypeScript.
  - drizzle-kit generates the migrations, and they're committed.
  - Transactions are synchronous, with no `await` inside.
- **Dexie 4:** a versioned schema (`db.version(n).stores(...)`), typed tables, and `liveQuery`
  turned into signals.
- **Socket.IO 4:**
  - Typed events on both sides (`Server<ClientToServerEvents, ServerToClientEvents>`).
  - Acknowledgements with a timeout: `socket.timeout(ms).emitWithAck(...)`.
  - WebSocket transport only.

## Nx 24

- Use generators instead of hand-written project config, with a dry run first.
- `nx show project <name>` lists the inferred targets, and `nx affected` scopes work to the
  change.
- `nx graph` shows the dependencies.
- Upgrade only with `nx migrate`.
- Where code goes is in the `module-boundaries` skill.
