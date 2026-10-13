# Canonical brand spelling in the catalog

Status: accepted (2026-10-13) | Risk: low (3 display values in a local SQLite file, reversible) | Tickets: [canonical-brand-spelling/tickets](canonical-brand-spelling/tickets/)

## Problem

The user asked to normalize the `Product` table matching on name + category + brand. Profiling
`data/catalog.db` on 2026-10-13 with the frozen normalizer (`libs/rules/src/normalization.service.ts`):

- 976 products, 0 duplicate groups by normalized Name + Category + Brand (also 0 by Name + Brand and
  by Name alone). `NormalizedName`/`NormalizedBrand` are fully backfilled and consistent.
- Name (976) and Category (44) have no spelling variants.
- Brand has 640 raw spellings for 638 normalized keys. Two brands are written two ways:

| Id | Name | Brand today | NormalizedBrand |
|---|---|---|---|
| 451, 454 | Soap Dispenser Automatic, Trash Can Step Pedal | `simplehuman` | `simplehuman` |
| 458, 460 | Dish Drying Rack Large, Sponge Holder Sink Caddy | `Simplehuman` | `simplehuman` |
| 607 | Handheld Vacuum Cordless | `Black+Decker` | `black decker` |
| 661, 663 | Grass Trimmer String, Hedge Trimmer Electric | `BLACK+DECKER` | `black decker` |

`fixtures/source/catalog.db` holds the same 7 rows.

## Decisions (user, 2026-10-13)

- Scope is display-spelling canonicalization only; Product Identity (ADR 0002: normalized name +
  compatible brand, category excluded) is unchanged.
- Canonical spellings are the brands' own stylizations: `simplehuman` and `BLACK+DECKER`.
- Delivered as one forward-only SQL migration, `migrations/0006_canonical_brand_spelling.sql`.
- Consolidation behavior is not changed: a product created later from a seller entry still keeps the
  seller's spelling (`cleanDisplay`), so a variant can reappear. A lasting fix was offered and declined.
- Throwaway preview approved at revision `3ae828afc37e`
  (local only: `docs/specs/canonical-brand-spelling/PROTOTYPE-preview.html`, not committed).

Rejected alternatives:
- Add `NormalizedCategory` and put category in the identity key: no effect on today's catalog (0
  groups) and fewer links later (`Photo` vs `Photography`); contradicts ADR 0002.
- Canonicalize by most frequent spelling: `simplehuman` is a 2-2 tie, so a frequency rule is not
  deterministic; an explicit mapping is.
- Rewrite in application code (CLI command): a one-off data fix belongs to the versioned,
  checksummed migration path that already runs on every database.

## Contract

Migration `0006_canonical_brand_spelling.sql`, applied by the existing runner
(`libs/persistence/src/sqlite-migrations.ts`) after the version-2 match-key backfill:

- `UPDATE Product SET Brand = 'simplehuman' WHERE NormalizedBrand = 'simplehuman' AND Brand <> 'simplehuman'`
- `UPDATE Product SET Brand = 'BLACK+DECKER' WHERE NormalizedBrand = 'black decker' AND Brand <> 'BLACK+DECKER'`
- `NormalizedName`/`NormalizedBrand` are not touched (the spelling change leaves the keys equal).
- Down path, documented in the file header (migrations are forward-only):
  `UPDATE Product SET Brand = 'Simplehuman' WHERE Id IN (458, 460); UPDATE Product SET Brand = 'Black+Decker' WHERE Id = 607;`

## Acceptance criteria

- AC1: on a fresh copy of `fixtures/source/catalog.db`, `migrate` reports schema version 6 and the
  `Product` dump differs from the recorded one only in `Brand` of Ids 458, 460 (`simplehuman`) and
  607 (`BLACK+DECKER`).
- AC2: `NormalizedName`/`NormalizedBrand` dumps are byte-identical to the recorded ones.
- AC3: running `migrate` again changes nothing (up to date at 6).
- AC4: after the migration no normalized brand key has more than one raw spelling; distinct brand
  spellings go from 640 to 638; Product count 976 and SellerProduct count unchanged.
- AC5: golden fixtures that record schema version, `SchemaVersion` rows or the `Product` table are
  updated deliberately (ADR 2026-10-06-remove-python-golden-fixtures) and `scripts/golden-check.sh`
  passes against the Nest CLI.
