# 02. Final proof

**Status:** done
Blocked by: 01
Closes checks: AC1, AC2, AC3, AC4, AC5

## What to run (only after explicit final consent)

- Build the CLI and run `scripts/golden-check.sh` (AC1, AC2, AC3, AC5).
- Apply the migration to `data/catalog.db` with the CLI `migrate` command (it writes a backup first)
  and re-run the profiling queries from the spec (AC4).

## Comments

2026-10-13: final consent given (Run proposed checks) at d42a64e. `nx run cli:build` OK;
`scripts/golden-check.sh` OK (22/22); `migrate --db data/catalog.db` applied 0006 (backup
`data/catalog.db.pre-migrate-20261013T184631Z.bak`), re-run up to date; profiling: 976 products,
638 spellings / 638 keys, 0 brands with two spellings, 255 links, 0 duplicate groups.
