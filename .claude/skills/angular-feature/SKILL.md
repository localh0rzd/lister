---
name: angular-feature
description: Conventions and steps for Angular 22 work in lister-web — components, routes, Angular libraries, data access, forms and tests. Use when adding or changing anything in apps/lister-web or packages/web/*.
---

# Angular feature work (Angular 22, zoneless, standalone)

## Where code goes

- Small or app-wide: `apps/lister-web/src/app/<feature>/`.
- Once there are several features, use libraries, generated (dry-run first):
  - `npx nx g @nx/angular:library packages/web/feature-<name> --tags=scope:web,type:feature` (routed pages, smart components)
  - `npx nx g @nx/angular:library packages/web/ui-<name> --tags=scope:web,type:ui` (presentational, inputs/outputs only)
  - `npx nx g @nx/angular:library packages/web/data-access-<name> --tags=scope:web,type:data-access` (services, resources, state)
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

- Reads: `httpResource<T>(() => apiPath(...))`. Its request function reads signals, so it refetches when they change. Use `.value()`, `.isLoading()`, `.error()`, `.hasValue()`, `.reload()`.
- Writes: a `@Injectable({ providedIn: 'root' })` service using `HttpClient`, typed with `@lister/shared/api-contracts`. Convert with `firstValueFrom` if you need a promise.
- Never import from `apps/lister-api` or `packages/api/*`. Shared types only.

## Routing

- Add routes in `app.routes.ts` (or a feature lib's `*.routes.ts`) with `loadComponent` / `loadChildren` (lazy).
- Route params arrive as component inputs (`withComponentInputBinding` is on): `readonly id = input.required<string>()`.
- Guards/resolvers are functions (`CanActivateFn`, `ResolveFn`) that use `inject()`.

## Forms

- New forms: Signal Forms from `@angular/forms/signals` (`form()`, schema validators, `[formField]` binding via the `FormField` directive). Check the installed `@angular/forms` typings for exact APIs before using them.
- Mirror server-side validation rules (the Nest DTO) in the form schema.

## Styling

- Global tokens/resets in `apps/lister-web/src/styles.scss`; component styles stay small (budgets: 4 kB warning / 8 kB error per component).

## Tests

- Vitest via `npx nx test lister-web` (or the lib's project name). Spec next to the file.
- `TestBed.configureTestingModule({ imports: [Cmp], providers: [provideHttpClient(), provideHttpClientTesting()] })`.
- Set inputs with `fixture.componentRef.setInput('list', value)`; `await fixture.whenStable()` before asserting.
- Assert rendered output and emitted outputs, not private fields.
