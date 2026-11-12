---
name: angular-feature
description: Conventions and steps for Angular 22 work in lister-web — components, routes, Angular libraries, data access, forms and tests. Use when adding or changing anything in apps/lister-web or packages/web/*.
---

# Angular feature work (Angular 22, zoneless, standalone)

Always load `best-practices` (and read `node_modules/@angular/core/resources/best-practices.md`),
`testing` and `module-boundaries` too.

## Where code goes

- **Bigger features get their own library from the start.** The `module-boundaries` skill says
  what counts as bigger and how to generate one. Only bootstrap, providers, the route table,
  the shell and small app-wide pieces stay in `apps/lister-web/src/app/`.
- **Planned web libraries** (docs/design.md §5):
  - `type:feature` (routed pages, smart components): `feature-lists`, `feature-runs`,
    `feature-auth`, `feature-admin`, `feature-space`.
  - `type:ui` (presentational, inputs and outputs only): `ui`. It holds the navigation bar and
    rail, the item row, the section header, the sync status and the dialogs.
  - `type:data-access`: `data-access-local-db` (Dexie, repositories) and `data-access-sync` (the
    sync engine).
  - `type:util`: `util-pwa` (service worker updates, the install hint, storage persistence).
- **Lint config:** new Angular libraries spread `angularBestPractices` in their
  `eslint.config.mjs`. `npm run lint:workspace` checks this.
- **Components:** `npx nx g @nx/angular:component <dir>/<name>/<name> --dry-run`.
  - The path is the file path without the extension.
  - The defaults are scss and the `lister-` prefix. OnPush is Angular's default, so the
    generator doesn't write it.
  - Add `--inlineTemplate --inlineStyle` for small components.

## Component rules

```ts
@Component({
  selector: 'lister-list-card',
  templateUrl: './list-card.html',
})
export class ListCard {
  private readonly lists = inject(ListsRepository);
  readonly list = input.required<List>();
  readonly removed = output<string>();
  protected readonly itemCount = computed(() => this.list().itemCount);
}
```

- **Defaults:** standalone and OnPush are Angular's defaults. Don't write `standalone: true` or
  `changeDetection`, and never use `Eager`. No NgModules.
- **State:** signals: `signal`, `computed`, `linkedSignal`. Use `effect` only for side effects
  that leave Angular (DOM APIs, storage, logging).
- **Component API:** `input()`, `input.required()`, `output()` and `model()`; signal queries
  (`viewChild()` and the rest). Not `@Input`, `@Output` or `@ViewChild`.
- **DI:** `inject()` instead of constructor injection. New singleton services use `@Service()`,
  not `@Injectable({ providedIn: 'root' })`.
- **Templates:**
  - Control flow: `@if`, `@for (x of xs; track x.id)` with `@empty`, `@switch`, `@let`,
    `@defer`.
  - Bind `[class.x]` and `[style.x]` instead of `ngClass` and `ngStyle`.
  - Every `<button>` has a `type`.
- **Zoneless:** UI updates come from signals, the `async` pipe, or events. Don't use
  `setTimeout` or `NgZone` to "make change detection run".
- **Host bindings** go in the `host: {}` metadata, not `@HostBinding` or `@HostListener`.
- **Images:** `NgOptimizedImage`.
- **Accessibility:** semantic elements, labels on inputs, keyboard support, and clean axe checks.

## Data access

- **Synced data** (lists, items, includes, runs):
  - Read it from the local database through the repositories in `data-access-local-db`: Dexie
    `liveQuery` exposed as signals.
  - Change it only with sync-engine mutations from `data-access-sync`.
  - The UI updates whenever the local database changes (locally, from another tab, or from the
    server), so components never refetch.
  - T-008 and T-009 build these libraries. Don't build synced features before they exist.
- **Sync state:** show it where it matters: pending ("not synced yet"), offline, and rejected
  changes (a snackbar with the reason, and Undo where it makes sense).
- **Other HTTP** (sign-in, passkeys, user administration, spaces, export, health):
  - Reads: `httpResource<T>(() => apiPath(...))`, with `.value()`, `.isLoading()`, `.error()`,
    `.hasValue()` and `.reload()`.
  - Writes: a `@Service()` class using `HttpClient`, typed with `@lister/shared/api-contracts`.
- **Imports:** never import from `apps/lister-api` or `packages/api/*`; lint rejects it. Shared
  code comes from `packages/shared/*`.

## Routing

- Add routes in `app.routes.ts`, or in a feature library's `*.routes.ts`, with `loadComponent`
  or `loadChildren` (lazy). A feature library exports its routes and nothing else that the app
  needs.
- Route params arrive as component inputs (`withComponentInputBinding` is on):
  `readonly id = input.required<string>()`.
- Guards and resolvers are functions (`CanActivateFn`, `ResolveFn`) that use `inject()`.

## Forms

- New forms use Signal Forms from `@angular/forms/signals` (stable in v22): `form()`, schema
  rules (`required()`, `validate()`), the `FormField` directive bound as `[formField]`, and
  `submit()`.
- Mirror the server's validation. Where a shared Zod schema exists, use it through
  `validateStandardSchema()`.

## Styling and Material

- **Theme:** Angular Material 3 (from T-001), generated from the deep teal seed `#00796B` (D11).
  - Use Material components first.
  - Style custom ones with the M3 system tokens (`--mat-sys-*`), not hard-coded colours, so
    light and dark both work.
- **Navigation:** Material has no navigation bar or rail; ours live in `packages/web/ui`.
- **Fonts and icons** are self-hosted: Roboto and Material Symbols from npm. Never add Google
  Fonts `<link>`s; they break offline use.
- **Phone first:**
  - Below 600 px: a top app bar, the bottom navigation bar, and a FAB for the main action.
  - From 600 px: the navigation rail, with list and detail side by side where that helps.
- **Interaction:** CDK drag and drop always comes with a keyboard alternative ("Move up / down"
  in a menu). Destructive actions offer Undo in a snackbar.
- **Styles:** global styles go in `apps/lister-web/src/styles.scss`. Component styles stay small;
  the budget per component is 4 kB (warning) and 8 kB (error).
- **Text:** UI text is English. Runs are called runs in the UI too: the destination is "Runs",
  and the buttons are "Start run" and "New run".

## Tests

What's required is in the `testing` skill: unit tests for everything, plus a Playwright happy
path for every user-facing change. How to write them:

- **Running:** Vitest through `npx nx test lister-web`, or the library's project name. Each spec
  sits next to its file.
- **Setup:**
  `TestBed.configureTestingModule({ imports: [Cmp], providers: [provideHttpClient(), provideHttpClientTesting()] })`.
- **Inputs and effects:** set inputs with `fixture.componentRef.setInput('list', value)`, and
  `await fixture.whenStable()` before asserting. `TestBed.tick()` flushes effects.
- **Material:** interact through component harnesses (`TestbedHarnessEnvironment.loader(fixture)`)
  rather than Material's DOM.
- **Assertions:** assert on rendered output and emitted outputs, not on private fields.
- **Local-database and sync code:** test local-database code with `fake-indexeddb`, and the sync
  engine with a fake socket.
- **Offline and PWA behaviour:** Playwright against the production build. The dev server has no
  service worker.
