---
name: testing
description: The tests every Lister change needs and how to write them — unit tests on both sides, an integration test for every backend call (HTTP route, Socket.IO event, mutation type), and a Playwright happy-path e2e for every user-facing feature. Use whenever you implement or change behaviour, before calling work done, and when reviewing a change's tests.
---

# Tests every change needs

No behaviour change ships without tests. A task isn't done until every kind below that applies
exists and passes.

| What changed                                                                                                                                                                                  | Required                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A unit, new or changed: component, directive, pipe, service, guard, interceptor, repository, Nest service, mutation handler, pure function or schema, on the web side, the API side or shared | **Unit tests** next to it                                          |
| A backend call, new or changed: HTTP route, Socket.IO event or mutation type                                                                                                                  | **Integration test** through the real app                          |
| User-facing behaviour, new or changed                                                                                                                                                         | **Playwright happy-path e2e**                                      |
| Synced data (lists, items, includes, runs)                                                                                                                                                    | Also the two-context and offline specs (`fullstack-feature` skill) |

How to write each kind well (Vitest, TestBed and Playwright idioms) is in the `best-practices`
skill.

## Unit tests

- **Where and how to run:** next to the code as `<file>.spec.ts`, run with
  `npx nx test <project>`.
- **Web components:**
  - Render the component with TestBed, and set inputs with `fixture.componentRef.setInput()`.
  - Act through the DOM or Material harnesses, then `await fixture.whenStable()`.
  - Assert on what's rendered and on the outputs emitted.
- **Web services:**
  - Get them with `TestBed.inject()`.
  - For HTTP, use `provideHttpClient()`, `provideHttpClientTesting()` and `HttpTestingController`:
    `expectOne`, then `flush`, then `verify()` in `afterEach`.
  - Local-database code runs against `fake-indexeddb`; the sync engine runs with a fake socket.
- **API:**
  - Build a module with `Test.createTestingModule()` containing the class under test, and replace
    its collaborators with `{ provide: X, useValue: … }`.
  - When the logic is SQL, use a fresh in-memory database instead of mocks:
    `createTestDatabase()` from `@lister/api/data-access-db`.
- **Shared:**
  - Pure functions get table-driven cases with `it.each`, including empty, one, many, duplicates,
    unicode and boundary values.
  - Schemas get both valid and invalid examples.
- **Error paths count:** test what the user sees when something fails, not only the happy path.

## Integration tests (every backend call)

Every HTTP route and every Socket.IO event is tested through the real application: real
modules, guards, pipes, filters and serialisation, a real HTTP request or socket, and a fresh,
migrated in-memory SQLite database.

- **Where:** `apps/lister-api/src/integration/<area>.integration.spec.ts`, so the tests can use
  the whole `AppModule`. They run as part of `npx nx test lister-api`.
- **The app:** `createTestApp()` (`apps/lister-api/src/testing/create-test-app.ts`) starts the
  real `AppModule`; `health.integration.spec.ts` is the example to copy.
  - It uses the same setup as `main.ts`: one shared `configureApp()` applies the global prefix,
    pipes and filters.
  - It swaps in a fresh in-memory database and listens on a random port (`app.listen(0)`).
  - Send HTTP requests with the global `fetch` to `await app.getUrl()`. Connect sockets with
    `socket.io-client` (from T-007).
  - Close the app in `afterEach`.
- **Each HTTP route:**
  - The happy path: the status, the body (typed with the shared contract), and the effect in the
    database.
  - Validation failure (400), not signed in (401), not allowed (403), unknown id (404), and
    conflicts (409) where they apply.
- **Each socket event or mutation:**
  - It's applied and acknowledged with the new version.
  - The poke reaches the other members of the space, and nobody else.
  - A retried mutation id is applied only once.
  - A broken rule is rejected with its human-readable reason.
  - Delete wins.
- **Libraries** test their own SQL against an in-memory database as well. The app-level tests
  above come on top: they prove that the call works end to end.
- **`apps/lister-api-e2e`** stays a smoke test of the built server: startup, migrations on a
  file database, health, static hosting, and the origin check. Add to it only what needs the
  real process.

## Web e2e (happy path of every user-facing feature)

- **One spec per feature:** `apps/lister-web-e2e/src/<feature>.spec.ts`.
  `npx nx e2e lister-web-e2e` starts the API and the web app itself.
- **Walk the main flow the way a user does:** role, label and text locators, web-first
  assertions, and no `waitForTimeout`.
- **Independent tests:** each test creates its own data (unique names), so tests run in parallel
  and in any order.
- **Both layouts:** the layout changes at 600 px, so cover the flow at 375 px and at 1280 px.
- **Accessibility:** run an axe check (`@axe-core/playwright`) on every screen in the flow. The
  first task that adds a screen also adds that dependency and a small fixture for it.
- **Offline and PWA behaviour** runs against the production build, not the dev server: name the
  spec `*.pwa.spec.ts`. It then runs in the `pwa` Playwright project against
  `lister-web:serve-static` (port 4300, with the service worker), which the e2e target starts.

## Quality bar

- A test must fail when the behaviour it covers breaks. If you're not sure it would, break the
  code on purpose and watch the test fail.
- **Deterministic:**
  - Fake timers or fixed clocks.
  - Fixed or seeded ids.
  - No network beyond the app under test.
  - No dependence on test order.
- **Never committed:**
  - `.only`, `.skip` or `.todo`.
  - Arbitrary sleeps.
  - Assertions on private fields or implementation details.
  - Snapshots of whole pages.
- **Names state the behaviour:** `it('rejects an include that would create a loop')`.
- **Shared helpers:** a helper that more than one spec needs goes in a `testing/` folder of the
  project that owns it. Don't copy helpers between specs.
- **Bugs:** every bug you fix gets a test that reproduces it first.
