---
status: done
completed: 2026-10-05
domain: backend
spec: docs/specs/catalog-consolidation/tasks.md
---

# Change record — Catalog Consolidation: implementation

Date: 2026-10-05
Risk: low (local CLI over a copy of a local SQLite file; `data/` stays pristine; no external effect)
Autonomy: A2
Gate: Implementation -> Validation

## What / Why

Implement the catalog consolidation CLI exactly as planned in
`docs/specs/catalog-consolidation/tasks.md` (PRD `docs/prds/0001-catalog-consolidation.md`,
ADRs 0001-0005). Design record:
`.engineos/archived/2026/10/docs/2026-10-05-catalog-consolidation-design.md`.

## Frozen contracts

The "Frozen contracts" section of `docs/specs/catalog-consolidation/tasks.md` (including the
integration amendments of 2026-10-05: `MatchType` adds `REVIEWED`; heal-match-keys step;
exit 2 for missing/unmigrated DB; `review_previously_rejected`). T0 writes them into code.

## Scope

Tasks T0-T11 (T10 stretch included). T12-T16 `[opt-in: tests]` NOT taken — tests not requested.

## Waves

```
[fanout] waves=5 wave0=borisenko:T0 wave1=borisenko:T1,ronaldo:T2,borisenko:T3,borisenko:T4,borisenko:T5,borisenko:T6 wave2=ronaldo:T7,borisenko:T8 wave3=borisenko:T9 wave4=borisenko:T10,borisenko:T11 model=opus
```

## Checklist
- [x] Wave 0 — T0 scaffold + contracts in code (borisenko, OK; data/catalog.db sha e7c535cb unchanged)
- [x] Wave 1 — T1-T6 all OK (T1,T3,T4,T5,T6 borisenko; T2 ronaldo); scoped ruff+pyright green per unit
- [x] Wave 2 — T7 (ronaldo) + T8 (borisenko) OK; barrier: added MigrationErrorCode "rows_lost" (orphan guard), package-wide ruff+pyright clean
- [x] Wave 3 — T9 (borisenko) OK; first end-to-end run matches baseline exactly (258 rows, re-run 0)
- [x] Wave 4 — T10 (borisenko) OK; T11 README (tomasz, DEGRADED: no shell) reconciled by orchestrator against real output
- [x] Final gate green: `ruff check .` All checks passed; `ruff format --check .` 21 files already formatted; `pyright` 0 errors; end-to-end demo on out/gate/ matches baseline exactly; `[tests] skipped — not requested`

## What was made
- A Python 3.12 stdlib CLI `python -m catalog_consolidation` with `migrate`, `consolidate`
  and `review list|resolve`, ports-and-adapters layout (21 Python files, ~2.6k lines).
- 3 forward-only migrations (SellerProduct rebuilt with TEXT seller SKU, two unique keys,
  Source* traceability columns, MatchType incl. REVIEWED; Product NormalizedName/NormalizedBrand;
  ProductMatchReview queue) and a checksum-guarded runner with `.bak` backup and an orphan-row
  guard (`rows_lost`).
- Final-gate evidence (2026-10-05, out/gate/ fresh copy): first run LINKED_EXACT 200,
  LINKED_NORMALIZED 54, CREATED 1, UNCHANGED 1, SKIPPED_DUPLICATE_LISTING 11, HELD_FOR_REVIEW 2,
  REJECTED_INVALID 0, CONFLICT_SELLER_SKU 0 (269), rows_written=258; tables 255/976/2; report
  269 lines, 3 non_uuid warnings; re-run rows_written=0; invalid file exit 2; hostile brand stored
  verbatim; data/catalog.db sha1 e7c535cb… unchanged.
- Integration fixes made by the orchestrator at barriers: `rows_lost` MigrationErrorCode
  (errors.py, sqlite_migrations.py, tasks.md); `_recheck_existing_link` returns UNCHANGED for a
  REVIEWED link (bug found by tomasz: re-run after `review resolve --link` reported a false
  CONFLICT_SELLER_SKU) — propagated to tasks.md and ADR-0004; README reconciled with real output;
  `*.egg-info/` added to .gitignore.
- Known not done: no tests (opt-in, not requested); repo is not under git yet.

## Decision-rule check
- `rule-destructive-ddl` (keyword match on "DROP TABLE" in migration 0001) — classified, risk stays low:
  0001 rebuilds `SellerProduct` (SQLite cannot ALTER a column type; table is empty, 0 rows).
  two-phase-deploy: waived — single-file local DB, no concurrent consumers, empty table.
  explicit-confirmation: migrations are only ever applied to copies under `out/` in this change;
  migrating `data/catalog.db` itself is left to the user.
  down-path-or-documented-irreversibility: forward-only by design (ADR 0005); the T7 runner takes a
  `.bak` backup before applying (recovery path) and asserts the SellerProduct row count is preserved
  across 0001 (guards the inner-JOIN drop risk ronaldo reported).

## Human decisions
- 2026-10-05 — user invoked `/implement` after the PRD/ADR/tasks delivery. No hitl reason fired (risk low).

## Changes registered
Not a git repository, so no `git status` / `git diff --stat` output. Files created:
`pyproject.toml`, `uv.lock`, `.gitignore`, `README.md`, `migrations/0001_seller_product_text_id.sql`,
`migrations/0002_product_match_keys.sql`, `migrations/0003_review_queue.sql`,
`src/catalog_consolidation/{__init__,__main__,cli,cli_review}.py`,
`src/catalog_consolidation/domain/{__init__,errors,limits,matching,models,normalization,ports}.py`,
`src/catalog_consolidation/use_cases/{__init__,consolidate_file,resolve_review}.py`,
`src/catalog_consolidation/adapters/{__init__,json_entry_reader,report_writer,sqlite_catalog_repository,sqlite_connection,sqlite_migrations,sqlite_review_repository}.py`.
Files modified: `docs/specs/catalog-consolidation/tasks.md` (rows_lost, REVIEWED re-check rule),
`docs/adr/0004-review-queue-for-uncertain-matches.md` (REVIEWED re-send rule).
Generated, ignored: `.venv/`, `src/catalog_consolidation.egg-info/`, `out/` (demo outputs).
No moves or renames.
