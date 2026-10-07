# 13: Remove Python, README, final verification

**What to build:** The Python reference is deleted last: source, project file, lock file, virtual environment and caches. The README is rewritten for the TypeScript system (workspace layout, the three apps, how to run the API, web and CLI, the golden check) and its quick start is followed verbatim to prove it. The whole workspace builds, lints and typechecks with a cache, and the provided data is unchanged.

**Blocked by:** 04, 12

**Closes checks:** C1, C36, C37

**Status:** done

- [x] No `*.py`, `pyproject.toml`, `uv.lock`, `.venv` or `.ruff_cache` remains; the archive from ticket 01 is still present
- [x] The README's quick-start commands, run from a fresh copy, produce the output the README shows
- [x] `nx show projects` lists the nine projects; `nx run-many -t build,lint,typecheck` exits 0 and a rerun reports cache hits
- [x] The golden check passes with Python gone
- [x] `data/catalog.db` and `data/ProductEntry.json` match the recorded SHA-256 values
- [x] Docs that mention the Python implementation or the old packages (ADR 0006 notes, CONTEXT.md, launch config, scripts) are consistent

## Comments
