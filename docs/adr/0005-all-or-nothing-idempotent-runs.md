# 0005. Run one transaction per file, validate per record, and make re-runs no-ops

Date: 2026-10-05
Status: proposed

## Context

A run reads one JSON array (269 entries, 20 sellers) and writes `Product`, `SellerProduct` and
`ProductMatchReview` in one SQLite file. The real file contains: 11 cases of a seller sending the
same product twice under different Ids (OfficeSupply `Basketball Spalding Official` and the
same name with a doubled internal space); 1 case of the same seller re-sending the same Id for the same
product (`e5e5e5e5-…`, `Câmera`/`Camera Canon EOS R6`); 3 malformed Ids; 1 hostile value
(`TestBrand'; SELECT 1; --`); and products two sellers both offer (53), which a fresh catalog
would see as "created by the first, linked by the second" inside one run. Files will be
re-sent. Design record sections E through H freeze the semantics.
Related: [PRD](../prds/0001-catalog-consolidation.md),
[0003 schema](0003-seller-link-schema-and-golden-record.md),
[0004 review queue](0004-review-queue-for-uncertain-matches.md).

## Options considered

1. **Commit per record.**
   - Pros: a crash mid-file keeps the work done so far; simple progress reporting.
   - Cons: a partially applied file is the worst state to reason about (which half landed?);
     a DB error at entry 200 leaves 199 links the operator must reconcile with the report;
     re-running to finish relies on idempotency being perfect.
2. **One transaction per file; per-record validation failures are reported, not fatal**
   (chosen).
   - Pros: the catalog is either exactly before-run or exactly after-run; one bad record does
     not punish the other 268; the report is the complete account of the run.
   - Cons: one write lock for the whole run (no concurrent runs); a 100k-entry file holds the
     transaction for its full duration; a DB error after 268 good entries discards them all.
3. **Fail the whole file on the first invalid record.**
   - Pros: forces sellers to send clean files; simplest contract.
   - Cons: one malformed Id (3 in the real file) blocks 266 valid offers; sellers' feeds are
     not under the marketplace's control.

## Decision

Option 2. Concretely: the file is validated first (JSON array, <= 10 MB, <= 100 000 entries;
otherwise exit code 2 and nothing is written; a missing database or one not yet migrated also
exits 2, since all three are operator-fixable input problems). Each record is validated independently
(`Id` string or safe-integer JSON (converted to decimal text), `SellerName`, `Name` required non-blank strings with max lengths 64/100/200; `Brand`,
`Category` string or null, max 100; `Id` allowlist `[A-Za-z0-9._-]`, not required to be a UUID
because it is the seller's opaque SKU; unknown keys ignored with a warning).
Amended 2026-10-07: numeric Ids accepted (see PRD 0001 A16).
A failing record is
`REJECTED_INVALID` and the run continues. All SQL is parameterized, so `TestBrand'; SELECT 1; --`
is stored verbatim. Entries are processed in file order inside one transaction, so a product
`CREATED` by entry 10 is visible to entry 200 (1 `CREATED` + 1 `LINKED`, not 2 `CREATED`). Any DB
error rolls back the whole run (exit code 1). Idempotency uses the two unique keys from 0003:
same `(SellerName, SellerProductId)` already linked to the same product is `UNCHANGED`; to a
different product is `CONFLICT_SELLER_SKU` (reported, not applied: a SKU silently changing
product is exactly the ambiguity a human should see); the same seller matching a product it
already links under another SKU is `SKIPPED_DUPLICATE_LISTING` (first SKU wins, 11 cases today).
`--dry-run` executes everything and rolls back. Output is a JSONL report (entry index, seller,
SKU, outcome, product id, score, warnings) plus summary counts; the outcome vocabulary is closed:
`LINKED_EXACT | LINKED_NORMALIZED | CREATED | UNCHANGED | SKIPPED_DUPLICATE_LISTING |
HELD_FOR_REVIEW | REJECTED_INVALID | CONFLICT_SELLER_SKU`. Exit code 0 means the run was applied,
even with rejected records; the report carries the per-record truth.

## Consequences

- Easier: re-running the same file is safe and visibly a no-op (every entry `UNCHANGED`,
  `SKIPPED_DUPLICATE_LISTING` or `HELD_FOR_REVIEW`); `--dry-run` gives sellers a preview with the
  real rules; a failed run needs no cleanup.
- Harder: no concurrent runs against one database (SQLite write lock plus a single
  transaction); a seller cannot move a SKU to another product without a human; exit code 0 with
  rejections means a pipeline must parse the report, not the exit code, to detect bad data.
- We commit to maintaining: the closed outcome set as a tested contract, the report schema, and
  the exit-code table (0 applied, 1 unexpected error, 2 invalid file, missing database or
unmigrated schema).
- Revisit when: files approach the 100 000-entry cap and lock duration becomes a problem (chunked
  transactions with a run id and resume marker); two feeds must be ingested at once (a queue in
  front of a single writer); or operators ask for a non-zero exit on any rejection (a
  `--strict` flag, not a change of default).
