---
name: 2026-10-06-nx-nestjs-modern-ui
status: active
owner: Ricardo Fagmer
spec: docs/specs/2026-10-06-nx-nestjs-modern-ui.md   # index written at stage 4b
domain: general
---

## What
Move the catalog-consolidation TypeScript workspace (`packages/core`, `apps/cli`, `apps/web`) to an
Nx monorepo, introduce a NestJS backend API that serves the frontend, and redesign the web UI to a
modern look with a light/dark mode toggle. Behavioral parity with the Python reference must hold.

## Why
User request (2026-10-06): "apply nestjs + nx to handle fe be and improve the web design to a modern
one with toggle to light and dark mode". Today the Next.js app reads SQLite directly (ADR 0006,
"no separate JSON API"); a NestJS backend and an Nx workspace change that architecture, so the
decision is recorded and the flow runs PRD -> plan -> checks -> tickets before any code.

## Scope
Touches ADR 0006's "Next.js reads SQLite directly" decision, the workspace layout, build/lint/
typecheck orchestration, the data-access boundary between web and database, and all web pages and
styling. Details are settled at the ADR and PRD stages.

## Checklist
- [x] 0 stack — not greenfield (package manifests exist: pnpm workspace, Next.js app); skipped
- [x] 1 preconditions — docs/agents/issue-tracker.md, docs/agents/domain.md, .engineos/changes/2026-10-06-nx-nestjs-modern-ui.md (approved 2026-10-06)
- [x] 2 ADR — CONTEXT.md; docs/adr/2026-10-06-nx-nest-backend-web-via-api.md, docs/adr/2026-10-06-rules-as-nest-providers-nest-11.md, docs/adr/2026-10-06-api-contract-and-security.md, docs/adr/2026-10-06-remove-python-golden-fixtures.md (approved 2026-10-06; ADRs accepted)
- [x] 3 PRD — docs/prds/2026-10-06-nx-nestjs-modern-ui.md (10 user stories; approved 2026-10-06)
- [x] 4a plan — .specs/features/nx-nestjs-modern-ui/plan.md (36 EARS criteria R1-R36; approved 2026-10-06)
- [x] 4b checks — .specs/features/nx-nestjs-modern-ui/checks.md, docs/specs/2026-10-06-nx-nestjs-modern-ui.md
- [x] 5 tasks — docs/specs/nx-nestjs-modern-ui/tickets/01..13 (13 tickets, every check C1-C37 closed once; approved 2026-10-06)
- [x] 6 build + verify — tickets 01-13 done (docs/specs/nx-nestjs-modern-ui/tickets/*-evidence.md); final gate green; independent verification .specs/features/nx-nestjs-modern-ui/verification.md (2026-10-07); tests pending

`[tests] pending — final-stage user approval required`

## What was made
An Nx workspace of nine projects: NestJS 11 `api` and `cli` (Nest standalone context) sharing five backend libraries (domain, rules, persistence, consolidation, reviews) where every rule is an injectable provider; a generated `api-client` (openapi-typescript + openapi-fetch); and the Next.js 16 `web` app, which reaches data only through the API from the Next server. The API (127.0.0.1:3001) has the C-API rev1 contract: loopback bind, Host allowlist, JSON-only, closed four-field error codes, JSON depth guard, health endpoints, Swagger/OpenAPI. The web UI is redesigned (Tailwind v4, shadcn-style primitives, next-themes light/dark/system toggle, sidebar shell with drawer, loading/empty/error states, accessibility carry-overs). The Python reference was archived (`.engineos/archived/2026/10/python-reference-2026-10-06.tar.gz`) after its behavior was frozen as 22 golden fixtures, then deleted; the README is rewritten for TypeScript. Behavior is unchanged: golden 22/22, `data/` byte-identical.

## Verification
Non-test evidence only. Final gate (2026-10-07): `nx run-many -t build,lint,typecheck --skip-nx-cache` exit 0 for nine projects (29 tasks), cached rerun 28/29 hits; `scripts/golden-check.sh` 22/22; README quick start and API/web commands run verbatim from a fresh copy; data sha256 `733ff1d9...c404` and `1b0c861f...04b8f6` unchanged. Independent Verifier (critic) reviewed C1-C37: no claim failed; two defects outside the claims (README API table, `nx affected` graph) plus four minor ones were fixed and re-gated; browser claims C26-C31 rest on one in-app browser run. Details and gaps: `.specs/features/nx-nestjs-modern-ui/verification.md`.

`[tests] pending — final-stage user approval required`. No executable test was authored or run. The test scope has been presented to the developer; until it is approved the test decision is open.

## Follow-up changes (2026-10-07)
- Live search from 3 characters: the web search form filters as the user types once the trimmed query reaches 3 code points, debounced 300 ms (`apps/web/src/components/SearchForm.tsx`); plain GET submit still works at any length.
- Assessment fidelity review fixes: README "For evaluators" and "How AI was used" sections, PRD 0001 corrections, absolute local paths redacted from the docs.
- Numeric seller Ids accepted: a JSON number `Id` that is a safe integer is converted to its decimal text and then follows the string allowlist/length rules (`withIntegerIdAsText`, `libs/persistence/src/seller-record-validator.ts`); `12345` and `"12345"` are the same seller SKU. Other numbers and types stay `REJECTED_INVALID` (`not_a_string:Id`); no new error code. PRD A16 revised from option (b) to (a).
- New warning `brand_unverified_null` (`libs/domain/src/models.ts` `WARNING_CODES`): added to a newly written `LINKED_EXACT`/`LINKED_NORMALIZED` link when exactly one side's normalized brand is NULL (`brandCheck` from `libs/rules/src/matching.service.ts`, emitted in `libs/consolidation/src/consolidation-run.ts`). It does not change which product is linked. README and PRD A3 updated.
- Final gate: lint, typecheck, build green 29/29 tasks; golden-check 22/22 (the provided data triggers neither behavior change).

`[tests] pending - final-stage user approval required`

## Human decisions
- 2026-10-06 | Ricardo Fagmer | n/a (no hitl reason fired; risk medium, A2) | approved | chose slug `nx-nestjs-modern-ui` ("go for it") and the from-scratch flow for this feature.

## Changes registered
The project is not a git repository, so `git status` output is unavailable. Registered by area: root (`nx.json`, `package.json`, `pnpm-workspace.yaml`, `eslint*.mjs`, tsconfigs, `.gitignore`, `.nxignore`, `.claude/launch.json`); `apps/{api,cli,web}`; `libs/{domain,rules,persistence,consolidation,reviews,api-client}`; `fixtures/golden`; `scripts/{golden-check,parity-check}.sh`; docs (`README.md`, `CONTEXT.md`, 4 new ADRs, PRD, specs, tickets). Removed: `packages/core`, the Python package, `.venv`, `.ruff_cache`, `pyproject.toml`, `uv.lock`, `scripts/golden-record.sh`, `apps/web/src/components/ui/separator.tsx`.

## Notes
- Grilling decisions (2026-10-06): Next.js stays and reaches data only via the Nest API (browser -> Next server -> API); rules become Nest providers (all injectable, SequenceMatcher via factory) and core is dissolved; CLI = Nest standalone app; Nest 11 + @nx/nest (CommonJS); Nx inferred tasks on pnpm; REST + OpenAPI with DTO classes and generated client; loopback + Host allowlist + JSON-only; one SQLite connection per operation; API exposes only what the UI needs; shadcn/ui + Tailwind v4 + next-themes (light/dark/system), neutral minimal look, sidebar shell; Python removed after golden fixtures + archive; README switched; auth, CI/containers out of scope; tests pending final-stage approval.
- Two non-recommended choices (rules as Nest providers; Nest 11) were made deliberately by the user after the trade-offs were stated.
- Prior work in the same workspace: `.engineos/archived/2026/10/general/2026-10-06-typescript-rewrite-and-web-ui.md` and the SDD ledger next to it.
- Existing ADRs `docs/adr/0001`..`0006` use sequence numbers; `docs/agents/domain.md` mandates dated
  filenames for new ADRs. Existing files are not renamed (COMPATIBILITY: a rename is a deprecation,
  not a silent move); new ADRs for this feature are dated.
- Parity gate to keep green: `scripts/golden-check.sh` (22 golden scenarios; `scripts/parity-check.sh` is now a wrapper over it).
