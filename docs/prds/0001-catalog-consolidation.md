# PRD 0001 — Catalog Consolidation

| Field | Value |
|---|---|
| Title | Catalog Consolidation: receive seller product files and merge them into the marketplace catalog without duplicates |
| Status | implemented; kept as the requirements record (see the revision note below) |
| Date | 2026-10-05 |
| Revised | 2026-10-07 |
| Owner | Ricardo Fagmer |
| Decision record | `../../.engineos/archived/2026/10/docs/2026-10-05-catalog-consolidation-design.md` (frozen sections A–I; this PRD cites them, it does not renegotiate them) |
| Related | ADR-0001 `../adr/0001-python-stdlib-cli.md` (superseded by ADR-0006) · ADR-0002 `../adr/0002-product-identity-normalized-name-and-brand.md` · ADR-0003 `../adr/0003-seller-link-schema-and-golden-record.md` · ADR-0004 `../adr/0004-review-queue-for-uncertain-matches.md` · ADR-0005 `../adr/0005-all-or-nothing-idempotent-runs.md` · ADR-0006 `../adr/0006-typescript-shared-core.md` · Tasks `../specs/catalog-consolidation/tasks.md` · Follow-up spec index `../specs/2026-10-06-nx-nestjs-modern-ui.md` |

**Revision note (2026-10-07).** This PRD was written on 2026-10-05 for the first implementation,
a Python 3.12 standard-library CLI (ADR-0001). That implementation was rewritten in TypeScript
(ADR-0006, [design spec](../specs/2026-10-06-typescript-rewrite-and-web-ui-design.md)) and then
restructured into an Nx workspace with a NestJS CLI, a NestJS REST API and a Next.js web app
(follow-up feature `nx-nestjs-modern-ui`, [spec index](../specs/2026-10-06-nx-nestjs-modern-ui.md)).
The Python code was removed and archived; its recorded behavior is kept as golden fixtures under
`fixtures/golden/`. The feature is delivered; this document stays as the record of the problem,
the ambiguities and the requirements. In this revision:

- Commands and runtime requirements describe the TypeScript CLI. The [README](../../README.md)
  quick start is the source of truth for commands. Text that applied only to the Python
  implementation is kept and labelled "Historical".
- Section 3 records the two non-goals that the follow-up feature reversed, with the reason.
- Section 4 corrects evidence that the 2026-10-05 profile got wrong (A5, A6, A8) and adds A16
  and A17; section 1 is corrected to match.
- FR-6 and section 9 now state what the code reports and does, where the 2026-10-05 text
  promised something else.
- After the fidelity review, A16 changed from rejecting JSON number Ids to accepting safe
  integers as their decimal text, and A3 now records the `brand_unverified_null` warning on links
  made with a one-sided NULL brand (FR-3 and section 9 note it too).

## 1. Problem statement and context

The company has run a first-party (1P) catalog: 975 products in `Product`, every one of them
registered by the company itself. `SellerProduct`, the table meant to say "seller S offers
product P under their own SKU", is empty. The store is now becoming a marketplace: 20 external
sellers have sent a first file of 269 product entries (`data/ProductEntry.json`), and more
files will follow.

Each seller registers products in their own words. The same physical item arrives as
"Câmera Canon EOS R6" from one seller and "Camera Canon EOS R6" from another, with Category
"Photo" from one and "Photography" from the catalog. Thirteen `Id` strings are each reused by two
different sellers for unrelated products (A5). Ten sellers each send the same product twice under
two completely different Ids, the second time with a double space added to the name, for example
OfficeSupply "Basketball Spalding Official" and "Basketball Spalding  Official"; GardenStore also
re-sends "Camera Canon EOS R6" under a second Id (A6).

**Why duplicates hurt.** If every seller entry became a new `Product` row, the catalog would
grow from 975 to 1,244 rows for a file whose real contribution is one genuinely new product.
Shoppers would see the same camera listed three times in search results, reviews would be
split across clones, the buy-box (the "best offer for this product" slot that a marketplace
exists to compute) would have nothing to compete on, and inventory/price comparisons across
sellers — the whole point of a marketplace — would be impossible.

**Why false merges hurt more.** The opposite failure is worse and harder to undo. If two
different products are fused into one, a seller is attached to an item they do not sell, a
shopper buys A and receives B, and un-merging later means untangling orders, reviews and
offers that were recorded against the wrong identity. A duplicate is a cosmetic defect fixable
by a later merge; a false merge is a data-corruption event. The matching policy in this PRD is
therefore deliberately asymmetric: it auto-links only on strong evidence and routes everything
in between to a human (section 4, ADR-0002, ADR-0004).

The challenge statement is explicit that "demonstrating mastery of the problem and
understanding of the solution is more important than a scalable, production-ready
implementation" and that it "contains some intentional ambiguities" which "are part of the
assessment". Section 4 is the centerpiece of this document for that reason.

## 2. Users and actors

| Actor | Role in this system | Direct? |
|---|---|---|
| Marketplace catalog operator | Runs the import CLI against a seller file, reads the per-entry report, works the review queue of uncertain matches (CLI `review` commands or, since the follow-up feature, the web app's review page). The only human who touches the system. | Direct |
| Seller | Produces the product file. Does not interact with the system; is represented by the `SellerName` string on each entry. Experiences the outcome as "my product appears / is linked / is pending review". | Indirect |
| Shopper | Never sees the system. Experiences the outcome as one product page per real-world item with N seller offers, instead of N near-identical pages. | Indirect |

## 3. Goals and non-goals

### Goals

| # | Goal |
|---|---|
| G1 | Ingest a seller product file and, for each entry, either link the seller to an existing catalog product or create a new one — never a duplicate of an existing product. |
| G2 | Record which sellers offer each product, keeping each seller's own SKU and their raw attributes for traceability. |
| G3 | Never auto-merge on weak evidence; hold uncertain matches for a human decision. |
| G4 | Be deterministic and idempotent: the same file produces the same result, and re-running it writes nothing. |
| G5 | Make every decision explainable: one closed-vocabulary outcome per entry, with the matched product and score, in a machine-readable report. |
| G6 | Keep the given schema recognizable (the tables `Product` and `SellerProduct` stay, with additive changes) so the evaluators can inspect the result with plain `sqlite3`. |

### Non-goals (frozen, section I of the decision record)

| Non-goal | Why it is excluded now |
|---|---|
| Review-queue resolution UI | The queue is a table; a `review list` / `review resolve` CLI is a stretch task, a UI is out. **Reversed after delivery; see "Scope changes after this PRD" below.** |
| Price, stock, offers | The input file carries none of them; the brief asks about catalog identity only. |
| `Seller` entity table | `SellerName` is unique and stable within this file; a table is recorded as a future step (section 10). |
| Translation / synonym dictionaries | Two cases in 269 entries (Roteador, Processador); the review queue handles them at this volume. |
| ML / embedding matching | Candidate generation by embeddings is a future feeder for the same review queue, not a replacement for it. |
| Concurrency between simultaneous runs | One operator, one file at a time; a single SQLite transaction already serializes writers. |
| HTTP API | The brief asks for a system that "receives a file"; a CLI is the smallest honest surface. **Reversed after delivery for reading the catalog and resolving reviews; receiving a file is still CLI-only. See "Scope changes after this PRD" below.** |

### Scope changes after this PRD

Both non-goals above were reversed by later, separately specified work. The original rows are
kept so the change stays visible.

| Former non-goal | What shipped | Why the scope changed | Record |
|---|---|---|---|
| Review-queue resolution UI | The `review list` / `review resolve` CLI, and a Next.js web app with a review queue page (`/reviews`) whose link, create and reject actions resolve Review Items. | The project was to be presented in an interview, and a review queue driven only from a terminal made the system's hardest decision (uncertain matches wait for a human, ADR-0004) invisible in a demo. | [TypeScript rewrite and web UI design spec](../specs/2026-10-06-typescript-rewrite-and-web-ui-design.md), section 1 |
| HTTP API | A NestJS 11 REST API (`apps/api`) under `/v1` that serves the catalog and the review queue and resolves Review Items. It cannot run `migrate` or `consolidate`: a seller file is still received only through the CLI. The web app reaches data only through this API. | The first web app read SQLite directly (that spec listed an HTTP JSON API as a non-goal), so no backend owned data access. The follow-up feature `nx-nestjs-modern-ui` moved data access behind a NestJS API shared with the CLI's rules. | [Spec index](../specs/2026-10-06-nx-nestjs-modern-ui.md), [plan](../../.specs/features/nx-nestjs-modern-ui/plan.md), [ADR: Nx and Nest backend, web via API](../adr/2026-10-06-nx-nest-backend-web-via-api.md), [ADR: API contract and security](../adr/2026-10-06-api-contract-and-security.md) |

The matching rules, the outcome vocabulary and the acceptance baseline in this PRD did not change
with either step. The API and web app add no matching behavior; they resolve Review Items through
the same rules as `review resolve`.

## 4. Ambiguities and how we resolved them

Each row is one intentional ambiguity in the challenge. Evidence comes from profiling
`data/catalog.db` and `data/ProductEntry.json` on 2026-10-05 (decision record, "Evidence").
Evidence in A5, A6 and A8 was corrected on 2026-10-07 against the file and the recorded golden
report (`fixtures/golden/consolidate-first/report.jsonl`); A16 and A17 were added the same day.
Entry indexes are 0-based positions in the file, as in the report's `index` field.

| # | Ambiguity | Evidence from the data | Options considered | Resolution | ADR |
|---|---|---|---|---|---|
| A1 | What does "duplicate product" mean? | 200 of 269 entries have a raw `Name` byte-equal to a catalog product; 54 more are equal only after normalization ("Câmera" vs "Camera", `55"` vs `55`, doubled spaces in ~60 entries). | (a) byte-equal name only; (b) normalized name + brand; (c) fuzzy similarity threshold auto-merges. | (b). Identity = (normalized name, compatible brand). Fuzzy similarity never merges by itself (A12). | ADR-0002 |
| A2 | Which attributes form identity? Is Category part of it? | GardenStore sends "Camera Canon EOS R6" with Category "Photo"; the catalog says "Photography". Sellers use their own taxonomy. | (a) name+brand+category; (b) name+brand; (c) name only. | (b). Category is NOT identity; it is kept as `SourceCategory` on the link row for traceability. (c) rejected: two brands may legitimately share a generic name. | ADR-0002 |
| A3 | How is a NULL brand compared? | 119 of 975 catalog products have `Brand NULL`; 3 file entries have `Brand null`, and all 3 match catalog products whose brand is also NULL. | (a) NULL ≠ anything (always a new product); (b) NULL is compatible with anything ("unknown, not different"); (c) NULL only matches NULL. | (b). Unknown is not different: brands are compatible when normalized-equal or either side is NULL. Revised 2026-10-07: a new link made when exactly one side's normalized brand is NULL carries the warning `brand_unverified_null`; it does not change which product is linked. | ADR-0002 |
| A4 | Seller `Id` is a string; `SellerProductId` is `INTEGER`. | Every file `Id` is a UUID-like string such as `a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d`; the column is `INTEGER NOT NULL`. | (a) hash the string to an integer; (b) change the column to `TEXT`; (c) add a parallel text column. | (b). `SellerProductId` becomes `TEXT NOT NULL` (table rebuild; the table is empty so this is safe). Hashing loses traceability and invites collisions. | ADR-0003 |
| A5 | Are seller Ids globally unique? | 14 `Id` strings appear twice in the file. 13 of them are reused by two DIFFERENT sellers for different products, e.g. `00112233-4455-4667-7889-900112233445` is GardenStore "Curtain Rod Adjustable" and SportsHub "Bookshelf 5-Shelf". The 14th, GardenStore `e5e5e5e5-…`, is sent twice by the same seller (A7). | (a) treat `Id` as global (second use is a conflict); (b) `Id` is unique only per seller. | (b). The idempotency key is `UNIQUE (SellerName, SellerProductId)`. The Id is the seller's opaque SKU. | ADR-0003 |
| A6 | Same seller sends the same product twice under DIFFERENT Ids. | 11 entries: indexes 87 and 257–266. Entries 257–266 come from 10 different sellers; each repeats, one for one, that seller's entry at 237–246 under a completely different Id with a double space added to the name, e.g. OfficeSupply "Basketball Spalding Official" (`1111aaaa-…`, index 237) and "Basketball Spalding  Official" (`aaaa1111-…`, index 257). Entry 87 is GardenStore "Camera Canon EOS R6" under `e6e6e5e5-…` after already linking under `e5e5e5e5-…`. Not a case: KitchenPlus "Grass Trimmer  String" (index 236) is KitchenPlus's only listing of that product (the single-spaced name came from FitnessCenter, index 213), so it is `LINKED_NORMALIZED`. | (a) link both SKUs to the product; (b) first SKU wins, second is reported and skipped; (c) reject the file. | (b). `UNIQUE (SellerName, ProductId)`: a seller offers a product once. Outcome `SKIPPED_DUPLICATE_LISTING`. (a) would make the "which sellers offer X" question return the same seller twice. | ADR-0003 |
| A7 | Same seller + same Id re-sent in the file. | GardenStore `e5e5e5e5-…` appears twice: "Câmera Canon EOS R6" then "Camera Canon EOS R6" — the same product after normalization. | (a) error; (b) no-op when it resolves to the same product, conflict when it does not. | (b). Same product → `UNCHANGED`; different product → `CONFLICT_SELLER_SKU`, not applied, reported. This is also what makes re-running a file a no-op (A14). | ADR-0005 |
| A8 | Translations and synonyms. | "Roteador WiFi 6 TP-Link" (FootwearHub) vs catalog "Router WiFi 6 TP-Link", ratio 0.91; "Processador AMD Ryzen 9 7950X" (SuperMart) vs "Processor AMD Ryzen 9 7950X", ratio 0.96. | (a) auto-link above a similarity threshold; (b) hold for human review; (c) translation dictionary. | (b). Both are `HELD_FOR_REVIEW` with the candidate and score. Different products score just as high: catalog products 885 "Multivitamin Men" and 886 "Multivitamin Women" have a ratio of 0.941 on their normalized names, above the 0.91 of the Roteador translation. A threshold low enough to auto-link that translation would also fuse that pair on name similarity alone (brand compatibility is a separate check), so no threshold is safe for auto-merge. | ADR-0002, ADR-0004 |
| A9 | Hostile and malformed input. | Entry "Security Test Product" has Brand `TestBrand'; SELECT 1; --` and malformed Id `09835342345-4678-9abc-def012345678`; two more malformed Ids (`uddd0000-…`, `ddddeee-…`). | (a) reject anything non-UUID; (b) sanitize/strip the brand; (c) parameterized SQL, store verbatim, validate Id against a charset allowlist and warn when not a UUID. | (c). Every SQL statement is parameterized, so the brand is just data and is stored verbatim. `Id` must match `[A-Za-z0-9._-]`, max 64 chars; a non-UUID Id is accepted with a warning (it is the seller's opaque SKU, the brief never promised a UUID). The entry's best fuzzy ratio is 0.48, so it becomes the file's one `CREATED` product. | ADR-0002, ADR-0003 |
| A10 | Whose attributes win when a duplicate differs (golden record)? | "Levi's" (seller) vs "Levis" (catalog); "Black+Decker" vs "BLACK+DECKER"; "Photo" vs "Photography". | (a) last seller overwrites; (b) catalog row is the golden record, never overwritten by a seller; (c) merge field by field. | (b). The existing `Product` row keeps its Name/Brand/Category. A `CREATED` product takes the seller's cleaned display values (trimmed, internal whitespace collapsed — not the normalized key). Each seller's raw values live on the link row (`SourceName`, `SourceBrand`, `SourceCategory`). | ADR-0003 |
| A11 | More than one catalog product matches an entry. | 0 occurrences in this catalog (no two products share a normalized name), but nothing in the schema prevents it and two brands may share a generic name. | (a) pick the first; (b) hold for review as ambiguous. | (b). `HELD_FOR_REVIEW` with `Reason = 'AMBIGUOUS'`. | ADR-0004 |
| A12 | What to do with uncertain matches. | 2 fuzzy candidates at ≥ 0.80 (A8); the next-best non-match is 0.48. | (a) auto-link above threshold; (b) create a new product (accept duplicates); (c) queue for a human. | (c). `ProductMatchReview` table with candidate, score, reason and status. `FUZZY_REVIEW_THRESHOLD = 0.80` decides between "queue" and "create", never between "queue" and "link". | ADR-0004 |
| A13 | Partial failure of a file. | 3 entries have malformed Ids but are otherwise valid; one has a hostile brand. | (a) reject the whole file on any bad record; (b) fail per record, commit the rest; (c) commit per record. | (b) for validation: an invalid record is `REJECTED_INVALID` and the rest proceed. One transaction per run: a DB error rolls back everything. A file that is not a JSON array, exceeds 10 MB or 100,000 entries fails before any write (exit 2). | ADR-0005 |
| A14 | Re-running the same file. | The same operator will re-run after fixing a feed or after a crash; the challenge DB may be reset and reloaded. | (a) duplicates on every run; (b) idempotent no-op. | (b). Every entry reports `UNCHANGED` / `SKIPPED_DUPLICATE_LISTING` / `HELD_FOR_REVIEW` (already queued); zero rows written. `--dry-run` runs everything and rolls back. | ADR-0005 |
| A15 | Seller as a string vs an entity. | `SellerName` is `TEXT NOT NULL`; 20 distinct values, consistently spelled. The file has no seller metadata. | (a) create a `Seller` table now; (b) keep the string, record the entity as a future step. | (b). A `Seller` table with no attributes to hold is a rename of a string. Deferred (section 10). | ADR-0003 |
| A16 | Numeric versus string seller Ids. | The original `SellerProduct.SellerProductId` column is `INTEGER NOT NULL`, but every `Id` in the file is a JSON string: UUID-shaped except three (A9), some made only of digits and hyphens, such as `12341234-5678-4901-2345-678901234567`. No entry sends a JSON number. | (a) accept JSON numbers and strings, converting numbers to text; (b) accept strings only and reject a number; (c) keep `INTEGER` and parse numeric strings. | (a), restricted to safe integers. A JSON string `Id` is stored as sent, not trimmed; whitespace fails the charset allowlist instead (A9). A JSON number that is a safe integer (`Number.isSafeInteger`, negatives included) is converted to its decimal text and then follows the same allowlist and length rules, so `12345` and `"12345"` name the same seller SKU (`withIntegerIdAsText`, `libs/persistence/src/seller-record-validator.ts`). Floats, unsafe integers, booleans, `null`, arrays and objects are `REJECTED_INVALID` with error `not_a_string:Id`, and the rest of the file proceeds. `JSON.parse` cannot tell `12345` from `12345.0` or `1.2345e4`, so those literals are also accepted as `"12345"`. A non-UUID numeric `Id` gets the `non_uuid_seller_sku` warning like a string. Links that existed before migration 0001 keep their integer value cast to `TEXT` (section 9). (c) is rejected for the reasons in A4. Revised 2026-10-07: originally option (b); changed after the fidelity review because the original column was `INTEGER`. | ADR-0003, ADR-0005 |
| A17 | Seller identity normalization. | The file identifies a seller only by the `SellerName` string; there is no seller id. The 20 names in this file are consistently spelled, so the sample does not exercise the rule. | (a) use the name exactly as sent; (b) trim surrounding whitespace only; (c) also normalize the name like a product name (case, accents, punctuation) so spelling variants collapse into one seller. | (b). The name is trimmed of leading and trailing whitespace (Python `str.strip()` semantics, `TextService.pyStrip`), then stored and compared byte for byte: case-sensitive, with internal whitespace and accents untouched and no alias table. Consequence: a spelling variant (different case, an extra internal space, a typo) counts as a separate seller with its own links. A variant of an existing seller therefore links a product that seller already offers instead of reporting `SKIPPED_DUPLICATE_LISTING`, and its earlier SKUs are not recognized as `UNCHANGED`. No ADR records why (c) was not chosen; this row records the delivered behavior. The only recorded future step for seller identity is the `Seller` entity in section 10. | ADR-0003 |

## 5. Functional requirements

Outcomes use exactly the closed vocabulary of decision record section E:
`LINKED_EXACT | LINKED_NORMALIZED | CREATED | UNCHANGED | SKIPPED_DUPLICATE_LISTING |
HELD_FOR_REVIEW | REJECTED_INVALID | CONFLICT_SELLER_SKU`.

### FR-1 — Migrate the given database additively

`data/catalog.db` is the original input and is never modified. The operator works on a scratch
copy, as in the README quick start:

```bash
mkdir -p out && cp data/catalog.db out/catalog.db
pnpm cli migrate --db out/catalog.db
```

`pnpm cli migrate` applies forward-only SQL migrations from `migrations/`, tracked in a
`SchemaVersion` table (section D). Before applying anything it copies the database to
`<db>.pre-migrate-<timestamp>.bak`. `pnpm cli` needs Node >= 24 and a prior `pnpm build`
(README "Requirements and quick start").

Historical: the 2026-10-05 text ran `python -m catalog_consolidation migrate --db data/catalog.db`
against the original file. The Python CLI no longer exists.

- Given a copy of the original `catalog.db`, When `migrate` runs, Then `SellerProduct.SellerProductId` is `TEXT NOT NULL`, the columns `SourceName`, `SourceBrand`, `SourceCategory`, `MatchType` (CHECK `EXACT|NORMALIZED|CREATED|REVIEWED`), `CreatedAt` exist, and the constraints `UNIQUE (SellerName, SellerProductId)` and `UNIQUE (SellerName, ProductId)` exist.
- Given a copy of the original `catalog.db`, When `migrate` runs, Then `Product.NormalizedName` and `Product.NormalizedBrand` exist, all 975 rows are backfilled by the same normalizer the matcher uses (`NormalizationService`; historically the Python normalizer), and `NormalizedName` is indexed (not unique).
- Given a copy of the original `catalog.db`, When `migrate` runs, Then table `ProductMatchReview` exists with the columns and CHECK constraints of section D.
- Given a migrated database, When `migrate` runs again, Then no migration is re-applied and the command exits 0.
- Given any connection opened by the system, Then `PRAGMA foreign_keys = ON` is set.

### FR-2 — Validate the file and each record

- Given a file that is not a JSON array, or exceeds 10 MB, or has more than 100,000 entries, When `consolidate` runs, Then no row is written and the process exits 2.
- Given an entry missing `Id`, `SellerName` or `Name`, or with any of them blank, or with a field over its max length (Id 64, SellerName 100, Name 200, Brand 100, Category 100), or with `Brand`/`Category` neither string nor null, or with an `Id` outside `[A-Za-z0-9._-]`, When processed, Then its outcome is `REJECTED_INVALID` with the reason, and the following entries are still processed.
- Given an entry whose `Id` is within the allowlist but is not a UUID (e.g. `09835342345-4678-9abc-def012345678`), When processed, Then it is accepted and the report carries a warning.
- Given an entry with unknown extra keys, When processed, Then the keys are ignored and the report carries a warning.

### FR-3 — Match by normalized identity

- Given entry Name byte-equal to one brand-compatible catalog product's Name, When processed, Then outcome is `LINKED_EXACT` and a `SellerProduct` row with `MatchType = 'EXACT'` points to that product.
- Given entry "Câmera Canon EOS R6" / Brand "Canon" and catalog "Camera Canon EOS R6" / "Canon", When processed, Then outcome is `LINKED_NORMALIZED` and `MatchType = 'NORMALIZED'`.
- Given entry Brand "Levi's" and catalog Brand "Levis" with equal normalized names, When processed, Then the brands are compatible and the entry links.
- Given entry Brand null and a catalog product with equal normalized name and any Brand, When processed, Then the brands are compatible and the entry links. When exactly one side's normalized brand is NULL, the new link's report line carries the warning `brand_unverified_null` (revised 2026-10-07).
- Given entry Category "Photo" and catalog Category "Photography" with equal normalized name and compatible brand, When processed, Then the entry links; Category never prevents or causes a match.
- Given two or more brand-compatible catalog products with the same normalized name, When processed, Then outcome is `HELD_FOR_REVIEW` with `Reason = 'AMBIGUOUS'` and no `SellerProduct` row is written.

### FR-4 — Fuzzy candidates go to review, never to a link

- Given no normalized match and a brand-compatible product whose normalized-name `SequenceMatcher` ratio is ≥ 0.80 (e.g. "Roteador WiFi 6 TP-Link" vs "Router WiFi 6 TP-Link", 0.91), When processed, Then outcome is `HELD_FOR_REVIEW`, a `ProductMatchReview` row is written with `CandidateProductId`, `Score` and `Reason = 'FUZZY'`, and no `Product` or `SellerProduct` row is written.
- Given no normalized match and best ratio < 0.80 (e.g. "Security Test Product", 0.48), When processed, Then outcome is `CREATED`.

### FR-5 — Create a product and link the seller in one step

- Given outcome `CREATED`, When applied, Then one `Product` row is inserted with the seller's trimmed, whitespace-collapsed Name/Brand/Category and its `NormalizedName`/`NormalizedBrand`, and one `SellerProduct` row with `MatchType = 'CREATED'` links the seller to it.
- Given Brand `TestBrand'; SELECT 1; --`, When the product is created, Then the Brand column holds exactly that string and no other table or row is affected.
- Given two sellers sending the same new product later in the same file, When processed in file order, Then the first is `CREATED` and the second is `LINKED_EXACT` or `LINKED_NORMALIZED` against the product created earlier in the same run.

### FR-6 — Seller-side duplicates and conflicts

- Given a seller already linked to product P under SKU S1 in this run or a previous one, and an entry from the same seller matching P under SKU S2 (e.g. OfficeSupply "Basketball Spalding  Official"), When processed, Then outcome is `SKIPPED_DUPLICATE_LISTING`, no row is written, and the report's `productId` is P. The report does not name S1 (see the limitation below).
- Given `(SellerName, SellerProductId)` already linked to product P and an entry with the same pair resolving to P (GardenStore `e5e5e5e5-…` sent twice), When processed, Then outcome is `UNCHANGED` and no row is written.
- Given `(SellerName, SellerProductId)` already linked to product P and an entry with the same pair resolving to a different product Q, When processed, Then outcome is `CONFLICT_SELLER_SKU`, no row is written, and the report's `productId` is P, the product already linked. The report does not name Q (see the limitation below).
- Given seller A and seller B using the same `Id` string for different products, When processed, Then both link (or create) independently; the shared `Id` is not a conflict.

Known limitation: the 2026-10-05 text required the report to name P and S1 for
`SKIPPED_DUPLICATE_LISTING`, and P and Q for `CONFLICT_SELLER_SKU`. The implementation reports only
the existing product id in `productId` (`libs/consolidation/src/consolidation-run.ts`: the
`CONFLICT_SELLER_SKU` outcome in `recheckExistingLink` and the `SKIPPED_DUPLICATE_LISTING` outcome in
`link`). The first SKU S1 and the conflicting product Q are not in the report. Adding them would be a
report format change.

### FR-7 — Golden record is the catalog row

- Given a linked entry whose Name, Brand or Category differ from the catalog product's, When applied, Then the `Product` row is unchanged and the differences are stored on the `SellerProduct` row as `SourceName`, `SourceBrand`, `SourceCategory`.

### FR-8 — Report and exit codes

The command, on the scratch copy from FR-1:
`pnpm cli consolidate --db out/catalog.db --input data/ProductEntry.json --report out/report.jsonl`
(`--dry-run` is optional). `pnpm cli review list --db out/catalog.db` prints the review queue.

- Given a completed run, Then stdout ends with summary counts per outcome and `--report` (when given) holds one JSON line per entry with: `index`, `sellerName`, `sellerProductId`, `outcome`, `productId` (null when none), `reviewReason` (null when none), `score` (null when none), `warnings`, `errors`.
- Given a run with any number of `REJECTED_INVALID` or `CONFLICT_SELLER_SKU` entries and no unexpected error, Then the exit code is 0; an invalid file, a missing database or an unmigrated database exits 2; an unexpected error rolls back and exits 1.
- Given `--dry-run`, When the run completes, Then the report is produced and the database is byte-identical to before.

### FR-9 — Idempotent re-run

- Given a file already consolidated, When the same file is run again, Then every entry reports `UNCHANGED`, `SKIPPED_DUPLICATE_LISTING` or `HELD_FOR_REVIEW`, and `Product`, `SellerProduct` and `ProductMatchReview` have the same row count as before the second run.

## 6. Non-functional requirements

| # | Requirement | How it is verified |
|---|---|---|
| NFR-1 | Deterministic: the same file against the same database state yields the same per-entry outcomes and the same `ProductId`s. Entries are processed in file order; tie-breaks are by catalog `Id`. | Two `--dry-run` reports on the same inputs are identical. |
| NFR-2 | Idempotent: re-running writes zero rows (FR-9). | Row counts before/after a second run. |
| NFR-3 | Traceable: every `SellerProduct` row carries the seller's raw `SourceName`, `SourceBrand`, `SourceCategory`, the `MatchType`, and `CreatedAt`; every review row carries candidate, score and reason. | Join `SellerProduct` to the input file by `(SellerName, SellerProductId)`; every row resolves. |
| NFR-4 | All-or-nothing per run: one SQLite transaction; any DB error rolls back the whole file. Validation failures are per record and do not abort the run. | Inject a failure mid-file; the DB is unchanged. |
| NFR-5 | Input limits (section F): 10 MB, 100,000 entries, per-field max lengths, `Id` charset allowlist. | Boundary tests at each limit. |
| NFR-6 | Parameterized SQL everywhere; no string-built statements. | Code inspection; the hostile brand round-trips verbatim. |
| NFR-7 | Runtime for the provided file (269 entries against 975 products, including the fuzzy pass over unmatched entries) completes in a few seconds on a laptop. | Wall-clock on `data/ProductEntry.json`. |
| NFR-8 | Runtime: Node >= 24 (`.nvmrc` says 24); SQLite through Node's built-in `node:sqlite`; dependencies installed from the repository's `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`. Historical: the 2026-10-05 requirement was "Stdlib-only at runtime (Python 3.12); dev tools pinned to exact versions", verified by an import-purity test on `domain/`. It lapsed when ADR-0006 superseded ADR-0001. | README "Requirements and quick start". |
| NFR-9 | One implementation of the normalization rule, used for both the backfill and the matcher. | The backfill in migration 0002 and the matcher both call `NormalizationService` (`libs/rules`), not SQL. Historical: in the Python implementation this was the Python normalizer. |

## 7. Expected outcome on the provided data (acceptance baseline)

Simulated by applying the frozen rules to the 269 entries of `data/ProductEntry.json`
against the 975-product `data/catalog.db` (decision record, "Simulated outcome").

| Outcome | Count | Example |
|---|---|---|
| `LINKED_EXACT` | 200 | MegaStore "Smartphone Galaxy S23" |
| `LINKED_NORMALIZED` | 54 | GardenStore "Câmera Canon EOS R6" → "Camera Canon EOS R6" |
| `SKIPPED_DUPLICATE_LISTING` | 11 | OfficeSupply "Basketball Spalding  Official" (second SKU for the same product) |
| `HELD_FOR_REVIEW` | 2 | "Roteador WiFi 6 TP-Link" (0.91), "Processador AMD Ryzen 9 7950X" (0.96) |
| `UNCHANGED` | 1 | GardenStore `e5e5e5e5-…` re-sent |
| `CREATED` | 1 | MegaStore "Security Test Product" (best ratio 0.48) |
| `REJECTED_INVALID` | 0 | the 3 malformed Ids pass the charset allowlist and are accepted with a warning |
| `CONFLICT_SELLER_SKU` | 0 | — |
| **Total** | **269** | |

The delivered CLI's recorded first run on this data
(`fixtures/golden/consolidate-first/01-consolidate.stdout`) shows these counts and
`rows_written=258`.

Resulting state: `Product` 975 → 976; `SellerProduct` 0 → 255 (200 + 54 + 1 created link);
`ProductMatchReview` 0 → 2 pending; 199 products end up with at least one seller: 145 offered by
1 seller (including the created product), 52 by 2, and 2 by 3. A run producing different counts on this file is a
defect until the difference is explained and the baseline is re-frozen.

## 8. Success metrics

| Metric | Target | Source |
|---|---|---|
| Duplicate products created from the sample file | 0 | `Product` grows by exactly 1 (section 7) |
| Valid entries ending in a terminal outcome | 100% (269 of 269) | Report line count equals entry count; every line has an outcome from the closed set |
| Rows written by an immediate re-run | 0 | FR-9 |
| Seller offers traceable to their raw source attributes | 100% | NFR-3 join |
| False merges on the sample file | 0 | Manual check of the 54 `LINKED_NORMALIZED` rows against their catalog product |
| Uncertain matches auto-linked | 0 | No `SellerProduct` row has a fuzzy origin; the 2 translations sit in the queue |

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Normalization over-merges (e.g. `12.9''` and `12 9` both normalize to `12 9`; two distinct SKUs differing only by punctuation collapse). | False merge — the costly failure. | Brand must also be compatible; the catalog is clean today (no two products share a normalized name), so any future collision surfaces as `AMBIGUOUS` review rather than a silent link. Golden-record rule keeps the catalog row intact for a later un-merge. |
| NULL-brand compatibility links a brandless seller entry to a branded product with the same name. | Possible false merge when a generic name is shared across brands. | 0 such cases in the sample (all 3 null-brand entries match null-brand products). Reviewer can revisit the rule when a branded-vs-null collision appears; the link row records `SourceBrand NULL` for audit. Since 2026-10-07 the report flags every new link made with a one-sided NULL brand (in either direction) with `brand_unverified_null`; the false merge is surfaced, not prevented. |
| Fuzzy threshold 0.80 misses true duplicates below it (they become `CREATED`). | Duplicate — the cheaper failure, visible and mergeable later. | Threshold is a named constant; the report carries the best score for every `CREATED` entry so the operator can tune it with evidence. |
| Hostile entry is created as a real product ("Security Test Product"). | Junk product in the catalog. | The rules are applied honestly: it is new and unmatched. Parameterized SQL makes it harmless; the operator sees it as the only `CREATED` row in the summary. A blocklist is deliberately not invented. |
| Review queue is never worked. | Translations stay unlinked; the seller's offer is invisible. | Queue rows are `PENDING` with candidate and score; the count is printed in every run summary. Delivered since: the `review list` / `review resolve` CLI and the web app's review queue page (section 3, "Scope changes after this PRD"). |
| Table rebuild to change `SellerProductId` to `TEXT`. | Data loss if the table were populated. | The table is empty in the delivered catalog, and migration 0001 preserves rows anyway: it copies each existing link into the rebuilt table, casting `SellerProductId` to `TEXT`, filling `SourceName`, `SourceBrand` and `SourceCategory` from the linked catalog product and setting `MatchType = 'EXACT'`. The copy joins `Product`, so a link to a missing product would be dropped; the migration runner compares the `SellerProduct` row count before and after and rolls back with `rows_lost` when they differ. `migrate` also writes a `.bak` copy before applying anything. (The 2026-10-05 text said the migration asserted `COUNT(*) = 0` and failed otherwise; the shipped migration does not.) |
| Evaluator loads a fresh `catalog.db` without migrating. | Run fails on missing columns. | `consolidate` checks `SchemaVersion` first and exits 2 with "run migrate", never writes to an unmigrated DB. |

## 10. Future evolution

| Step | Trigger | Shape |
|---|---|---|
| `Seller` entity | A seller needs attributes (contact, status, feed URL) or sellers rename themselves. | `Seller(Id, Name)`; `SellerProduct.SellerName` → `SellerId` via expand-contract. |
| GTIN/EAN as a strong identifier | Sellers start sending barcodes. | A GTIN match precedes name matching and is strong enough to auto-link across translations. |
| Synonym / translation dictionary | Review decisions repeat ("Roteador" = "Router" resolved N times). | A normalization step consulting a versioned dictionary; each resolved review row is a candidate dictionary entry. |
| Embedding-based candidate generation | Fuzzy string ratio misses paraphrases. | A second candidate generator feeding the same `ProductMatchReview` queue — never auto-linking. |
| Review UI | Queue volume exceeds what a CLI serves. | Reads/writes `ProductMatchReview` only; resolution creates `SellerProduct` rows through the same use case. Delivered by later work for a different reason than this trigger (section 3, "Scope changes after this PRD"). |
| Concurrency | Multiple operators or scheduled feeds. | Per-seller advisory lock or a queue; the `UNIQUE` constraints already make concurrent duplicates fail loudly rather than silently. |

## 11. Resolved review questions

Raised while drafting; resolved by the orchestrator on 2026-10-05 and recorded in the change
record and the ADRs named.

| # | Question | Resolution | Recorded in |
|---|---|---|---|
| 1 | `MatchType` for review-resolved links. | `'REVIEWED'` added to the `MatchType` CHECK in migration 0001 (nothing shipped, so no extra migration). | ADR-0003, ADR-0004, tasks R2 |
| 2 | Re-send after a review was `REJECTED`. | Stays `HELD_FOR_REVIEW` with warning `review_previously_rejected`; a re-send never overturns a human decision. | ADR-0004 |
| 3 | Exit code with rejected records. | Kept at 0; the report carries per-record truth. A `--strict` flag is the revisit path. Exit 2 also covers a missing or unmigrated database. | ADR-0005 |
| 4 | ADR count. | Five ADRs are intended; 0005 owns run semantics. | change record |
| 5 | Review-queue uniqueness key. | First queued `Reason` sticks; accepted at this volume and stated. | ADR-0004 |
| 6 | Products written by other tools have NULL match keys. | `consolidate` heals missing keys at the start of each run, in the same transaction. | ADR-0003, tasks R1 |
