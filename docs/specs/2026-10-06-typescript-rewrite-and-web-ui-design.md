# Catalog Consolidation — TypeScript rewrite and web UI (design spec)

Status: approved by the user 2026-10-06
Date: 2026-10-06
Owner: Ricardo Fagmer
Risk: medium (behavioral parity with a shipped tool; local SQLite only, no production surface) — autonomy ceiling A2

## 1. Context and goals

The catalog consolidation tool exists today as a Python 3.12 stdlib CLI (`src/catalog_consolidation/`,
frozen contracts in [`catalog-consolidation/tasks.md`](catalog-consolidation/tasks.md)). It migrates
`catalog.db`, consolidates `ProductEntry.json` into it, and lists/resolves the review queue. It
reproduces a verified baseline on the delivered data (200/54/1/1/11/2/0/0 = 269, `rows_written` 258).

The take-home will be presented in an interview. A reviewer judges clarity and code quality, and a
review queue that can only be driven from a terminal makes the hardest decision in the system (ADR
0004: uncertain matches wait for a human) invisible in a demo. The cost of staying as-is: a demo with
no visible review step, and two languages if a web UI were bolted on beside the Python CLI.

Goal: one TypeScript codebase — shared core, CLI with identical behavior, and a small Next.js web UI
that reads the catalog and resolves reviews — with the Python implementation kept as the reference
until the TypeScript CLI reproduces the baseline byte-for-byte on the parity check (section 5.7).

Related: PRD [`../prds/0001-catalog-consolidation.md`](../prds/0001-catalog-consolidation.md);
ADRs [0001](../adr/0001-python-stdlib-cli.md) (superseded by 0006 once accepted),
[0002](../adr/0002-product-identity-normalized-name-and-brand.md),
[0003](../adr/0003-seller-link-schema-and-golden-record.md),
[0004](../adr/0004-review-queue-for-uncertain-matches.md),
[0005](../adr/0005-all-or-nothing-idempotent-runs.md),
[0006 — TypeScript shared core](../adr/0006-typescript-shared-core.md) (written in parallel with this spec).

### Non-goals (out of scope)

- Login, users, roles, or any auth — the app binds to `127.0.0.1` and is a single-user local demo.
- Uploading a seller file or running `consolidate`/`migrate` from the browser.
- Editing catalog rows (`Product`, `SellerProduct`) from the UI; the only write is review resolution.
- Client-side state libraries (TanStack Query, Zustand, Redux) or client-side data fetching.
- An HTTP JSON API: the web app reads and writes SQLite directly through `@catalog/core`.
- Production deployment, Docker, CI pipelines, hosting configuration.
- Changing any matching, normalization, validation, report, or exit-code behavior. Zero semantic drift.
- Removing the Python implementation — a separate later step (section 9) after explicit confirmation.

## 2. Decisions (recorded 2026-10-06, not reopened here)

| # | Decision |
|---|---|
| D1 | Purpose of the web UI: interview demo — local, single user, judged on clarity and code quality. |
| D2 | Whole project in TypeScript, CLI included. The Next.js app reads and writes SQLite directly (no separate JSON API); the resolve rules live in TypeScript (`@catalog/core`). |
| D3 | pnpm workspace: `packages/core` (domain + use cases + SQLite adapters + migration runner), `apps/cli` (`migrate`, `consolidate`, `review list|resolve`; same flags, outputs, exit codes as today), `apps/web` (Next.js App Router). `migrations/*.sql` reused byte-for-byte. Driver: Node 24 built-in `node:sqlite` (`DatabaseSync`), verified on 2026-10-06 to read the catalog copy; no native dependencies. Same `SchemaVersion` table and SHA-256 checksums, so a database is interchangeable between the Python and TypeScript versions. Explicit `BEGIN`/`COMMIT`/`ROLLBACK`. Python stays as the reference until the TS CLI reproduces the baseline; removed in a separate later step. |
| D4 | Parity risks designed for explicitly: (a) Python `str.casefold()` vs JS `toLowerCase()`; (b) faithful port of `difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()`, no npm similarity library; (c) transactions (Python's implicit `autocommit=False` transaction vs `node:sqlite` autocommit). |

## 3. Workspace layout

```
pnpm-workspace.yaml              packages: ["packages/*", "apps/*"]
package.json                     private; scripts: build, lint, typecheck, cli, parity
tsconfig.base.json               strict, target ES2023, module NodeNext, moduleResolution NodeNext,
                                 exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax
.npmrc                           engine-strict=true
.nvmrc                           24
migrations/                      0001_seller_product_text_id.sql, 0002_product_match_keys.sql,
                                 0003_review_queue.sql  (unchanged bytes; checksums must stay identical)
data/                            original input, never written to
scripts/parity-check.sh          section 5.7
packages/core/                   @catalog/core
  package.json                   "type": "module", exports "." -> dist/index.js (+ types), engines node >= 24
  src/index.ts                   public surface (barrel of the names listed in section 4)
  src/domain/{limits,models,errors,ports,text,normalization,sequence-matcher,matching}.ts
  src/use-cases/{consolidate-file,resolve-review}.ts
  src/adapters/{sqlite-connection,sqlite-catalog-repository,sqlite-review-repository,
                sqlite-migrations,json-entry-reader,report-writer,python-format}.ts
apps/cli/                        @catalog/cli
  package.json                   bin: { "catalog-consolidation": "dist/main.js" }
  src/{main,arguments,commands/migrate,commands/consolidate,commands/review,logging,exit-codes}.ts
apps/web/                        @catalog/web (Next.js App Router, Tailwind v4, create-next-app default)
  next.config.ts                 transpilePackages: ["@catalog/core"]
  instrumentation.ts             validates CATALOG_DB_PATH once at server start (section 6.6)
  src/app/{layout,page,loading,error,not-found,globals.css}.tsx
  src/app/products/[id]/{page,loading,not-found}.tsx
  src/app/reviews/{page,loading,actions}.ts(x)
  src/components/                SummaryTiles, ProductsTable, Pagination, SearchForm, ReviewCard,
                                 StatusTabs, Notice
  src/lib/{config,catalog-db,review-messages,search-params}.ts   (catalog-db.ts is `import 'server-only'`)
```

- Package names: `@catalog/core`, `@catalog/cli`, `@catalog/web`. All `"private": true`.
- Node `>= 24` (`engines` in every package; `.nvmrc`). pnpm 10 via `packageManager` in the root `package.json`.
- TypeScript strict everywhere; no `any`, no non-null assertions in core; `unknown` at every boundary (JSON, SQLite rows, form data) narrowed by type guards.
- Runtime dependencies: `@catalog/core` has none (Node built-ins only: `node:sqlite`, `node:fs`, `node:crypto`, `node:path`). `@catalog/cli` depends on `@catalog/core` and uses `node:util` `parseArgs`. `@catalog/web` depends on `next`, `react`, `react-dom`, `server-only`, `@catalog/core`. Dev: `typescript`, `eslint` (flat config, `typescript-eslint` strict), Tailwind; `vitest` only if the opt-in tests are taken.
- How the CLI runs: `tsc` compiles `apps/cli/src` to `apps/cli/dist`; the bin is `catalog-consolidation` (shebang `#!/usr/bin/env node`). Root script `"cli": "node apps/cli/dist/main.js"` so `pnpm cli consolidate --db ... --input ...` works after `pnpm -r build`. pnpm builds in topological order, so core builds before cli and web.
- How web consumes core: `transpilePackages: ["@catalog/core"]` in `next.config.ts`; core's `exports` points at `dist/`, so `pnpm --filter @catalog/core build` (or `build --watch` during development) must run before `next dev`. The root `dev` script runs both.
- `migrations/` resolution: `defaultMigrationsDir()` in `packages/core/src/adapters/sqlite-migrations.ts` resolves `<workspace root>/migrations` from `import.meta.url` (from `packages/core/dist/adapters/`, four levels up), overridable by the environment variable `CATALOG_MIGRATIONS_DIR`. Only `apps/cli migrate` uses it. The web app never runs migrations; it requires schema version >= 3 and never resolves the directory, so Next.js bundling cannot break it. Mirrors Python plan risk R7 (works from the workspace checkout, not from a packed tarball).

## 4. Core contracts in TypeScript (`@catalog/core`)

These restate the frozen Python contracts in `tasks.md` as TypeScript. Names are camelCase; values,
orders, and vocabularies are unchanged. Every array type is `readonly`; every object type is a
`readonly` interface (the TypeScript equivalent of a frozen dataclass).

### 4.1 `domain/limits.ts`

Same constants and values as `domain/limits.py`: `MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024`,
`MAX_INPUT_ENTRIES = 100_000`, `MAX_SELLER_PRODUCT_ID_LENGTH = 64`, `MAX_SELLER_NAME_LENGTH = 100`,
`MAX_NAME_LENGTH = 200`, `MAX_BRAND_LENGTH = 100`, `MAX_CATEGORY_LENGTH = 100`,
`SELLER_PRODUCT_ID_PATTERN = /^[A-Za-z0-9._-]+$/u`, `UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u`
(anchored: `re.fullmatch` semantics), `FUZZY_REVIEW_THRESHOLD = 0.8`, `MAX_EXACT_CANDIDATES = 50`,
`FUZZY_SCAN_BATCH_SIZE = 500`, `BACKFILL_BATCH_SIZE = 500`, `REPORT_SCORE_DECIMALS = 4`,
`REVIEW_PAGE_DEFAULT_LIMIT = 20`, `REVIEW_PAGE_MAX_LIMIT = 100`, `REQUIRED_SCHEMA_VERSION = 3`.
Lengths are measured in Unicode code points (`Array.from(value).length`), matching Python `len()`.

### 4.2 `domain/models.ts`

```ts
export const OUTCOME_CODES = ["LINKED_EXACT", "LINKED_NORMALIZED", "CREATED", "UNCHANGED",
  "SKIPPED_DUPLICATE_LISTING", "HELD_FOR_REVIEW", "REJECTED_INVALID", "CONFLICT_SELLER_SKU"] as const;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];
export const MATCH_TYPES = ["EXACT", "NORMALIZED", "CREATED", "REVIEWED"] as const;
export const REVIEW_REASONS = ["FUZZY", "AMBIGUOUS"] as const;
export const REVIEW_STATUSES = ["PENDING", "LINKED", "CREATED", "REJECTED"] as const;
export const WARNING_CODES = ["non_uuid_seller_sku", "unknown_fields_ignored", "blank_brand_treated_as_null",
  "blank_category_treated_as_null", "ambiguous_candidates", "review_previously_rejected"] as const;
export const VIOLATION_CODES = ["not_an_object", "missing", "not_a_string", "blank", "too_long",
  "invalid_charset", "unnormalizable"] as const;
export const FIELD_NAMES = ["record", "Id", "SellerName", "Name", "Brand", "Category"] as const;
// MatchType, ReviewReason, ReviewStatus, WarningCode, ViolationCode, FieldName derived the same way.

export interface FieldViolation { readonly field: FieldName; readonly code: ViolationCode }
export interface SellerEntry { readonly kind: "entry"; readonly index: number; readonly sellerName: string;
  readonly sellerProductId: string; readonly name: string; readonly brand: string | null;
  readonly category: string | null; readonly warnings: readonly WarningCode[] }
export interface RejectedEntry { readonly kind: "rejected"; readonly index: number; readonly sellerName: string | null;
  readonly sellerProductId: string | null; readonly violations: readonly FieldViolation[];
  readonly warnings: readonly WarningCode[] }
export type InputEntry = SellerEntry | RejectedEntry;

export interface CatalogProduct { id; name; brand: string | null; category: string | null;
  normalizedName: string | null; normalizedBrand: string | null }          // all readonly
export interface FuzzyCandidate { readonly productId: number; readonly normalizedName: string }
export interface MatchQuery { readonly rawName: string; readonly normalizedName: string; readonly normalizedBrand: string | null }

export interface LinkDecision { readonly kind: "link"; readonly productId: number; readonly matchType: "EXACT" | "NORMALIZED" }
export interface HoldDecision { readonly kind: "hold"; readonly reason: ReviewReason; readonly candidateProductId: number | null;
  readonly score: number | null; readonly candidateProductIds: readonly number[] }
export interface CreateDecision { readonly kind: "create"; readonly bestScore: number | null }
export type MatchDecision = LinkDecision | HoldDecision | CreateDecision;

// SellerLink, NewSellerLink, NewProduct, ReviewItem, NewReviewItem, ProductKeySource, ReviewRecord
// (item + sourceName/sourceBrand/sourceCategory), EntryOutcome, RunSummary, ConsolidationResult:
// field-for-field the Python dataclasses, camelCased. RunSummary.counts is
// readonly (readonly [OutcomeCode, number])[] in OUTCOME_CODES order, zeros included.
```

`isSellerEntry`, `isHoldDecision` etc. are plain discriminant checks on `kind`; there is no
`instanceof` on data.

### 4.3 `domain/errors.ts`

```ts
export type InputFileErrorCode = "unreadable" | "too_large" | "not_utf8" | "not_json" | "not_an_array" | "too_many_entries";
export type DatabaseFileErrorCode = "not_found" | "schema_outdated";
export type MigrationErrorCode = "invalid_filename" | "version_gap" | "checksum_mismatch" | "rows_lost";
export type ReviewResolutionErrorCode = "review_not_found" | "review_not_pending" | "product_not_found"
  | "seller_sku_already_linked" | "seller_already_linked_to_product" | "source_name_unnormalizable";

export class DomainError extends Error {}
export class InvalidInputFileError extends DomainError { readonly code: InputFileErrorCode; readonly detail: string }
export class DatabaseFileError extends DomainError { readonly code: DatabaseFileErrorCode; readonly detail: string }
export class MigrationError extends DomainError { readonly code: MigrationErrorCode; readonly detail: string }
export class ReviewResolutionError extends DomainError { readonly code: ReviewResolutionErrorCode; readonly detail: string }
```

Constructors take `{ code, detail }`; `message` is `` `${code}: ${detail}` ``; every class sets
`this.name`. `detail` never contains seller-supplied text (paths, sizes, versions, ids, statuses
only) — same rule as Python. The six review codes are verified against
`use_cases/resolve_review.py` (the brief listed five; `source_name_unnormalizable` is the sixth and
is kept). The `schema_outdated` detail names the TypeScript command:
`run: catalog-consolidation migrate --db <path>` (stderr text is outside the parity contract, 5.7).

### 4.4 `domain/ports.ts`

```ts
export interface CatalogReader {
  findByNormalizedName(args: { normalizedName: string; normalizedBrand: string | null }): readonly CatalogProduct[];
  listBrandCompatible(args: { normalizedBrand: string | null }): Iterable<FuzzyCandidate>;   // keyset batches of FUZZY_SCAN_BATCH_SIZE
}
export interface CatalogRepository extends CatalogReader {
  findLinkBySku(args: { sellerName: string; sellerProductId: string }): SellerLink | null;
  findLinkBySellerProduct(args: { sellerName: string; productId: number }): SellerLink | null;
  findReviewBySku(args: { sellerName: string; sellerProductId: string }): ReviewItem | null;
  insertProduct(product: NewProduct): number;
  insertLink(link: NewSellerLink): number;
  enqueueReview(review: NewReviewItem): number;
  listProductsMissingMatchKeys(args: { afterId: number; limit: number }): readonly ProductKeySource[];
  setMatchKeys(args: { productId: number; normalizedName: string; normalizedBrand: string | null }): void;
}
export interface UnitOfWork { readonly catalog: CatalogRepository; commit(): void; rollback(): void; rowsWritten(): number }
export interface EntrySource { read(): readonly InputEntry[] }                    // throws InvalidInputFileError
export interface ReviewRepository {
  listByStatus(args: { status: ReviewStatus; afterId: number; limit: number }): readonly ReviewRecord[];
  get(args: { reviewId: number }): ReviewRecord | null;
  productExists(args: { productId: number }): boolean;
  transitionStatus(args: { reviewId: number; fromStatus: ReviewStatus; toStatus: ReviewStatus }): boolean;
}
export interface ReviewUnitOfWork { readonly catalog: CatalogRepository; readonly reviews: ReviewRepository; commit(): void; rollback(): void }
```

All methods are synchronous: `node:sqlite` is synchronous, and the Python reference is too. Keeping
the domain synchronous removes an entire class of ordering drift (writes visible to later entries
inside one transaction, frozen rule G).

### 4.5 Use cases

```ts
export class ConsolidateFile {
  constructor(args: { unitOfWork: UnitOfWork; entrySource: EntrySource; inputLabel: string; runId: string });
  execute(args: { dryRun: boolean }): ConsolidationResult;
}
export class ListReviews { constructor(args: { unitOfWork: ReviewUnitOfWork }); execute(args: { status: ReviewStatus; afterId: number; limit: number }): ReviewPage }
export class ResolveReview { constructor(args: { unitOfWork: ReviewUnitOfWork }); execute(command: ResolveCommand): ResolutionResult }
export type ResolveCommand = { kind: "create"; reviewId: number } | { kind: "reject"; reviewId: number } | { kind: "link"; reviewId: number; productId: number };
export interface ResolutionResult { readonly reviewId: number; readonly status: ReviewStatus; readonly productId: number | null; readonly linkId: number | null }
export interface ReviewPage { readonly records: readonly ReviewRecord[]; readonly nextAfterId: number | null }
export function matchEntry(args: { query: MatchQuery; catalog: CatalogReader }): MatchDecision;
export function normalize(text: string | null): string | null;
export function cleanDisplay(text: string | null): string | null;
```

The per-entry algorithm, the heal step, the REVIEWED re-check rule, the `rows_written`-before-commit
read, rollback-on-any-exception, the review resolution order (pending check → reject | sku-unlinked →
create | product-exists → seller-not-on-product → link → conditional status transition) are the
Python code (`consolidate_file.py`, `resolve_review.py`) translated statement for statement.
`ListReviews` ends its read with `rollback()` exactly as today.

### 4.6 Adapters

- `sqlite-connection.ts`: `openConnection(dbPath: string): DatabaseSync` — throws
  `DatabaseFileError("not_found")` unless `dbPath` is an existing regular file; opens with
  `new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })`, then `PRAGMA foreign_keys = ON`
  and `PRAGMA busy_timeout = 5000` (in autocommit, so the PRAGMA takes effect). Also exports
  `readSchemaVersion`, `requireSchemaVersion`, and `beginTransaction(db)` = `db.exec("BEGIN")`.
- `sqlite-catalog-repository.ts`: `SqliteCatalogRepository({ connection })`, `SqliteUnitOfWork({ connection })`.
  The unit of work constructor runs `BEGIN` and records `SELECT total_changes()`; `rowsWritten()`
  returns `total_changes()` now minus that baseline — the same SQLite counter Python's
  `connection.total_changes` wraps, so the 258/0 figures match by construction. Frozen SQL from
  `tasks.md` verbatim, `?` placeholders only. `listBrandCompatible` is a generator over keyset
  batches. Row values are narrowed (`typeof value === "number"`, `Number.isInteger`) and
  `MatchType`/`ReviewReason`/`ReviewStatus` checked against the `as const` vocabularies; an
  unexpected value throws.
- `sqlite-review-repository.ts`: `SqliteReviewRepository`, `SqliteReviewUnitOfWork` — same SQL as the Python module.
- `sqlite-migrations.ts`: `MigrationFile`, `AppliedMigration`, `MigrationReport`,
  `defaultMigrationsDir()`, `SqliteMigrationRunner({ connection, dbPath, migrationsDir })` with
  `pending()` and `applyPending()`. Discovery regex `^(\d{4})_([a-z0-9_]+)\.sql$`; contiguous
  versions from 1; SHA-256 of the file bytes via `node:crypto`; checksum re-verified between
  discovery and apply; backup to `<db>.pre-migrate-<UTC yyyymmddThhmmssZ>.bak` (refuse to
  overwrite); each migration in its own `BEGIN`…`COMMIT`: `CREATE TABLE IF NOT EXISTS SchemaVersion`,
  `SellerProduct` row count before/after for version 1 (`rows_lost`), `db.exec(script)`, backfill for
  version 2 in keyset batches (`UPDATE` per row, counting every row — 975), `INSERT INTO
  SchemaVersion`, `COMMIT`; any throw → `ROLLBACK`, rethrow. Backup mechanism: `node:sqlite`'s
  `backup()` from `node:sqlite` (available on Node v24.21.0, see Q2).
- `json-entry-reader.ts`: `JsonEntryReader({ path, maxBytes?, maxEntries? })` — section 5.3.
- `report-writer.ts`: `toReportRecord`, `writeJsonlReport({ path, outcomes })` (write `<path>.tmp`,
  `fsync`, `renameSync`; unlink the temp file on failure), `formatSummary(summary)`.
- `python-format.ts`: `roundHalfEven(value, decimals)`, `formatPythonFloat(value)`,
  `formatFixed(value, decimals)`, `pythonPathLabel(text)` — section 5.4.

## 5. Parity specification

Parity means: identical stdout summary (modulo run id), identical JSONL report bytes, identical
table contents, identical exit codes, on the same inputs. Stderr text (error details, log line
timestamps, usage messages) is explicitly NOT part of parity; its JSON log schema is (5.6).

### 5.1 Python text semantics (`domain/text.ts`)

Python `str.strip()`, `str.split()` and `len()` differ from JS `trim()`, `split(/\s+/)` and
`.length`. One module owns the Python definitions and nothing else in core touches raw JS variants:

- `PYTHON_WHITESPACE` = `[\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0  -     　]`
  (the characters for which Python `str.isspace()` is true). JS `\s` adds `﻿` and lacks
  `\x1c-\x1f` and `\x85`, so `\s` is never used in core.
- `pyStrip(text)`, `pyIsBlank(text)`, `pySplitJoin(text)` (= `" ".join(text.split())`), `pyLength(text)`
  (code points).

### 5.2 Normalization (`domain/normalization.ts`)

Same five ordered steps as `normalization.py`:

1. `text.normalize("NFKD")`, then drop every combining mark. Python drops characters with a non-zero
   canonical combining class (`unicodedata.combining`); JS exposes no combining class, so the port
   drops `\p{M}` (Mn, Mc, Me). The two sets differ only for marks with class 0 (some Indic/Thai
   vowel signs), which become a space in step 4 instead of vanishing — a difference only when such a
   mark sits between two ASCII alphanumerics. Not present in the delivered data; recorded as Q5.
2. Case folding. JS `toLowerCase()` is not `casefold()`. After NFKD + mark removal, the only characters
   whose full case folding yields ASCII letters while `toLowerCase()` does not are `ß` (U+00DF → `ss`)
   and `ẞ` (U+1E9E, lowercases to `ß`). Every other difference between the two (Greek final sigma,
   Cherokee, ligatures `ﬁ`/`ﬀ`/`ﬆ`, long s `ſ`, Kelvin sign) is either resolved by NFKD first or
   falls outside `[0-9a-z]` and becomes a space in step 4 under both. Implementation:
   `toLowerCase()` then replace `ß` with `ss`. Verified against the 16-row reference table of
   `tasks.md` (`Straße` → `strasse`) and against all 975 catalog rows by the parity check (5.7 step 2).
3. Delete `"`, `'`, U+2019, U+201C, U+201D.
4. Replace every run matching `/[^0-9a-z]+/gu` with one space.
5. `pySplitJoin`; empty → `null`; `null` input → `null`.

`cleanDisplay(text)` = `pySplitJoin`, blank → `null`.

### 5.3 JSON input validation (`adapters/json-entry-reader.ts`)

File level, in order, each throwing `InvalidInputFileError`: not a regular file / `statSync` error →
`unreadable`; `size > maxBytes` → `too_large`; read at most `maxBytes + 1` bytes and re-check →
`too_large`; decode with `new TextDecoder("utf-8", { fatal: true })` and strip one leading U+FEFF
(Python `utf-8-sig`) — decode failure → `not_utf8`; `JSON.parse` throws (any error, including a
V8 stack/`RangeError` on deep nesting) → `not_json`; `NaN`/`Infinity` are already rejected by
`JSON.parse` (Python needs `parse_constant`; same result); not `Array.isArray` → `not_an_array`;
`length > maxEntries` → `too_many_entries`.

Record level: identical rules, violations collected in field order `Id, SellerName, Name, Brand, Category`;
lengths via `pyLength`; blank via `pyIsBlank`; `Id` charset by the anchored regex; non-UUID warning;
unknown keys warning (`Object.keys(record)` ⊄ the five names); `Brand`/`Category` absent or `null`
→ `null`, blank string → `null` plus warning; `SellerName` stored `pyStrip`ped, `Name` verbatim.
A record is an object iff `typeof record === "object" && record !== null && !Array.isArray(record)`.
Duplicate JSON keys: last wins in both runtimes.

### 5.4 Numbers and strings in the report, summary and `review list`

- `roundHalfEven(x, 4)`: Python `round()` rounds the exact binary value half-to-even; JS `toFixed(4)`
  rounds the exact binary value half-up. They differ only on exact ties, which at four decimals are
  exactly the odd multiples of 1/32 (0.03125, 0.09375, …, 0.96875 — a ratio `2M/T` can hit them).
  Algorithm: `const scaled = x * 32; if (Number.isInteger(scaled) && scaled % 2 !== 0) → tie: round
  the 5th-decimal half to the even 4th decimal manually; else Number(x.toFixed(4))`. Both paths
  yield the double nearest the decimal result, as Python does.
- `formatPythonFloat(x)`: `repr(float)` and `Number.prototype.toString` are both shortest-round-trip;
  for a rounded score in [0, 1] they differ only for integral values (`0.0`/`1.0` vs `0`/`1`), so the
  formatter appends `.0` when `Number.isInteger(x)`. Exponent notation cannot occur for values in
  [0.0001, 1] or 0.
- Integers (`index`, `productId`, counts, ids) render as plain integers in both.
- JSONL record: `JSON.stringify` of an object literal built in the frozen key order
  `index, sellerName, sellerProductId, outcome, productId, reviewReason, score, warnings, errors`,
  with `score` pre-rendered: the writer builds the line with a placeholder-free approach —
  `JSON.stringify` of every field except `score`, and `score` spliced as `formatPythonFloat(rounded)`
  or `null`. `JSON.stringify` default output equals `separators=(",", ":")`; `ensure_ascii=False`
  equals JS not escaping non-ASCII; both escape `"`, `\`, and control characters below U+0020 (short
  forms `\n \r \t \b \f`, else `\u00xx` lowercase) and neither escapes `/`, U+007F, U+2028/2029.
  Lone surrogates cannot appear (the input was decoded as valid UTF-8). File written UTF-8, `\n` line endings.
- Summary: `` `${code.padEnd(26)}${String(count).padStart(6)}` `` per line; header
  `run <runId> input=<inputLabel> dry_run=<true|false> committed=<true|false> rows_written=<n>`; `TOTAL` line.
- `inputLabel`: Python prints `str(Path(arg))`, which strips a leading `./`, collapses repeated `/`
  and a trailing `/`, and keeps `..`. `pythonPathLabel(arg)` applies exactly those rules to the
  argv string.
- `review list` score column: `formatFixed(score, 4)` = `roundHalfEven` then `toFixed(4)` on the
  rounded value (Python `f"{x:.4f}"` is also half-even on the exact value). Columns tab-separated,
  `cleanDisplay` applied to `SellerName` and `SourceName`, trailing `next: --after-id <id>` line.
- `migrate` output lines: `backup: <path>`, `applied NNNN <name>` (`(backfilled <n> products)` suffix
  on version 2), `schema version: <n>` (`(up to date)` suffix when nothing was pending).
- `review resolve` output: `review <id> -> <STATUS>` plus ` product=<id> link=<id>` when a product is involved.

### 5.5 `difflib.SequenceMatcher` port (`domain/sequence-matcher.ts`)

No npm similarity library. The class is a line-by-line port of CPython's `difflib.py` with
`isjunk = None`, `autojunk = False`, over strings of ASCII characters (normalized keys contain only
`[0-9a-z ]`, so UTF-16 length equals code-point length and `ratio` denominators match).

- `setSeq2(b)`: builds `b2j: Map<char, number[]>` of ascending indexes; with `autojunk=False`
  nothing is marked popular and `bjunk` is empty — the junk-related extension loops in
  `find_longest_match` are ported as no-ops (kept for fidelity, provably unreachable).
- `findLongestMatch(alo, ahi, blo, bhi)`: the dynamic-programming scan with `j2len` maps exactly as
  CPython does it, returning the longest block; on ties the block that starts earliest in `a`, and
  among those, earliest in `b` (CPython's documented tie rule — the strict `>` comparison and the
  iteration order produce it; the port keeps both).
- `getMatchingBlocks()`: the explicit queue algorithm (not recursion), then the adjacent-block merge
  and the final `(la, lb, 0)` sentinel. Only the sum of block sizes feeds `ratio`, but the merge is
  kept so the port is testable against `get_matching_blocks()` output.
- `ratio()` = `2.0 * matches / (la + lb)`, `1.0` when both strings are empty.
- `quickRatio()` (multiset intersection count) and `realQuickRatio()` (`2 * min(la, lb) / (la + lb)`)
  are upper bounds; `matching.ts` may skip a candidate only when either bound is strictly below the
  current best, exactly as `matching.py` does. Ties still reach the full `ratio()` so the lowest id wins.

Acceptance values (recorded from Python on 2026-10-05): `roteador wifi 6 tp link` vs
`router wifi 6 tp link` → 0.9091 (20 matches / 44); `processador amd ryzen 9 7950x` vs
`processor amd ryzen 9 7950x` → 0.9643 (27 / 56); `security test product` best catalog ratio →
0.4762. Ratios are compared as doubles before rounding: the port must yield bit-identical doubles
(same rational `2M/T`), which the report check (5.7 step 4) verifies on every fuzzy entry.

### 5.6 Structured log line (stderr)

One JSON object per command, same keys as Python's `_JsonLogFormatter`: `timestamp` (ISO 8601 UTC —
JS `toISOString()` renders `Z` and milliseconds where Python renders `+00:00` and microseconds;
format difference accepted, schema identical), `level`, `service: "catalog_consolidation"`, `event`
(`consolidate.finished`, `consolidate.failed`, `migrate.finished`, `migrate.failed`,
`review.list.finished`, `review.resolve.finished`, `review.*.failed`), `correlationId` = run id
(`crypto.randomUUID()` without dashes, 32 hex chars), `durationMs` (integer, `performance.now()`),
plus the same per-command fields (`dryRun`, `committed`, `rowsWritten`, `total`, `counts` object;
`schemaVersion`, `appliedCount`; `status`, `rows`, `hasMore`; `reviewId`, `status`, `productId`,
`linkId`; on failure `errorType` = the error class name). Never seller text, never a stack trace.

### 5.7 The parity check (`scripts/parity-check.sh`)

Runs from the workspace root with Python (`.venv`) and the built TS CLI present. Exits non-zero on
the first difference and prints the diff.

1. `rm -rf out/parity && mkdir -p out/parity && cp data/catalog.db out/parity/py.db && cp data/catalog.db out/parity/ts.db`.
2. Migrate both: `.venv/bin/python -m catalog_consolidation migrate --db out/parity/py.db` and
   `pnpm cli migrate --db out/parity/ts.db`. Compare `SELECT Version, Name, Checksum FROM SchemaVersion
   ORDER BY Version` (identical rows — proves the migration files are byte-identical and the
   checksum algorithm matches) and `SELECT Id, NormalizedName, NormalizedBrand FROM Product ORDER BY
   Id` (identical 975 rows — the normalizer verified on the real catalog, including `Id 661` →
   `grass trimmer string|black decker`).
3. Consolidate both with `--input data/ProductEntry.json --report out/parity/{py,ts}.jsonl`; capture
   stdout and exit codes. Compare stdout after replacing the run id token on the first line with
   `<run>`: must be identical and equal to the baseline (200/54/1/1/11/2/0/0, TOTAL 269,
   `committed=true rows_written=258`), exit code 0 on both.
4. `diff out/parity/py.jsonl out/parity/ts.jsonl` — byte-for-byte, 269 lines, ignoring nothing.
5. Table contents: for each of `Product`, `SellerProduct`, `ProductMatchReview`, dump every column
   except `CreatedAt` (explicit column lists in `ORDER BY Id` selects, run through `sqlite3 -json`;
   `.dump` is not used because `CreatedAt` sits inside each `INSERT` line and would need fragile
   text surgery). Dumps must be identical, with counts 976 / 255 / 2.
6. Re-run step 3 on both databases (no `--report`): identical stdout modulo run id, `rows_written=0`,
   UNCHANGED 256, SKIPPED_DUPLICATE_LISTING 11, HELD_FOR_REVIEW 2; re-dump as in step 5 — unchanged.
7. `--dry-run` on two fresh migrated copies: baseline counts, `committed=false`, tables 975 / 0 / 0.
8. Error paths: `printf '{}' > out/parity/bad.json` → both exit 2; `consolidate` on an unmigrated copy
   → both exit 2; `review resolve --id 999 --reject` → both exit 2, nothing written.
9. Review parity: on both databases `review list` (identical stdout), `review resolve --id 1 --link 21`
   (stdout `review 1 -> LINKED product=21 link=256` on both), `review resolve --id 2 --reject`, then
   `consolidate` again: identical stdout, UNCHANGED 257, HELD_FOR_REVIEW 1 with the
   `review_previously_rejected` warning visible in a `--report` diff; re-dump identical.

Step 9 also freezes the human-decision path (REVIEWED is authoritative). The script's Python half is
replaced by recorded golden files before Python is removed (section 9).

## 6. Web app (`@catalog/web`)

Server Components for every read, Server Actions for the single write. No client-side fetching, no
`useEffect` data loading, no client state library. `'use client'` appears only where interaction
needs it (the search form submit is a plain `<form method="get">`, so possibly nowhere beyond
`error.tsx`, which Next requires to be a client component).

### 6.1 Routes

| Route | Reads | UI |
|---|---|---|
| `/` | summary counts; products page (keyset) | three summary tiles (products, seller links, pending reviews); search form; products table `Id, Name, Brand, Category, Sellers` with a link to `/products/[id]`; next/previous controls |
| `/products/[id]` | one product; its seller links | catalog row (Name, Brand, Category, NormalizedName, NormalizedBrand); sellers table `SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType`; `notFound()` when the id is missing or not a positive integer |
| `/reviews` | review page by status (keyset) | status tabs PENDING / LINKED / CREATED / REJECTED (links with `aria-current`); PENDING rows render a `ReviewCard` with the seller entry (SourceName/SourceBrand/SourceCategory, seller, SKU) side by side with the candidate product (Id, Name, Brand, Category, score as `formatFixed(score, 4)`); non-pending rows render a compact table; a `Notice` banner driven by `?notice=`/`?error=` |

Search params are parsed in `lib/search-params.ts`: `after` (non-negative integer, default 0),
`limit` (1..100, default 20), `q` (string, max 200 code points), `status` (one of
`REVIEW_STATUSES`, default `PENDING`), `notice`/`error`/`review` (closed sets / positive integer).
Anything invalid falls back to the default rather than erroring.

Pagination is keyset on `Id` with one look-ahead row (`limit + 1`), default 20, max 100, matching
`ListReviews`. The "next" link carries `after=<last id>`; "back to first page" resets `after`.
Search runs on `Product.NormalizedName` using the core `normalize(q)`: `null` → no filter; otherwise
`NormalizedName LIKE ? ESCAPE '\'` with the pattern `'%' + escapeLike(normalized) + '%'`, where
`escapeLike` prefixes `%`, `_` and `\` with `\`. Normalized text contains only `[0-9a-z ]`, so the
escape is defensive rather than load-bearing, and it stays because the rule is "always escape".

### 6.2 Data access (`lib/catalog-db.ts`, `import 'server-only'`)

The only module that imports `node:sqlite` or `@catalog/core` adapters. One connection per request
or action: `withConnection(fn)` opens via core `openConnection(config.dbPath)`, calls
`requireSchemaVersion`, runs `fn(db)`, and closes in `finally`. Reads run in autocommit (no
`BEGIN`), bounded by `LIMIT`. Queries (all parameterized):

```sql
SELECT COUNT(*) FROM Product;  SELECT COUNT(*) FROM SellerProduct;  SELECT COUNT(*) FROM ProductMatchReview WHERE Status = 'PENDING';
SELECT p.Id, p.Name, p.Brand, p.Category,
       (SELECT COUNT(*) FROM SellerProduct sp WHERE sp.ProductId = p.Id) AS SellerCount
FROM Product p WHERE p.Id > ? AND (? IS NULL OR p.NormalizedName LIKE ? ESCAPE '\') ORDER BY p.Id LIMIT ?;
SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product WHERE Id = ?;
SELECT Id, SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType
FROM SellerProduct WHERE ProductId = ? ORDER BY Id LIMIT 101;     -- 100 shown + "more exist" note
SELECT Id, Name, Brand, Category FROM Product WHERE Id = ?;        -- review candidate
```

Review listing uses core `ListReviews` over `SqliteReviewUnitOfWork`. For an AMBIGUOUS pending row
(no candidate id persisted) the card lists the live candidates from core
`findByNormalizedName({ normalizedName: normalize(sourceName), normalizedBrand: normalize(sourceBrand) })`
so the reviewer sees what the matcher saw. Row mapping functions live in `lib/catalog-db.ts` and
narrow every column from `unknown`.

### 6.3 Server action (`app/reviews/actions.ts`, `'use server'`)

`resolveReviewAction(formData: FormData): Promise<never>` (always redirects).

1. Parse: `reviewId` positive integer; `action` in the closed set
   `["link-candidate", "link-other", "create", "reject"] as const`; `productId` positive integer,
   required only for `link-other`. Parsing failure → `redirect('/reviews?error=invalid_request')`.
2. Open a connection (`withConnection`). For `link-candidate`, read the review through core
   `reviews.get({ reviewId })` and use its `candidateProductId` (the form never supplies it;
   `null` → `error=no_candidate`). Build the `ResolveCommand` and call `new ResolveReview({ unitOfWork }).execute(command)`.
3. On success: `revalidatePath('/')`, `revalidatePath('/reviews')`, `revalidatePath('/products/[id]', 'page')`;
   `redirect('/reviews?status=PENDING&notice=<LINKED|CREATED|REJECTED>&review=<id>')`.
4. On `ReviewResolutionError`: `redirect('/reviews?status=PENDING&error=<code>&review=<id>')`.
   On `DatabaseFileError` or a `node:sqlite` error (`code === "ERR_SQLITE_ERROR"`): `error=database`.
   Any other error propagates to `error.tsx`. `redirect()` is invoked outside the `try` (it throws by design).

`lib/review-messages.ts` maps every `ReviewResolutionErrorCode` plus `invalid_request`,
`no_candidate`, `database` to one human sentence (e.g. `review_not_pending` → "This review was already
resolved."), and each status to a success sentence. The map is exhaustive (`Record<Code, string>`),
so a new code fails `typecheck` until a message exists.

### 6.4 UI states and layout

Every route handles four states: `loading.tsx` (skeleton tiles/table rows), empty (a designed empty
state: "No products match “<q>”", "No PENDING reviews — run `consolidate` to queue some"), error
(`error.tsx` renders a generic message and the Next `digest`, never `error.message` or a stack), and
success. `not-found.tsx` for unknown product ids.

### 6.5 Styling and accessibility

Tailwind v4 as scaffolded by `create-next-app`; design tokens as CSS variables in `globals.css`
(`--background`, `--foreground`, `--muted`, `--accent`, `--success`, `--danger`, `--border`) exposed
through `@theme inline`; components reference token classes only, never hex or magic px. Semantic
HTML: `<nav aria-label="Review status">` for tabs, `<table>` with `<caption>` and `<th scope="col">`,
`<label>` on every input, `<button>` for actions, visible `:focus-visible` rings, text contrast >= 4.5:1
in both color schemes, `aria-live="polite"` on the `Notice`. `next/font` for the default fonts;
no images.

### 6.6 Configuration and startup

`lib/config.ts` reads `process.env.CATALOG_DB_PATH` once (module-level memo) and validates: set and
non-empty; `statSync` is a regular file; `readSchemaVersion >= 3`. Failure throws
`Error("CATALOG_DB_PATH ...: <reason>; run: catalog-consolidation migrate --db <path>")`.
`instrumentation.ts` `register()` (Node runtime only) calls it so `next start`/`next dev` fail at
boot with that one line, not at the first request. Scripts bind locally:
`"dev": "next dev -H 127.0.0.1 -p 3000"`, `"start": "next start -H 127.0.0.1 -p 3000"`.
`.env.example` documents `CATALOG_DB_PATH=../../out/catalog.db`.

## 7. Error handling and security

- CLI exit codes unchanged: 0 finished (incl. `--dry-run`, rejected/held/conflict entries, `migrate`
  done); 2 `InvalidInputFileError`, `DatabaseFileError`, `ReviewResolutionError`, usage errors
  (`parseArgs` failures are caught and printed as `usage: ...` + exit 2); 1 `MigrationError`,
  `node:sqlite` errors, anything else — transaction rolled back. stderr: `error: <message>` plus the
  JSON log line; `node:sqlite` messages (which can echo values) are replaced by
  `database failure (correlationId=<id>)`; unexpected errors by `unexpected failure (correlationId=<id>)`.
- Web: no stack traces or error messages reach the browser (`error.tsx`, the action's redirect codes).
  React escapes all rendered text; `dangerouslySetInnerHTML` is forbidden (lint rule `react/no-danger`),
  so the hostile brand `TestBrand'; SELECT 1; --` on `/products/976` renders as literal text.
- Every SQL statement in core and web is parameterized; the LIKE pattern is a bound parameter with
  `ESCAPE`. No string interpolation into SQL anywhere (lint: `no-template-curly-in-string` is not
  enough — the reviewer greps for `` `SELECT `` with `${`).
- Server Actions: Next.js enforces same-origin on action POSTs; `serverActions.allowedOrigins`
  stays at its default (none). Action input is validated at the boundary (6.3); ids never flow from
  the form into SQL untyped.
- No authentication or authorization: local demo on `127.0.0.1`. Stated as a limitation in the
  README and on the `/reviews` page footer.
- Secrets: none exist. `CATALOG_DB_PATH` is a path, read once in `lib/config.ts`; no other
  `process.env` access outside it and the CLI's `CATALOG_MIGRATIONS_DIR`.
- `data/` is never written: every documented command copies to `out/` first.

## 8. Verification

Final gate, run once after the last unit of work is integrated, output shown:

```bash
cd <repo>
pnpm install --frozen-lockfile
pnpm -r build                     # core (tsc) -> cli (tsc) -> web (next build)
pnpm -r lint && pnpm -r typecheck
scripts/parity-check.sh           # section 5.7, exit 0
```

End-to-end web smoke (manual, on the parity output):

```bash
cp out/parity/ts.db out/catalog.db           # migrated + consolidated, 2 PENDING reviews
CATALOG_DB_PATH=$PWD/out/catalog.db pnpm --filter @catalog/web start &
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/            # 200, tiles 976 / 255 / 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/products/976 # 200, brand rendered as text
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/reviews     # 200, two PENDING cards
# In the browser: on review 1 (Roteador) click "Link to candidate" -> notice "Review 1 linked to product 21"
pnpm cli consolidate --db out/catalog.db --input data/ProductEntry.json
# UNCHANGED 257, HELD_FOR_REVIEW 1, SKIPPED_DUPLICATE_LISTING 11, rows_written=0
```

### Acceptance criteria

- [ ] `pnpm -r build`, `pnpm -r lint`, `pnpm -r typecheck` exit 0 with strict TypeScript and no `any`,
      no `eslint-disable` in `packages/core`.
- [ ] `@catalog/core` `package.json` declares no runtime dependencies; `grep -rn "from \"" packages/core/src`
      shows only `node:` built-ins and relative imports.
- [ ] `scripts/parity-check.sh` exits 0: SchemaVersion rows and all 975 `NormalizedName`/`NormalizedBrand`
      pairs identical; first-run stdout identical modulo run id with the baseline 200/54/1/1/11/2/0/0 = 269,
      `rows_written=258`; `diff py.jsonl ts.jsonl` empty; table dumps identical (976/255/2); re-run
      `rows_written=0`; dry-run 975/0/0; error paths exit 2 on both; review path (step 9) identical.
- [ ] The 16-row normalization table in `tasks.md` reproduces through `normalize` (checked by a one-off
      `node -e` script in the PR description, or by the opt-in test).
- [ ] `sequence-matcher.ts` yields 0.9091, 0.9643 and 0.4762 (rounded) for the three recorded pairs,
      and its `getMatchingBlocks()` equals Python's for those pairs (listed in the PR description).
- [ ] `catalog-consolidation --help`, `migrate`, `consolidate`, `review list`, `review resolve` accept
      exactly the flags in the README's Commands section; exit codes follow the table in section 7.
- [ ] `/`, `/products/[id]`, `/reviews` render with the four states (`loading.tsx`, empty, `error.tsx`,
      success) and pass an axe scan with no critical violations.
- [ ] `/products/976` shows `TestBrand'; SELECT 1; --` as text (`curl` output contains the escaped
      entity sequence, not a raw `'` inside markup attributes).
- [ ] Resolving a review in the browser produces the same database rows as `review resolve` (compare
      dumps as in 5.7 step 5), and the CLI re-run reports the resolved entry `UNCHANGED`.
- [ ] `CATALOG_DB_PATH` unset, pointing at a missing file, or at an unmigrated copy makes `next start`
      exit non-zero with the one-line message from 6.6.
- [ ] `grep -rn "dangerouslySetInnerHTML\|process.env" apps/web/src` returns only `lib/config.ts`.
- [ ] `data/catalog.db` and `data/ProductEntry.json` unchanged (checksums equal before and after).

### Optional tests (`[opt-in: tests]`, vitest, not required by this spec)

Tests are opt-in under EngineOS; none of the above depends on them. If taken, each is its own task:

- `packages/core/test/normalization.test.ts` — the 16-row table, `cleanDisplay`, the `ß` case, `pyStrip`/`pySplitJoin` vs JS `\s` differences.
- `packages/core/test/sequence-matcher.test.ts` — recorded Python `ratio()`, `quick_ratio()` and `get_matching_blocks()` for ~30 pairs generated from the catalog (fixture JSON produced once by a Python script).
- `packages/core/test/python-format.test.ts` — `roundHalfEven` on the 1/32 ties and `formatPythonFloat` on 0, 1, 0.4762.
- `packages/core/test/matching.test.ts` — the T13 cases with an in-memory `FakeCatalogReader`.
- `packages/core/test/consolidate-file.test.ts`, `resolve-review.test.ts` — the T15 cases with in-memory fakes implementing the ports.
- `packages/core/test/integration.test.ts` — migrate + consolidate on a temp copy, asserting the baseline and table counts.

Without them, the PR states `[tests] skipped — not requested`.

## 9. Migration path and removal of Python

| Phase | Deliverable | Exit condition |
|---|---|---|
| 1 | Workspace scaffold, `@catalog/core` domain + adapters, `@catalog/cli` | `pnpm -r build/lint/typecheck` green; `pnpm cli migrate` and `consolidate` run on a copy |
| 2 | `scripts/parity-check.sh` | exits 0 on the delivered data (section 5.7, all nine steps) |
| 3 | `@catalog/web` | web smoke and acceptance criteria green; ADR 0006 accepted |
| 4 | Remove Python; update docs | separate PR, only after explicit user confirmation |

Phase 4 "remove" includes: `src/`, `pyproject.toml`, `uv.lock`, `.venv/` (local), `__pycache__`,
the Python lines of `.gitignore`; rewriting `README.md` (requirements Node 24 + pnpm, commands,
web app section, limitations); marking `docs/specs/catalog-consolidation/tasks.md` as superseded
by this spec (kept as history); recording golden files under `tests/golden/` (Python `report.jsonl`,
table dumps, `review list` output) before deletion so `scripts/parity-check.sh` degrades to a
golden-file check instead of losing its reference. Phases 1–3 leave the Python tree untouched.

## 10. Risks and open questions

Risks (designed for):

- R1 Unicode version drift: Python 3.12 `unicodedata` is Unicode 15.0; Node 24's ICU is newer. NFKD
  differences only affect characters added after 15.0 — none in the delivered data; the parity
  check's 975-row comparison is the detector.
- R2 Float formatting: covered by `roundHalfEven` / `formatPythonFloat` (5.4); the report diff catches any miss.
- R3 `node:sqlite` emits an `ExperimentalWarning` on stderr if still experimental in the Node 24 line
  used; stderr is outside parity but noisy for a demo — `NODE_OPTIONS=--no-warnings` in the CLI shebang
  line is not portable, so the cli `main.ts` would use `process.removeAllListeners('warning')` scoped
  to that warning name only. Depends on Q1.
- R4 Dev loop: `next dev` needs `@catalog/core` built; the root `dev` script runs `tsc --watch` and
  `next dev` concurrently. A stale `dist/` shows as a type error, not a silent behavior change.
- R5 `BEGIN` placement: Python opens its implicit transaction before the first statement; the TS unit
  of work opens it in the constructor. Reads before the unit of work exists run in autocommit in TS
  and inside an implicit transaction in Python — invisible for a single-process run, which is the only supported mode.

Open questions (Q1-Q2 resolved by probe; the rest are for the user or the implementation plan):

- Q1 RESOLVED 2026-10-06 (orchestrator probe on Node v24.21.0): `require('node:sqlite')` prints no
  `ExperimentalWarning`; exports `DatabaseSync, StatementSync, Session, constants, backup`. No
  warning filter is needed.
- Q2 RESOLVED 2026-10-06 (same probe): `backup()` is a function and `new DatabaseSync(path,
  { readOnly, timeout: 5000 })` is accepted; `SELECT total_changes()` works. Use `backup()` and the
  `timeout` option; the `VACUUM INTO` fallback is not needed.
- Q3 (phase-1 spike, first task of the web wave) Does Next.js (version to be pinned) treat `node:sqlite` as a Node built-in external in both
  webpack and Turbopack server bundles, or does it need `serverExternalPackages` / a webpack
  `externals` entry? If bundling fails, `lib/catalog-db.ts` loads it through `createRequire`.
- Q4 RESOLVED 2026-10-06 (user): show AMBIGUOUS candidates live on review cards via core
  `findByNormalizedName` (6.2).

- Q5 RESOLVED 2026-10-06 (user): accept the `\p{M}` vs `unicodedata.combining` deviation; documented as
  a known limitation. Orchestrator check: 0 differences across all 1,683 distinct names/brands in the data.

- Q6 RESOLVED 2026-10-06 (user): help text and hints use the bin name `catalog-consolidation`; the README
  also documents `pnpm cli ...` for running from a clone.

- Q7 Pin versions: Next.js, Tailwind, typescript, eslint, pnpm — to be chosen at implementation time
  with exact pins; not decided here.
