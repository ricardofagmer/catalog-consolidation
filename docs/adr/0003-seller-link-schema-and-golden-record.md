# 0003. Store seller attributes on the link row and never overwrite the catalog product

Date: 2026-10-05
Status: proposed

## Context

The given schema is `Product (Id, Name, Brand, Category)` and `SellerProduct (Id, SellerName,
ProductId, SellerProductId INTEGER NOT NULL)`, with no unique constraints or indexes beyond the
primary keys and a foreign key SQLite enforces only under `PRAGMA foreign_keys = ON`.
`SellerProduct` is empty. Seller `Id` values are UUID-like strings (3 of them malformed, e.g.
`09835342345-4678-9abc-def012345678`), so they cannot be stored in an INTEGER column, and 14 of
them are reused by different sellers for different products (`00112233-…` is a curtain rod for
GardenStore and a bookshelf for SportsHub), so they are unique only per seller. After
consolidation, 54 catalog products are offered by 2 or more sellers (52 by 2, 2 by 3). Design record sections C and D freeze the schema.
Related: [PRD](../prds/0001-catalog-consolidation.md),
[0002 identity](0002-product-identity-normalized-name-and-brand.md),
[0005 run semantics](0005-all-or-nothing-idempotent-runs.md).

## Options considered

Where a seller's `Name`/`Brand`/`Category` go when the product already exists:

1. **Overwrite the catalog product with the seller's values.**
   - Pros: simplest write path.
   - Cons: `Câmera Canon EOS R6` would rename the catalog row on arrival; two sellers of the
     same product fight over the display name on every run; the catalog's own data is lost.
2. **Last-writer-wins with a timestamp.**
   - Pros: deterministic given run order.
   - Cons: still destroys the 1P catalog values; "latest" is not "best" for a spelling.
3. **Keep the catalog row as the golden record; store the seller's raw attributes on the link
   row** (`SourceName`, `SourceBrand`, `SourceCategory`, `MatchType`) (chosen).
   - Pros: catalog never changes on link; every link is auditable (what the seller sent, how it
     matched); one row per seller per product.
   - Cons: denormalized text repeated per link; `SellerProduct` becomes wider than its name
     suggests; no history if the same seller re-sends changed attributes (the row is unchanged,
     see [0005](0005-all-or-nothing-idempotent-runs.md)).
4. **Separate `SellerProductSnapshot` table, one row per received version.**
   - Pros: full history of what each seller sent over time.
   - Cons: a second table and a join for a question (what did the seller send) nobody asks yet;
     unbounded growth on re-sends.

## Decision

Option 3, with these schema changes. `SellerProduct` is rebuilt (SQLite cannot alter a column
type; the table is empty so no data moves): `SellerProductId TEXT NOT NULL`; add `SourceName TEXT
NOT NULL`, `SourceBrand TEXT`, `SourceCategory TEXT`, `MatchType TEXT NOT NULL CHECK (MatchType IN
('EXACT','NORMALIZED','CREATED','REVIEWED'))` (`REVIEWED` marks a link a human confirmed through
the review queue, see 0004), `CreatedAt`; `UNIQUE (SellerName, SellerProductId)` as the
idempotency key; `UNIQUE (SellerName, ProductId)` so a seller offers a catalog product once;
index on `ProductId`. `Product` gains `NormalizedName` and `NormalizedBrand`, backfilled for all
975 rows by the Python normalizer (one implementation of the rule, see 0002), indexed on
`NormalizedName`, deliberately not unique because two brands may share a generic name. A created
product takes the seller's cleaned display values (trim and collapse whitespace, not the
normalized key). Table names keep the given PascalCase; renaming to snake_case would break the
schema's existing consumers for no functional gain. `Seller` stays a `SellerName` string: with 20
sellers and no seller attributes in the input, a `Seller` table would be a key with no payload.
Migrations are forward-only SQL files applied by a runner tracking `SchemaVersion`, and every
connection sets `PRAGMA foreign_keys = ON`. Every `consolidate` run first fills in match keys for
products whose `NormalizedName` is NULL (rows written by other tools), so they are never invisible
to matching.

## Consequences

- Easier: "which sellers offer product X" is an indexed lookup; a bad link is diagnosable from
  the row itself; re-running a file cannot drift the catalog.
- Harder: a seller cannot correct its own listing by re-sending (the link is immutable until a
  resolution path exists); the normalized columns must be re-backfilled whenever the normalizer
  changes (a migration, not a hot fix); misspellings in the catalog stay in the catalog.
- We commit to maintaining: the normalizer version as part of the schema contract, the two
  unique constraints as the only idempotency mechanism, and the migration runner.
- Revisit when: a seller needs attributes of its own (contact, tier, feed URL) or a rename, which
  justifies a `Seller` table with a stable id; the same seller must legitimately list two SKUs
  against one product (drop `UNIQUE (SellerName, ProductId)` in favour of a variant model); or
  attribute history is requested, which is the `SellerProductSnapshot` option.
