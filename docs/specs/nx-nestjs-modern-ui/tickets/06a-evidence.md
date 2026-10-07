# Ticket 06A evidence: catalog read model in @catalog/persistence

Status: OK. Captured 2026-10-06 on node v24.21.0. This covers the library half of ticket 06
(contract C-READMODEL rev1). The read model the web owned in `apps/web/src/lib/catalog-db.ts` is
now an injectable `CatalogReadModel` in `@catalog/persistence`. `apps/web` is unchanged; ticket 09
rewires it. No tests were written; that waits for the approved final test stage.

## Files

- `libs/persistence/src/catalog-read-model.ts` (new, 155 lines): `CatalogReadModel`, the SQL
  constants, the bounds check, LIKE escaping and the look-ahead paging.
- `libs/persistence/src/catalog-read-model-rows.ts` (new, 109 lines): the read-model types and the
  row mappers.
- `libs/persistence/src/persistence.module.ts`: `CatalogReadModel` added to
  `PERSISTENCE_PROVIDERS`, so the module now provides and exports it.
- `libs/persistence/src/index.ts`: two additions.
  - `export * from "./catalog-read-model.js"` exports the class and its argument interfaces.
  - `export type { ... }` exports the eight contract types.

No existing export or behavior changed.

## Surface (C-READMODEL rev1)

Every method takes the caller's open `DatabaseSync`. The read model opens no connection, closes
none, sets no `query_only` pragma and runs no schema check. The caller (`DatabaseAccess.read`,
C-API) owns all of that.

- `summary({ connection }): SummaryCounts`
- `listProducts({ connection, afterId, limit, query }): ProductPage`
- `getProduct({ connection, productId }): ProductDetail | null`
- `listSellerLinks({ connection, productId }): SellerLinkPage`
- `reviewViews({ connection, records }): ReviewView[]`

Normalization uses the injected `NormalizationService.normalize` in place of the core free
function. `listProducts` uses it for the query; `reviewViews` uses it for the live candidates'
source name and brand.

## Verbatim checks

- **SQL and constants.** Each constant was extracted from both files and its sha256 compared:
  `COUNT_COLUMN`, `SELLER_LINKS_SHOWN`, `COUNT_PRODUCTS`, `COUNT_SELLER_LINKS`,
  `COUNT_PENDING_REVIEWS`, `SELECT_PRODUCT_PAGE`, `SELECT_PRODUCT`, `SELECT_SELLER_LINKS`,
  `SELECT_CANDIDATE` and `LIKE_SPECIAL_CHARACTERS` are all **identical**.
- **ESCAPE byte check.** `LC_ALL=C grep -n ESCAPE` prints the same line in both files:
  `... LIKE ? ESCAPE '\\') ORDER BY p.Id LIMIT ?"`. That is two backslash bytes in the TS source,
  so SQLite receives one.
- **ASCII only.** A perl `/[^\x00-\x7F]/` scan of both new files found no non-ASCII bytes.
- **Logic carried over unchanged:**
  - the `RangeError` messages and conditions (`Number.isSafeInteger` for afterId, `1..100` for
    limit);
  - the look-ahead row (`limit + 1`) and how `nextAfterId` is derived;
  - the seller-links query (`LIMIT 101`, first 100 shown, `hasMore`);
  - the live-candidate rule: only `PENDING` + `AMBIGUOUS`, and only when the source name
    normalizes. It goes through `SqliteCatalogRepository.findByNormalizedName`;
  - the `MatchType` guard error text;
  - the mapper fields.
- **Errors.** SQLite errors are not caught anywhere in the new code.

## Gate (scoped, persistence only)

`NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p persistence` passed:
`domain:build`, `rules:build`, `persistence:typecheck`, `persistence:build` and `persistence:lint`
all ran (5/5 tasks, 0 cache hits).

## Smoke run on a scratch copy

How the copy was prepared, all under `out/ticket06a/`:

1. Copied `data/catalog.db` to `out/ticket06a/catalog.db`. The copy started at 975 products, 0
   seller links and no review table.
2. `node apps/cli/dist/main.js migrate --db out/ticket06a/catalog.db` applied 0001 to 0003 and
   reached schema version 3.
3. `node apps/cli/dist/main.js consolidate --db out/ticket06a/catalog.db --input data/ProductEntry.json`
   committed 258 rows written. Counts: LINKED_EXACT 200, LINKED_NORMALIZED 54, CREATED 1,
   UNCHANGED 1, SKIPPED_DUPLICATE_LISTING 11, HELD_FOR_REVIEW 2.

`out/ticket06a/smoke.cjs` (throwaway) boots `NestFactory.createApplicationContext` with
`PersistenceModule` and `ReviewsModule`. It opens the copy with `openConnection`, then sets
`PRAGMA query_only = ON` and calls `requireSchemaVersion` as the caller would. Results are below;
the full log is in `out/ticket06a/smoke.log`.

| Call | Result |
|---|---|
| `summary` | `{"products":976,"sellerLinks":255,"pendingReviews":2}`, as expected |
| `listProducts q=camera limit=20` | 14 rows (ids 18, 43, 211, 277, 292, 731, 732, 733, 737, 738, 739, 744, 746, 747), `nextAfterId: null`. Id 18 "Camera Canon EOS R6" has sellerCount 2 |
| `listProducts q=CAMERA limit=2` | ids 18 and 43, `nextAfterId: 43` (the look-ahead works) |
| `listProducts q="100%" limit=5` | ids 9, 758, 836, 890, 898. Normalization drops `%`, so the pattern is `%100%` |
| `getProduct 976` | `{"id":976,"name":"Security Test Product","brand":"TestBrand'; SELECT 1; --","category":"Electronics","normalizedName":"security test product","normalizedBrand":"testbrand select 1"}`. The hostile brand comes back as inert text |
| `getProduct 999999` | `null` |
| `listSellerLinks 976` | 1 row (id 177, MegaStore, matchType CREATED), `hasMore: false` |
| bounds `afterId=-1` | `RangeError: afterId must be a non-negative integer, got -1` |
| bounds `limit=0` / `limit=101` | `RangeError: limit must be between 1 and 100, got 0` / `got 101` |

The two pending reviews come from `ReviewsService.list` (PENDING, afterId 0, limit 20) and are
passed through `reviewViews`:

| Review | Reason | Source name | Candidate | Live candidates | Candidate seller links |
|---|---|---|---|---|---|
| 1 | FUZZY | Roteador WiFi 6 TP-Link | 21 Router WiFi 6 TP-Link (TP-Link, Networking) | none (not AMBIGUOUS) | 1 row (id 20, SmartHomeStore, EXACT), `hasMore: false` |
| 2 | FUZZY | Processador AMD Ryzen 9 7950X | 28 Processor AMD Ryzen 9 7950X (AMD, Components) | none (not AMBIGUOUS) | 1 row (id 27, HomeGoods, EXACT), `hasMore: false` |

The review page's `nextAfterId` is `null`.

## Data integrity

sha256 was taken before and after the run, and is unchanged:

- `data/catalog.db`: `733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404`
- `data/ProductEntry.json`: `1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6`

## Decisions and deviations

- `ReviewViewPage`, `ReviewFormCommand`, `MissingCandidateError` and the write path
  (`resolveReviewFromForm`, `linkCandidateCommand`) were not moved. C-READMODEL does not list
  them, and C-REVIEWS/C-API now own review listing, resolution and error mapping. They stay in
  the web file until ticket 09.
- `reviewViews` returns a mutable `ReviewView[]`, as the contract signature says. The type
  definitions themselves were moved verbatim, including `readonly` arrays inside `ProductPage`,
  `SellerLinkPage` and `ReviewView.liveCandidates`.
- The method argument interfaces (`ReadModelConnectionArgs`, `ListProductsArgs`,
  `ProductLookupArgs`, `ReviewViewsArgs`) are exported because they are part of the public
  method signatures.
- The row mappers live in their own file (as `rules/base.md` asks for mappers) and are not
  exported from the barrel.

## Not exercised

- **The `hasMore: true` path of `listSellerLinks`.** No product in the demo data has more than 100
  links.
- **A LIKE-special character reaching the pattern.** Normalized text is `[0-9a-z ]` only, so
  `escapeLike` stays defensive, as the source comment says.
- **The `AMBIGUOUS` live-candidate branch.** Both pending reviews are FUZZY.

All three paths are code moved byte-for-byte from the web module. Covering them is part of the
final test scope.
