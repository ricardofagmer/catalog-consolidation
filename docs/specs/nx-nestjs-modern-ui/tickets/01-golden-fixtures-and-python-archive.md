# 01: Record golden fixtures and archive Python

**What to build:** The Python CLI's behavior on the provided data is frozen as golden fixtures before anything is refactored, and the Python source is archived, so the parity oracle survives its own deletion. The fixtures cover every scenario the PRD names: first run, re-run, dry run, error paths, the review flow (link, create, reject, already-resolved), table contents after each phase, the JSONL reports, and `migrate` output without its timestamped backup path. A fixture check script runs the current TypeScript CLI against them and passes.

**Blocked by:** None (can start immediately)

**Closes checks:** C35

**Status:** done

- [ ] Fixtures exist for every scenario above, recorded from the Python CLI while it still agrees with the current TypeScript CLI (timestamps and backup paths normalized, not removed from the contract)
- [ ] A compressed archive of the Python source, `pyproject.toml` and `uv.lock` is stored under the archived area, and its listing shows the source
- [ ] The fixture check exits 0 on the current TypeScript CLI and prints one OK line per scenario
- [ ] The report records the listing, the archive listing and the passing output, so later tickets can show they started after it
- [ ] `data/catalog.db` and `data/ProductEntry.json` are unchanged (checksums recorded in the change record)
- [ ] The existing Python-versus-TypeScript parity script still passes, untouched

## Comments
