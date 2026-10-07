# Plan: Nx workspace, NestJS backend and a modern light/dark web UI

Feature: `nx-nestjs-modern-ui` | Date: 2026-10-06 | Risk: medium | Autonomy: A2 | Status: draft (awaiting review)

Inputs: [PRD](../../../docs/prds/2026-10-06-nx-nestjs-modern-ui.md), ADRs
[Nx + Nest backend](../../../docs/adr/2026-10-06-nx-nest-backend-web-via-api.md),
[rules as Nest providers](../../../docs/adr/2026-10-06-rules-as-nest-providers-nest-11.md),
[API contract and security](../../../docs/adr/2026-10-06-api-contract-and-security.md),
[Python removal](../../../docs/adr/2026-10-06-remove-python-golden-fixtures.md);
glossary [CONTEXT.md](../../../CONTEXT.md).

## 1. Problem

The verified TypeScript tool has no backend that owns data access, a framework-free core nobody can
extend with an API, no workspace tooling (cache, affected, boundaries), a plain UI without a theme
switch, and a Python reference that only exists as a comparison oracle. The change reshapes the
system without changing any Consolidation behavior.

## 2. Flow

1. **CLI.** `cli <command>` boots a Nest standalone context (logger off), resolves the same providers
   the API uses, runs the command, writes stdout, sets the exit code, closes the context.
2. **Browse.** Browser -> Next server (Server Component) -> generated client -> API (`127.0.0.1`) ->
   per-operation read-only SQLite connection -> JSON -> HTML. The browser never calls the API.
3. **Resolve.** Form post -> Server Action (validates input at its edge) -> API resolution endpoint ->
   `ResolveReview` in one write transaction (write lock taken up front) -> redirect with a notice.
4. **Theme.** First paint: inline script from `next-themes` reads the stored choice or the system
   preference and sets the theme class before content paints; the toggle updates class and storage.
5. **Verify.** Golden-file check runs the CLI (and, for the API seam, the HTTP surface) on copies of
   the provided data and compares against recorded expectations.

## 3. Impact

| Area | Change |
|---|---|
| Workspace | Nx added to the pnpm workspace (`nx.json`, inferred targets, cache, tags, boundary lint). `packages/core` is removed after its rules are re-homed. New `libs/*` directory is part of the workspace globs. |
| Backend | New `api` app (Nest 11, HTTP) and libraries: `domain`, `rules`, `persistence`, `consolidation`, `reviews`. `cli` app rewritten as a Nest standalone application. All CommonJS (`module: node16`, no `"type": "module"`). |
| Web | Data layer replaced by the generated client; all database code, `node:sqlite` use and the startup database check removed; UI redesigned (shadcn/ui, Tailwind v4, `next-themes`, sidebar shell). Stays ESM. |
| Client lib | New `api-client` library: types and a thin fetch client generated from the OpenAPI document (`openapi-typescript` + `openapi-fetch`), a build output. |
| Verification | `scripts/parity-check.sh` becomes a golden-file check; fixtures stored under the repository; Python archive stored under `.engineos/archived/`. |
| Removed | Python source, `pyproject.toml`, `uv.lock`, `.venv`, `.ruff_cache`, Python-only docs wording. |
| Docs | README rewritten; ADR 0006 already marked partially superseded; the earlier plan/spec documents stay as history. |
| Unchanged | SQL migration files and checksums, the database schema, outcome vocabulary, validation limits, ADRs 0002-0005. |

## 4. Entities

No schema change. The system manipulates: **Catalog Product**, **Seller Offer**, **Review Item**,
**Seller Entry / Seller File** (input only), **Outcome** (report/summary only), and the migration
bookkeeping table. New transient concepts: **Golden Fixture** (a recorded expected output) and the
**OpenAPI document** (generated contract). Names follow [CONTEXT.md](../../../CONTEXT.md).

## 5. Public surfaces

**5.1 CLI** (`catalog-consolidation`): `migrate --db`; `consolidate --db --input [--report] [--dry-run]`;
`review list --db [--status] [--limit] [--after-id]`; `review resolve --db --id (--create|--reject|--link N)`;
`-h/--help` at every level. stdout formats, exit codes (0/1/2), JSON report, structured stderr log
line: unchanged from the TypeScript CLI that passed the parity gate.

**5.2 HTTP API `v1`** (loopback `127.0.0.1:3001`, JSON only):

| Method and path | Purpose | Errors |
|---|---|---|
| `GET /v1/summary` | product, Seller Offer and pending-review counts | 503 `database` |
| `GET /v1/products?q&after&limit` | search and keyset page (default 20, max 100) | 400 `invalid_request` |
| `GET /v1/products/{id}` | product with Seller Offers (max 100, `hasMore`) | 400 `invalid_request`, 404 `product_not_found` |
| `GET /v1/reviews?status&after&limit` | review queue page; ambiguous items carry live Candidates | 400 `invalid_request` |
| `POST /v1/reviews/{id}/resolution` | body `{action, productId?}`, actions `link-candidate`, `link-other`, `create`, `reject` | 400, 404 `review_not_found`, 404 `product_not_found`, 409 `review_not_pending` / `seller_sku_already_linked` / `seller_already_linked_to_product`, 422 `source_name_unnormalizable` / `no_candidate`, 503 `database` |
| `GET /health/live`, `GET /health/ready` | liveness; readiness (database present, schema version >= 3) | 503 when not ready |
| `GET /docs`, `GET /docs-json` | Swagger UI and OpenAPI document | - |

Error body always `{ statusCode, code, message, correlationId }`; `code` is a closed set:
`invalid_request`, `product_not_found`, `review_not_found`, `review_not_pending`,
`seller_sku_already_linked`, `seller_already_linked_to_product`, `source_name_unnormalizable`,
`no_candidate`, `unsupported_media_type`, `host_not_allowed`, `database`, `internal`.

**5.3 Web routes** (`127.0.0.1:3000`): `/`, `/products/[id]`, `/reviews`, plus the resolve Server
Action and the theme toggle (three states, persisted).

**5.4 Nx targets**: per project `build`, `lint`, `typecheck`; `api:serve`, `web:dev`/`start`;
`api:openapi` (writes the OpenAPI document), `api-client:generate`, `golden:check`.
**5.5 Configuration (names only)**: API `CATALOG_DB_PATH`, `API_PORT`, `API_ALLOWED_HOSTS`; web
`API_BASE_URL`; CLI flags only. Each validated once at startup, failing with one `error:` line.

## 6. One-way doors

| Door | Why hard to reverse | Mitigation |
|---|---|---|
| D1 Dissolve `packages/core` into Nest 11 providers | ~2,600 reviewed lines move; behavior must not drift | Golden fixtures recorded first; rules move only after the check passes on the old CLI; `core` deleted last |
| D2 Delete Python (no git) | Source unrecoverable | Archive tarball under `.engineos/archived/` and golden fixtures before deletion; deletion is the last ticket |
| D3 HTTP API `v1` contract and error codes | The web client and any future consumer depend on it | OpenAPI is the single source; client generated; closed code set above |
| D4 Web loses direct database access | Reintroducing it would break the boundary rule | Lint boundary rule + no `node:sqlite` in web, checked |
| D5 CommonJS libraries on `module: node16` | Switching to ESM later needs a re-config of every backend project | Recorded in ADR; revisit trigger when `@nx/nest` supports Nest 12 |

## 7. Decisions closed in this plan (no open assumptions)

- **Versions** (pinned exactly at scaffold with `pnpm view`): Nx 23.2.1; Nest `@nestjs/*` 11.2.7;
  `@nestjs/swagger` 11.4.7; `@nestjs/terminus` 11.1.1; `nestjs-pino` 5.3.1 with `pino` 10 and
  `pino-http` 11; `nest-commander` 3.21.0; `@nestjs/config` 4.x; `class-validator` 0.15.1;
  `openapi-typescript` 7.13.0; `openapi-fetch` 0.17.0; `next-themes` 0.4.6; shadcn CLI 4.21.3;
  Tailwind 4.3.3; TypeScript stays 6.0.3. Verified 2026-10-06: `@nx/eslint` itself depends on
  TypeScript `~6.0.3`; all Nest 11 companions declare Nest 11 peers.
- **TypeScript 6 and CommonJS:** `moduleResolution: node10` is an error in TS 6, so every backend
  project uses `module: node16` / `moduleResolution: node16` with `experimentalDecorators` and
  `emitDecoratorMetadata`. Probe on 2026-10-06 (scratch, deleted) compiled, emitted `design:paramtypes`
  and loaded as CommonJS.
- **Migrations folder** is resolved with `__dirname` (CommonJS) plus the existing environment override;
  no `import.meta`.
- **Fonts:** a locally installed variable font (`@fontsource-variable/inter`) or the system stack, never a
  build-time network fetch.
- **Ports:** API 3001, web 3000, both bound to `127.0.0.1`.
- **Fallbacks** (decided now so nothing is left to improvise): if Nx task inference misbehaves under
  pnpm 12, use `nx.json` plus per-project `project.json` targets that run the same commands; if
  `nest-commander` cannot keep stdout clean, use `NestFactory.createApplicationContext` with a thin
  hand-written command dispatcher (reusing the existing argument parser logic).
- **Testing:** none authored here; tests are pending final-stage approval. Verification is non-test
  evidence (lint, typecheck, build, golden check, browser smoke, contrast measurement).

## 8. Acceptance criteria (EARS)

**Workspace**
- R1: The workspace shall define an Nx project for every app and library with inferred `build`, `lint` and `typecheck` targets and a task cache.
- R2: If a project tagged for the web imports a project tagged for the backend, then the lint task shall fail.
- R3: When a library changes, `nx affected` shall select that library's dependents and not unrelated projects.

**CLI and rules**
- R4: When any CLI command runs on the provided data, the stdout, exit code, JSON report and resulting table contents shall equal the recorded golden fixtures.
- R5: When the CLI is given any help flag (including bundled forms such as `-hh`), the system shall print help, exit 0 and touch no database.
- R6: While the CLI runs, the Nest logger shall write nothing to stdout.
- R7: When `consolidate` runs twice on the same file, the second run shall write zero rows.
- R8: If the database is missing, not migrated, or the Seller File is invalid, then the CLI shall print one `error:` line and exit 2.
- R9: If an unexpected error occurs during a run, then the CLI shall roll back the run and exit 1.
- R10: The API and the CLI shall obtain normalization, matching, consolidation and review resolution from the same provider classes, so that each rule has exactly one implementation.

**API**
- R11: When `GET /v1/summary` is requested, the API shall return the product, Seller Offer and pending-review counts.
- R12: When `GET /v1/products` is requested with `q`, the API shall filter by Normalized Name and return at most `limit` rows (default 20, maximum 100) with a keyset cursor.
- R13: If a product id is malformed or does not exist, then `GET /v1/products/{id}` shall return 400 `invalid_request` or 404 `product_not_found` respectively.
- R14: When `GET /v1/reviews` is requested, the API shall return the page for the requested status, with live Candidates for ambiguous items and the stored Candidate and score for fuzzy items.
- R15: When a valid resolution is posted for a pending Review Item, the API shall apply it in one transaction and return the review id, final status, product id and link id.
- R16: If the Review Item is not pending, then the API shall return 409 `review_not_pending` and write nothing.
- R17: The API shall return every error as `{ statusCode, code, message, correlationId }` with a code from the closed set, and shall never include stack traces, SQL or seller text.
- R18: If the request `Host` header is not allowlisted, then the API shall reject it with `host_not_allowed`.
- R19: If a request body is not `application/json`, then the API shall return 415 `unsupported_media_type`.
- R20: The API shall bind only to `127.0.0.1` and shall send no CORS headers.
- R21: When `GET /health/ready` is requested, the API shall return 200 only if the database exists with schema version 3 or higher, otherwise 503; `GET /health/live` shall return 200 while the process runs.
- R22: When `GET /docs-json` is requested, the API shall return an OpenAPI document describing every endpoint in 5.2 and the error body.
- R23: If a database operation fails, then the API shall return 503 `database` and log one structured event naming the event and error type but not the message or seller text.

**Web**
- R24: The web application shall contain no database or business-rule code: no import of `node:sqlite` and no import of backend-tagged projects.
- R25: When a web page renders, its data shall come from the API through the generated client on the Next server, and the browser shall make no request to the API port.
- R26: If the API is unreachable, then the web application shall render its error state without a stack trace.
- R27: When the user selects light, dark or system, the interface shall switch immediately, persist the choice across reloads, and paint the first frame in the right theme with no flash.
- R28: The web application shall present a sidebar layout (Catalog, Review queue) with the theme toggle in a top bar, and below the small-screen breakpoint the sidebar shall become a drawer.
- R29: Each page shall render designed loading, empty and error states.
- R30: While a resolution request is pending, its buttons shall be disabled; if the same resolution is submitted twice, then the second shall produce the "already resolved" notice and no second link.
- R31: In both themes, body text shall have contrast of at least 4.5:1, focus shall be visible, a skip-to-content link shall exist, notices shall be announced to assistive technology, repeated buttons shall carry review-specific accessible names, and animation shall be disabled under reduced-motion.
- R32: The web application shall keep its anti-framing and related security headers and its Host allowlist.
- R33: If the web application's API address is missing or invalid at startup, then it shall print one `error:` line and exit 1; `next build` shall succeed without the API running.
- R34: When `/products/{id}` is requested for a malformed or unknown id, the web application shall respond with a real 404 page.

**Python removal and docs**
- R35: Before any rule is moved, golden fixtures shall be recorded from the Python CLI and an archive of the Python source stored under `.engineos/archived/`, and the fixture check shall pass on the existing TypeScript CLI.
- R36: When the work is complete, no Python source, project file, lock file or virtual environment shall remain, and the README shall describe the TypeScript system and how to run its three applications.

## 9. Traceability (surface or door -> criteria)

| Surface or door | Criteria |
|---|---|
| CLI (5.1) | R4-R9 |
| One implementation per rule (D1) | R4, R10 |
| API endpoints, errors, health, docs (5.2, D3) | R11-R23 |
| API security (ADR 3) | R17-R20, R23 |
| Web routes and Server Action (5.3, D4) | R24-R30, R33, R34 |
| Theme and layout and accessibility | R27-R29, R31, R32 |
| Nx targets (5.4) | R1-R3 |
| Configuration (5.5) | R8, R33 |
| Python removal (D2) | R35, R36 |
| CommonJS libraries (D5) | R1, R4, R10 |
