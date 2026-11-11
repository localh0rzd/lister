# shared-api-contracts

Types and constants shared by `lister-api` (NestJS) and `lister-web` (Angular):
request/response shapes, route helpers, enums. Import via `@lister/shared/api-contracts`.

Rules: plain TypeScript only — no Angular, NestJS, or Node imports, no runtime side effects.

Run `npx nx test shared-api-contracts` to execute the unit tests.
