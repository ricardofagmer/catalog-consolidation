# Catalog Consolidation

Catalog Consolidation merges a seller product file (`ProductEntry.json`) into a marketplace
catalog stored in SQLite (`catalog.db`). Each Seller Entry either links the seller to a Catalog
Product that already exists, creates a new Catalog Product, or is held as a Review Item for a
person to decide. It never inserts a duplicate of an existing product. Every entry gets one
outcome code, written to a per-entry JSON Lines report. A whole file runs in a single
transaction, so running the same file again writes nothing. Terms such as Seller Offer, Review
Item and Candidate are defined in [CONTEXT.md](CONTEXT.md).

## For evaluators

Run it on a scratch copy (Node >= 24 and pnpm 12.8.1; details in [the quick start](#requirements-and-quick-start)):

```bash
pnpm install --frozen-lockfile
pnpm build
mkdir -p out && cp data/catalog.db out/catalog.db
pnpm cli migrate --db out/catalog.db
pnpm cli consolidate --db out/catalog.db --input data/ProductEntry.json --report out/report.jsonl
pnpm cli review list --db out/catalog.db
```

**Identity rule.** A Seller Entry is the same product as a Catalog Product when their normalized
names are equal and their brands are compatible (equal after normalization, or NULL on either side);
category is not part of identity. Without such a match, a similarity ratio of 0.80 or more only
queues a Review Item for a person and never links on its own; below 0.80 a new product is created.

| Outcome | Meaning | First run |
|---|---|---|
| `LINKED_EXACT` | Linked; the catalog name is byte-equal to the seller's | 200 |
| `LINKED_NORMALIZED` | Linked; the names are equal only after normalization | 54 |
| `CREATED` | No match, no close candidate; product created and linked | 1 |
| `UNCHANGED` | This seller SKU is already linked to the product it resolves to | 1 |
| `SKIPPED_DUPLICATE_LISTING` | The seller already offers that product under another SKU | 11 |
| `HELD_FOR_REVIEW` | Fuzzy or ambiguous candidate, queued for a person | 2 |
| `REJECTED_INVALID` | The record failed validation; the rest of the file continues | 0 |
| `CONFLICT_SELLER_SKU` | This seller SKU is already linked to a different product | 0 |

The 17 ambiguities and the resolution chosen (evidence and rejected options in [PRD section 4](docs/prds/0001-catalog-consolidation.md#4-ambiguities-and-how-we-resolved-them)):

| # | Ambiguity | Resolution |
|---|---|---|
| A1 | What "duplicate product" means | Same normalized name and compatible brand; fuzzy similarity never merges |
| A2 | Is Category part of identity? | No; the catalog `Product.Category` is the only copy (migration 0005 dropped the seller's copy from the link) |
| A3 | How a NULL brand compares | Compatible with any brand: unknown is not different; a link made with exactly one NULL side carries the warning `brand_unverified_null` |
| A4 | String seller `Id` vs `INTEGER` column | `SellerProductId` becomes `TEXT NOT NULL` (table rebuild) |
| A5 | Are seller Ids globally unique? | No; unique per seller: `UNIQUE (SellerName, SellerProductId)` |
| A6 | Same seller, same product, different Ids | First SKU wins; later ones are `SKIPPED_DUPLICATE_LISTING` |
| A7 | Same seller and Id sent again | `UNCHANGED` if it resolves to the same product, else `CONFLICT_SELLER_SKU` |
| A8 | Translations and synonyms | `HELD_FOR_REVIEW` with candidate and score; no dictionary |
| A9 | Hostile and malformed input | Parameterized SQL, values stored verbatim; `Id` charset allowlist, non-UUID accepted with a warning |
| A10 | Whose attributes win (golden record) | The catalog row, never overwritten; the link row holds only the seller SKU and `MatchType` |
| A11 | More than one catalog product matches | `HELD_FOR_REVIEW` with reason `AMBIGUOUS` |
| A12 | What to do with uncertain matches | Review queue; 0.80 decides "queue" vs "create", never "link" |
| A13 | Partial failure of a file | Bad record `REJECTED_INVALID`, rest proceeds; one transaction per run; a bad file writes nothing (exit 2) |
| A14 | Re-running the same file | Idempotent: zero rows written; `--dry-run` rolls back |
| A15 | Seller as a string or an entity | Superseded by migration 0004: a `Seller` table (`Id`, unique `Name`) registers every seller in the file; `SellerProduct` is the N:N link (`SellerId`, `ProductId`) and `ProductMatchReview` points at `Seller` too |
| A16 | Numeric versus string seller Ids (original SellerProductId column is INTEGER, file Ids are strings) | Strings are stored as sent; a JSON number that is a safe integer is converted to its decimal text (`12345` and `"12345"` are the same SKU); any other number or type is REJECTED_INVALID (`not_a_string:Id`); pre-existing integer links are cast to TEXT by migration 0001. |
| A17 | Seller identity normalization (file has only a seller name string) | Name trimmed only, then compared case-sensitively with no alias table; a spelling variant counts as a separate seller (recorded as a known limitation). |

Where to read the core:

- [libs/rules/src/normalization.service.ts](libs/rules/src/normalization.service.ts): the match key.
- [libs/rules/src/matching.service.ts](libs/rules/src/matching.service.ts): the link, hold or create decision.
- [libs/consolidation/src/consolidation-run.ts](libs/consolidation/src/consolidation-run.ts): one run, its transaction, re-send checks and writes.
- [libs/persistence/src/seller-record-validator.ts](libs/persistence/src/seller-record-validator.ts): per-record validation.

The Nx workspace, the NestJS API and the Next.js UI are a demonstration layer around this core and
are not needed to evaluate the consolidation: the CLI is the only way to ingest a seller file.

## Overview

The repository is an Nx workspace with three applications that share one set of rules:

- **CLI** (`apps/cli`): `migrate`, `consolidate` and the `review` commands. It runs the rules in
  a NestJS standalone application context, with no HTTP server.
- **API** (`apps/api`): a NestJS 11 REST API over the same database. It serves the catalog and the
  review queue and resolves Review Items. It cannot run `migrate` or `consolidate`.
- **Web app** (`apps/web`): a Next.js 16 UI (catalog, product, review queue). It reaches data only
  through the API.

Deeper documents: [PRD](docs/prds/0001-catalog-consolidation.md) (problem, ambiguities,
requirements), [ADRs](docs/adr/) (decisions), [implementation plan](docs/specs/catalog-consolidation/tasks.md)
of the first version, and the [spec index for the Nx, NestJS and web UI work](docs/specs/2026-10-06-nx-nestjs-modern-ui.md).
How the work was done is in [How AI was used](#how-ai-was-used).

## Requirements and quick start

- Node >= 24 (`.nvmrc` says 24). The code uses `node:sqlite`.
- pnpm 12.8.1 (the `packageManager` field of `package.json`).
- No Python is needed. The original Python implementation was removed; see
  [Workspace layout](#workspace-layout).

```bash
pnpm install --frozen-lockfile
pnpm build
```

`data/` holds the original input and is never written to. Always work on a copy under `out/`:

```bash
mkdir -p out && cp data/catalog.db out/catalog.db

pnpm cli migrate --db out/catalog.db
pnpm cli consolidate --db out/catalog.db --input data/ProductEntry.json --report out/report.jsonl
pnpm cli review list --db out/catalog.db
```

`pnpm cli` is `node apps/cli/dist/main.js`, so it needs the `pnpm build` above. pnpm may print its
own script header before the CLI output; the blocks below show the CLI output only. To start again
from a clean copy, use a fresh directory under `out/` (for example `out/second/catalog.db`).

`migrate` output (the backup timestamp is the UTC time of the run, `YYYYMMDDTHHMMSSZ`):

```
backup: out/catalog.db.pre-migrate-<timestamp>.bak
applied 0001 seller_product_text_id
applied 0002 product_match_keys (backfilled 975 products)
applied 0003 review_queue
applied 0004 seller_table
applied 0005 seller_product_drop_source_columns
applied 0006 canonical_brand_spelling
schema version: 6
```

`consolidate` output on the provided data, first run (`<run_id>` is a fresh UUID hex each run):

```
run <run_id> input=data/ProductEntry.json dry_run=false committed=true rows_written=278
LINKED_EXACT                 200
LINKED_NORMALIZED             54
CREATED                        1
UNCHANGED                      1
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                2
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
```

Running the same command again prints `rows_written=0` with `UNCHANGED 256`,
`SKIPPED_DUPLICATE_LISTING 11`, `HELD_FOR_REVIEW 2`, every other code `0`, and `TOTAL 269`.

Stdout carries the summary only. Stderr gets one structured JSON log line per run (`timestamp`, `level`,
`service`, `event` such as `consolidate.finished`, `correlationId` equal to the run id,
`durationMs`, and the run counts). On failure, stderr also gets an `error: <message>` line.

The API and the web app are optional; see [Run the API and the web app](#run-the-api-and-the-web-app).

## Commands

```
pnpm cli migrate     --db PATH
pnpm cli consolidate --db PATH --input PATH [--report PATH] [--dry-run]
pnpm cli review list    --db PATH [--status PENDING|LINKED|CREATED|REJECTED] [--limit N] [--after-id ID]
pnpm cli review resolve --db PATH --id N (--create | --reject | --link PRODUCT_ID)
```

`-h`, `--help` and `-hh` print help at every level (for example `pnpm cli review resolve -h`). Help
never runs a command and never writes. The top-level usage line is
`usage: catalog-consolidation [-h] COMMAND ...`.

- `migrate` applies pending migrations from `migrations/`. Before applying anything it copies
  the database to `<db>.pre-migrate-<timestamp>.bak`. When nothing is pending it prints
  `schema version: 6 (up to date)` and takes no backup.
- `consolidate` refuses to run on a missing file or on a database below schema version 5. In
  both cases it exits 2 and, for the schema case, prints the `migrate` command to run.
  `--dry-run` makes every decision and then rolls back (`committed=false`). `--report` writes
  one JSON object per entry, in input order, through a temporary file and an atomic rename, e.g.
  `{"index":180,"sellerName":"MegaStore","sellerProductId":"09835342345-4678-9abc-def012345678","outcome":"CREATED","productId":976,"reviewReason":null,"score":0.4762,"warnings":["non_uuid_seller_sku"],"errors":[]}`.
- `review list` prints a header line and then queue rows as tab-separated columns
  `Id SellerName SellerProductId Reason Score CandidateProductId SourceName`. Defaults:
  `--status PENDING`, `--limit 20` (maximum 100). Paging is by keyset: the last line reads
  `next: --after-id <id>` when more rows exist.
- `review resolve` acts only on a `PENDING` row, in one transaction:
  - `--create` creates the product from the seller's values and links it (`MatchType='CREATED'`).
  - `--link PRODUCT_ID` links the seller to an existing product (`MatchType='REVIEWED'`).
  - `--reject` marks the row `REJECTED`.

  A missing review row, a missing product, a row that is not `PENDING`, a seller already linked
  to that product, or a seller SKU already linked elsewhere prints `error: <code>: ...`, writes
  nothing, and exits 2. After `--link` or `--create`, re-running `consolidate` reports that entry
  as `UNCHANGED`; after `--reject` it reports `HELD_FOR_REVIEW` with the warning
  `review_previously_rejected`.

  On the provided data, `review list` after the first run prints:

  ```
  Id  SellerName   SellerProductId                       Reason  Score   CandidateProductId  SourceName
  1   FootwearHub  a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1  FUZZY   0.9091  21                  Roteador WiFi 6 TP-Link
  2   SuperMart    b4b4b4b4-c5c5-4d6d-e7e7-f8f8f8f8f8f8  FUZZY   0.9643  28                  Processador AMD Ryzen 9 7950X
  ```
  (columns aligned here for reading; the real output is tab-separated)

| Exit code | When |
|---|---|
| 0 | The run finished: committed, rolled back by `--dry-run`, or with rejected, conflicting or held entries; `migrate` finished |
| 2 | Invalid input file (not UTF-8, not JSON, not an array, over 10 MB or 100,000 entries, unreadable); database file missing; schema not migrated; usage error |
| 1 | Anything else (migration error, SQLite error, unexpected exception); the transaction is rolled back |

For example, `printf '{}' > out/bad.json` followed by `pnpm cli consolidate --db out/catalog.db --input out/bad.json` prints
`error: invalid input file: not_an_array: out/bad.json: top-level value is not a JSON array` and
exits 2. Error messages are built from error codes and paths only. They never include
seller-supplied text or a traceback.

## How matching works

For each entry, in file order:

1. **Validate the record.** `Id` must match `[A-Za-z0-9._-]+` and be at most 64 characters.
   A JSON number `Id` that is a safe integer (negatives included) is first converted to its
   decimal text and then checked the same way; floats, unsafe integers, booleans, `null`, arrays
   and objects are rejected with `not_a_string:Id`. String Ids are not trimmed.
   `SellerName` and `Name` are required. `Brand` and `Category` are optional. Length limits
   come from `libs/domain/src/limits.ts`. A record that fails is `REJECTED_INVALID` and the rest of the
   file continues. A non-UUID `Id` is accepted with the warning `non_uuid_seller_sku`.
2. **Compute the match key** with `normalize()` (`libs/rules/src/normalization.service.ts`). Steps run in this
   order:
   - Unicode NFKD, then drop combining marks: `Câmera` becomes `Camera`.
   - Casefold: `BLACK+DECKER` becomes `black+decker`, and `ß` becomes `ss`.
   - Delete quotes (`"`, `'` and their curly forms): `Levi's` becomes `levis`, `55"` becomes `55`.
   - Replace every run of non-`[0-9a-z]` characters with one space, then collapse and trim:
     `Black+Decker` becomes `black decker`, `TP-Link` becomes `tp link`, and doubled spaces
     disappear.
3. **Check whether this seller SKU was seen before**, keyed by `(SellerName, Id)`.
   - Already linked by a human (`MatchType='REVIEWED'`, from `review resolve --link`):
     `UNCHANGED`. A human decision is never re-litigated by the automatic matcher.
   - Already linked automatically: re-match the entry. If it resolves to the same product, the
     outcome is `UNCHANGED`; otherwise it is `CONFLICT_SELLER_SKU` and nothing changes.
   - Already in the review queue: `HELD_FOR_REVIEW`, and no new row is written.
4. **Look for identity matches.** Product Identity is the normalized name plus a compatible brand.
   Brands are compatible when their normalized forms are equal or either side is NULL
   ("unknown is not different"). Category is not part of identity: sellers use their own
   taxonomies (`Photo` vs `Photography`).
   - One candidate: link. The outcome is `LINKED_EXACT` when the catalog `Name` is byte-equal to
     the seller's raw name, and `LINKED_NORMALIZED` otherwise. If exactly one side's normalized
     brand is NULL, the new link carries the warning `brand_unverified_null`. If this seller is
     already linked to that product under another SKU, the outcome is `SKIPPED_DUPLICATE_LISTING`.
   - More than one candidate: `HELD_FOR_REVIEW`, reason `AMBIGUOUS`.
5. **No identity match:** score the entry with the `SequenceMatcher` ratio (the TypeScript port of
   `difflib.SequenceMatcher.ratio()`, with identical scores) against every
   product with a compatible brand. Ties go to the lowest product id.
   - Best score of 0.80 or higher: `HELD_FOR_REVIEW`, reason `FUZZY`, with the Candidate and
     score. **A fuzzy score never links on its own.** The threshold only decides between "queue"
     and "create".
   - Otherwise: `CREATED`. The new product takes the seller's values with whitespace collapsed,
     and the seller is linked to it.

The catalog row is the golden record: linking never overwrites `Product.Name`, `Brand` or
`Category`. The link row (`SellerProduct`) holds only the seller, the product, the seller's SKU and the
`MatchType`; the seller's raw name, brand and category are not stored for a linked offer (a pending
Review Item keeps them until a person decides). Every SQL statement is parameterized.

Before matching, every run also fills in missing match keys for any `Product` row whose
`NormalizedName` is NULL, for example rows inserted by another tool.

A flow diagram of a run, an entry, the matcher and the review lifecycle is in
[docs/diagrams/consolidation-flow.md](docs/diagrams/consolidation-flow.md).

## Outcome vocabulary

| Code | Meaning | Writes |
|---|---|---|
| `LINKED_EXACT` | Linked to a product whose name is byte-equal to the seller's | 1 link |
| `LINKED_NORMALIZED` | Linked to a product that is equal only after normalization | 1 link |
| `CREATED` | No match and no close candidate; created a product and linked it | 1 product + 1 link |
| `UNCHANGED` | This seller SKU is already linked to the product it resolves to | nothing |
| `SKIPPED_DUPLICATE_LISTING` | This seller already offers that product under a different SKU | nothing |
| `HELD_FOR_REVIEW` | Fuzzy or ambiguous candidate, queued in `ProductMatchReview` (or already queued) | 1 review row, first time only |
| `REJECTED_INVALID` | The record failed validation; `errors` holds `code:Field` pairs | nothing |
| `CONFLICT_SELLER_SKU` | This seller SKU is already linked to a different product | nothing |

Warnings never change the outcome. Each report line lists them in `warnings`; the codes come
from `WARNING_CODES` in `libs/domain/src/models.ts`:

| Warning | Meaning |
|---|---|
| `non_uuid_seller_sku` | The `Id` passed the charset allowlist but is not UUID-shaped |
| `unknown_fields_ignored` | The record has keys other than `Id`, `SellerName`, `Name`, `Brand`, `Category`; they were ignored |
| `blank_brand_treated_as_null` | `Brand` was a blank string and was treated as NULL |
| `blank_category_treated_as_null` | `Category` was a blank string and was treated as NULL |
| `ambiguous_candidates` | Held for review with reason `AMBIGUOUS` (more than one identity match) |
| `review_previously_rejected` | Held for review because a person already rejected this seller SKU's review item |
| `brand_unverified_null` | A new `LINKED_EXACT` or `LINKED_NORMALIZED` link where exactly one side's normalized brand is NULL (the entry has a brand and the catalog product has none, or the reverse). Not emitted when both brands are NULL or both are present, nor on `UNCHANGED`, `SKIPPED_DUPLICATE_LISTING`, held or created entries. It flags the link for audit; it does not change which product is linked |

## Results on the provided data (2026-10-05)

- 269 entries, 278 rows written. After the run: `Seller` 20 rows, `SellerProduct` 255 rows, `Product` 976 rows
  (975 + 1), `ProductMatchReview` 2 rows.
- Held for review: `Roteador WiFi 6 TP-Link` (score about 0.91 against `Router WiFi 6 TP-Link`) and
  `Processador AMD Ryzen 9 7950X` (about 0.96 against `Processor AMD Ryzen 9 7950X`). These are
  translations. A high ratio does not prove identity, though: catalog products 885
  `Multivitamin Men` (brand `Centrum`) and 886 `Multivitamin Women` (brand `One A Day`) are two
  different products whose normalized names score 0.941. Their brands keep them apart when both are
  known, but a seller entry with no brand is compatible with both. No auto-link threshold is safe,
  so a fuzzy score only queues a review.
- Created: `Security Test Product`, whose brand `TestBrand'; SELECT 1; --` is stored verbatim as
  data.
- 11 seller duplicates were skipped. Three entries carry non-UUID ids and were accepted with a
  warning.

## Schema changes

The migrations in `migrations/` are additive and forward-only. `SchemaVersion` records each
applied migration with a SHA-256 checksum. Editing an applied migration file fails `migrate`
(`checksum_mismatch`). Each migration commits on its own.

| Migration | Change |
|---|---|
| `0001_seller_product_text_id` | Rebuilds `SellerProduct`: `SellerProductId` becomes `TEXT`. Adds `SourceName`, `SourceBrand`, `SourceCategory`, `MatchType` (`EXACT`, `NORMALIZED`, `CREATED`, `REVIEWED`) and `CreatedAt`. Adds `UNIQUE (SellerName, SellerProductId)` and `UNIQUE (SellerName, ProductId)`. If the row count changes during the copy (orphan links), the migration rolls back with `rows_lost`. |
| `0002_product_match_keys` | Adds `Product.NormalizedName` and `NormalizedBrand` (indexed, not unique) and backfills them with the same normalizer the matcher uses (`NormalizationService`), not with SQL. |
| `0003_review_queue` | Creates `ProductMatchReview` (candidate, score, reason `FUZZY`/`AMBIGUOUS`, status `PENDING`/`LINKED`/`CREATED`/`REJECTED`), unique per seller SKU. |
| `0004_seller_table` | Creates `Seller` (`Id`, unique `Name`), backfilled from existing links and reviews. `SellerProduct` and `ProductMatchReview` swap `SellerName` for a `SellerId` foreign key; `SellerProduct` is the N:N link between `Seller` and `Product`. |
| `0005_seller_product_drop_source_columns` | Drops `SourceName`, `SourceBrand` and `SourceCategory` from `SellerProduct`: they duplicated `Product`. `ProductMatchReview` keeps them. |
| `0006_canonical_brand_spelling` | Data only: sets the display `Product.Brand` to the brand's own spelling for every product whose normalized brand is `simplehuman` or `black decker` (`simplehuman`, `BLACK+DECKER`). Match keys are unchanged. Like the others it has no down path; restore the `.bak` to undo it. |

There are no down migrations. Recovery is the `.bak` file that `migrate` writes first.

## Run the API and the web app

Both read the migrated copy from the quick start. Start the API in one terminal and the web app in
another, from the repository root:

```bash
CATALOG_DB_PATH="$PWD/out/catalog.db" pnpm --filter @catalog/api serve
API_BASE_URL=http://127.0.0.1:3001 pnpm --filter @catalog/web dev
```

Then open <http://127.0.0.1:3000>. `pnpm --filter @catalog/api serve` compiles the API and runs
`dist/main.js`. Use an absolute `CATALOG_DB_PATH` as shown: `pnpm --filter` runs the script from
`apps/api`, and the API uses the path exactly as given, relative to its working directory.
`pnpm dev` (`nx run-many -t serve dev --parallel=2`) starts both processes together; the same two
variables must be set in its environment. For a production web server, run
`pnpm --filter @catalog/web build`, then `pnpm --filter @catalog/web start`.

| Variable | App | Meaning |
|---|---|---|
| `CATALOG_DB_PATH` | API | Required. Must be an existing regular file: a migrated database. |
| `API_PORT` | API | Optional, default `3001`. The API always binds `127.0.0.1`. |
| `API_ALLOWED_HOSTS` | API | Optional. Comma-separated `host[:port]` list of accepted `Host` headers. Defaults to `127.0.0.1` and `localhost` with the API port. |
| `API_BASE_URL` | Web | Required, for example `http://127.0.0.1:3001` (see `apps/web/.env.example`). A missing or invalid value stops the server at startup with one `error:` line and exit code 1. `next build` works with it unset. |

### How they connect

The browser talks only to the web app on `127.0.0.1:3000`. The web app's Server Components and
its one Server Action call the API from the Next.js server, with a client generated from the API's
OpenAPI document. The browser never calls the API. The API opens one SQLite connection per
operation.

### Web app pages

| Page | Path | Content |
|---|---|---|
| Catalog | `/` | Summary tiles, name search, paging |
| Product | `/products/:id` | One Catalog Product and its Seller Offers |
| Review queue | `/reviews` | Status tabs; link, create and reject buttons that disable while pending; result notices in a live region |

The UI uses shadcn-style primitives on Tailwind v4 with tokens as CSS variables. A light, dark or
system theme toggle sits in the top bar (remembered, no flash on load). The sidebar becomes a
drawer below the `md` breakpoint. There is a skip link, visible focus, reduced-motion support, and
loading, empty and error states on every page. The web app sends security headers (CSP
`frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`,
`Permissions-Policy`) and answers an unknown `Host` with 421.

### API endpoints

The data routes are under `/v1`. Health checks and the documentation are at the root.

| Method and path | Purpose |
|---|---|
| `GET /v1/summary` | Counts of products, Seller Offers and `PENDING` Review Items |
| `GET /v1/products` | Products; query `q`, `limit` (default 20, maximum 100), `after` (pass the previous page's `nextCursor`) |
| `GET /v1/products/:id` | One product with its Seller Offers, capped at 100 with a `hasMore` flag |
| `GET /v1/reviews` | Review Items; query `status`, `limit`, `after` (pass the previous page's `nextCursor`) |
| `POST /v1/reviews/:id/resolution` | Resolve a Review Item with `link-candidate`, `link-other` (needs `productId`), `create` or `reject`; JSON body `{"action": ...}` |
| `GET /health/live`, `GET /health/ready` | Liveness and readiness |
| `GET /docs`, `GET /docs-json` | Swagger UI and the OpenAPI document |

Errors are always `{ statusCode, code, message, correlationId }` with a closed set of `code`
values. An unknown `Host` gets 421, a POST that is not JSON gets 415, and no CORS headers are
sent. The rationale is in [the API ADR](docs/adr/2026-10-06-api-contract-and-security.md).

## Workspace layout

```
apps/
  api/             NestJS 11 REST API (tags scope:backend, type:app)
  cli/             catalog-consolidation CLI, a Nest standalone application context
  web/             Next.js 16 UI (tags scope:web, type:app)
libs/
  domain/          models, limits, errors and ports (scope:backend)
  rules/           injectable providers: text helpers, normalization, matching, SequenceMatcher port
  persistence/     SQLite connections, repositories, migrations, JSON reader, report writer, read model
  consolidation/   one consolidation run = one transaction
  reviews/         resolving Review Items
  api-client/      typed client generated from the API's OpenAPI document (scope:client)
migrations/        0001-0003 SQL files, applied by `migrate`
fixtures/golden/   recorded CLI behavior: 22 scenarios
scripts/           golden-check.sh (`pnpm parity` runs it through parity-check.sh)
data/              original input, never written to
docs/              PRD, ADRs, specs, diagrams
```

`pnpm nx show projects` lists the nine Nx projects. Run Nx with `NX_DAEMON=false` in scripts and
CI. Nx caches task results, so a second identical `pnpm build`, `pnpm lint` or `pnpm typecheck`
reports cache hits.

- **Boundaries.** [`eslint.module-boundaries.mjs`](eslint.module-boundaries.mjs) enforces the
  tags: the web app may depend only on `api-client` (`scope:client`), and backend projects only on
  backend libraries. The web app therefore cannot import database code.
- **One set of rules.** The rules are NestJS providers shared by the API and the CLI, so a Review
  Item resolved in the web app and one resolved with `review resolve` follow the same code.
  `libs/rules` exposes a TypeScript port of `difflib.SequenceMatcher` that produces the same
  similarity scores as the original.
- **Generated client.** `libs/api-client/src/generated` is produced from the API's OpenAPI document
  (`openapi-typescript`, used through `openapi-fetch`) as a build output. It is git-ignored; `pnpm build`
  regenerates it.
- **Root scripts.** `pnpm build`, `pnpm lint` and `pnpm typecheck` run the matching Nx target on
  every project. `pnpm parity` runs the golden check.
- **Golden check.** `pnpm parity` replays the 22 scenarios in `fixtures/golden` against the built
  CLI and diffs the normalized outputs. It needs `pnpm build` first, and `sqlite3`, `jq`,
  `shasum` and `diff` on the `PATH`. It prints `golden: OK (22/22 scenarios)` when nothing drifted. It
  only reads `data/` and runs every command on scratch copies under a new `out/golden-check/run-*`
  directory.
- **Python reference.** The original Python implementation is archived at
  `.engineos/archived/2026/10/python-reference-2026-10-06.tar.gz`. Its behavior is frozen in the
  golden fixtures, which cannot be regenerated from Python any more
  ([ADR](docs/adr/2026-10-06-remove-python-golden-fixtures.md)).

## Key decisions

| Decision | Record |
|---|---|
| Python 3.12 standard-library CLI over SQLite, no runtime dependencies (superseded by 0006) | [ADR 0001](docs/adr/0001-python-stdlib-cli.md) |
| Identity is the normalized name plus a compatible brand; category is not identity; NULL brand is compatible with any brand | [ADR 0002](docs/adr/0002-product-identity-normalized-name-and-brand.md) |
| Seller SKU is opaque `TEXT`, unique per seller; the link row holds no seller attributes; the catalog row is never overwritten | [ADR 0003](docs/adr/0003-seller-link-schema-and-golden-record.md) |
| Uncertain matches (fuzzy, ambiguous) go to a review queue and are never linked or created automatically | [ADR 0004](docs/adr/0004-review-queue-for-uncertain-matches.md) |
| One transaction per file, validation per record, re-runs are no-ops | [ADR 0005](docs/adr/0005-all-or-nothing-idempotent-runs.md) |
| TypeScript throughout, one implementation of the rules for every entry point (partly superseded by the two Nx and Nest records below) | [ADR 0006](docs/adr/0006-typescript-shared-core.md) |
| Nx workspace with a NestJS backend; the web app reaches data only through the API | [Nx workspace and API-only web](docs/adr/2026-10-06-nx-nest-backend-web-via-api.md) |
| Business rules are NestJS 11 providers; the CLI is a Nest standalone application | [Rules as Nest providers](docs/adr/2026-10-06-rules-as-nest-providers-nest-11.md) |
| REST API with OpenAPI from DTO classes; loopback, Host allowlist, JSON-only; one connection per operation | [API contract and security](docs/adr/2026-10-06-api-contract-and-security.md) |
| Python reference removed and archived; golden fixtures replace the parity oracle | [Python removal and golden fixtures](docs/adr/2026-10-06-remove-python-golden-fixtures.md) |

All seventeen ambiguities found in the brief and the data, with the evidence and the options
rejected, are listed in [PRD section 4](docs/prds/0001-catalog-consolidation.md#4-ambiguities-and-how-we-resolved-them).

## How AI was used

The solution was built with Claude Code. AI agents did the data profiling, wrote the documents and
the code, and checked the results, following a spec-driven workflow in three stages. Each stage has
a change record with its human decisions.

- **First version, Python (2026-10-05).** The data was profiled with `sqlite3` and scripts, and the
  decisions were frozen in a [design record](.engineos/archived/2026/10/docs/2026-10-05-catalog-consolidation-design.md).
  Three agents then wrote the PRD, ADRs 0001-0005 and the task plan in parallel. The ambiguity
  resolutions were proposed by the AI from the profiled data; the record notes that the Python stack
  was the AI's default choice. The owner started implementation from those documents, and scoped
  sub-agents built a Python 3.12 standard-library CLI in waves.
- **TypeScript rewrite (2026-10-06).** The owner chose the approach and approved the spec and plan
  ([change record](.engineos/archived/2026/10/general/2026-10-06-typescript-rewrite-and-web-ui.md)).
  Sub-agents implemented 15 tasks, each followed by an independent review. A parity check compared
  the TypeScript CLI with the Python CLI, which was still present.
- **Nx, NestJS and web UI (2026-10-06 to 2026-10-07).** A grilling interview of the owner, then
  four ADRs, a PRD, a plan with 36 acceptance criteria, 37 checks and 13 tickets. The owner
  approved the ADRs, PRD, plan and tickets ([change record](.engineos/changes/2026-10-06-nx-nestjs-modern-ui.md)). Sub-agents built
  the tickets in parallel on separate files ([ledger](.specs/features/nx-nestjs-modern-ui/ledger.md)),
  with security audits of the API. Then an independent read-only verifier tried to refute each check
  ([verification](.specs/features/nx-nestjs-modern-ui/verification.md)): no check failed, and the
  gaps it found are listed there. The owner made two choices that the AI had not recommended (rules
  as Nest providers, Nest 11) after the trade-offs were explained.

Before Python was removed, the behavior of its CLI was recorded as 22 golden scenarios in
`fixtures/golden` (output and table dumps). Six of them (five help texts and one invalid-file
message) were re-recorded from the TypeScript CLI because only the wording differed. They are
marked `"rebaselinedFrom": "ts-cli"` in `fixtures/golden/manifest.json`.

Correctness was checked by comparing against the golden fixtures (`pnpm parity`), by repeated runs
(the second `consolidate` writes 0 rows), by checksums showing `data/` never changes, by lint,
typecheck and build, and by the independent verifier. The golden check detects drift from the
recorded behavior. It cannot catch a bug that was already present when the behavior was recorded.
**No automated unit or integration tests have been written.** Tests are waiting for the owner's
explicit approval (see [Known limitations](#known-limitations)).

`.engineos/`, `.specs/`, `.superpowers/` and `docs/agents/` are process records of this
AI-assisted workflow, not product code: change records and archives, feature plans, ledgers and
verification reports, the working folder of the sub-agent execution, and instructions telling the
agents where documents and tickets live. Reviewers can skip them. The one exception is the Python
archive in `.engineos/archived/` mentioned under [Workspace layout](#workspace-layout).

## Known limitations

- **No automated test suite.** `[tests] pending`: none has been written. Verification so far is
  lint, typecheck and build, the golden-file check (`pnpm parity`), and manual browser and HTTP
  checks. A test suite is the first next step.
- **A second SKU for the same product is reported but not stored.** When a seller already offers a
  product, another SKU from that seller for the same product gets `SKIPPED_DUPLICATE_LISTING`. No
  row records that SKU. The report line gives the product id, but not the SKU that was kept.
- **Float-looking integer Ids are accepted.** `JSON.parse` cannot tell `12345` from `12345.0` or
  `1.2345e4`, so all three are accepted as the seller SKU `"12345"`.
- **Seller names are trimmed but case-sensitive.** Surrounding whitespace is removed from
  `SellerName`, and the result is compared exactly (no `COLLATE NOCASE`). `megastore` and
  `MegaStore` would therefore be two sellers.
- **A one-sided NULL brand still links (residual risk).** Because a NULL brand is compatible with
  any brand (unknown is not different, A3), an entry with a brand can link to a catalog product that
  has none, or a brandless entry can link to a branded product. A wrong-brand match of this kind is
  possible and is not prevented. It is surfaced: the new link's report line carries the warning
  `brand_unverified_null`, so an operator can audit it, and `MatchType` records how the link was made.
  Re-runs report such a link as `UNCHANGED` without the warning, so the first-run report is the
  place to find them.
- **`CONFLICT_SELLER_SKU` names only the existing product.** The report's `productId` is the product
  that the seller SKU is already linked to. The product the entry now resolves to is not reported.
- **The web app has no authentication.** It is a local demo: anyone who can reach
  `127.0.0.1:3000` can resolve Review Items. The API binds loopback only and sends no CORS headers.
- **API and CLI write-lock stall.** `node:sqlite` is synchronous and the database uses a rollback
  journal. While another process, for example the CLI running `consolidate` or `migrate`, holds the
  write lock, an API request waits up to the 5 s busy timeout and stalls every other API request,
  health checks included, so a liveness probe needs a timeout above 5 s. See [the API ADR](docs/adr/2026-10-06-api-contract-and-security.md).
- **The web app serves only on `127.0.0.1:3000`.** Its Host allowlist (`apps/web/src/proxy.ts`) is
  fixed to that address, so another port or a reverse-proxy hostname gets 421 until the allowlist is
  made configurable.
- **Fuzzy scan is O(catalog) per unmatched entry.** Three entries reach it here. At millions of
  products, it needs a blocking index (token or trigram table).
- **Translations and synonyms are not matched.** `Roteador` and `Processador` reach the review
  queue rather than linking. Matching them automatically needs a dictionary, which is out of scope.
- **Category cannot break a tie.** Two catalog products with the same normalized name and brand
  but different categories would send every matching entry to review as `AMBIGUOUS`. None exist
  in the provided catalog.
- **Seller is a string** (`SellerName`), not an entity. The file has no seller attributes to
  hold.
- **The report is written after the commit.** If writing `--report` fails, the run exits 1 with
  the database already committed. A re-run is safe but reports `UNCHANGED`/`SKIPPED`/`HELD`
  instead of the original outcomes. When the first-run report matters, run with
  `--dry-run --report` first.
- **Run from the repository checkout.** The default `migrations/` folder is located relative to
  the built `libs/persistence` output (three directories up is the repository root), so the CLI
  and API must run from a built checkout of this repository.
- **Out of scope:** price/stock/offers, ML or embedding matching, multi-user access, and
  concurrent runs. SQLite's write lock and a 5 s `busy_timeout` serialize concurrent runs; a
  run that loses the race exits 1 and rolls back.
