---
name: nx-nestjs-modern-ui
owner: Ricardo Fagmer
---

**Status:** ready-for-agent

# PRD: Nx workspace, NestJS backend and a modern light/dark web UI

Date: 2026-10-06. Decisions: [Nx + Nest backend](../adr/2026-10-06-nx-nest-backend-web-via-api.md),
[rules as Nest providers](../adr/2026-10-06-rules-as-nest-providers-nest-11.md),
[API contract and security](../adr/2026-10-06-api-contract-and-security.md),
[Python removal with golden fixtures](../adr/2026-10-06-remove-python-golden-fixtures.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md).

## Problem Statement

The Catalog Consolidation tool works and is verified, but its shape no longer matches how the team
wants to build and present it. The web app reads the database itself, so there is no backend that owns
data access, the rules live in a framework-free package nobody can extend with a real API, and the
workspace has no tooling for caching, affected builds or enforced boundaries between frontend and
backend. The web UI is functional but plain, offers no way to switch between light and dark, and does
not look like a modern product. Meanwhile a second, Python implementation still sits in the repository
only as a comparison oracle, and the README describes it first.

## Solution

One Nx workspace holds three applications: a NestJS API, a NestJS-based command line, and the Next.js
web app. All Consolidation rules live in Nest providers shared by the API and the CLI, so there is
still exactly one implementation of every rule. The web app no longer touches the database: its server
calls the API, which is the only web-facing process that reads or writes SQLite, and the browser only
ever talks to the web app. The interface is redesigned with a sidebar layout, a neutral minimal look and
a theme toggle (light, dark, or follow the system) that remembers the choice and never flashes the wrong
theme. The Python reference is removed after its outputs are frozen as golden fixtures, and the README
describes the TypeScript system.

## User Stories

1. As an operator, I want `migrate`, `consolidate` and `review list|resolve` to behave exactly as they do today (same stdout, exit codes, reports and database contents, safe re-runs, help that never runs a command, failed runs that leave the database unchanged), so that nothing I rely on changes.
2. As a reviewer, I want a review queue showing each Review Item beside its Candidates and similarity score, filterable by status, where I can link, create or reject with buttons that disable while pending, and get a clear notice if an item was already resolved, so that every uncertain Seller Entry is resolved once and correctly.
3. As a catalog browser, I want catalog totals, an accent-insensitive name search with paging, and a product page listing every Seller Offer with what each seller sent and its Match Type (and a real 404 for unknown products), so that I can see how duplicates were merged.
4. As any user, I want a theme toggle with light, dark and system choices that is remembered and never flashes the wrong theme, with readable contrast and styled native controls in both themes, so that the interface fits my environment.
5. As any user, I want a sidebar layout (Catalog, Review queue) with the toggle in a top bar, a sidebar that collapses to a drawer on small screens, and clear loading, empty and error states on every page, so that the product feels modern and is never blank.
6. As a keyboard, screen-reader or reduced-motion user, I want labelled controls, a skip-to-content link, announced notices, review-specific button names, visible focus and animations that respect my settings, so that I can do everything without a mouse or distraction.
7. As a developer, I want one implementation of each rule shared by the API and the CLI, a web app that lint prevents from importing database or rule code, and `nx affected` with a task cache, so that rules cannot drift and checks stay fast.
8. As a developer, I want the API described by an OpenAPI document and Swagger page, a web client generated from it, validated requests and error bodies with a stable code and correlation id, and liveness and readiness endpoints, so that the contract is explorable and cannot silently disagree between frontend and backend.
9. As a security-minded maintainer, I want the API to refuse unknown hosts, non-JSON bodies and cross-origin requests, the web app to keep its anti-framing headers and host allowlist, database failures logged without leaking text, and configuration validated once at startup, so that a web page cannot change the catalog and misconfiguration fails immediately.
10. As a maintainer or newcomer, I want the Python reference removed with its behavior preserved as golden fixtures and an archive, and a README describing the TypeScript system and how to run its three apps, so that nothing is lost and nothing stale remains.

## Implementation Decisions

- **Workspace.** Nx is added to the existing pnpm workspace with tasks inferred from each tool's own configuration, a task cache, affected runs and module-boundary lint rules. Projects are tagged so the web application may depend only on the generated API client and shared presentation code, never on backend libraries.
- **Applications.** `api` (NestJS 11, HTTP), `cli` (NestJS standalone application context, no HTTP server) and `web` (Next.js App Router). Backend libraries are CommonJS (Nest 11 with `@nx/nest`); the web app stays ESM and imports none of them.
- **Rules as providers.** The former core package is dissolved into Nest modules: text helpers, normalization, similarity matching (`SequenceMatcher` exposed through a transient factory), matching, catalog repositories and the connection factory, migration runner, Seller File reader, report writer, Consolidation, and Review resolution. Every unit is injectable. Both `api` and `cli` compose the same modules.
- **No behavior change.** Product Identity, golden-record handling, outcome vocabulary, validation limits, transaction semantics, error codes and the migration files and their checksums are exactly as in the accepted ADRs 0002-0005. No schema changes.
- **CLI contract.** Commands, flags, stdout formats, exit codes, JSON reports and structured stderr log lines are unchanged. Nest's own logger is disabled in the CLI context so only the program's output reaches stdout. Output is flushed through the exit code, never by exiting abruptly.
- **API contract (REST + OpenAPI).** DTO classes validated with class-validator and described with swagger decorators. Resources: catalog summary counts; product list (name search using the shared normalization, keyset pagination, default 20, maximum 100); product detail with Seller Offers (capped at 100 with a "more" flag); review queue by status (keyset pagination) with live Candidates for ambiguous items; resolve a Review Item (link to Candidate, link to another product, create, reject); liveness and readiness. Errors use one shape: HTTP status, a stable machine code from a closed set, a message and a correlation id. Consolidate and migrate are not exposed.
- **API security.** Binds to loopback; allowlisted Host values only; only `application/json` bodies (otherwise 415); no CORS headers; baseline security headers. The generated OpenAPI document and Swagger page are available locally.
- **Data access.** One SQLite connection per operation, closed in `finally`; read paths read-only. Resolving a review takes the write lock up front so contention waits for the busy timeout instead of failing immediately. A busy or failed database maps to a stable "database" error, never a stack trace.
- **Web data flow.** Server Components and the review Server Action call the API from the Next server using the generated client. The browser never calls the API. The web app drops its database dependencies, startup database check and connection code, and instead validates its API address at startup and checks API readiness.
- **Generated client.** A library built from the OpenAPI document by a build target, treated as a build output and never hand-edited.
- **Configuration.** Read once at startup, validated, fail fast with one line. The API needs the database path, listen port and allowed hosts; the CLI keeps its flags; the web app needs the API address. Only variable names appear in the repository.
- **Observability.** The API writes structured JSON logs with a correlation id propagated from the request, logs database failures by event and error type only (never message text or seller text), and exposes health checks that reflect the real database.
- **UI design system.** shadcn/ui components on Tailwind v4 with design tokens as CSS variables and class-based theming through `next-themes`: three states (light, dark, system), persisted, no flash, native controls styled via `color-scheme`. Neutral minimal look: soft neutral surfaces, thin borders, tight type, one accent colour, subtle shadows and motion that respects reduced-motion. Sidebar app shell with a top bar holding the toggle; the sidebar collapses to a drawer on small screens. Contrast stays at or above 4.5:1 in both themes, focus rings are always visible, and every page has loading, empty, error and success states.
- **Accessibility carry-overs.** Fold in the previously deferred items: announced notices (live region present before content), review-specific accessible names on repeated buttons, motion-safe animation, and pending-state buttons.
- **Deviations from previous deferrals.** The terminal-escape neutralization in `review list` stays deferred (it changes stdout and would update the fixtures); it is not part of this feature.
- **Python removal and docs.** Golden fixtures are recorded from the Python CLI before any code moves; a compressed archive of the Python source is stored under the archived area; the parity script becomes a golden-file check run against the Nest CLI; Python source, project file, lock file and virtual environment are deleted last; the README and affected documents are rewritten for TypeScript, and ADR 0006 notes its partial supersession.
- **Order of work.** Record fixtures; scaffold Nx and the Nest apps; re-home rules and prove them against the fixtures; add the API and generated client; move the web app onto the API; redesign the UI with the theme toggle; remove Python and rewrite the docs.

## Testing Decisions

- **What a good check is:** it exercises observable behavior only (process output, HTTP responses, rendered pages), never internal wiring or provider structure, and it compares against recorded expectations rather than re-deriving them.
- **Seam 1 - the CLI process (primary):** the full golden-fixture comparison, covering every Consolidation and review rule at once: summaries, reports, table contents after each phase, re-run and dry-run behavior, error paths and the review flow.
- **Seam 2 - the API over HTTP:** responses checked against the OpenAPI contract and the same recorded data, including the review resolve flow, error shape and codes, host and content-type rejection, and the readiness check.
- **UI:** verified by a build, a browser smoke run (pages render, resolve a review, theme toggle switches and persists with no flash, sidebar collapses) and a contrast/accessibility check; no separate unit seam for components.
- **Prior art:** the existing parity script and its helper functions (copies under a scratch directory, byte-for-byte comparisons, table dumps without timestamps).
- **Test authorship is pending the developer's approval at the final stage.** Until then, implementation is verified by lint, typecheck, build and the checks above run as non-test evidence.

## Out of Scope

- Authentication, authorization and any multi-user concern.
- CI pipelines and container images.
- Exposing consolidate or migrate over HTTP, or file upload.
- Changing any Consolidation behavior, schema, or outcome vocabulary.
- Terminal-escape neutralization of seller text in CLI output.
- Remote or shared deployment; the API stays on loopback.
- Mobile apps and internationalization.

## Further Notes

- **Risks to confirm in the plan:** Nest 11 and `@nx/nest` with the workspace's pinned TypeScript 6.0.3 and ESLint versions (decorator metadata, builds); loading the migrations folder without `import.meta.url`; the difflib port keeping identical scores after re-homing; the startup cost of a Nest context on every CLI command.
- **Nest 12** is available but unsupported by `@nx/nest`; the accepted ADR records the trade-off and the trigger to revisit.
- Existing accepted ADRs 0002-0005 remain valid unchanged. ADR 0001 stays superseded.
- Previously deferred minor findings that this redesign touches are folded in; the rest stay deferred.
