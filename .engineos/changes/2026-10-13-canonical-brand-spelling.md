---
name: 2026-10-13-canonical-brand-spelling
status: active
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
- [ ] 01 migration + golden fixtures (dba-coordinator)
- [ ] 02 final proof: golden-check + apply to data/catalog.db (awaits final consent)

## What was made
<filled on completion>

## Verification
Pre-implementation: profiling on data/catalog.db and the planned UPDATEs run on a scratch copy
(3 rows changed, NormalizedBrand unchanged, 640 -> 638 spellings, 976 products, 255 links).
Final validation: pending.

## Human decisions
<!-- risk low: hitl.required did not fire; entries below are user scope decisions (reason n/a), not hitl gates -->
- 2026-10-13 | Ricardo Fagmer | n/a (scope) | approved | option 1: canonicalize brand spellings via migration (not category in identity)
- 2026-10-13 | Ricardo Fagmer | n/a (spelling) | approved | `simplehuman` + `BLACK+DECKER` (official stylizations)
- 2026-10-13 | Ricardo Fagmer | n/a (preview-approved) | approved | LOGIC prototype rev 3ae828afc37e, local pointer docs/specs/canonical-brand-spelling/PROTOTYPE-preview.html (not committed; git capture not authorized); scope: migration only, lasting consolidation fix declined
- 2026-10-13 | Ricardo Fagmer | n/a (golden rebaseline) | approved | the approved scope included updating the golden fixtures the migration changes (ADR 2026-10-06-remove-python-golden-fixtures); verified by ticket 02

## Changes registered
<filled on completion>

## Notes
Variants can reappear when a seller entry creates a product (cleanDisplay keeps seller casing).
