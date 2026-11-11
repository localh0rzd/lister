---
name: angular-feature
description: Conventions and steps for Angular 22 work in lister-web — components, routes, Angular libraries, data access, forms and tests. Use when adding or changing anything in apps/lister-web or packages/web/*.
---

# Angular feature work (Angular 22, zoneless, standalone)

## Where code goes

- Small or app-wide: `apps/lister-web/src/app/<feature>/`.
- Libraries follow `docs/design.md` §5. Create each one when its task comes up, with `npx nx g @nx/angular:library packages/web/<name> --tags=scope:web,type:<type> --dry-run` first:
  - `type:feature` (routed pages, smart components): `feature-lists`, `feature-runs`, `feature-auth`, `feature-admin`, `feature-space`
  - `type:ui` (presentational, inputs/outputs only): `ui` — navigation bar and rail, item row, section header, sync status, dialogs
  - `type:data-access`: `data-access-local-db` (Dexie, repositories), `data-access-sync` (sync engine)
  - `type:util`: `util-pwa` (service worker updates, install hint, storage persistence)
- Components: `npx nx g @nx/angular:component <dir>/<name>/<name>` (defaults: scss, OnPush, `lister-` prefix). The path is the file path without extension.

## Component rules

```ts
@Component({
  selector: 'lister-list-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-card.html',
})
export class ListCard {
  readonly list = input.required<List>();
  readonly removed = output<string>();
  private readonly lists = inject(ListsService);
  protected readonly itemCount = computed(() => this.list().items.length);
}
```

- Standalone only; no NgModules; no `standalone: true` (it's the default).
- Signals for state: `signal`, `computed`, `linkedSignal`, `effect` only for side effects that leave Angular (DOM APIs, storage, logging).
- `input()` / `input.required()` / `output()` / `model()` — not `@Input`/`@Output`.
- `inject()` instead of constructor injection.
- Templates: `@if`, `@for (x of xs; track x.id)`, `@switch`, `@let`, `@defer`. Bind `[class.x]` / `[style.x]` instead of `ngClass`/`ngStyle`.
- The app is zoneless: UI updates come from signals, `async` pipe, or events. Don't use `setTimeout`/`NgZone` to "make change detection run".
- Host bindings go in the `host: {}` metadata, not `@HostBinding`/`@HostListener`.
- Images: `NgOptimizedImage`. Accessibility: semantic elements, labels on inputs, keyboard support.

## Data access

- **Synced data** (lists, items, includes, runs): read it from the local database through the repositories in `data-access-local-db` (Dexie `liveQuery` exposed as signals). Change it only with sync-engine mutations from `data-access-sync`. The UI updates whenever the local database changes — locally, from another tab, or from the server — so components never refetch. These libraries are built by T-008 and T-009; don't build synced features before they exist.
- Show sync state where it matters: pending ("not synced yet"), offline, and rejected changes (snackbar with the reason; Undo where it makes sense).
- **Other HTTP** (sign-in, passkeys, user administration, spaces, export, health): `httpResource<T>(() => apiPath(...))` for reads (`.value()`, `.isLoading()`, `.error()`, `.hasValue()`, `.reload()`); a `providedIn: 'root'` service with `HttpClient` for writes, typed with `@lister/shared/api-contracts`.
- Never import from `apps/lister-api` or `packages/api/*`. Shared code comes from `packages/shared/*`.

## Routing

- Add routes in `app.routes.ts` (or a feature lib's `*.routes.ts`) with `loadComponent` / `loadChildren` (lazy).
- Route params arrive as component inputs (`withComponentInputBinding` is on): `readonly id = input.required<string>()`.
- Guards/resolvers are functions (`CanActivateFn`, `ResolveFn`) that use `inject()`.

## Forms

- New forms: Signal Forms from `@angular/forms/signals` (`form()`, schema validators, `[formField]` binding via the `FormField` directive). Check the installed `@angular/forms` typings for exact APIs before using them.
- Mirror server-side validation rules (the Nest DTO) in the form schema.

## Styling and Material

- Angular Material 3 (from T-001), with the theme generated from the deep teal seed `#00796B` (D11). Use Material components first. Style custom ones with the M3 system tokens (`--mat-sys-*`), not hard-coded colours, so light and dark both work.
- Material has no navigation bar or rail; ours live in `packages/web/ui`.
- Fonts and icons are self-hosted (Roboto and Material Symbols from npm). Never add Google Fonts `<link>`s; they break offline use.
- Phone first. Below 600 px: top app bar, bottom navigation bar, FAB for the main action. From 600 px: navigation rail, and list and detail side by side where it helps.
- CDK drag and drop always comes with a keyboard alternative ("Move up / down" in a menu). Destructive actions offer Undo in a snackbar.
- Global styles in `apps/lister-web/src/styles.scss`; component styles stay small (budgets: 4 kB warning / 8 kB error per component).
- UI text is English. Runs are called runs in the UI too (destination "Runs", buttons "Start run" and "New run").

## Tests

- Vitest via `npx nx test lister-web` (or the lib's project name). Spec next to the file.
- `TestBed.configureTestingModule({ imports: [Cmp], providers: [provideHttpClient(), provideHttpClientTesting()] })`.
- Set inputs with `fixture.componentRef.setInput('list', value)`; `await fixture.whenStable()` before asserting.
- Assert rendered output and emitted outputs, not private fields.
- Local-database code: test with `fake-indexeddb`. The sync engine: test with a fake socket.
- Offline and PWA behaviour: Playwright against the production build (the dev server has no service worker).
