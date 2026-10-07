---
status: done
completed: 2026-10-06
domain: general
spec: docs/specs/2026-10-06-typescript-rewrite-and-web-ui-design.md
---

# Change record — Rewrite in TypeScript (shared core + CLI) and add a Next.js web UI

Date: 2026-10-06
Risk: medium (replaces the whole implementation and supersedes ADR 0001; local tool only, no
production surface, databases are copies under out/; reversible because the Python version stays
until parity is proven)
Autonomy: A2 (working tree only)
Gate: Validation passed (Release gate n/a — local demo, not shipped)

## What / Why

User decisions (2026-10-06, in chat):
- Web UI purpose: interview demo (local, one user).
- Approach: Next.js, reading SQLite directly; resolve rules in TypeScript.
- Scope: "all in TS" = whole project in TypeScript — CLI and web share one core.
- Architecture section approved ("go for it"): pnpm workspace `packages/core`, `apps/cli`,
  `apps/web`; reuse `migrations/*.sql`; `node:sqlite`; faithful difflib port; explicit
  transactions; Python kept as reference until the TS CLI reproduces the baseline, removed in a
  separate step.

## Design-gate artifacts
- [x] Spec `docs/specs/2026-10-06-typescript-rewrite-and-web-ui-design.md` (approved by user 2026-10-06)
- [x] ADR `docs/adr/0006-typescript-shared-core.md` (supersedes 0001)
- [x] Implementation plan `docs/specs/2026-10-06-typescript-rewrite-and-web-ui-plan.md` (15 tasks, 6 waves; reviewed by user 2026-10-06)

## Progress
- 2026-10-06 — Phase 1 (core + CLI, T0-T11) implemented and reviewed per task; Phase 2 parity gate GREEN: `scripts/parity-check.sh` -> `parity: OK (9/9 steps)`. Ledger: `.superpowers/sdd/2026-10-06-typescript-rewrite-and-web-ui-plan/progress.md`.

## Human decisions
- 2026-10-06 — user chose Next.js + direct SQLite, TS resolve rules, whole project in TS, and approved the architecture section.
- 2026-10-06 — user approved the written spec; Q4 show AMBIGUOUS candidates live, Q5 accept the \p{M} deviation, Q6 bin name `catalog-consolidation`.
- 2026-10-06 — user accepted the plan and chose subagent-driven execution ("yes sub ones").

## What was made
- pnpm workspace (Node 24, pnpm 12.8.1, TypeScript 6.0.3 strict): `@catalog/core` (domain: Python-semantics text helpers, normalization, faithful CPython difflib port, matching; use cases ConsolidateFile / ListReviews / ResolveReview; node:sqlite adapters incl. migration runner; no runtime dependencies), `@catalog/cli` (`catalog-consolidation migrate|consolidate|review list|resolve`), `@catalog/web` (Next.js 16 App Router: `/` catalog + search, `/products/[id]` per-seller offers, `/reviews` queue with resolve Server Action), `scripts/parity-check.sh`.
- Executed subagent-driven: 15 tasks (T0-T14) in 6 waves, each with an implementer + independent task review (fix rounds where needed), a Phase 2 parity gate, a final gate, a final whole-branch review (fable) + security review, one fix wave (F1-F9) + scoped re-review. 46 controller rulings, all in the archived ledger `.engineos/archived/2026/10/general/2026-10-06-typescript-rewrite-sdd-ledger.md`.
- Evidence (out/final-gate-2.log): install/build/lint/typecheck exit 0; `scripts/parity-check.sh` -> `parity: OK (9/9 steps)` vs the Python reference (counts 200/54/1/1/11/2/0/0, 258 rows, re-run 0, byte-identical reports, identical table dumps, dry run, error paths, review flow); web smoke 200/404s; browser resolve == CLI resolve (identical dumps); startup misconfig exits 1 with one line; data/ checksums unchanged.
- Security review: CLEAR for the local demo; clickjacking headers, Host allowlist (DNS rebinding) and deep-nesting cap were applied in the fix wave.
- Not done: Phase 4 (remove Python, switch README/docs) — awaits explicit user confirmation; ADR 0006 still `proposed`; axe accessibility scan not run (needs a download); terminal-escape neutralization in `review list` deferred (would change stdout vs Python); `[tests] skipped — not requested`.

## Changes registered
Not a git repository — no diff/stat output. Created (68 source/config files, ~5.6k lines; list in the ledger's branch-files.txt at close time):
`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.npmrc`, `.nvmrc`,
`packages/core/**` (package.json, tsconfig.json, src/domain/{limits,models,errors,ports,text,normalization,sequence-matcher,matching}.ts, src/use-cases/{consolidate-file,resolve-review}.ts, src/adapters/{sqlite-connection,sqlite-catalog-repository,sqlite-review-repository,sqlite-migrations,json-entry-reader,report-writer,python-format}.ts, src/index.ts),
`apps/cli/**` (package.json, tsconfig.json, src/{main,arguments,logging,exit-codes}.ts, src/commands/{migrate,consolidate,review}.ts),
`apps/web/**` (package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .env.example, src/{instrumentation,proxy}.ts, src/app/{layout,error,not-found}.tsx, src/app/globals.css, src/app/(catalog)/{page,loading}.tsx, src/app/products/[id]/{page,loading,layout}.tsx + find-product.ts, src/app/products/not-found.tsx, src/app/reviews/{page,loading}.tsx + actions.ts, src/lib/{config,catalog-db,search-params,review-messages}.ts, src/components/{Pagination,SummaryTiles,ProductsTable,SearchForm,ReviewCard,StatusTabs,Notice,SubmitButton}.tsx),
`scripts/parity-check.sh`, `.claude/launch.json`.
Modified: `.gitignore` (node_modules/, dist/, .next/, *.tsbuildinfo, next-env.d.ts), `docs/adr/0001-python-stdlib-cli.md` (status -> superseded by 0006).
Docs created earlier in this change: spec, plan, ADR 0006. Python reference (`src/catalog_consolidation/`, `pyproject.toml`, `uv.lock`, `migrations/*.sql`) untouched. No moves or renames.
