# 0006. Rewrite in TypeScript as a shared core for the CLI and a Next.js web UI

Date: 2026-10-06
Status: proposed; partially superseded by [Nx + Nest backend](2026-10-06-nx-nest-backend-web-via-api.md) (web reads SQLite directly, no JSON API) and [rules as Nest providers](2026-10-06-rules-as-nest-providers-nest-11.md) (framework-free core). The decision to use TypeScript throughout stands. The Python reference has since been removed and archived; see [Remove the Python reference](2026-10-06-remove-python-golden-fixtures.md).

Supersedes [0001](0001-python-stdlib-cli.md). [0002](0002-product-identity-normalized-name-and-brand.md),
[0003](0003-seller-link-schema-and-golden-record.md), [0004](0004-review-queue-for-uncertain-matches.md)
and [0005](0005-all-or-nothing-idempotent-runs.md) remain valid unchanged. Related:
[PRD](../prds/0001-catalog-consolidation.md),
[design spec](../specs/2026-10-06-typescript-rewrite-and-web-ui-design.md).

## Context

A web UI was requested for the interview demo: browse the catalog, inspect a run's report, and
resolve review-queue items. The chosen UI stack is Next.js reading `catalog.db` directly, with the
resolution rules executed in TypeScript in-process. The current Python implementation (ADR 0001) is
about 2.6k lines, stdlib-only, and reproduces the acceptance baseline
(200/54/1/1/11/2/0/0 over 269 entries, 258 rows written, re-run writes 0). Keeping it beside a
TypeScript web app would put the review-resolution rules (pending-only state transition, target
product exists, no duplicate seller/product link, no SKU already linked, `REVIEWED` match type) in
two languages that nothing forces to agree; the first divergence would show up as a web decision
the CLI cannot reproduce.

## Options considered

1. **Keep the Python CLI; the Next.js app carries its own TypeScript copy of the resolve rules.**
   - Pros: nothing verified is thrown away; smallest immediate effort; the CLI keeps zero runtime
     dependencies.
   - Cons: two implementations of the same rules, two test suites, drift is a matter of time; any
     future rule change is a two-language change; the demo shows exactly the duplication a
     consolidation tool exists to remove.
2. **Python core behind a JSON API (FastAPI); Next.js is a pure client.**
   - Pros: one implementation of every rule; the UI never touches SQLite; the shape a multi-user
     deployment would eventually need.
   - Cons: a second process, a second start command, CORS, request schemas and an HTTP error
     taxonomy for a single-user local demo; ADR 0001 already rejected a server for this problem,
     and the UI request does not change that argument; the demo becomes "start two things".
3. **Next.js spawns the Python CLI as a subprocess for every write.**
   - Pros: one implementation of the rules; the web app stays thin.
   - Cons: a Python interpreter becomes a hidden runtime dependency of a Node app; errors and
     results cross a stdout/exit-code boundary that must be parsed; per-request process start-up;
     the review-resolve path needs a CLI surface designed for machines, which does not exist yet.
4. **Whole project in TypeScript** (chosen): a pnpm workspace with `packages/core` (domain,
   use cases, SQLite adapter), `apps/cli` and `apps/web`; Node 24 with `node:sqlite`; the
   migration SQL reused byte-for-byte with the same `SchemaVersion` rows and checksums.
   - Pros: one language, one implementation of normalization, matching, run semantics and
     review resolution, imported by both entry points; the web app reads the database through
     the same adapter the CLI writes with; no second process and no native SQLite driver.
   - Cons: a full rewrite of a working, verified implementation; parity risks that are real,
     not theoretical: Python `str.casefold()` versus JavaScript `toLowerCase()` ("Straße" folds
     to "strasse" only in Python), `difflib.SequenceMatcher` has no JavaScript equivalent and
     must be ported faithfully for the fuzzy scores to match, Python's and V8/ICU's Unicode NFKD
     tables may differ for some code points, and float formatting in the JSON report differs
     between the two runtimes; `node:sqlite` is still at a lower stability level in Node 24
     than the rest of the standard library; Node 24 becomes a hard requirement; the web app
     gives up ADR 0001's zero-runtime-dependency property (Next.js, React).

## Decision

Option 4. The deciding reasons: (a) the review-resolution rules are now business rules with two
consumers, and one implementation shared by both is the only arrangement that cannot drift;
(b) the alternatives that also achieve one implementation (2, 3) buy it with a second process or a
hidden interpreter, which is more operational surface than the demo justifies; (c) the schema,
identity, review-queue and run-semantics decisions are language-independent, so the rewrite
changes the language and nothing else, and the existing baseline is a complete acceptance test
for it.

## Consequences

- Easier: one place to read or change any rule; the UI and the CLI are guaranteed to agree because
  they call the same function; one toolchain (`pnpm`, `tsc`, one test runner).
- Harder: the parity cons above must be closed by porting, not approximated; `node:sqlite` API
  changes land on us directly.
- We commit to maintaining: a parity check that runs both CLIs (migrate + consolidate) on fresh
  copies of `data/catalog.db` and diffs outcome counts, the JSON Lines report and the contents of
  every written table. The switch is gated on that check being green. Python remains the
  reference implementation until then and is removed in a separate, user-confirmed step, never as
  part of the rewrite itself.
- Revisit when: parity for normalization or fuzzy scores cannot be reached without special-casing
  inputs (then the Python core stays and option 2 or 3 is reopened); `node:sqlite` changes
  incompatibly or is withdrawn (then a driver such as `better-sqlite3` replaces it behind the
  adapter); or the UI needs multi-user or remote access (then an API layer and authentication
  become necessary, and option 2's shape returns as a requirement rather than a cost).
