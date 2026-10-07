# Frozen contracts (owner: orchestrator; revision numbers are cited in worker briefs)

## C-TAGS rev1 (done, ticket 02)
scope:backend / scope:web / scope:client; type:app / type:lib; rule in eslint.module-boundaries.mjs.

## C-LIBS rev1: backend library conventions (scaffolded by the orchestrator in ticket 03 setup)
- Every backend lib: libs/<name>, package `@catalog/<name>`, CommonJS (no "type": "module"), tsconfig extends
  tsconfig.backend.json (module/moduleResolution node16, decorators + metadata, verbatimModuleSyntax false),
  main/types/exports to dist, scripts build/typecheck/lint, tags scope:backend + type:lib.
- Relative imports keep the `.js` suffix (verbatim moves). Interfaces injected into decorated constructors must be
  imported with `import type` and injected through a string token constant exported by the providing lib.
- Allowed lib edges: domain <- rules <- consolidation; domain,rules <- persistence. Nothing depends on an app.
- Only the orchestrator edits root files, package.json dependency blocks and the lockfile.

## C-DOMAIN rev1 (done): @catalog/domain = verbatim move of core domain/{limits,models,errors,ports}.ts. Framework-free.

## C-RULES rev1: @catalog/rules (Nest providers; logic moved VERBATIM from core domain/{text,normalization,sequence-matcher,matching}.ts)
- `RulesModule` provides and exports:
  - `TextService`: pyStrip(text: string): string; pyIsBlank(text: string): boolean; pySplitJoin(text: string): string; pyLength(text: string): number
  - `NormalizationService`: normalize(text: string | null): string | null; cleanDisplay(text: string | null): string | null
  - `SimilarityMatcherFactory` (transient factory): create(a: string, b: string): SequenceMatcher
  - `MatchingService`: matchEntry(args: { query: MatchQuery; catalog: CatalogReader }): MatchDecision (uses the factory and the domain thresholds)
- Also exports the `SequenceMatcher` class and `Match` type unchanged.

## C-CONSOLIDATION rev1: @catalog/consolidation
- `ConsolidationModule` (imports RulesModule) provides and exports `ConsolidationService`:
  execute(args: { unitOfWork: UnitOfWork; entrySource: EntrySource; inputLabel: string; runId: string; dryRun: boolean }): ConsolidationResult
  (same result and exception behavior as core `ConsolidateFile.execute`). Result/summary/outcome types exported from the lib or domain as they live today.

## C-PERSISTENCE rev1: @catalog/persistence (from core adapters/*; logic VERBATIM)
- `PersistenceModule` (imports RulesModule) provides and exports at least:
  `SqliteConnectionFactory` (open(dbPath) = openConnection; plus the row/bind helpers as plain exports),
  `SqliteMigrationRunner` (same behavior as today; migrations folder resolved with __dirname + the existing env override, NO import.meta),
  `UnitOfWorkFactory` (create({connection, mode}) -> SqliteUnitOfWork), `ReviewUnitOfWorkFactory`,
  `JsonEntryReaderFactory` (create({path}) -> EntrySource, uses TextService),
  `ReportWriter` (writeJsonlReport, toReportRecord, formatSummary), `PythonFormat` (roundHalfEven, formatPythonFloat, formatFixed, pythonPathLabel),
  and `requireSchemaVersion`/`readSchemaVersion`/`isSqliteError` as injectable-or-exported helpers.
- Core's `use-cases/resolve-review.ts` stays in packages/core until ticket 04 moves it to libs/reviews.

## C-REVIEWS rev1: @catalog/reviews (from core use-cases/resolve-review.ts; logic VERBATIM)
- `ReviewsModule` (imports RulesModule) provides and exports `ReviewsService` (stateless, injects NormalizationService):
  - list(args: { unitOfWork: ReviewUnitOfWork; status: ReviewStatus; afterId: number; limit: number }): ReviewPage   (= core ListReviews.execute, incl. rollback in finally)
  - resolve(args: { unitOfWork: ReviewUnitOfWork; command: ResolveCommand }): ResolutionResult   (= core ResolveReview.execute: commit on success, rollback and rethrow on any error)

## C-CLI rev1: apps/cli is a CommonJS Nest standalone app (no HTTP). Parsing stays the existing hand-written argparse emulation
(nest-commander is NOT used: ruling R-5, it would have to re-implement argparse's exact messages; plan section 7 pre-approved this fallback).
`NestFactory.createApplicationContext(CliModule, { logger: false })` only after arguments parsed OK and the command is not help; stdout carries program output only.

## C-READMODEL rev1: @catalog/persistence gains the read model the web used to own (owner: worker 06A; logic VERBATIM from apps/web/src/lib/catalog-db.ts)
- New injectable `CatalogReadModel` (file libs/persistence/src/catalog-read-model.ts, row mappers in their own file; provided + exported by PersistenceModule; injects NormalizationService). Every method takes the caller's open `DatabaseSync` (the caller owns open/close; no connection opened here):
  - summary({ connection }): SummaryCounts { products, sellerLinks, pendingReviews }
  - listProducts({ connection, afterId, limit, query: string | null }): ProductPage { rows: ProductListRow[], nextAfterId: number | null }  (query normalized with NormalizationService, LIKE-escaped; look-ahead row; RangeError bounds as in web)
  - getProduct({ connection, productId }): ProductDetail | null
  - listSellerLinks({ connection, productId }): SellerLinkPage { rows: SellerLinkRow[] (max 100), hasMore }
  - reviewViews({ connection, records: readonly ReviewRecord[] }): ReviewView[] { record, candidate: CandidateProduct | null, liveCandidates: CandidateProduct[] }  (live candidates only for PENDING + AMBIGUOUS, same rule as web)
  - Types SummaryCounts, ProductListRow, ProductPage, ProductDetail, SellerLinkRow, SellerLinkPage, CandidateProduct, ReviewView exported from the lib barrel (moved verbatim from the web file).
- Reviews flow in the API: `ReviewsService.list` (C-REVIEWS) on a ReviewUnitOfWork from `ReviewUnitOfWorkFactory.create({connection})`, then `CatalogReadModel.reviewViews`.

## C-API rev1: apps/api foundation (owner: worker 05; consumers 06B/07 code against these exact surfaces)
- Files (all under apps/api/src): main.ts (bootstrap), openapi.ts (writes dist/openapi.json without a database), app.module.ts (`AppModule.register(config: ApiConfig): DynamicModule`), features.ts (`export const FEATURE_MODULES: readonly Type<unknown>[] = []`; orchestrator wires feature modules here, workers 06B/07 do NOT edit it), config/, http/, errors/, database/, health/, openapi/.
- Config: `ApiConfig { readonly dbPath: string; readonly port: number; readonly allowedHosts: readonly string[] }`, injection token `API_CONFIG`. Env: CATALOG_DB_PATH (required, regular file), API_PORT (default 3001, integer 1-65535), API_ALLOWED_HOSTS (comma list, default `127.0.0.1:<port>,localhost:<port>`). Read once in main.ts before the app is created; invalid -> exactly one `error: ...` line on stderr, exit 1. Only variable names in repo; no .env files.
- Errors: `API_ERROR_CODES` closed tuple (invalid_request, product_not_found, review_not_found, review_not_pending, seller_sku_already_linked, seller_already_linked_to_product, source_name_unnormalizable, no_candidate, unsupported_media_type, host_not_allowed, database, internal) and type `ApiErrorCode`; `class ApiProblem extends HttpException { constructor(args: { code: ApiErrorCode; status: number; message: string }) }`; `class ErrorBodyDto { statusCode: number; code: ApiErrorCode; message: string; correlationId: string }` (swagger-decorated, used by every endpoint via `@ApiProblemResponses(...)`-style decorator exported from errors/). Global `ApiExceptionFilter` always emits exactly those four fields: ApiProblem as given; ValidationPipe failures -> 400 invalid_request (message names fields, never echoes values); unknown route -> 404 invalid_request; terminus ServiceUnavailable and SQLite/DatabaseFileError -> 503 database, logged ONCE as {event:"api.database.failed", errorType, correlationId} (never message/seller text); anything else -> 500 internal logged once with errorType only. No stack trace, SQL or seller text ever in a body.
- HTTP hardening (middleware, in this order): correlation id (inbound `x-correlation-id` accepted only if /^[A-Za-z0-9._-]{1,64}$/, else crypto.randomUUID(); echoed on response; `request.correlationId` typed), Host allowlist (421 host_not_allowed, Host compared exactly), content-type check (non GET/HEAD/OPTIONS whose content-type is not `application/json` [parameters allowed] -> 415 unsupported_media_type), baseline headers (X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Cache-Control no-store; x-powered-by disabled; NO access-control-* ever, no CORS enabled). JSON body limit 16kb. Listen on 127.0.0.1 only.
- Database: `DatabaseAccess` (injectable, exported by a global DatabaseModule): `read<T>(fn: (connection: DatabaseSync) => T): T` opens a connection via persistence `openConnection(config.dbPath)`, `PRAGMA query_only = ON`, `requireSchemaVersion`, runs fn, closes in finally; `write<T>(fn)` same without query_only. One connection per call. Errors propagate unwrapped (the filter maps them).
- Logging: nestjs-pino JSON, `service: "catalog_consolidation_api"`, fields timestamp, level, event, correlationId, durationMs; request log has method, path WITHOUT query string, status only.
- Health: `GET /health/live` -> 200 `{status:"ok"}`; `GET /health/ready` -> 200 when the database file exists and schema version >= REQUIRED_SCHEMA_VERSION, else 503 error body code `database`. Excluded from the /v1 prefix.
- OpenAPI: `buildOpenApiDocument(app): OpenAPIObject` in openapi/; main.ts serves Swagger UI at /docs and JSON at /docs-json (these two paths exempt from nothing else: Host check still applies); openapi.ts writes the same document to dist/openapi.json using `AppModule.register({dbPath:"unused",port:0,allowedHosts:[]})` and `NestFactory.create(..., {logger:false})` without listening.
- Nx scripts in apps/api/package.json (orchestrator owns): build, typecheck, lint, serve, openapi. Workers do not edit package.json/tsconfig.
- Feature modules (06B catalog + review queue under /v1, 07 resolution) must mount controllers under the `v1` path prefix themselves (`@Controller('v1/...')`), import nothing from each other, and use `DatabaseAccess` + `ApiProblem`.

## C-THEME rev1 (frozen 2026-10-06 after ticket 10; owner: orchestrator)

Source of truth: `apps/web/src/app/globals.css`. Both `:root` and `.dark` define every token; Tailwind utilities
come from `@theme inline` (`bg-background`, `text-muted-foreground`, `border-border`, `ring-ring`, ...).
Tokens: background, foreground, card(-foreground), popover(-foreground), primary(-foreground),
secondary(-foreground), muted(-foreground), accent(-foreground), destructive(-foreground),
success(-foreground), warning(-foreground), border, input, ring, sidebar, sidebar-foreground,
sidebar-primary(-foreground), sidebar-accent(-foreground), sidebar-border, sidebar-ring; `--radius` 0.5rem;
`shadow-xs`, `shadow-sm`; `font-sans` Inter Variable (local) then system-ui; `font-mono` system stack.
Rules: muted, accent and secondary are SURFACE colours only (secondary text = `text-muted-foreground`, links =
`text-primary`); status text uses `text-success|warning|destructive`; no hex/rgb/palette classes in components;
dark variant is `.dark` (`dark:` utilities), storage key `theme`, provider attribute class, default system.
Primitives in `components/ui/` (button, card, badge, input, label, table, separator, skeleton, alert,
dropdown-menu) are FROZEN for tickets 11 and 12: need a change -> add a new file or report to the orchestrator.

## C-SHELL rev1 (frozen; owner: ticket 11 for implementation)

`app/layout.tsx` owns the skip link (first focus stop, targets `#main-content`) and the single
`<main id="main-content" tabIndex={-1}>` landmark; pages must not render another `<main>`. Breakpoint for
sidebar -> drawer is Tailwind `md` (768px). Ticket 12 (review pages and components) relies only on the
`#main-content` target and on the C-STATES components; it does not edit layout or `globals.css`.

## C-STATES rev1 (frozen; written by the orchestrator, `apps/web/src/components/states/`)

`EmptyState({title, description?, icon?, action?, className?})` and
`ErrorState({title, description?, reference?, action?, icon?, className?})` (role="alert"; `reference` is the
server digest, never a message or stack). Neither ticket edits these files.
