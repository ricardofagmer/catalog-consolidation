# SDD ledger — plan: docs/specs/2026-10-06-typescript-rewrite-and-web-ui-plan.md

Spec: docs/specs/2026-10-06-typescript-rewrite-and-web-ui-design.md (approved 2026-10-06). ADR 0006.
Execution: subagent-driven (user chose "yes sub ones", 2026-10-06).

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T0 -> T1..T6 | T0 freezes domain/{limits,models,errors,ports,text}.ts, sqlite-connection.ts, partial index.ts | ok; T6 imports REVIEW_STATUSES, isReviewStatus, REVIEW_PAGE_* from the T0 barrel -> T0 partial barrel must export them (carried in T0 dispatch) |
| T0 index.ts vs B2 | partial barrel (T0), full barrel at B2 by orchestrator | shared file across waves, plan assigns B2 to orchestrator -> Ruling R6 |
| T0 / T12 pnpm-lock.yaml | T0 creates, T12 modifies | different waves, ok |
| T1 -> T7, T8, T9 | normalize, cleanDisplay | ok (wave 2 after wave 1) |
| T2 -> T8 | matchEntry, SequenceMatcher | ok |
| T3 -> T8 (verify), T11, T14 | pythonPathLabel, writeJsonlReport, formatSummary, formatFixed | ok |
| T4 -> T8 (verify), T11 | JsonEntryReader | ok |
| T5 -> T8 (verify), T9 (verify), T11, T12 | Sqlite*Repository / *UnitOfWork | ok; T5 must BEGIN in both UoW constructors and guard ROLLBACK/COMMIT on isTransaction (plan spec-gap list) |
| T6 -> T11 | parseCommandLine, logEvent, exit codes | ok |
| T7 -> T11 | SqliteMigrationRunner (async applyPending) | ok; CLI main async |
| T10 vs T11 | parity script uses `node apps/cli/dist/main.js`, self-tests with PARITY_TS_CLI=python before T11 | ok |
| T12 -> T13, T14 | config, search-params, catalog-db, Pagination | ok |
| each task self-consistency | files created vs touched; verification commands vs produced names | no contradictions found in extracted Files/Interfaces blocks |

## Rulings (pre-flight)
- Ruling R1: No git repository -> no worktree, no commits, no BASE/HEAD diffs. Review package = the task's owned file list (reviewer reads files directly); fix rounds name the files changed. — plan Global Constraints forbid git; git writes need user approval per EngineOS — if wrong: weaker fix-round diffs, mitigated by small disjoint file scopes.
- Ruling R2: Implementers within a wave are dispatched in parallel (the skill says never parallel). — plan wave table + EngineOS rules/parallelism.md + user approved the wave description; disjoint file scopes + scoped verification protocol + barrier full checks — if wrong: cross-agent interference in the shared tree, caught at the barrier typecheck.
- Ruling R3: Task reviews run per task, dispatched in parallel per wave after its implementers return, model opus (EngineOS models.md: standards review = build tier). — keeps the skill's per-task gate without serializing — if wrong: extra cost only.
- Ruling R4: Tests stay opt-in (EngineOS verification.md, `[tests] skipped — not requested`); implementer template's TDD/commit steps do not apply; verification = plan's scoped typecheck/lint + behavior checks. — user rules outrank skill defaults — if wrong: fewer regression nets; the parity gate is the behavioral net.
- Ruling R5: Barrier full-package typecheck/lint/build checks are run by the orchestrator (plan "B0..B4"); they are integration checks, not the final gate. — plan text — if wrong: none.
- Ruling R6: The orchestrator writes the full core barrel at B2 exactly as the plan lists (mechanical `export *` lines); reviewed by the final whole-branch review. — plan assigns it; a dispatch for 17 export lines is pure overhead — if wrong: a missing export surfaces at T11/T12 typecheck.

## Progress
- Ruling T0-a: TypeScript pinned 6.0.3 (not the 7.0.2 `pnpm view` reported) — typescript-eslint peers on <6.1.0 and TS 7 has no compiler API for type-aware lint; plan's intent is "exact current stable that the toolchain supports" — if wrong: one version bump later.
- Ruling T0-b: typescript-eslint pinned 8.71.0 (8.71.1 was <24h old, pnpm 12 min-release-age) — exclusion list removed — if wrong: none.
- Ruling T0-c: pnpm 12 ignores `engine-strict`/`save-exact` in .npmrc -> also set `engineStrict: true` and `saveExact: true` in `pnpm-workspace.yaml` (keep .npmrc). Spec intent (exact pins, Node>=24 enforced) beats the brief's one-line freeze of pnpm-workspace.yaml — if wrong: harmless extra config.
- Ruling T0-d: `apps/cli` typecheck TS18003 (no inputs) until T6 is expected; B0 gate checks core only; full gate at B1 — if wrong: none.
- Task T0: review 1 — spec ok on contracts; 1 Important (T0-c not applied to pnpm-workspace.yaml); minors deferred below.
- Task T0: minor (deferred): isSqliteError returns boolean, not a type predicate (plan-mandated signature).
- Task T0: minor (deferred): busy timeout set twice (constructor + PRAGMA), spec-mandated.
- Carry to T12 dispatch: do not let `pnpm add next ...` re-pin typescript (stay 6.0.3 per T0-a); check next/eslint-config-next peer ranges vs TS 6; pnpm 12 minimumReleaseAge may skip <24h releases.
- Task T0: fix round 1/5 (1 addressed, 0 open — pnpm-workspace engineStrict/saveExact; files pnpm-workspace.yaml)
- Task T0: complete (review clean after round 1). B0 barrier: core build/typecheck/lint exit 0; data checksums unchanged.
- Wave 1 dispatched: T1..T6 in parallel (Ruling R2).
- Task T1: complete (review clean; full code-point differential vs Python: only Q5 class-0 marks (1618 cp) and Unicode 17-vs-15 skew (37 cp)).
- Task T1: minor (deferred): document Unicode-version skew (Node 24 = Unicode 17, venv Python = 15.0) next to the Q5 note in docs/README at the end.
- Task T1: minor (deferred): normalization.ts:19-21 docstring ordering rationale wording (NFKD before lowercase is about compatibility forms).
- Task T3: complete (review clean; reviewer differentials: 885 path labels, 21,558 rounding values, 0 mismatches).
- Task T3: minor (deferred): python-format.ts:35 formatPythonFloat differs from Python repr outside the report-score range (>=1e16, <1e-6, -0); add a range comment.
- Task T3: minor (deferred): report-writer.ts:48 guard runs before mkdir (no empty dir left on rejection; Python creates the dir first) — no parity impact.
- Note: hook flagged rule-destructive-ddl on keywords in T3's review text; T3 has no DDL — no HITL owed for this task.
- Ruling T4-a: invalid-JSON error detail is `<path>: invalid JSON` (no line/column) — stderr is outside parity (Global Constraints) and Node's message echoes file content — if wrong: less precise operator message.
- Ruling T4-b: constructor RangeError for fractional/NaN limits accepted — closes a silent-disable hole — if wrong: none.
- Ruling T4-c: deeply nested JSON (~1000 levels): Python fails with not_json (its RecursionError, an interpreter artifact); TS parses and rejects records instead (exit 0 vs 2). Accepted as a documented deviation, not replicated — the exact Python depth depends on its recursion limit and stack — if wrong: a pathological file gets a different exit code; add to README limitations at the end.
- Ruling T4-d: error details print the path as given; Python normalizes via Path — stderr only, outside parity — if wrong: cosmetic.
- Task T2: complete (review clean; line-by-line vs CPython 3.12.14 difflib; implementer differential 3002 pairs + 2000 matchEntry cases, 0 mismatches).
- Task T2: minor (deferred): sequence-matcher.ts:43,85 bpopular written never read (plan-mandated mirror of CPython).
- Task T2: minor (deferred): matching.ts:20-21 unreachable `onlyCandidate !== undefined` branch ordering (cosmetic).
- Task T2: minor (deferred): sequence-matcher.ts:100-101 findLongestMatch has no range guard for ahi > la (Python raises IndexError); internal callers never pass it.
- Task T4: complete (review clean; reviewer differentials incl. nesting and 10 MiB string).
- Task T4: minor (deferred, TRIAGE AT FINAL REVIEW): deeply nested 10 MiB input -> ~1 GB RSS in JSON.parse before rejection (consequence of Ruling T4-c); optional fix = nesting pre-scan (~1000 levels) that also restores Python's not_json/exit 2. CLI-only (web has no upload).
- Task T4: minor (deferred): text.ts pyLength materializes a code-point array per string (175 MB on a 10 MiB Name); short-circuit possible in T0's file.
- Task T4: minor (deferred): not_json detail carries no line/column (Ruling T4-a).
- Ruling T6-a: arguments.ts at 486 lines (> ~300 guideline) accepted for now — the brief fixes the file list; split is a deferred minor for final-review triage — if wrong: a larger file to read.
- Ruling T6-b: `review list --limit 0 -h` prints help (exit 0) where argparse errors first (exit 2) — documented deviation, odd input only — if wrong: different exit code on a contradictory command line.
- Ruling T6-c: ids above 2^53-1 rejected as usage errors (exit 2); Python would accept the int and fail later (review_not_found, also exit 2) — same exit code, safer — if wrong: different stderr text only.
- Note for T11: main.ts prints usage + `error:` line and sets process.exitCode = 2 on usage errors (from T6 report).
- Task T5: complete (review clean; frozen SQL diffed verbatim; surrogate path = Python's generic exception -> rollback -> exit 1).
- Task T5: minor (deferred): toReviewItem exported from sqlite-catalog-repository.ts becomes public via the B2 `export *` barrel (same as T0 row helpers).
- Task T5: minor (deferred): error text "unexpected value in column" duplicated from T0's private helper.
- Task T5: parked — deferred BEGIN at UoW construction holds a SHARED lock from the first read; a CLI resolve racing a web resolve in another process can get SQLITE_BUSY on lock upgrade where Python gets the conditional-update false — Ruling: keep the spec's deferred BEGIN (spec §4.6, T0); single-user local demo makes the race unlikely; T14 must map a SQLite error to the "database" action error (no 500). Final review to triage BEGIN IMMEDIATE for the review write path. Cost if wrong: rare "database busy" message on a concurrent double resolve.
- Wave 2 partial dispatch: T7 + T10 started early (inputs reviewed); T8 + T9 dispatched after T5 completion.
- Task T6: complete (review clean; all flags/bounds/abbreviations/integer forms match the Python surface).
- Task T6: minor (deferred, PRIORITY AT FINAL REVIEW): arguments.ts:301-316 `-hh` (combined short help) parses as a real command and RUNS it (e.g. migrate) where argparse prints help — cheap fix: honor values.help after parseArgs.
- Task T6: minor (deferred): `migrate --db --help` returns help (exit 0) where argparse errors (exit 2) — sibling of T6-b.
- Task T6: minor (deferred): logging.ts:27-33 spread order lets a field overwrite event/level/service/timestamp.
- Task T6: minor (deferred): arguments.ts 486 lines (Ruling T6-a); natural split = help formatter + command specs.
- Task T6: minor (deferred): `\s`/trim() accept U+FEFF in integers (brief-mandated pattern).
- Carry to T11: apply pythonPathLabel to --input for the summary label (args return raw argv); log fields must use null, never undefined (JSON.stringify drops undefined); print usage + `error:` line on usage-error (exit 2), help to stdout (exit 0).
- Wave 1 complete: T1..T6 all reviewed clean.
- B1 barrier: core typecheck+lint clean on all wave-1 files; cli typecheck+lint exit 0; data checksums unchanged.
- Note for T10 review: T8 found the brief's verification block fails under zsh (`rm -f out/t8*` nomatch); check parity-check.sh runs under bash with a bash shebang and no zsh-only globbing assumptions.
- Task T8: complete (review clean; statement-for-statement vs consolidate_file.py; implementer: JSONL report byte-identical to Python, 258/0/258).
- Task T8: minor (deferred): consolidate-file.ts:58-61 a throwing rollback() masks the original error (Python chains via __context__); diagnostics only.
- Task T8: minor (deferred): consolidate-file.ts:92 unreachable `last === undefined` guard (exists to avoid `!`).
- Ruling T9-a: ListReviews validates `limit` inside try/finally so the unit of work (which BEGINs at construction) is always rolled back — accepted; same error type/message — if wrong: none.
- Carry to T11 + T12: units of work BEGIN at construction, so anything thrown between constructing a UoW and the use case's try (e.g. ConsolidateFile reads entries before its try -> InvalidInputFileError) leaves a transaction open on that connection. Composition roots must close the connection in `finally` (close() discards the open transaction) and must not reuse a connection after a failed use case.
- Task T9: complete (review clean; statement-for-statement vs resolve_review.py; implementer: table dumps identical to Python's on twin copies).
- Carry to T11/T13/T14: `afterId` is not validated by the use case (nor by Python) — callers must narrow it to a non-negative integer.
- Task T7: complete (review clean; SchemaVersion DDL/rows and backfill interchangeable with the Python migrator).
- Task T7: minor (deferred): sqlite-migrations.ts:115-118 backup "never overwrite" is check-then-act (Python same); optional atomic `openSync(path,"wx")` reservation.
- Task T7: minor (deferred): SELECT_TABLE duplicates readSchemaVersion's statement (T0 file).
- Task T7: minor (deferred): migration filename `\d` is ASCII-only (Python accepts Unicode digits) — stricter, list in deviations.
- Carry to T11: map the plain Error "refusing to overwrite existing backup" and backup() rejections to exit 1 (Python FileExistsError -> exit 1).
- Carry to T12: web must not call defaultMigrationsDir() (it never resolves migrations/ per spec); if it ever does, set CATALOG_MIGRATIONS_DIR.
- B2 barrier: orchestrator wrote full core barrel (Ruling R6, plan order); core build/typecheck/lint exit 0; cli typecheck/lint exit 0; core has no dependencies key and only node:/relative imports; 79 exports incl. all key symbols; data checksums unchanged.
- Task T10: review 1 — spec ok; 1 Important (migrate stdout + backup not compared at all; frozen surface).
- Task T10: minor (deferred): error-path stdout (*-bad.out, *-unmigrated.out, *-resolve-999.out) captured but not compared.
- Task T10: minor (deferred): script does not re-check data/ checksums itself (optional hardening).
- Task T10: minor (deferred): PARITY_TS_CLI split on whitespace; `dump <db>` resolves relative paths against repo root (document in usage).
- Task T10: minor (deferred): idempotent second migrate and double-resolve (exit 2, Review Focus 1) not exercised.
- Ruling T10-a: backup verified by integrity_check + `.dump` equality with data/catalog.db, not `cmp` — the controller's cmp instruction was wrong: the SQLite backup API rewrites 7 header bytes even in the correct Python output — if wrong: a header-only difference in the backup goes unnoticed (content still verified).
- Ruling T11-a: help/usage text differs from argparse (metavars PATH/N vs DB/LIMIT, no wrapping) — accepted: spec acceptance requires the same flags and exit codes, not argparse's help layout; Q6 fixed only the bin name — if wrong: cosmetic help differences.
- Ruling T11-b: pythonPathLabel applied to --db and --report too (argparse type=Path normalizes all three) — accepted — if wrong: none (parity green).
- Ruling T11-c: errorType "Error" for node:sqlite/fs errors where Python names the class — stderr is outside parity — if wrong: less specific log field.
- T11 report: implementer ran scripts/parity-check.sh against the real TS CLI: parity: OK (9/9 steps), exit 0 (controller re-runs it at the Phase 2 gate).
- Task T10: fix round 1/5 (1 addressed, 0 open — migrate stdout + backup now compared; file scripts/parity-check.sh)
- Task T10: complete (review clean after round 1).
- Task T11: complete (review clean; reviewer re-ran parity: OK 9/9).
- Task T11: minor (deferred, TRIAGE AT FINAL REVIEW): main.ts has no process.stdout 'error' handler -> closed pipe (`| :`) prints a Node EPIPE stack trace on stderr (Python: BrokenPipeError notice, exit 120); fix = swallow EPIPE.
- Task T11: minor (deferred): usage-error prog recovered by regex from T6's usage text (main.ts:19,51-53); better: T6 usage-error variant carries prog.
- PHASE 2 PARITY GATE: GREEN (controller run): core+cli build/typecheck/lint exit 0; scripts/parity-check.sh exit 0, `parity: OK (9/9 steps)` (976/255/2, 269-line reports identical, re-run 0, dry-run 975/0/0, error paths, review flow); data checksums unchanged. Web phase unblocked.
- Task T12: BLOCKED at Q3 spike — cause is NOT node:sqlite (bundles fine) but core `defaultMigrationsDir()` using `new URL("../../../../migrations/", import.meta.url)`, which both bundlers try to resolve as an asset; F1 fails because pnpm-linked workspace packages are not under node_modules; F2/F3 hit the same resolution.
- Ruling T12-a: change core `defaultMigrationsDir()` to `join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "migrations")` (T12 proved both bundlers green with it + transpilePackages). Owner: T7 implementer, fix round on T7's file; then re-run the parity gate. Cost if wrong: migration path resolution differs -> caught by parity step 2.
- Ruling T12-b: add the pnpm 12 build-script approval for `unrs-resolver` to pnpm-workspace.yaml in the same fix dispatch (plain `pnpm install` exits 1 with ERR_PNPM_IGNORED_BUILDS) — use the setting pnpm 12.8.1 actually honors, verified by a plain `pnpm install` exit 0. Cost if wrong: install fails; caught immediately.
- Ruling T12-c: eslint 10 (root) vs eslint-config-next plugins peering on eslint<=9 — T12 decides on resume (web may pin its own eslint 9.x devDependency) and reports; root eslint stays 10.12.0.
- Ruling T12-a CORRECTED: the bundler-safe form uses FOUR ".." segments from dist/adapters (repo-root migrations/); the three-level text was wrong (pointed at packages/migrations). — implementer measured it — if wrong: parity step 2 would fail (it is green).
- Task T7: fix round (T12-a/T12-b): defaultMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..","..","..","..","migrations"); pnpm-workspace.yaml `allowBuilds: { unrs-resolver: true }`; plain `pnpm install` exit 0; core build/typecheck/lint + cli build exit 0; parity: OK (9/9 steps). Re-review dispatched; T12 resumed in parallel (disjoint files).
- Task T7: fix round re-review — both findings ADDRESSED (defaultMigrationsDir resolves migrations from dist; allowBuilds honored by pnpm 12.8.1). T7 remains complete.
- Q3 RESOLVED (T12): with rebuilt core + spec `transpilePackages`, Turbopack and webpack builds exit 0; no fallback needed.
- Ruling T12-c applied: eslint-plugin-react crashes on eslint 10 -> apps/web pins eslint 9.39.5 + typescript-eslint 8.71.0 (web only); root stays eslint 10.12.0; `pnpm peers check` clean.
- Ruling T12-d: keep the brief's instrumentation form (no process.env outside lib/config.ts) despite 11 Turbopack Edge-runtime warnings from Next compiling instrumentation.ts for Edge — warnings only, build exits 0 — deferred minor for final-review triage — if wrong: noisy build output.
- Ruling T12-e: concurrent web resolve while another process holds the write lock fails immediately with the "database" notice (deferred BEGIN) — same parked finding as T5; BEGIN IMMEDIATE triage at final review — if wrong: rare immediate failure instead of a 5 s wait.
- Ruling T12-f: notice product id read from `?product=` (plan spec-gap note) — accepted.
- Boot fallback (Next 16 keeps serving when register() throws): instrumentation prints one `error:` line and exits 1 — per brief fallback.
- Ruling R7: T13 + T14 dispatched in parallel with the T12 review — T12's Interfaces block is plan-frozen and the reviewer checks it; any T12 fix must keep the interface — if wrong: T13/T14 rework on an interface change.
- Task T12: complete (review clean; interfaces exact; build-time safety confirmed in Next source; read connections query_only).
- Task T12: minor (deferred, PRIORITY AT FINAL REVIEW): globals.css lacks `color-scheme: light dark` -> native controls/scrollbars stay light in dark mode.
- Task T12: minor (deferred): config.ts:41-48 a non-SQLite CATALOG_DB_PATH prints raw `error: file is not a database` without path/hint.
- Task T12: minor (deferred): search-params.ts value-imports the full core barrel (reaches node:sqlite) and is not server-only — a 'use client' import would fail the client build.
- Task T12: minor (deferred): catalog pagination reuses REVIEW_PAGE_* names (values correct).
- Task T12: minor (deferred): body bg/color duplicated in globals.css and layout classes; Pagination returns null when first page and no next (sound).
- Spec drift note: spec §6.2 "catalog-db.ts is the only module importing core adapters" is inaccurate (config.ts imports openConnection, plan-mandated) — update the spec at close.
- Ruling T14-a: submit buttons not disabled while pending (needs a 'use client' SubmitButton; brief keeps the page server-only) — server rejects the second POST (review_not_pending, verified) — deferred PRIORITY minor for final review (rules/frontend.md "disable submit while pending") — if wrong: a double-click shows an "already resolved" notice instead of being prevented.
- Ruling T14-b: `database` errors are mapped for the user but not logged server-side — deferred PRIORITY minor for final review (rules/observability.md: log at boundaries, correlationId) — if wrong: a DB failure is invisible to the operator.
- Ruling T14-c: cross-origin POST gets Next's own CSRF 500 before the action runs, nothing written — accepted (framework protection) — if wrong: a less friendly error page for a forged request.
- Note: T14's builds rewrote apps/web/.next while T13's server ran; T13 owns its re-verification.
- Ruling T13-a: file layout deviates from the brief — `/` lives in route group `app/(catalog)/{page,loading}.tsx`; product existence checked in `app/products/[id]/layout.tsx` (+ `find-product.ts`, one cached read); not-found at `app/products/not-found.tsx` — because loading.tsx streams a 200 before notFound() runs, so the literal layout returned 200 for missing products; URLs unchanged — if wrong: none functionally; final gate lint must include the (catalog) paths.
- Demo server started for the user (2026-10-06): out/web-demo/catalog.db (TS CLI migrate+consolidate), `pnpm --filter @catalog/web build` exit 0, served via .claude/launch.json 'catalog-web' on 127.0.0.1:3000; /, /products/2, /reviews render. Not the final gate.
- Task T13: complete (review clean; parser-only data access, layout-level 404, escaped seller text, tokens only, force-dynamic, no connection leaks).
- Task T13: minor (deferred): a query that normalizes to null ("!!!") lists the whole catalog under a "Products matching" caption — misleading text.
- Task T13: minor (deferred): hand-edited q > 200 code points silently disables the filter (T12 parser).
- Task T13: minor (deferred): long unbroken seller strings can overflow the <dl>/empty-state <p> (add min-w-0 break-words).
- Task T13: minor (deferred): animate-pulse ignores prefers-reduced-motion (use motion-safe:).
- Task T13: minor (deferred): SearchForm uncontrolled input may keep stale text across soft navigation (key={query}).
- Task T13: minor (deferred): duplicated cell classes/MissingValue between ProductsTable and product page (rule of three not yet hit).
- Task T14: complete (review clean; allowlist parsing, candidate from stored row, closed-set error mapping, redirects from validated values only).
- Task T14: minor (deferred): action set defined twice (ReviewCard.tsx:11 vs actions.ts:9-10) — export type FormAction.
- Task T14: minor (deferred): Notice live region inserted already filled (screen readers may not announce); render an empty aria-live container.
- Task T14: minor (deferred): repeated button names across cards lack review context (aria-describedby).
- Task T14: minor (deferred): catalog-db.ts:219-222 (T12) checks missing candidate before status — forged link-candidate POST on a resolved review gets no_candidate instead of review_not_pending.
- All tasks T0..T14 complete. Next: JS-enabled browser click-through (T14 reviewer's ask), final gate, final whole-branch review.
- FINAL GATE (controller, 2026-10-06), output in out/final-gate.log:
  - pnpm install --frozen-lockfile exit 0; pnpm -r build exit 0 (routes ƒ /, ƒ /products/[id], ƒ /reviews; built with CATALOG_DB_PATH unset); pnpm -r lint exit 0; pnpm -r typecheck exit 0; scripts/parity-check.sh -> parity: OK (9/9 steps).
  - static: core imports only node:/relative; core dependencies 0; no any/eslint-disable in core; no SQL template interpolation; dangerouslySetInnerHTML|process.env only in apps/web/src/lib/config.ts.
  - startup failures: unset / missing / unmigrated CATALOG_DB_PATH -> exit 1 with one `error:` line + migrate hint.
  - web smoke (fresh migrated+consolidated copy): / 200 (tiles 976/255/2), /products/976 200 (hostile brand escaped), /reviews 200, /products/999999 404, /products/abc 404.
  - browser (JS on) "Link to candidate" -> notice "Review 1 linked to product 21."; CLI resolve on a twin copy -> table dumps identical; CLI re-run rows_written=0, UNCHANGED 257, SKIPPED 11, HELD 1. Earlier demo run: review 2 -> product 28, CLI re-run UNCHANGED.
  - NOT RUN: axe accessibility scan (needs downloading @axe-core/cli or axe from a CDN — requires user permission). `[tests] skipped — not requested`.
  - data checksums unchanged.
- Final review dispatched: whole-branch code review (most capable model) + security-reviewer pass (diff touches input validation, SQL, a write endpoint).
- SECURITY REVIEW (leo-ely): CLEAR for the local demo; 0 Critical/High/Medium; 4 Low: (1) no frame-ancestors/X-Frame-Options/security headers -> clickjacking of /reviews forms; (2) no Host allowlist -> DNS rebinding bypasses Next's origin check; (3) terminal escape injection via seller text in `review list` (inherited from Python); (4) deep-nesting JSON memory (T4-c) + pyLength materialization. Info: lone surrogate aborts the batch (matches Python); spoofable notice via URL (cosmetic); deferred BEGIN not an integrity risk; allowBuilds acceptable; env-driven dirs operator-only; sqlite-migrations reads process.env in core (architecture). pnpm audit not run (needs network).
- FINAL REVIEW (fable): Ready after fixes. MUST-FIX: `-hh` runs the command (arguments.ts). Recommended before demo: database-error logging, pending SubmitButton, BEGIN IMMEDIATE on write paths, color-scheme, EPIPE handler. Triage table in the reviewer's report: all other deferred minors OK-TO-DEFER.
- Ruling F-scope: ONE final fix dispatch covering: F1 `-hh` (must), F2 database-error server log, F3 pending SubmitButton, F4 BEGIN IMMEDIATE mode on the two write units of work (deferred for ListReviews), F5 color-scheme + motion-safe pulse, F6 stdout EPIPE handler, F7 security headers (frame-ancestors 'none', X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy), F8 Host allowlist proxy.ts (127.0.0.1:3000, localhost:3000), F9 JSON nesting-depth pre-scan (not_json, restores Python exit 2). — all small, all named by a reviewer, none changes the parity surface for valid input — if wrong: parity gate re-run catches regressions.
- Ruling F-defer: terminal-escape neutralization in `review list` NOT included — it changes stdout vs the Python reference (inherited behavior); recorded for Phase 4 with the remaining OK-TO-DEFER minors and the spec §3/§6.2 corrections — if wrong: an operator terminal can be manipulated by a hostile seller file, same as the Python version.
- Final fix wave (one fixer): F1..F9 applied; pnpm -r build/lint/typecheck exit 0; parity OK 9/9 (twice); grep gate ok; data unchanged.
- Ruling F9-a: MAX_JSON_NESTING_DEPTH = 9994, not 1000 — measured: Python 3.12.14's CLI accepts 9994 levels and exits 2 at 9995; 1000 would have created a new exit-code divergence for depths 1001..9994; 9994 still bounds the pathological 5M-level memory case — if wrong: a 9994-deep file costs some memory (small, file-size bound).
- Final fix residual notes (deferred): F2 errorType is always "Error" for SQLite (add errcode later); `-hh --bogus` gives usage error where argparse prints help; broken pipe exits 1 (Python 120) — stdout/stderr edge cases outside parity.
- Final fix wave re-review: F1..F9 all ADDRESSED, no new breakage.
- FINAL GATE RE-RUN after fixes (out/final-gate-2.log): install/build/lint/typecheck exit 0; parity OK (9/9); grep gate ok; `-hh` prints help, no backup, db unchanged; data checksums unchanged. Demo server restarted (catalog-web, out/web-demo).
- PLAN COMPLETE (Phases 1-3). Phase 4 (Python removal + docs switch) NOT executed — requires explicit user confirmation. ADR 0006 stays `proposed` until the user accepts it.
