# 02. Final proof

**Status:** blocked
Waiting on: ticket 01 integrated and the user's final check consent.
Blocked by: 01
Closes checks: AC1, AC2, AC3, AC4, AC5

## What to run (only after explicit final consent)

- Build the CLI and run `scripts/golden-check.sh` (AC1, AC2, AC3, AC5).
- Apply the migration to `data/catalog.db` with the CLI `migrate` command (it writes a backup first)
  and re-run the profiling queries from the spec (AC4).
