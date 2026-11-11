---
name: fullstack-feature
description: Build a feature that spans the Lister API and web app — shared contract types, a NestJS endpoint, Angular UI, and tests on both sides. Use when a change needs a new or changed HTTP endpoint and UI that consumes it.
---

# Full-stack feature: contract → API → web

Work in this order. Each step compiles against the previous one, so type errors surface early.

## 1. Contract (`packages/shared/api-contracts`)

Add `src/lib/<feature>.ts` and export it from `src/index.ts`:

```ts
export interface List {
  id: string;
  title: string;
  createdAt: string;
}
export interface CreateListRequest {
  title: string;
}
export type ListsResponse = List[];
```

- Interfaces/types only (plus tiny pure helpers). No classes with decorators, no framework imports.
- Dates cross HTTP as ISO strings — type them as `string`.
- Use `apiPath('lists')` for URLs on both sides; don't hard-code `/api/...`.
- When a feature grows big, a dedicated lib is fine: `npx nx g @nx/js:library packages/shared/<name> --tags=scope:shared,type:util`.

## 2. API (`apps/lister-api`, or a `packages/api/<feature>` Nest library)

Follow the `nest-feature` skill. Key points:

- `npx nx g @nx/nest:resource apps/lister-api/src/app/<feature>/<feature> --type=rest --crud --dry-run`, then trim what you don't need.
- Request DTO classes `implements` the contract interface and carry `class-validator` decorators.
- Controller return types are the contract types, so the compiler checks the response shape.
- Unit-test the service; add an HTTP case in `apps/lister-api-e2e` for the new route.

## 3. Web (`apps/lister-web`, or `packages/web/*` libraries)

Follow the `angular-feature` skill. Key points:

- Data access: `httpResource<ListsResponse>(() => apiPath('lists'))` for reads; a `providedIn: 'root'` service with `HttpClient` for writes, returning the contract types.
- After a write, `.reload()` the resource (or update it with `.set()/.update()`), don't refetch manually.
- Handle loading, error and empty states in the template.
- Test with `provideHttpClientTesting()`; flush responses typed with `satisfies <ContractType>`.

## 4. Verify

Run the `verify` skill. For anything user-visible, also run `npx nx e2e lister-web-e2e` and add or extend a Playwright spec.

## Checklist

- [ ] Contract exported from `@lister/shared/api-contracts`
- [ ] Endpoint validated (DTO) and unit + e2e tested
- [ ] UI handles loading / error / empty
- [ ] No web ↔ api imports (lint enforces this)
- [ ] `verify` passes
