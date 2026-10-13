---
name: 2026-10-13-canonical-brand-spelling
status: done
completed: 2026-10-13
owner: Ricardo Fagmer
spec: docs/specs/2026-10-13-canonical-brand-spelling.md
domain: dba
---

## What
Forward migration 0006 that sets one display spelling per brand for the two brands written two
ways in the catalog (`simplehuman`, `BLACK+DECKER`), plus the golden fixtures it changes.

## Why
User asked to normalize the Product table by name + category + brand. Profiling found 0 duplicate
products; the only inconsistency is 2 brands with 2 spellings each (7 rows, 3 to change).

## Scope
migrations/0006_canonical_brand_spelling.sql, fixtures/golden/**, docs that list migrations.

## Checklist
- [x] 01 migration + golden fixtures (dba-coordinator; integrated 5455313, review fixes d42a64e)
- [x] Code review (standards + spec axes): 0 hard violations; judgement calls fixed in d42a64e
- [x] 02 final proof: build, golden-check 22/22, migration applied to data/catalog.db

## What was made
- Profiled `Product` by normalized Name + Category + Brand: 0 duplicate groups (also 0 by Name + Brand
  and Name alone); the only inconsistency was 2 brands with 2 spellings each.
- Added `migrations/0006_canonical_brand_spelling.sql`: data-only, sets display `Brand` to
  `simplehuman` / `BLACK+DECKER` where `NormalizedBrand` is `simplehuman` / `black decker`; header
  documents the `.bak` recovery and the hand restore for the provided data (Ids 458, 460, 607).
- Rebaselined golden fixtures deliberately: 6 `table-product.json` (3 Brand values each), migrate
  stdout/stderr for version 6, `schema-version.json` with checksum `0a548bdd...51edc`.
- README: migrate sample output and up-to-date text at version 6, 0006 row in the schema table.
- Applied migration 6 to `data/catalog.db` (3 rows changed; backup kept locally, gitignored).
- Throwaway LOGIC preview kept local only (not committed).

## Verification
Pre-implementation: profiling on data/catalog.db and the planned UPDATEs run on a scratch copy
(3 rows changed, NormalizedBrand unchanged, 640 -> 638 spellings, 976 products, 255 links).
Final validation (user consent "Run proposed checks", 2026-10-13, at d42a64e):
- `pnpm exec nx run cli:build`: OK (5/6 tasks from cache).
- `scripts/golden-check.sh`: `golden: OK (22/22 scenarios)`.
- `node apps/cli/dist/main.js migrate --db data/catalog.db`: `applied 0006 canonical_brand_spelling`,
  `schema version: 6`; second run `schema version: 6 (up to date)`.
- Profiling after: 976 products, 638 brand spellings / 638 normalized brands, 0 brands with two
  spellings, 255 seller links, 0 duplicate groups by Name + Category + Brand.
No security review: no auth, input or secret surface touched.

## Human decisions
<!-- risk low: hitl.required did not fire; entries below are user scope decisions (reason n/a), not hitl gates -->
- 2026-10-13 | Ricardo Fagmer | n/a (scope) | approved | option 1: canonicalize brand spellings via migration (not category in identity)
- 2026-10-13 | Ricardo Fagmer | n/a (spelling) | approved | `simplehuman` + `BLACK+DECKER` (official stylizations)
- 2026-10-13 | Ricardo Fagmer | n/a (preview-approved) | approved | LOGIC prototype rev 3ae828afc37e, local pointer docs/specs/canonical-brand-spelling/PROTOTYPE-preview.html (not committed; git capture not authorized); scope: migration only, lasting consolidation fix declined
- 2026-10-13 | Ricardo Fagmer | n/a (golden rebaseline) | approved | the approved scope included updating the golden fixtures the migration changes (ADR 2026-10-06-remove-python-golden-fixtures); verified by ticket 02

## Changes registered
`git log --oneline main..HEAD` (before the closing commit):
```
d42a64e fix(catalog): address review on brand migration
5455313 fix(catalog): canonical brand spelling migration
8c111bf docs: spec canonical brand spelling migration
```
`git diff --stat main...HEAD` (before the closing commit): 20 files changed, 198 insertions(+), 28 deletions(-)
- migrations/0006_canonical_brand_spelling.sql (new), README.md
- docs/specs/2026-10-13-canonical-brand-spelling.md, docs/specs/canonical-brand-spelling/tickets/01,02 (new)
- fixtures/golden/{consolidate-after-review,consolidate-dry-run,consolidate-first,review-resolve-create,review-resolve-link,review-resolve-reject}/table-product.json
- fixtures/golden/{migrate,consolidate-dry-run}/01-migrate.{stdout,stderr}, migrate-up-to-date/01-migrate-again.{stdout,stderr}
- fixtures/golden/{migrate,migrate-up-to-date}/schema-version.json
Closing commit `git status --short`: `M data/catalog.db`, `M tickets/01,02`, record moved
`.engineos/changes/` -> `.engineos/archived/2026/10/dba/` (rename).

## Notes
Variants can reappear when a seller entry creates a product (cleanDisplay keeps seller casing).
