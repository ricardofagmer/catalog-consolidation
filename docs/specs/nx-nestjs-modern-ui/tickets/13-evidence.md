# Ticket 13 evidence: remove Python, README, final verification

Date: 2026-10-07. Executed by the orchestrator; README and doc fixes by docs-writer (tomasz).

## Preconditions checked before deleting (C35)
- Archive `.engineos/archived/2026/10/python-reference-2026-10-06.tar.gz`: 32 entries; extracted to a scratch directory, `diff -r` of `src/catalog_consolidation` (excluding `__pycache__`) and `cmp` of `pyproject.toml` and `uv.lock` against the live files: identical.
- `fixtures/golden`: 22 scenarios; `scripts/golden-check.sh` printed `golden: OK (22/22 scenarios)` before deletion.

## Deleted (no recursive rm; `find -delete` on named paths only)
`src/` (Python package, egg-info, `__pycache__`), `.venv`, `.ruff_cache`, `pyproject.toml`, `uv.lock`, `scripts/golden-record.sh`. `.nxignore` and `.gitignore` Python entries removed.

## Results
- C36 leftovers: `find` for `*.py`, `*.pyc`, `pyproject.toml`, `uv.lock`, `.venv`, `.ruff_cache`, `__pycache__`, `*.egg-info` outside `node_modules`, `out`, `.nx`, `.engineos` returns nothing. The archive is still present.
- C36 quick start: README commands run verbatim from a fresh copy (`out/readme-verify`: rsync without node_modules, dist, .next, .nx, generated client; `pnpm install --frozen-lockfile`; `pnpm build`; copy of `data/catalog.db`; `migrate`, `consolidate`, `review list`). Output matched the README blocks: migrate applied 0001-0003 (backfilled 975), consolidate `rows_written=258` with 200/54/1/1/11/2/0/0 and TOTAL 269, review list rows 1 (candidate 21, 0.9091) and 2 (candidate 28, 0.9643). The "Run the API and the web app" commands also worked: `/v1/summary` returned 976 products, 255 Seller Offers, 2 pending reviews; web `/` and `/reviews` returned 200. Servers stopped, no listeners on 3000/3001.
- C1: `nx show projects` lists the nine projects. `nx run-many -t build,lint,typecheck --skip-nx-cache` exited 0 (29 tasks). A first cached run reported 0/29 (a `--skip-nx-cache` run does not populate the cache); the next identical run reported 28/29 hits (the one miss is `api:openapi`, `cache: false` by design).
- Golden check with Python gone: `golden: OK (22/22 scenarios)`.
- C37: `data/catalog.db` sha256 `733ff1d9...c404`, `data/ProductEntry.json` sha256 `1b0c861f...b8b6`: unchanged.
- Docs: README rewritten for TypeScript; ADR 0006 status notes the removal; flow diagram names fixed; `.claude/launch.json` now has `catalog-api` (3001) and `catalog-web` (3000).

## Not changed (reported out of scope by the docs worker)
- Identifiers `PythonFormat` / `pythonPathLabel` in `libs/persistence` and `apps/cli/src/commands/*.ts` and a few history comments mention Python. They are code naming only; renaming is a follow-up (no behavior change, golden-protected).
- Historical documents (PRD 0001, `docs/specs/catalog-consolidation/tasks.md`, ADR bodies) keep their Python wording as history. ADRs 0002-0005 still say `Status: proposed`.
