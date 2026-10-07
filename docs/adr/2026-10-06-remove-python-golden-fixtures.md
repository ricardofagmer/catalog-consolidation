---
status: accepted
---

# Remove the Python reference; golden fixtures from its CLI replace the parity oracle

The Python implementation is deleted (source, `pyproject.toml`, `uv.lock`, virtual environment) and the README is rewritten for TypeScript. Before anything is refactored, the Python CLI's outputs on the provided data are recorded as golden fixtures: stdout summaries, JSONL reports, table dumps after each phase, the dry-run and error-path results, the review flow, and the `migrate` output without its timestamped backup path. `scripts/parity-check.sh` becomes a golden-file check run against the Nest CLI. A compressed archive of the Python source is kept in `.engineos/archived/`.

## Considered options

- **Keep Python indefinitely as a live oracle.** Zero risk to the comparison, but a second implementation and toolchain to maintain, and the user chose removal.
- **Delete with no archive.** Smaller, but the project is not a git repository, so the reference would be unrecoverable.
- **`git init` first so history keeps Python.** Reasonable, but every git write asks for approval and the user did not choose it; the archive is the lighter safeguard.

## Consequences

- The fixtures are the contract. They cannot be regenerated from Python after deletion, so any intended behavior change (for example neutralizing terminal escape codes in `review list`) updates them deliberately, with a recorded decision.
- The first ticket records the fixtures while Python and the current TypeScript CLI still exist and agree; rules move into Nest providers only afterwards, and Python is deleted last.
- The check no longer detects bugs shared by both old implementations, only drift from the recorded behavior.
- Revisit if the fixtures prove too coarse to catch a regression; add finer fixtures from the same recorded runs rather than reviving Python.
