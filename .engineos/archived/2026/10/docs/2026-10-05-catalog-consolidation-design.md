---
status: done
domain: docs
spec: docs/specs/catalog-consolidation/tasks.md
completed: 2026-10-05
---

# Change record — Catalog Consolidation: PRD + ADRs + tasks

Date: 2026-10-05
Status: done
Risk: low (documentation only; local SQLite file, no production surface)
Autonomy: A2
Gate: Design

## Scope of this change

Documentation only — no implementation code:
- `docs/prds/0001-catalog-consolidation.md`
- `docs/adr/0001` .. `0005`
- `docs/specs/catalog-consolidation/tasks.md`

## Evidence (data profiled 2026-10-05)

Source: `data/catalog.db` and `data/ProductEntry.json`, downloaded 2026-10-05 from
`https://engineering-hiring-process.s3.us-east-1.amazonaws.com/` (links in the
challenge PDF). Facts below were produced by `sqlite3` and Python profiling scripts.

### Catalog (`data/catalog.db`)
```sql
CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT);
CREATE TABLE SellerProduct (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL,
  ProductId INTEGER CONSTRAINT FK_Product_Id REFERENCES Product (Id) NOT NULL,
  SellerProductId INTEGER NOT NULL);
```
- 975 products; `SellerProduct` is EMPTY (the catalog is the marketplace's own 1P catalog).
- Brand NULL on 119 rows; Category NULL on 34 rows. No empty strings.
- No two products share a normalized name (rule F below) — the catalog is currently clean.
- No unique constraints, no indexes besides PKs. FK is declared but SQLite enforces it only with `PRAGMA foreign_keys=ON`.

### Seller file (`data/ProductEntry.json`)
- JSON array, 269 objects, shape `{Id: str, SellerName: str, Name: str, Brand: str|null, Category: str}`.
- 20 sellers, 13–15 entries each.
- `Id` is a UUID-like STRING — **incompatible with `SellerProductId INTEGER`**.
- 3 malformed Ids: `09835342345-4678-9abc-def012345678`, `uddd0000-eeee-4111-ffff-aaaa22223333`, `ddddeee-ffff-4000-1111-222233334444`.
- 14 Ids are reused by DIFFERENT sellers for different products (e.g. `00112233-…` = GardenStore "Curtain Rod Adjustable" and SportsHub "Bookshelf 5-Shelf") → seller Id is unique only per seller.
- Same seller + same Id twice: GardenStore `e5e5e5e5-…` = "Câmera Canon EOS R6" and "Camera Canon EOS R6" (same product after normalization).
- 11 cases of the same seller sending the same product twice under DIFFERENT Ids with only whitespace differences (e.g. OfficeSupply "Basketball Spalding Official" / "Basketball Spalding  Official"); one more is GardenStore "Camera Canon EOS R6" with Category "Photo" vs catalog "Photography".
- Variation catalog: doubled internal whitespace (~60 entries), diacritics ("Câmera"), inch-mark variants (`55"` / `55` / `12.9''`), apostrophe in brand ("Levi's" vs catalog "Levis"), brand case ("Black+Decker" / "BLACK+DECKER"), category synonym ("Photo" vs "Photography"), Portuguese translations ("Roteador WiFi 6 TP-Link" ↔ catalog "Router WiFi 6 TP-Link"; "Processador AMD Ryzen 9 7950X" ↔ "Processor AMD Ryzen 9 7950X").
- 3 entries with Brand null — all match catalog products whose Brand is also NULL.
- 1 hostile-looking entry: Name "Security Test Product", Brand `TestBrand'; SELECT 1; --`, malformed Id.
- Under the frozen rules (re-simulated at the integration barrier): 199 products end with at least one seller — 145 by 1, 52 by 2, 2 by 3. (An earlier whitespace-only profile said 53/145; superseded.)

### Simulated outcome of the frozen rules on the real data (269 entries)
| Outcome | Count |
|---|---|
| LINKED_EXACT (raw name equal) | 200 |
| LINKED_NORMALIZED (equal after normalization) | 54 |
| SKIPPED_DUPLICATE_LISTING (seller already linked to that product under another Id) | 11 |
| HELD_FOR_REVIEW (fuzzy candidate, ratio ≥ 0.80) | 2 (Roteador 0.91, Processador 0.96) |
| UNCHANGED (same seller + same Id → same product, re-send) | 1 |
| CREATED (new product) | 1 ("Security Test Product", best ratio 0.48) |

## Frozen decisions (contracts — agents consume, never renegotiate)

### A. Stack
Python 3.12, standard library only at runtime (`sqlite3`, `json`, `unicodedata`, `re`,
`difflib`, `argparse`, `dataclasses`). Dev deps pinned exact: `pytest`, `ruff`, `pyright`.
CLI entry point (no HTTP API — the challenge asks for a system that "receives a file").
Rejected: NestJS/TypeORM (heavy for a single-file batch job, adds a runtime dep for SQLite);
HTTP API (adds surface the brief doesn't ask for).
Layout (ports and adapters, per `rules/backend-python.md` adapted to a CLI):
```
src/catalog_consolidation/
  domain/      models.py (frozen dataclasses), normalization.py, matching.py, errors.py, limits.py, ports.py (Protocols)
  use_cases/   consolidate_file.py
  adapters/    sqlite_catalog_repository.py, json_entry_reader.py, report_writer.py
  cli.py       composition root + argparse
migrations/    0001_seller_product_text_id.sql, 0002_product_match_keys.sql, 0003_review_queue.sql
tests/
```

### B. Product identity = (normalized name, compatible brand). Category is NOT identity.
`normalize(text)`:
1. Unicode NFKD, drop combining marks (Câmera → Camera).
2. `casefold()`.
3. DELETE quote/apostrophe chars `" ' ’ “ ”` (Levi's → levis; 12.9'' → 12.9; 55" → 55).
4. Replace every remaining non-`[0-9a-z]` run with one space (`BLACK+DECKER` → `black decker`; `12.9` → `12 9`).
5. Collapse whitespace, trim. Empty result → NULL.

Brands are "compatible" when normalized-equal OR either side is NULL (unknown ≠ different).

Match algorithm per entry (deterministic, in this order):
1. Candidates = catalog products with `NormalizedName == normalize(entry.Name)` AND compatible brand.
   - exactly 1 → LINK (EXACT if raw Name equal, else NORMALIZED).
   - >1 → HOLD for review (ambiguous).
2. 0 candidates → fuzzy pass: `difflib.SequenceMatcher` ratio of normalized names over
   brand-compatible products. Best ratio ≥ `FUZZY_REVIEW_THRESHOLD = 0.80` → HOLD for review
   (never auto-link). Else → CREATE product.
Rationale to carry into the ADR: a false merge (two different products fused; seller
attached to the wrong item; customer receives the wrong thing) is costlier and harder to
undo than a duplicate, so fuzzy NEVER auto-merges. Category excluded because sellers use
their own taxonomy ("Photo" vs "Photography").

### C. Golden record — the catalog row is never overwritten by a seller
Existing Product Name/Brand/Category stay as they are. A created product takes the seller's
cleaned display values (trim + collapse internal whitespace — NOT the normalized key).
Each seller's raw attributes are kept on the link row for traceability.

### D. Schema changes (SQLite; table rebuild where a type changes; SellerProduct is empty)
- `SellerProduct`:
  - `SellerProductId` INTEGER → TEXT NOT NULL (seller's opaque SKU; rebuild table).
  - add `SourceName TEXT NOT NULL`, `SourceBrand TEXT NULL`, `SourceCategory TEXT NULL`,
    `MatchType TEXT NOT NULL CHECK (MatchType IN ('EXACT','NORMALIZED','CREATED'))`,
    `CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.
  - `UNIQUE (SellerName, SellerProductId)` — idempotency key (seller SKU unique per seller).
  - `UNIQUE (SellerName, ProductId)` — a seller offers a catalog product once.
  - index on `ProductId` ("which sellers offer product X").
- `Product`: add `NormalizedName TEXT`, `NormalizedBrand TEXT`; backfill all 975 rows with
  the Python normalizer (not SQL — one implementation of the rule); index on
  `NormalizedName`. NOT unique on name alone (two brands may legitimately share a generic name).
- New table `ProductMatchReview` (review queue): `Id`, `SellerName`, `SellerProductId`,
  `SourceName`, `SourceBrand`, `SourceCategory`, `CandidateProductId NULL` (FK Product),
  `Score REAL NULL`, `Reason TEXT CHECK IN ('FUZZY','AMBIGUOUS')`,
  `Status TEXT CHECK IN ('PENDING','LINKED','CREATED','REJECTED') DEFAULT 'PENDING'`,
  `CreatedAt`, `UNIQUE (SellerName, SellerProductId)`.
- `PRAGMA foreign_keys = ON` on every connection.
- Migrations are forward-only SQL files, applied by a tiny runner tracking `SchemaVersion`.
  Rejected: renaming tables to snake_case (breaks the given schema's consumers for no gain).
- Seller stays a `SellerName` string; a `Seller` table is a recorded future step, not now.

### E. Per-entry outcome vocabulary (closed set — the report and tests use exactly these)
`LINKED_EXACT | LINKED_NORMALIZED | CREATED | UNCHANGED | SKIPPED_DUPLICATE_LISTING |
HELD_FOR_REVIEW | REJECTED_INVALID | CONFLICT_SELLER_SKU`
- UNCHANGED: same (SellerName, SellerProductId) already linked to the same product (re-run / re-send).
- CONFLICT_SELLER_SKU: same (SellerName, SellerProductId) already linked to a DIFFERENT product → not applied, reported.
- SKIPPED_DUPLICATE_LISTING: seller already linked to the matched product under another SKU → first SKU wins, reported.

### F. Validation (fail per record, never the whole file)
- File: must be a JSON array; max 10 MB; max 100_000 entries; otherwise the run fails before writing.
- Record: `Id`, `SellerName`, `Name` required non-blank strings; `Brand`, `Category` string or null.
  Max lengths: Id 64, SellerName 100, Name 200, Brand 100, Category 100.
  `Id` charset allowlist `[A-Za-z0-9._-]`; NOT required to be a UUID (it is the seller's
  opaque SKU) — non-UUID Ids are accepted and flagged as a warning in the report.
- Unknown extra keys → ignored with a warning (sellers' feeds evolve).
- All SQL parameterized; the `TestBrand'; SELECT 1; --` value is stored verbatim.

### G. Transactions, idempotency, ordering
- One SQLite transaction per run; any DB error rolls back the whole run (all-or-nothing file).
- Entries are processed in file order; a product CREATED earlier in the same run is visible to
  later entries (two sellers sending the same new product → 1 CREATED + 1 LINKED).
- Re-running the same file is a no-op: every entry reports UNCHANGED / SKIPPED / HELD (already queued).
- `--dry-run` runs everything and rolls back.

### H. Interface & output
`python -m catalog_consolidation consolidate --db data/catalog.db --input data/ProductEntry.json [--report out/report.jsonl] [--dry-run]`
`python -m catalog_consolidation migrate --db data/catalog.db`
Output: JSONL per-entry report (entry index, SellerName, SellerProductId, outcome, ProductId,
score, warnings) + summary counts on stdout. Exit code 0 on success (even with rejected
records), 2 on invalid file, 1 on unexpected error.

### I. Explicit non-goals
Review-queue resolution UI (a `review list` / `review resolve` CLI is a stretch task);
price/stock/offers; Seller entity table; translation dictionaries; ML/embedding matching;
concurrency between simultaneous runs; HTTP API.

## Integration decisions (wave-1 barrier, 2026-10-05) — amend sections D, G, H
- D: `MatchType` CHECK is `('EXACT','NORMALIZED','CREATED','REVIEWED')`; `REVIEWED` = human-confirmed via `review resolve --link`.
- G: every `consolidate` run first heals products with `NormalizedName IS NULL` (rows from other writers), same transaction, Python normalizer; only non-NULL keys are written so a re-run still writes 0 rows.
- G: re-send of an entry whose review row is `REJECTED` -> `HELD_FOR_REVIEW` + warning `review_previously_rejected`.
- H: exit 2 also for a missing database path and an unmigrated schema.
- Accepted planner interpretations: SHA-256 checksum on applied migrations, pre-migrate `.bak` backup, keyset-batched fuzzy scan, `unnormalizable:Name` -> `REJECTED_INVALID`, per-run `rows_written`.
- Accepted as documented risk: migrations live in top-level `migrations/` (editable install via `uv sync`).

## Human decisions
- 2026-10-05 — user approved downloading `catalog.db` (60 KB) and `ProductEntry.json` (48 KB) into `data/`.
- Stack (Python CLI) chosen by the orchestrator as default — user may override.
- No hitl reason fired: risk classified low (documentation only, local files, no external effect).

## Checklist
- [x] PRD written
- [x] ADRs 0001–0005 written
- [x] Tasks written
- [x] Cross-document consistency check

## What was made
- Downloaded and profiled the challenge inputs (`data/catalog.db`, `data/ProductEntry.json`); simulated the matching rules on all 269 entries.
- Froze contracts A-I in this record, then dispatched one wave of three agents in parallel:
  product-spec (fable) wrote `docs/prds/0001-catalog-consolidation.md`; an ADR writer (fable) wrote
  `docs/adr/0001`-`0005`; a planner (opus) wrote `docs/specs/catalog-consolidation/tasks.md`
  (17 tasks, 6 waves, contracts as code, tests isolated as `[opt-in: tests]`).
- At the barrier: resolved 6 open questions (see Integration decisions) and propagated them into
  the PRD (section 11 now "Resolved review questions"), ADR-0003/0004/0005 and tasks.md (R1/R2/R4).
- Consistency check: 0 broken relative links; fixed two figures that were wrong
  (PRD `SellerProduct` 0 -> 256 corrected to 255; "53 products offered by 2 sellers" corrected
  to 52 by 2 + 2 by 3 under the final rules, in the PRD, ADR-0003 and this record).
- No implementation code was written; `[tests] skipped — not requested` (documentation-only unit).

## Changes registered
Not a git repository (`git rev-parse` -> "fatal: not a git repository"), so no diff/stat output.
Files created (all new):
```
data/ProductEntry.json
data/catalog.db
docs/adr/0001-python-stdlib-cli.md
docs/adr/0002-product-identity-normalized-name-and-brand.md
docs/adr/0003-seller-link-schema-and-golden-record.md
docs/adr/0004-review-queue-for-uncertain-matches.md
docs/adr/0005-all-or-nothing-idempotent-runs.md
docs/prds/0001-catalog-consolidation.md
docs/specs/catalog-consolidation/tasks.md
.engineos/changes/2026-10-05-catalog-consolidation-design.md (this record, archived)
```
No moves or renames.
