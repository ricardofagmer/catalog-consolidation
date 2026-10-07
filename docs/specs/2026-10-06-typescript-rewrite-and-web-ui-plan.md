# Catalog Consolidation — TypeScript Rewrite and Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One TypeScript pnpm workspace (`@catalog/core`, `@catalog/cli`, `@catalog/web`). The CLI must reproduce the Python reference byte for byte, and the Next.js UI must read the catalog and resolve reviews through the same core.

**Architecture:** `@catalog/core` holds a synchronous domain (Python-semantics text helpers, normalization, a faithful `difflib` port, matching), the two use-case modules and `node:sqlite` adapters, and it has no runtime dependencies. `@catalog/cli` is the composition root that maps errors to exit codes. `@catalog/web` uses Server Components for reads and one Server Action for review resolution, and it calls core in-process. The Python tree stays the reference until `scripts/parity-check.sh` is green.

**Tech Stack:** Node 24 (verified v24.21.0, built-in `node:sqlite`), pnpm 12.8.1, TypeScript (strict, NodeNext), ESLint flat config + typescript-eslint strict, Next.js App Router, React, Tailwind v4, bash + `sqlite3` CLI (3.54.0) + `jq` for the parity check.

**Spec:** [`2026-10-06-typescript-rewrite-and-web-ui-design.md`](2026-10-06-typescript-rewrite-and-web-ui-design.md) (approved 2026-10-06). ADR [0006](../adr/0006-typescript-shared-core.md). The frozen Python contracts and baseline are in [`catalog-consolidation/tasks.md`](catalog-consolidation/tasks.md). Executors read the spec alongside this plan. Wherever this plan writes "spec §N", the spec text is the contract.

Risk **medium**, autonomy ceiling **A2**, every task. Model: **opus** for every task. `[tests] skipped — not requested`: the opt-in test tasks are listed separately and nothing depends on them.

## Global Constraints

- Never write to `data/`, `src/catalog_consolidation/`, `pyproject.toml`, `uv.lock`, `migrations/*.sql`, `.venv/`. Every run uses copies under `out/`. Guard (run at every barrier): `shasum -a 256 data/catalog.db data/ProductEntry.json` prints `733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404` and `1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6`.
- Not a git repository: run no git commands. `create-next-app` is not run either, because it runs `git init`. The web scaffold is hand-written (T12).
- Node `>= 24` in `engines` of every package and `.nvmrc` = `24`. `.npmrc`: `engine-strict=true` and `save-exact=true`. Root `packageManager`: `"pnpm@12.8.1"` (Q7, the installed version; see spec gaps).
- Q7 version pins: at scaffold time, run `pnpm view <pkg> version` and write that exact version (no `^`/`~`) for `typescript`, `@types/node` (latest `24.x`), `eslint`, `@eslint/js`, `typescript-eslint`, `next`, `react`, `react-dom` (the versions `next` peers on), `@types/react`, `@types/react-dom`, `server-only`, `tailwindcss`, `@tailwindcss/postcss`, `eslint-config-next` (same version as `next`), and `vitest` (opt-in only).
- `tsconfig.base.json`: `strict`, `target: "ES2023"`, `lib: ["ES2023", "ES2024.String"]` (for `isWellFormed`), `module`/`moduleResolution: "NodeNext"`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `noImplicitOverride`, `declaration`, `skipLibCheck`, `types: ["node"]`.
- Core and CLI are ESM (`"type": "module"`). Relative imports carry the `.js` extension. No `any`, no `as` used to silence errors, no non-null `!`, and no `eslint-disable` in `packages/core`. Every boundary value is `unknown` and gets narrowed.
- `@catalog/core` may import only `node:` built-ins and relative paths. It has no `dependencies` key.
- SQL: `?` placeholders only, written as complete string literals with no `${` inside SQL text. Frozen statements from `tasks.md` § "SQL — repository statements" are copied verbatim.
- Exit codes, stdout formats, report bytes and table contents are frozen (spec §5, §7). Stderr text is not part of parity. Its JSON log schema is (spec §5.6).
- CLI output goes through `process.stdout.write(line + "\n")`. The exit code is set through `process.exitCode`, never `process.exit()`, because on macOS pipes are asynchronous and stdout would be truncated.
- English only, no emojis, comments say WHY.

### Scoped verification protocol (parallel agents share one working tree)

No worktrees are available because this is not a git repository. Inside a wave:
- Build core with emit-on-error (the tsc default): `pnpm --filter @catalog/core build`. A sibling's in-progress file must not block your behavior check.
- Typecheck is filtered to your own files: `pnpm --filter @catalog/core typecheck 2>&1 | grep -E '<your file regex>'` must print nothing. Errors in other files go under `### Out of scope`.
- Lint is scoped: `pnpm --filter <pkg> exec eslint <your files>` exits 0.
- Full-package `typecheck` + `lint` must be green at each wave barrier. The orchestrator runs that check.

## Review Focus

These are five input classes the spec does not exercise but a real user will hit. Each one has a check pinned in the task that owns it.

1. **Double-submitting or resolving from a stale `/reviews` page.** The second POST must land on `/reviews?status=PENDING&error=review_not_pending&review=<id>` with the message "This review was already resolved.". It must not produce a 500 or a second link. Owner: T14 step 6.
2. **`--input` typed in different ways** (`./data/ProductEntry.json`, `data//ProductEntry.json`, `data/./ProductEntry.json`). The summary header must print Python's `str(Path(arg))`. That function also drops inner `.` segments and keeps exactly two leading slashes, which spec §5.4 does not mention. Owner: T3 step 2 table.
3. **`next build` on a machine with no `CATALOG_DB_PATH` and no database.** The final gate runs this way, so the build must succeed. No database access may happen at import or build time. Every page sets `dynamic = "force-dynamic"` and config is read lazily. Owner: T12 step 7.
4. **Seller files saved with a BOM by Windows tools.** Exactly one leading U+FEFF is accepted. `TextDecoder` already strips it, so the code must not strip again. A second BOM makes the file `not_json`, as in Python. Owner: T4 step 3.
5. **JSON escapes that decode to lone surrogates** (`"\ud800"`). Python fails when binding to SQLite or writing the report, which means exit 1 and a rollback. `node:sqlite` and `JSON.stringify` would silently accept them. `bindText` and the report writer reject strings that are not well-formed. Owner: T5 step 4, T3 step 4.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.npmrc`, `.nvmrc`, `eslint.config.mjs`, `.gitignore` (append) | workspace, toolchain, shared lint | T0 (lockfile later modified by T12) |
| `packages/core/{package.json,tsconfig.json}` | core package | T0 |
| `packages/core/src/domain/{limits,models,errors,ports,text}.ts` | frozen contracts and Python text semantics | T0 |
| `packages/core/src/adapters/sqlite-connection.ts` | open/PRAGMA/schema version/bind guard/row narrowing | T0 |
| `packages/core/src/index.ts` | public barrel | T0 (partial), completed at barrier B2 |
| `apps/cli/{package.json,tsconfig.json}` | cli package | T0 |
| `packages/core/src/domain/normalization.ts` | `normalize`, `cleanDisplay` | T1 |
| `packages/core/src/domain/{sequence-matcher,matching}.ts` | difflib port, `matchEntry` | T2 |
| `packages/core/src/adapters/{python-format,report-writer}.ts` | Python number/path formatting, JSONL + summary | T3 |
| `packages/core/src/adapters/json-entry-reader.ts` | file + record validation | T4 |
| `packages/core/src/adapters/{sqlite-catalog-repository,sqlite-review-repository}.ts` | repositories + units of work | T5 |
| `apps/cli/src/{arguments,logging,exit-codes}.ts` | argv parsing, JSON log line, exit table | T6 |
| `packages/core/src/adapters/sqlite-migrations.ts` | migration runner + backfill | T7 |
| `packages/core/src/use-cases/consolidate-file.ts` | `ConsolidateFile` | T8 |
| `packages/core/src/use-cases/resolve-review.ts` | `ListReviews`, `ResolveReview` | T9 |
| `scripts/parity-check.sh` | spec §5.7 + `dump` mode | T10 |
| `apps/cli/src/{main,commands/migrate,commands/consolidate,commands/review}.ts` | composition root | T11 |
| `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,eslint.config.mjs,.env.example}` | web package | T12 |
| `apps/web/src/instrumentation.ts`, `src/app/{layout.tsx,error.tsx,not-found.tsx,globals.css}` | shell, tokens, startup validation | T12 |
| `apps/web/src/lib/{config,catalog-db,search-params}.ts`, `src/components/Pagination.tsx` | data access, params, shared pager | T12 |
| `apps/web/src/app/{page,loading}.tsx`, `src/app/products/[id]/{page,loading,not-found}.tsx`, `src/components/{SummaryTiles,ProductsTable,SearchForm}.tsx` | catalog pages | T13 |
| `apps/web/src/app/reviews/{page.tsx,loading.tsx,actions.ts}`, `src/lib/review-messages.ts`, `src/components/{ReviewCard,StatusTabs,Notice}.tsx` | review queue + action | T14 |

## Wave plan

| Wave | Tasks -> owner | Gate after |
|---|---|---|
| 0 | T0 -> borisenko (backend-coordinator) | B0: core builds; full typecheck/lint green |
| 1 | T1, T2, T3, T4, T5, T6 -> borisenko x6 | B1: core + cli skeleton typecheck/lint green |
| 2 | T7, T8, T9 -> borisenko x3; T10 -> hinokuma (devops-coordinator) | B2: orchestrator completes `index.ts` (below), core build/typecheck/lint green |
| 3 | T11 -> borisenko | **Phase 2 gate**: `scripts/parity-check.sh` exit 0 |
| 4 | T12 -> arturo (frontend-coordinator) | B4: web build green, Q3 decision recorded |
| 5 | T13, T14 -> arturo x2 | **Final gate** |

Dependencies: T0 -> {T1..T6}; T1 -> {T7, T8, T9}; {T2, T3, T4, T5} -> T8; T5 -> T9; {B2, T6} -> T11; {T11, T10} -> Phase 2 gate -> T12 -> {T13, T14}.

```
[fanout] waves=6 wave0=borisenko:T0 wave1=borisenko:T1, borisenko:T2, borisenko:T3, borisenko:T4, borisenko:T5, borisenko:T6 wave2=borisenko:T7, borisenko:T8, borisenko:T9, hinokuma:T10 wave3=borisenko:T11 wave4=arturo:T12 wave5=arturo:T13, arturo:T14 model=opus
```

Every brief carries MODE: IMPLEMENT, the task's file list, a pointer to T0's contracts and the spec sections it cites, risk medium / A2, tests NOT in scope, the protocol above, and the return envelope. Backend tasks load `rules/architecture.md`, `rules/backend.md` and `rules/observability.md`. Web tasks load `rules/architecture.md`, `rules/frontend.md` and the `react-patterns` skill. A handoff (`templates/handoff.md`) is written at every barrier.

**Barrier B2 integration (orchestrator):** replace `packages/core/src/index.ts` with `export *` lines for, in order: `domain/{limits,models,errors,ports,text,normalization,sequence-matcher,matching}`, `use-cases/{consolidate-file,resolve-review}`, `adapters/{sqlite-connection,sqlite-catalog-repository,sqlite-review-repository,sqlite-migrations,json-entry-reader,report-writer,python-format}` (each `./<path>.js`). Then `pnpm --filter @catalog/core build && pnpm --filter @catalog/core typecheck && pnpm --filter @catalog/core lint` exits 0.

---

# Phase 1 — core and CLI

### Task T0: Workspace scaffold and frozen contracts in code

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, `.nvmrc`, `eslint.config.mjs`, `pnpm-lock.yaml` (via install)
- Modify: `.gitignore` (append `node_modules/`, `dist/`, `.next/`, `*.tsbuildinfo`, `next-env.d.ts`)
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/domain/{limits,models,errors,ports,text}.ts`, `packages/core/src/adapters/sqlite-connection.ts`, `packages/core/src/index.ts`
- Create: `apps/cli/package.json`, `apps/cli/tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: everything below. Later tasks import these names verbatim and never edit these files.

- [ ] **Step 1: Workspace files.** `pnpm-workspace.yaml` is `packages: ["packages/*", "apps/*"]`. Root `package.json` is `"private": true` with `"name": "catalog-workspace"`, `packageManager`, `engines`, and devDependencies (the exact pins from Global Constraints): `typescript`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`. Scripts: `"build": "pnpm -r build"`, `"lint": "pnpm -r lint"`, `"typecheck": "pnpm -r typecheck"`, `"cli": "node apps/cli/dist/main.js"`, `"parity": "scripts/parity-check.sh"`, `"dev": "pnpm --parallel --filter @catalog/core --filter @catalog/web dev"`. `eslint.config.mjs` combines `@eslint/js` recommended and `tseslint.configs.strictTypeChecked` with `parserOptions.projectService: true`. It ignores `**/dist/**`, `**/.next/**` and `apps/web/**` (web has its own config), and applies `tseslint.configs.disableTypeChecked` to `**/*.mjs`.
- [ ] **Step 2: Packages.** `packages/core/package.json` has `"name": "@catalog/core"`, private, `"type": "module"`, `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`, engines, no `dependencies`. Scripts: `"build": "tsc -p tsconfig.json"`, `"dev": "tsc -p tsconfig.json --watch"`, `"typecheck": "tsc -p tsconfig.json --noEmit"`, `"lint": "eslint src"`. Its `tsconfig.json` extends the base with `rootDir: "src"`, `outDir: "dist"`, `include: ["src"]`. `apps/cli/package.json` has `"name": "@catalog/cli"`, private, ESM, `"bin": { "catalog-consolidation": "dist/main.js" }`, `"dependencies": { "@catalog/core": "workspace:*" }` and the same four scripts minus `dev`. Its tsconfig is the same shape. Then run `pnpm install`.
- [ ] **Step 3: `domain/limits.ts`.** Write spec §4.1 verbatim: `MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024`, `MAX_INPUT_ENTRIES = 100_000`, `MAX_SELLER_PRODUCT_ID_LENGTH = 64`, `MAX_SELLER_NAME_LENGTH = 100`, `MAX_NAME_LENGTH = 200`, `MAX_BRAND_LENGTH = 100`, `MAX_CATEGORY_LENGTH = 100`, `SELLER_PRODUCT_ID_PATTERN = /^[A-Za-z0-9._-]+$/u`, `UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u`, `FUZZY_REVIEW_THRESHOLD = 0.8`, `MAX_EXACT_CANDIDATES = 50`, `FUZZY_SCAN_BATCH_SIZE = 500`, `BACKFILL_BATCH_SIZE = 500`, `REPORT_SCORE_DECIMALS = 4`, `REVIEW_PAGE_DEFAULT_LIMIT = 20`, `REVIEW_PAGE_MAX_LIMIT = 100`, `REQUIRED_SCHEMA_VERSION = 3`.
- [ ] **Step 4: `domain/models.ts`.** Write the spec §4.2 block verbatim. Every field is `readonly` and every array is `readonly T[]`. Also derive `MatchType`, `ReviewReason`, `ReviewStatus`, `WarningCode`, `ViolationCode`, `FieldName` from their `as const` arrays. Spec §4.2 abbreviates some types, and §4.5 has the use-case value types. They are frozen here so wave-1 tasks can consume them:

```ts
export interface CatalogProduct { readonly id: number; readonly name: string; readonly brand: string | null; readonly category: string | null; readonly normalizedName: string | null; readonly normalizedBrand: string | null }
export interface SellerLink { readonly id: number; readonly sellerName: string; readonly sellerProductId: string; readonly productId: number; readonly matchType: MatchType }
export interface NewSellerLink { readonly sellerName: string; readonly sellerProductId: string; readonly productId: number; readonly sourceName: string; readonly sourceBrand: string | null; readonly sourceCategory: string | null; readonly matchType: MatchType }
export interface NewProduct { readonly name: string; readonly brand: string | null; readonly category: string | null; readonly normalizedName: string; readonly normalizedBrand: string | null }
export interface ReviewItem { readonly id: number; readonly sellerName: string; readonly sellerProductId: string; readonly candidateProductId: number | null; readonly score: number | null; readonly reason: ReviewReason; readonly status: ReviewStatus }
export interface NewReviewItem { readonly sellerName: string; readonly sellerProductId: string; readonly sourceName: string; readonly sourceBrand: string | null; readonly sourceCategory: string | null; readonly candidateProductId: number | null; readonly score: number | null; readonly reason: ReviewReason }
export interface ProductKeySource { readonly productId: number; readonly name: string; readonly brand: string | null }
export interface ReviewRecord { readonly item: ReviewItem; readonly sourceName: string; readonly sourceBrand: string | null; readonly sourceCategory: string | null }
export interface EntryOutcome { readonly index: number; readonly sellerName: string | null; readonly sellerProductId: string | null; readonly outcome: OutcomeCode; readonly productId: number | null; readonly reviewReason: ReviewReason | null; readonly score: number | null; readonly warnings: readonly WarningCode[]; readonly errors: readonly string[] }
export interface RunSummary { readonly runId: string; readonly inputLabel: string; readonly total: number; readonly counts: readonly (readonly [OutcomeCode, number])[]; readonly rowsWritten: number; readonly dryRun: boolean; readonly committed: boolean }
export interface ConsolidationResult { readonly outcomes: readonly EntryOutcome[]; readonly summary: RunSummary }
export type ResolveCommand = { readonly kind: "create"; readonly reviewId: number } | { readonly kind: "reject"; readonly reviewId: number } | { readonly kind: "link"; readonly reviewId: number; readonly productId: number };
export interface ResolutionResult { readonly reviewId: number; readonly status: ReviewStatus; readonly productId: number | null; readonly linkId: number | null }
export interface ReviewPage { readonly records: readonly ReviewRecord[]; readonly nextAfterId: number | null }
```

  Guards: `isSellerEntry` / `isRejectedEntry(entry: InputEntry)`, `isLinkDecision` / `isHoldDecision` / `isCreateDecision(decision: MatchDecision)` (all of these are discriminant checks), and `isMatchType` / `isReviewReason` / `isReviewStatus` / `isOutcomeCode(value: unknown): value is X` (membership in the `as const` array).
- [ ] **Step 5: `domain/errors.ts`.** Write spec §4.3 verbatim. Add `export const REVIEW_RESOLUTION_ERROR_CODES = ["review_not_found", "review_not_pending", "product_not_found", "seller_sku_already_linked", "seller_already_linked_to_product", "source_name_unnormalizable"] as const` and derive `ReviewResolutionErrorCode` from it (the web validates `?error=` against it). Each constructor takes `(args: { code; detail: string })`, `message` is `` `${code}: ${detail}` ``, and `this.name` is the class name.
- [ ] **Step 6: `domain/ports.ts`.** Write the spec §4.4 block verbatim (types imported from `models.ts`).
- [ ] **Step 7: `domain/text.ts`** (spec §5.1). `PYTHON_WHITESPACE` is the character class body `\t\n\v\f\r\x1c-\x1f \x85\xa0  -     　` (exactly the 29 code points where Python `str.isspace()` is true, verified 2026-10-06). Exports: `pyStrip(text: string): string`, `pyIsBlank(text: string): boolean`, `pySplitJoin(text: string): string` (split on runs of that class, drop empties, join with `" "`) and `pyLength(text: string): number` (`Array.from(text).length`). Regexes use the `u` flag and never `\s`.
- [ ] **Step 8: `adapters/sqlite-connection.ts`.** `BUSY_TIMEOUT_MS = 5000`. `openConnection(dbPath: string): DatabaseSync`: if `statSync(dbPath, { throwIfNoEntry: false })?.isFile() !== true`, throw `DatabaseFileError({ code: "not_found", detail: \`database file not found: ${dbPath}\` })`. Otherwise call `new DatabaseSync(dbPath, { enableForeignKeyConstraints: true, timeout: BUSY_TIMEOUT_MS })`, then `PRAGMA foreign_keys = ON` and `PRAGMA busy_timeout = 5000`. `readSchemaVersion(db): number` returns 0 when `SchemaVersion` is absent from `sqlite_master`, otherwise `MAX(Version)` (0 when that is null). `requireSchemaVersion(db): void` throws `schema_outdated` with detail `schema version <n> < required 3; run: catalog-consolidation migrate --db <main file from PRAGMA database_list>`. Also export `beginTransaction(db): void` (`db.exec("BEGIN")`) and `isSqliteError(error: unknown): boolean` (an `Error` with `code === "ERR_SQLITE_ERROR"`). `bindText(value: string): string` and `bindOptionalText(value: string | null): string | null` throw `new Error("text parameter is not well-formed UTF-16")` when `!value.isWellFormed()`; this mirrors Python's `UnicodeEncodeError` at bind time. Row narrowing for `node:sqlite`'s null-prototype rows: `type SqliteRow = Readonly<Record<string, unknown>>`, `asRow(value: unknown): SqliteRow`, `readInteger`, `readOptionalInteger`, `readText`, `readOptionalText`, `readOptionalReal(row: SqliteRow, column: string)` (integers via `Number.isInteger`), and `toRowId(value: number | bigint): number` (a safe integer, or throw). On a mismatch these throw `Error(\`unexpected value in column ${column}\`)` and never echo the value.
- [ ] **Step 9: `src/index.ts`.** Partial barrel: `export *` from `./domain/{limits,models,errors,ports,text}.js` and `./adapters/sqlite-connection.js`.
- [ ] **Step 10: Verify.** `pnpm --filter @catalog/core build && pnpm --filter @catalog/core typecheck && pnpm --filter @catalog/core lint` exits 0. Then:

```bash
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { OUTCOME_CODES, pyStrip, pySplitJoin, pyLength, openConnection, readSchemaVersion } from "./packages/core/dist/index.js";
assert.equal(OUTCOME_CODES.length, 8);
assert.equal(pyStrip("\u001c a \u0085"), "a"); assert.equal(pyStrip("﻿a"), "﻿a");
assert.equal(pySplitJoin(" a\u001fb　 c "), "a b c"); assert.equal(pyLength("Ĉamera"), 7); assert.equal(pyLength("\u{1F600}"), 1);
const db = openConnection("data/catalog.db"); assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1); assert.equal(readSchemaVersion(db), 0); db.close();
assert.throws(() => openConnection("out/missing.db"), { code: "not_found" });
console.log("T0 ok");
EOF
```
Expected: `T0 ok`. (Opening `data/catalog.db` only runs PRAGMAs and reads. The checksum guard confirms the file is unchanged.)
- [ ] **Step 11: Checkpoint.** Produced the files listed under **Files**.

### Task T1: Normalization

**Files:** Create `packages/core/src/domain/normalization.ts`

**Interfaces:**
- Consumes: `pySplitJoin` (T0).
- Produces: `normalize(text: string | null): string | null`, `cleanDisplay(text: string | null): string | null`.

- [ ] **Step 1: Implement spec §5.2.** `null` returns `null`. Then `text.normalize("NFKD")`, remove `/\p{M}/gu`, `toLowerCase()`, replace `ß` with `ss`, delete `"`, `'`, U+2019, U+201C, U+201D, replace `/[^0-9a-z]+/gu` with `" "`, apply `pySplitJoin`, and return `null` when the result is empty. `cleanDisplay` = `pySplitJoin`, with blank giving `null`. Module-level regex constants. The docstring explains WHY the order matters (quotes go before the run replacement; NFKD goes before lowercasing; `ß` covers what `casefold` adds).
- [ ] **Step 2: Verify the 16-row reference table** (`tasks.md`) after `pnpm --filter @catalog/core build`:

```bash
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { normalize, cleanDisplay } from "./packages/core/dist/domain/normalization.js";
const table = [["Câmera Canon EOS R6","camera canon eos r6"],["Smart TV Samsung 55\"","smart tv samsung 55"],["Smart TV Samsung  55\"","smart tv samsung 55"],["iPad Pro 12.9''","ipad pro 12 9"],["Levi's","levis"],["Levi’s","levis"],["Levis","levis"],["BLACK+DECKER","black decker"],["Black+Decker","black decker"],["Basketball Spalding  Official","basketball spalding official"],["Rock “N” Roll","rock n roll"],["Straße","strasse"],["TestBrand'; SELECT 1; --","testbrand select 1"],["   ",null],["!!!",null],[null,null]];
for (const [input, expected] of table) assert.equal(normalize(input), expected, String(input));
assert.equal(normalize("STRAẞE"), "strasse");
assert.equal(cleanDisplay("Basketball Spalding  Official "), "Basketball Spalding Official"); assert.equal(cleanDisplay("  "), null);
console.log(`normalization ${table.length}/16 ok`);
EOF
```
Expected: `normalization 16/16 ok`.
- [ ] **Step 3: Scoped typecheck/lint** on `src/domain/normalization.ts` per the protocol.
- [ ] **Step 4: Checkpoint.** `packages/core/src/domain/normalization.ts`.

### Task T2: `difflib.SequenceMatcher` port and matching

**Files:** Create `packages/core/src/domain/sequence-matcher.ts`, `packages/core/src/domain/matching.ts`

**Interfaces:**
- Consumes: `CatalogReader`, `MatchQuery`, `MatchDecision`, `FUZZY_REVIEW_THRESHOLD` (T0).
- Produces: `interface Match { readonly a: number; readonly b: number; readonly size: number }`; `class SequenceMatcher { constructor(a: string, b: string); setSeq1(a: string): void; setSeq2(b: string): void; findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Match; getMatchingBlocks(): readonly Match[]; ratio(): number; quickRatio(): number; realQuickRatio(): number }`; `matchEntry(args: { query: MatchQuery; catalog: CatalogReader }): MatchDecision`.

- [ ] **Step 1: Port CPython 3.12 `difflib.py` with `isjunk=None, autojunk=False`** (spec §5.5). Algorithm outline, kept statement for statement:
  - `setSeq2` / `chainB`: `b2j: Map<string, number[]>` built from ascending indexes of `b`. `bjunk` and `bpopular` are empty `Set`s. Reset the cached `matchingBlocks` and `fullBCount`.
  - `findLongestMatch`: `besti=alo, bestj=blo, bestsize=0, j2len=new Map()`. For each `i` in `[alo, ahi)`: `newj2len = new Map()`. For each `j` in `b2j.get(a[i]) ?? []`: `continue` if `j < blo`, `break` if `j >= bhi`, set `k = (j2len.get(j-1) ?? 0) + 1` in `newj2len`, and if `k > bestsize` set `besti=i-k+1, bestj=j-k+1, bestsize=k`. Then `j2len = newj2len`. After that come CPython's four extension `while` loops (two with `!isBJunk(...)`, two with `isBJunk(...)`), ported verbatim. They never iterate here and stay in for fidelity.
  - `getMatchingBlocks`: explicit stack `queue=[[0,la,0,lb]]`, `pop()` from the end. Push a found block when `k > 0`, then push `[alo,i,blo,j]` if `alo<i && blo<j` and `[i+k,ahi,j+k,bhi]` if `i+k<ahi && j+k<bhi`. Sort lexicographically by `(a,b,size)`, merge adjacent blocks (`i1+k1===i2 && j1+k1===j2`), and append the sentinel `{a:la,b:lb,size:0}`.
  - `ratio` = `calculateRatio(sum of sizes, la+lb)`, where `calculateRatio(m, t) = t ? 2 * m / t : 1`. `quickRatio` uses a multiset `fullBCount` and an `avail` map exactly as CPython does. `realQuickRatio` = `calculateRatio(Math.min(la, lb), la + lb)`.
- [ ] **Step 2: Port `matching.py`.** One candidate gives `link` (`matchType` `"EXACT"` iff `candidate.name === query.rawName`, else `"NORMALIZED"`). More than one gives `hold` AMBIGUOUS, ids sorted with `toSorted((x, y) => x - y)`. Zero runs the fuzzy scan: one `SequenceMatcher(query.normalizedName, "")`, `setSeq2` per candidate, and `continue` when `bestId !== null && (realQuickRatio() < bestRatio || quickRatio() < bestRatio)`. A candidate replaces the best iff `bestId === null || ratio > bestRatio || (ratio === bestRatio && productId < bestId)`. An empty pool gives `create` with `bestScore: null`. `bestRatio >= FUZZY_REVIEW_THRESHOLD` gives `hold` FUZZY with `candidateProductIds: [bestId]`, otherwise `create` with `bestScore: bestRatio`. Imports come from `domain/` only, and not from `normalization`.
- [ ] **Step 3: Verify** after building core:

```bash
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { SequenceMatcher } from "./packages/core/dist/domain/sequence-matcher.js";
import { matchEntry } from "./packages/core/dist/domain/matching.js";
const blocks = (m) => m.getMatchingBlocks().map((x) => [x.a, x.b, x.size]);
const r = new SequenceMatcher("roteador wifi 6 tp link", "router wifi 6 tp link");
assert.equal(r.ratio(), 0.9090909090909091); assert.equal(r.quickRatio(), 0.9090909090909091); assert.equal(r.realQuickRatio(), 0.9545454545454546);
assert.deepEqual(blocks(r), [[0,0,2],[2,3,2],[7,5,16],[23,21,0]]);
const p = new SequenceMatcher("processador amd ryzen 9 7950x", "processor amd ryzen 9 7950x");
assert.equal(p.ratio(), 0.9642857142857143); assert.deepEqual(blocks(p), [[0,0,7],[9,7,20],[29,27,0]]);
const s = new SequenceMatcher("security test product", "night light projector");
assert.equal(s.ratio(), 0.47619047619047616); assert.deepEqual(blocks(s), [[5,1,1],[6,4,1],[8,5,1],[12,10,5],[19,17,2],[21,21,0]]);
assert.equal(new SequenceMatcher("", "").ratio(), 1);
const product = (id, name) => ({ id, name, brand: null, category: null, normalizedName: "router x", normalizedBrand: null });
const reader = (exact, pool) => ({ findByNormalizedName: () => exact, *listBrandCompatible() { yield* pool; } });
const q = (rawName, normalizedName) => ({ rawName, normalizedName, normalizedBrand: null });
assert.deepEqual(matchEntry({ query: q("Router X", "router x"), catalog: reader([product(5, "Router X")], []) }), { kind: "link", productId: 5, matchType: "EXACT" });
assert.deepEqual(matchEntry({ query: q("ROUTER X", "router x"), catalog: reader([product(5, "Router X")], []) }), { kind: "link", productId: 5, matchType: "NORMALIZED" });
assert.deepEqual(matchEntry({ query: q("Router X", "router x"), catalog: reader([product(9, "a"), product(4, "b")], []) }), { kind: "hold", reason: "AMBIGUOUS", candidateProductId: null, score: null, candidateProductIds: [4, 9] });
assert.deepEqual(matchEntry({ query: q("x", "roteador wifi 6 tp link"), catalog: reader([], [{ productId: 21, normalizedName: "router wifi 6 tp link" }]) }), { kind: "hold", reason: "FUZZY", candidateProductId: 21, score: 0.9090909090909091, candidateProductIds: [21] });
assert.deepEqual(matchEntry({ query: q("x", "abcde"), catalog: reader([], [{ productId: 30, normalizedName: "abcdf" }, { productId: 12, normalizedName: "abcdf" }]) }), { kind: "hold", reason: "FUZZY", candidateProductId: 12, score: 0.8, candidateProductIds: [12] });
assert.deepEqual(matchEntry({ query: q("x", "abc"), catalog: reader([], []) }), { kind: "create", bestScore: null });
console.log("difflib + matching ok");
EOF
```
Expected: `difflib + matching ok`. (The values were recorded from Python 3.12 on 2026-10-06.)
- [ ] **Step 4: Scoped typecheck/lint** on both files.
- [ ] **Step 5: Checkpoint.** `sequence-matcher.ts`, `matching.ts`.

### Task T3: Python formatting, report writer, summary

**Files:** Create `packages/core/src/adapters/python-format.ts`, `packages/core/src/adapters/report-writer.ts`

**Interfaces:**
- Consumes: `EntryOutcome`, `RunSummary`, `OUTCOME_CODES`, `REPORT_SCORE_DECIMALS` (T0).
- Produces: `roundHalfEven(value: number, decimals: number): number`, `formatPythonFloat(value: number): string`, `formatFixed(value: number, decimals: number): string`, `pythonPathLabel(text: string): string`, `toReportRecord(outcome: EntryOutcome): string` (one JSON line, no newline), `writeJsonlReport(args: { path: string; outcomes: readonly EntryOutcome[] }): void`, `formatSummary(summary: RunSummary): string` (lines joined with `"\n"`, no trailing newline).

- [ ] **Step 1: `python-format.ts`, exactly spec §5.4.** For `roundHalfEven(x, 4)`: if `Number.isInteger(x * 32) && (x * 32) % 2 !== 0`, it is a tie. Take `k = Math.floor(x * 10000)` and return `(k % 2 === 0 ? k : k + 1) / 10000`. Otherwise return `Number(x.toFixed(4))`. The function supports `decimals === 4` only and throws a `RangeError` for any other value. `formatPythonFloat` returns `String(x)` with `.0` appended when `Number.isInteger(x)`. `formatFixed` returns `roundHalfEven(x, d).toFixed(d)`.
- [ ] **Step 2: `pythonPathLabel` = `str(PurePosixPath(arg))`.** Prefix `//` iff the text starts with exactly two slashes, `/` iff it starts with one or three or more. Split on `/`, drop empty and `.` segments, keep `..`, join with `/`. The result is `prefix + joined`, or `"."` when both are empty. Pinned table (from Python, 2026-10-06): `./data/x.json`→`data/x.json`, `data//x.json`→`data/x.json`, `data/x.json/`→`data/x.json`, `a/./b`→`a/b`, `//a`→`//a`, `///a`→`/a`, `../x`→`../x`, `.`→`.`, `./`→`.`, `a/../b`→`a/../b`, ``→`.`.
- [ ] **Step 3: `report-writer.ts`.** `toReportRecord` builds the frozen key order `index, sellerName, sellerProductId, outcome, productId, reviewReason, score, warnings, errors`. Each key and value goes through `JSON.stringify`, except `score`, which is spliced as `formatPythonFloat(roundHalfEven(score, REPORT_SCORE_DECIMALS))` or `null`. `writeJsonlReport` runs `mkdirSync(dirname, { recursive: true })`, writes `<path>.tmp` with `openSync`/`writeSync`/`fsyncSync`/`closeSync`, then `renameSync`. On any throw it unlinks the temp file and rethrows. `formatSummary` prints the header `run <runId> input=<inputLabel> dry_run=<b> committed=<b> rows_written=<n>`, one line per code in `OUTCOME_CODES` order as `code.padEnd(26) + String(count).padStart(6)` (looked up from `counts`, defaulting to 0), then `TOTAL`.
- [ ] **Step 4: Surrogate guard (Review Focus 5).** Before writing, `writeJsonlReport` throws `new Error("report text is not well-formed UTF-16")` if any string in any record (`sellerName`, `sellerProductId`) fails `isWellFormed()`. No `.tmp` file is created in that case.
- [ ] **Step 5: Verify** after building core:

```bash
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { roundHalfEven, formatPythonFloat, formatFixed, pythonPathLabel } from "./packages/core/dist/adapters/python-format.js";
import { writeJsonlReport, formatSummary } from "./packages/core/dist/adapters/report-writer.js";
for (const [x, y] of [[0.03125,0.0312],[0.09375,0.0938],[0.15625,0.1562],[0.96875,0.9688],[0.47619047619047616,0.4762],[0.9090909090909091,0.9091]]) assert.equal(roundHalfEven(x, 4), y);
assert.deepEqual([formatPythonFloat(1), formatPythonFloat(0), formatPythonFloat(0.4762)], ["1.0", "0.0", "0.4762"]);
assert.deepEqual([formatFixed(0.9090909090909091, 4), formatFixed(1, 4), formatFixed(0, 4)], ["0.9091", "1.0000", "0.0000"]);
const paths = { "./data/x.json":"data/x.json","data//x.json":"data/x.json","data/x.json/":"data/x.json","a/./b":"a/b","//a":"//a","///a":"/a","../x":"../x",".":".","./":".","a/../b":"a/../b","":"." };
for (const [input, expected] of Object.entries(paths)) assert.equal(pythonPathLabel(input), expected, input);
const outcome = { index: 180, sellerName: "MegaStore", sellerProductId: "09835342345-4678-9abc-def012345678", outcome: "CREATED", productId: 976, reviewReason: null, score: 0.47619047619047616, warnings: ["non_uuid_seller_sku"], errors: [] };
writeJsonlReport({ path: "out/t3/r.jsonl", outcomes: [outcome, { ...outcome, index: 181, score: null }] });
const lines = readFileSync("out/t3/r.jsonl", "utf8").split("\n");
assert.equal(lines[0], '{"index":180,"sellerName":"MegaStore","sellerProductId":"09835342345-4678-9abc-def012345678","outcome":"CREATED","productId":976,"reviewReason":null,"score":0.4762,"warnings":["non_uuid_seller_sku"],"errors":[]}');
assert.equal(lines.length, 3); assert.equal(lines[2], ""); assert.ok(!existsSync("out/t3/r.jsonl.tmp"));
assert.throws(() => writeJsonlReport({ path: "out/t3/bad.jsonl", outcomes: [{ ...outcome, sellerName: "a\ud800" }] }));
assert.ok(!existsSync("out/t3/bad.jsonl") && !existsSync("out/t3/bad.jsonl.tmp"));
const counts = ["LINKED_EXACT","LINKED_NORMALIZED","CREATED","UNCHANGED","SKIPPED_DUPLICATE_LISTING","HELD_FOR_REVIEW","REJECTED_INVALID","CONFLICT_SELLER_SKU"].map((c) => [c, c === "CREATED" ? 1 : 0]);
console.log(formatSummary({ runId: "r1", inputLabel: "in.json", total: 3, counts, rowsWritten: 2, dryRun: true, committed: false }));
EOF
```
Expected: no assertion error. The printed text is `run r1 input=in.json dry_run=true committed=false rows_written=2`, then eight count lines in vocabulary order (`CREATED                        1`, the others `0`), then `TOTAL                          3`.
- [ ] **Step 6: Scoped typecheck/lint.** Checkpoint: `python-format.ts`, `report-writer.ts`.

### Task T4: JSON entry reader

**Files:** Create `packages/core/src/adapters/json-entry-reader.ts`

**Interfaces:**
- Consumes: limits, models, `InvalidInputFileError`, `pyStrip`, `pyIsBlank`, `pyLength` (T0).
- Produces: `class JsonEntryReader implements EntrySource { constructor(args: { path: string; maxBytes?: number; maxEntries?: number }); read(): readonly InputEntry[] }`.

- [ ] **Step 1: File level, spec §5.3, in order.** A missing file or a non-regular file (`statSync` error) gives `unreadable`. `size > maxBytes` gives `too_large`. Read at most `maxBytes + 1` bytes (`openSync`/`readSync` loop) and re-check, giving `too_large`. Decode with `new TextDecoder("utf-8", { fatal: true })`; a failure gives `not_utf8`. `JSON.parse` throwing anything gives `not_json`. A result that is not `Array.isArray` gives `not_an_array`. `length > maxEntries` gives `too_many_entries`. Constructor args below zero throw `RangeError`. The detail strings match Python's (`<path>: not a readable file`, `<path>: <n> bytes > limit <m>`, `<path>: top-level value is not a JSON array`, …). They never contain file content.
- [ ] **Step 2: Record level, a port of `_validate_record`.** A value that is not an object gives `RejectedEntry` with `[{field:"record", code:"not_an_object"}]` and no warnings. Field presence uses `Object.hasOwn`. `Id`/`SellerName`/`Name` are checked in this order: missing, then not_a_string, then blank (`pyIsBlank`), then too_long (`pyLength` of the raw value against 64/100/200). `Id` additionally gets `invalid_charset` (`SELLER_PRODUCT_ID_PATTERN`). For `Brand`/`Category`, absent or `null` gives `null`; then not_a_string; then too_long against 100; blank gives `null`. Warning order: `non_uuid_seller_sku` (a valid Id not matching `UUID_PATTERN`), `blank_brand_treated_as_null`, `blank_category_treated_as_null` (only when the field had no violation), `unknown_fields_ignored` (`Object.keys` not a subset of the five). `SellerName` is stored after `pyStrip`, `Name` verbatim. A `RejectedEntry` carries `sellerName`/`sellerProductId` only when that field itself was valid.
- [ ] **Step 3: BOM (Review Focus 4).** Rely on `TextDecoder`'s default `ignoreBOM: false`, which removes exactly one leading U+FEFF. Do not strip again. A doubled BOM reaches `JSON.parse` and gives `not_json`, the same result as Python's `utf-8-sig` + `json.loads`.
- [ ] **Step 4: Verify** after building core:

```bash
mkdir -p out/t4
printf '{}' > out/t4/bad.json
printf '[{"Id":"a b","SellerName":"S","Name":"","Brand":7,"X":1}]' > out/t4/rec.json
printf '\xef\xbb\xbf[]' > out/t4/bom1.json
printf '\xef\xbb\xbf\xef\xbb\xbf[]' > out/t4/bom2.json
printf '[\xff]' > out/t4/notutf8.json
printf '[1,2]' > out/t4/two.json
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { JsonEntryReader } from "./packages/core/dist/adapters/json-entry-reader.js";
const code = (args) => { try { new JsonEntryReader(args).read(); return "ok"; } catch (error) { return error.code; } };
const all = new JsonEntryReader({ path: "data/ProductEntry.json" }).read();
assert.equal(all.length, 269); assert.equal(all.filter((e) => e.kind === "entry").length, 269);
assert.equal(all.filter((e) => e.warnings.includes("non_uuid_seller_sku")).length, 3);
const rec = new JsonEntryReader({ path: "out/t4/rec.json" }).read()[0];
assert.deepEqual(rec.violations, [{ field: "Id", code: "invalid_charset" }, { field: "Name", code: "blank" }, { field: "Brand", code: "not_a_string" }]);
assert.deepEqual(rec.warnings, ["unknown_fields_ignored"]);
assert.deepEqual([code({ path: "out/t4/bad.json" }), code({ path: "out/t4/bom1.json" }), code({ path: "out/t4/bom2.json" }), code({ path: "out/t4/notutf8.json" }), code({ path: "out/t4/missing.json" }), code({ path: "out/t4" }), code({ path: "data/ProductEntry.json", maxBytes: 10 }), code({ path: "out/t4/two.json", maxEntries: 1 })],
  ["not_an_array", "ok", "not_json", "not_utf8", "unreadable", "unreadable", "too_large", "too_many_entries"]);
assert.deepEqual(new JsonEntryReader({ path: "out/t4/two.json" }).read().map((e) => e.violations[0].code), ["not_an_object", "not_an_object"]);
console.log("reader ok");
EOF
```
Expected: `reader ok`. Cross-check against Python: `printf '\xef\xbb\xbf\xef\xbb\xbf[]' > out/t4/bom2.json && .venv/bin/python -c "from pathlib import Path; from catalog_consolidation.adapters.json_entry_reader import JsonEntryReader; JsonEntryReader(path=Path('out/t4/bom2.json')).read()"` fails with `not_json`.
- [ ] **Step 5: Scoped typecheck/lint.** Checkpoint: `json-entry-reader.ts`.

### Task T5: SQLite repositories and units of work

**Files:** Create `packages/core/src/adapters/sqlite-catalog-repository.ts`, `packages/core/src/adapters/sqlite-review-repository.ts`

**Interfaces:**
- Consumes: ports, models, limits, `bindText`, `bindOptionalText`, row readers, `toRowId`, `beginTransaction` (T0).
- Produces: `class SqliteCatalogRepository implements CatalogRepository { constructor(args: { connection: DatabaseSync }) }`, `class SqliteUnitOfWork implements UnitOfWork { constructor(args: { connection: DatabaseSync }) }`, `class SqliteReviewRepository implements ReviewRepository { constructor(args: { connection: DatabaseSync }) }`, `class SqliteReviewUnitOfWork implements ReviewUnitOfWork { constructor(args: { connection: DatabaseSync }) }`.

- [ ] **Step 1: Catalog repository.** Copy the `tasks.md` § "SQL — repository statements" verbatim. Statements are prepared once in the constructor. `listBrandCompatible` is a generator: it runs keyset batches of `FUZZY_SCAN_BATCH_SIZE` and stops when a batch is shorter than the limit. `findByNormalizedName` passes `MAX_EXACT_CANDIDATES`. `insert*` return `toRowId(result.lastInsertRowid)`. `MatchType`/`ReviewReason`/`ReviewStatus` column values are checked with the T0 guards, and an unexpected value throws. No commit or rollback inside a repository.
- [ ] **Step 2: Review repository.** Copy the SQL of `src/catalog_consolidation/adapters/sqlite_review_repository.py` as plain literals with the column list inlined: `SELECT Id, SellerName, SellerProductId, CandidateProductId, Score, Reason, Status, SourceName, SourceBrand, SourceCategory FROM ProductMatchReview WHERE Status = ? AND Id > ? ORDER BY Id LIMIT ?`, the same statement with `WHERE Id = ?`, `SELECT 1 FROM Product WHERE Id = ?`, and `UPDATE ProductMatchReview SET Status = ? WHERE Id = ? AND Status = ?` (`changes === 1` gives `true`). `listByStatus` throws `RangeError` unless `1 <= limit <= REVIEW_PAGE_MAX_LIMIT + 1`.
- [ ] **Step 3: Units of work.** Both constructors call `beginTransaction`. `SqliteUnitOfWork` records `SELECT total_changes() AS n` right after `BEGIN`, and `rowsWritten()` returns the current value minus that baseline. `commit()` / `rollback()` run `COMMIT` / `ROLLBACK` only when `connection.isTransaction` is true. Otherwise they are no-ops, matching Python, where `node:sqlite` would throw "cannot rollback - no transaction is active".
- [ ] **Step 4: Bind guard (Review Focus 5).** Every string parameter (seller name, SKU, source fields, names, brands, statuses) goes through `bindText` / `bindOptionalText`.
- [ ] **Step 5: Verify** after building core, on a schema built by the sqlite3 CLI (the runner arrives in T7):

```bash
mkdir -p out && rm -f out/t5.db && cp data/catalog.db out/t5.db
cat migrations/0001_seller_product_text_id.sql migrations/0002_product_match_keys.sql migrations/0003_review_queue.sql | sqlite3 out/t5.db
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { openConnection, isSqliteError, bindText } from "./packages/core/dist/adapters/sqlite-connection.js";
import { SqliteUnitOfWork } from "./packages/core/dist/adapters/sqlite-catalog-repository.js";
import { SqliteReviewUnitOfWork } from "./packages/core/dist/adapters/sqlite-review-repository.js";
const db = openConnection("out/t5.db");
const uow = new SqliteUnitOfWork({ connection: db });
const productId = uow.catalog.insertProduct({ name: "N", brand: null, category: null, normalizedName: "n", normalizedBrand: null });
assert.equal(productId, 976);
const link = { sellerName: "S", sellerProductId: "sku-1", productId, sourceName: "N", sourceBrand: null, sourceCategory: null, matchType: "CREATED" };
assert.equal(uow.catalog.insertLink(link), 1);
uow.catalog.enqueueReview({ sellerName: "S", sellerProductId: "sku-2", sourceName: "N", sourceBrand: null, sourceCategory: null, candidateProductId: productId, score: 0.9, reason: "FUZZY" });
assert.equal(uow.rowsWritten(), 3);
assert.deepEqual(uow.catalog.findLinkBySku({ sellerName: "S", sellerProductId: "sku-1" }), { id: 1, sellerName: "S", sellerProductId: "sku-1", productId: 976, matchType: "CREATED" });
assert.equal(uow.catalog.findReviewBySku({ sellerName: "S", sellerProductId: "sku-2" }).status, "PENDING");
assert.throws(() => uow.catalog.insertLink(link), (error) => isSqliteError(error));
assert.equal(uow.catalog.listProductsMissingMatchKeys({ afterId: 0, limit: 500 }).length, 500);
uow.catalog.setMatchKeys({ productId: 1, normalizedName: "x", normalizedBrand: null });
assert.equal([...uow.catalog.listBrandCompatible({ normalizedBrand: "anything" })].length, 2);
uow.rollback(); uow.rollback();
assert.deepEqual({ ...db.prepare("SELECT (SELECT COUNT(*) FROM Product) AS p, (SELECT COUNT(*) FROM SellerProduct) AS s, (SELECT COUNT(*) FROM ProductMatchReview) AS r").get() }, { p: 975, s: 0, r: 0 });
assert.throws(() => bindText("a\ud800"));
const reviews = new SqliteReviewUnitOfWork({ connection: db });
assert.equal(reviews.reviews.productExists({ productId: 1 }), true); assert.equal(reviews.reviews.get({ reviewId: 1 }), null);
reviews.rollback(); db.close();
console.log("repositories ok");
EOF
```
Expected: `repositories ok`. (`listBrandCompatible` with brand `anything` yields products 1 and 976, the two with keys and `NULL` brand, before rollback.)
- [ ] **Step 6: Scoped typecheck/lint.** Checkpoint: both files.

### Task T6: CLI arguments, logging, exit codes

**Files:** Create `apps/cli/src/arguments.ts`, `apps/cli/src/logging.ts`, `apps/cli/src/exit-codes.ts`

**Interfaces:**
- Consumes: `REVIEW_STATUSES`, `ReviewStatus`, `ResolveCommand`, `REVIEW_PAGE_DEFAULT_LIMIT`, `REVIEW_PAGE_MAX_LIMIT`, `isReviewStatus` from `@catalog/core` (T0 barrel).
- Produces:
  - `exit-codes.ts`: `EXIT_OK = 0`, `EXIT_FAILURE = 1`, `EXIT_INVALID_INPUT = 2`, `type ExitCode = 0 | 1 | 2`.
  - `logging.ts`: `newCorrelationId(): string` (`randomUUID().replaceAll("-", "")`), `startTimer(): number` (`performance.now()`), `elapsedMs(startedAt: number): number` (`Math.round`), `logEvent(args: { level: "info" | "error"; event: string; fields: Readonly<Record<string, unknown>> }): void`. The last one writes one line `JSON.stringify({ timestamp: new Date().toISOString(), level, service: "catalog_consolidation", event, ...fields })` to stderr.
  - `arguments.ts`: `parseCommandLine(argv: readonly string[]): ParsedCommand`, where `ParsedCommand = { kind: "help"; text: string } | { kind: "usage-error"; usage: string; message: string } | { kind: "migrate"; db: string } | { kind: "consolidate"; db: string; input: string; report: string | null; dryRun: boolean } | { kind: "review-list"; db: string; status: ReviewStatus; limit: number; afterId: number } | { kind: "review-resolve"; db: string; command: ResolveCommand }`.

- [ ] **Step 1: `arguments.ts`.** Dispatch on the leading positionals (`migrate`, `consolidate`, `review list`, `review resolve`), then run `node:util` `parseArgs({ args, options, strict: true, allowPositionals: false })` per command, catching its throw and returning a `usage-error`. Flags are exactly the README Commands section: `--db`, `--input`, `--report`, `--dry-run`, `--status`, `--limit`, `--after-id`, `--id`, `--create`, `--reject`, `--link`, and `-h/--help` at every level. Integer flags accept `/^\s*[+-]?[0-9]+\s*$/` (Python `int()` minus underscores and non-ASCII digits). Ranges: `--limit` 1..100, `--after-id` >= 0, `--id` >= 1, `--link` >= 1. `--status` must be in `REVIEW_STATUSES` (default `PENDING`). `--create|--reject|--link` are mutually exclusive, and exactly one is required. Usage lines use the bin name `catalog-consolidation` (Q6), e.g. `usage: catalog-consolidation consolidate [-h] --db PATH --input PATH [--report PATH] [--dry-run]`. Help text reuses the Python help strings from `cli.py` / `cli_review.py` verbatim.
- [ ] **Step 2: Verify** after `pnpm --filter @catalog/cli build`:

```bash
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { parseCommandLine as p } from "./apps/cli/dist/arguments.js";
assert.deepEqual(p(["consolidate", "--db", "a.db", "--input", "in.json"]), { kind: "consolidate", db: "a.db", input: "in.json", report: null, dryRun: false });
assert.deepEqual(p(["review", "list", "--db", "a.db"]), { kind: "review-list", db: "a.db", status: "PENDING", limit: 20, afterId: 0 });
assert.deepEqual(p(["review", "resolve", "--db", "a.db", "--id", "1", "--link", "21"]).command, { kind: "link", reviewId: 1, productId: 21 });
for (const argv of [["review","list","--db","a","--limit","0"],["review","list","--db","a","--limit","101"],["review","resolve","--db","a","--id","1","--create","--reject"],["review","resolve","--db","a","--id","1"],["consolidate","--input","x"],["migrate","--db","a","--bogus"],["nope"],[]])
  assert.equal(p(argv).kind, "usage-error", argv.join(" "));
assert.equal(p(["--help"]).kind, "help"); assert.equal(p(["review", "resolve", "-h"]).kind, "help");
console.log("arguments ok");
EOF
```
Expected: `arguments ok`. Then `pnpm --filter @catalog/cli typecheck && pnpm --filter @catalog/cli exec eslint src/arguments.ts src/logging.ts src/exit-codes.ts` exits 0.
- [ ] **Step 3: Checkpoint.** The three files.

### Task T7: Migration runner and match-key backfill

**Files:** Create `packages/core/src/adapters/sqlite-migrations.ts`

**Interfaces:**
- Consumes: `normalize` (T1), `readSchemaVersion`, `beginTransaction`, row readers (T0), `MigrationError`, `BACKFILL_BATCH_SIZE`.
- Produces: `interface MigrationFile { readonly version: number; readonly name: string; readonly path: string; readonly checksum: string }`, `interface AppliedMigration { readonly version: number; readonly name: string; readonly backfilledRows: number | null }`, `interface MigrationReport { readonly backupPath: string | null; readonly applied: readonly AppliedMigration[]; readonly schemaVersion: number }`, `defaultMigrationsDir(): string`, `class SqliteMigrationRunner { constructor(args: { connection: DatabaseSync; dbPath: string; migrationsDir: string }); pending(): readonly MigrationFile[]; applyPending(): Promise<MigrationReport> }`.

- [ ] **Step 1: Port `sqlite_migrations.py`** with the spec §4.6 values. Discovery uses `^(\d{4})_([a-z0-9_]+)\.sql$` (no match gives `invalid_filename`). Versions must be contiguous from 1 (a gap or an empty or missing directory gives `version_gap`). The checksum is `createHash("sha256")` hex of the bytes. Applied checksums are verified (`checksum_mismatch`, or `version_gap` for an applied version with no file). Before applying anything, the runner re-reads the file and re-verifies its checksum (`checksum_mismatch`).
- [ ] **Step 2: Backup and apply.** `applyPending` is `async`, because `node:sqlite`'s `backup()` returns a Promise (verified 2026-10-06). With nothing pending it returns `{ backupPath: null, applied: [], schemaVersion }`. Otherwise the backup path is `path.join(dirname(dbPath), \`${basename(dbPath)}.pre-migrate-${stamp}.bak\`)` with stamp = UTC `yyyymmddThhmmssZ`. If that file exists, throw `Error("refusing to overwrite existing backup: <path>")`. Then `await backup(connection, backupPath)`. Each migration runs in its own `BEGIN` … `COMMIT`: `CREATE TABLE IF NOT EXISTS SchemaVersion` (the frozen DDL), the `SellerProduct` count before and after for version 1 (`rows_lost` on a mismatch), `exec(script)`, a backfill for version 2 (keyset `SELECT Id, Name, Brand FROM Product WHERE Id > ? ORDER BY Id LIMIT ?` with `BACKFILL_BATCH_SIZE`, one `UPDATE Product SET NormalizedName = ?, NormalizedBrand = ? WHERE Id = ?` per row, counting every row), `INSERT INTO SchemaVersion (Version, Name, Checksum) VALUES (?, ?, ?)`, `COMMIT`. Any throw triggers `ROLLBACK` (if `isTransaction`) and a rethrow.
- [ ] **Step 3: `defaultMigrationsDir()`.** It returns `process.env.CATALOG_MIGRATIONS_DIR` when that is set and non-empty, otherwise `fileURLToPath(new URL("../../../../migrations/", import.meta.url))`, resolved from `packages/core/dist/adapters/`. This module and the web's `lib/config.ts` are the only places that read `process.env`.
- [ ] **Step 4: Verify** after building core:

```bash
rm -f out/t7*.db out/t7*.bak && cp data/catalog.db out/t7.db && cp data/catalog.db out/t7-py.db
node --input-type=module <<'EOF'
import { openConnection } from "./packages/core/dist/adapters/sqlite-connection.js";
import { SqliteMigrationRunner, defaultMigrationsDir } from "./packages/core/dist/adapters/sqlite-migrations.js";
for (const round of [1, 2]) { const db = openConnection("out/t7.db"); try { console.log(round, JSON.stringify(await new SqliteMigrationRunner({ connection: db, dbPath: "out/t7.db", migrationsDir: defaultMigrationsDir() }).applyPending())); } finally { db.close(); } }
EOF
.venv/bin/python -m catalog_consolidation migrate --db out/t7-py.db > /dev/null
for q in "SELECT Version, Name, Checksum FROM SchemaVersion ORDER BY Version" "SELECT Id, NormalizedName, NormalizedBrand FROM Product ORDER BY Id"; do diff <(sqlite3 out/t7.db "$q") <(sqlite3 out/t7-py.db "$q") && echo "same: $q"; done
sqlite3 out/t7.db "SELECT COUNT(*) FROM Product WHERE NormalizedName IS NOT NULL; SELECT NormalizedName || '|' || NormalizedBrand FROM Product WHERE Id = 661;"
CATALOG_MIGRATIONS_DIR=/nonexistent node --input-type=module -e 'import { defaultMigrationsDir } from "./packages/core/dist/adapters/sqlite-migrations.js"; console.log(defaultMigrationsDir())'
```
Expected: round 1 prints three applied entries `{"version":1,…,"backfilledRows":null}`, `{"version":2,"name":"product_match_keys","backfilledRows":975}`, `{"version":3,…}`, `"schemaVersion":3`, and a `backupPath` matching `out/t7.db.pre-migrate-\d{8}T\d{6}Z.bak` that exists. Round 2 prints `{"backupPath":null,"applied":[],"schemaVersion":3}`. Both `same:` lines print, then `975`, `grass trimmer string|black decker`, `/nonexistent`.
- [ ] **Step 5: Scoped typecheck/lint.** Checkpoint: `sqlite-migrations.ts`.

### Task T8: Use case — consolidate a file

**Files:** Create `packages/core/src/use-cases/consolidate-file.ts`

**Interfaces:**
- Consumes: `normalize`, `cleanDisplay` (T1); `matchEntry` (T2); ports and models (T0). For verification only: `JsonEntryReader` (T4), `SqliteUnitOfWork` (T5), `writeJsonlReport`, `formatSummary`, `pythonPathLabel` (T3).
- Produces: `class ConsolidateFile { constructor(args: { unitOfWork: UnitOfWork; entrySource: EntrySource; inputLabel: string; runId: string }); execute(args: { dryRun: boolean }): ConsolidationResult }`.

- [ ] **Step 1: Translate `consolidate_file.py` statement for statement** (frozen algorithm in `tasks.md`, spec §4.5). `read()` runs before the `try`. Inside the `try`: heal match keys (keyset, a batch shorter than `BACKFILL_BATCH_SIZE` ends the loop, `setMatchKeys` only when `normalize(name) !== null`), the per-entry loop in file order, then `rowsWritten()`, and `commit()` unless `dryRun`. On any throw, `rollback()` and rethrow. After the `try`, `rollback()` when `dryRun`. Error strings are `<code>:<field>`, plus `unnormalizable:Name`. The extra warnings `ambiguous_candidates` and `review_previously_rejected` are appended after the entry's own warnings. `counts` lists every code in `OUTCOME_CODES` order, zeros included. Imports: `domain/*` only (no adapters, no `node:sqlite`).
- [ ] **Step 2: Verify against the baseline and against Python's report bytes** after building core:

```bash
rm -f out/t8*.db* out/t8*.jsonl && for n in t8 t8-py t8-dry; do cp data/catalog.db out/$n.db && .venv/bin/python -m catalog_consolidation migrate --db out/$n.db > /dev/null; done
.venv/bin/python -m catalog_consolidation consolidate --db out/t8-py.db --input data/ProductEntry.json --report out/t8-py.jsonl > /dev/null
node --input-type=module <<'EOF'
import { openConnection, requireSchemaVersion } from "./packages/core/dist/adapters/sqlite-connection.js";
import { SqliteUnitOfWork } from "./packages/core/dist/adapters/sqlite-catalog-repository.js";
import { JsonEntryReader } from "./packages/core/dist/adapters/json-entry-reader.js";
import { writeJsonlReport, formatSummary } from "./packages/core/dist/adapters/report-writer.js";
import { pythonPathLabel } from "./packages/core/dist/adapters/python-format.js";
import { ConsolidateFile } from "./packages/core/dist/use-cases/consolidate-file.js";
const run = (db, dryRun, report) => { const c = openConnection(db); try { requireSchemaVersion(c);
  const r = new ConsolidateFile({ unitOfWork: new SqliteUnitOfWork({ connection: c }), entrySource: new JsonEntryReader({ path: "data/ProductEntry.json" }), inputLabel: pythonPathLabel("data/ProductEntry.json"), runId: "r" }).execute({ dryRun });
  if (report) writeJsonlReport({ path: report, outcomes: r.outcomes }); console.log(formatSummary(r.summary)); } finally { c.close(); } };
run("out/t8.db", false, "out/t8.jsonl"); run("out/t8.db", false, null); run("out/t8-dry.db", true, null);
EOF
diff out/t8.jsonl out/t8-py.jsonl && echo "report identical"
sqlite3 out/t8.db "SELECT COUNT(*) FROM Product; SELECT COUNT(*) FROM SellerProduct; SELECT COUNT(*) FROM ProductMatchReview;"
sqlite3 out/t8-dry.db "SELECT COUNT(*) FROM Product; SELECT COUNT(*) FROM SellerProduct; SELECT COUNT(*) FROM ProductMatchReview;"
```
Expected. Run 1: `committed=true rows_written=258` with counts 200/54/1/1/11/2/0/0 and TOTAL 269. Run 2: `rows_written=0` with UNCHANGED 256, SKIPPED_DUPLICATE_LISTING 11, HELD_FOR_REVIEW 2. Dry run: `dry_run=true committed=false rows_written=258` with baseline counts. Then `report identical`, `976 255 2`, and `975 0 0`.
- [ ] **Step 3: Scoped typecheck/lint;** `grep -nE "node:sqlite|adapters/" packages/core/src/use-cases/consolidate-file.ts` prints nothing. Checkpoint: `consolidate-file.ts`.

### Task T9: Use cases — list and resolve reviews

**Files:** Create `packages/core/src/use-cases/resolve-review.ts`

**Interfaces:**
- Consumes: `normalize`, `cleanDisplay` (T1); `ReviewUnitOfWork`, `ResolveCommand`, `ResolutionResult`, `ReviewPage`, `ReviewResolutionError`, `REVIEW_PAGE_MAX_LIMIT` (T0). For verification only: `SqliteReviewUnitOfWork` (T5).
- Produces: `class ListReviews { constructor(args: { unitOfWork: ReviewUnitOfWork }); execute(args: { status: ReviewStatus; afterId: number; limit: number }): ReviewPage }`, `class ResolveReview { constructor(args: { unitOfWork: ReviewUnitOfWork }); execute(command: ResolveCommand): ResolutionResult }`.

- [ ] **Step 1: Translate `resolve_review.py` statement for statement.** `ListReviews` throws `RangeError` outside 1..100, fetches `limit + 1` rows, calls `rollback()` in `finally`, and sets `nextAfterId` to the id of the last row on the page when more rows exist. `ResolveReview` follows the spec §4.5 order: pending check, then reject; or sku-unlinked, then create; or product-exists, then seller-not-on-product, then link with `MatchType "REVIEWED"`; then the conditional status transition (`review_not_pending` when 0 rows moved). On success it commits; on any throw it rolls back and rethrows. Detail strings are copied from Python and contain ids and statuses only.
- [ ] **Step 2: Verify** after building core:

```bash
rm -f out/t9*.db* && for n in t9 t9-create; do cp data/catalog.db out/$n.db && .venv/bin/python -m catalog_consolidation migrate --db out/$n.db > /dev/null && .venv/bin/python -m catalog_consolidation consolidate --db out/$n.db --input data/ProductEntry.json > /dev/null; done
node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { openConnection } from "./packages/core/dist/adapters/sqlite-connection.js";
import { SqliteReviewUnitOfWork } from "./packages/core/dist/adapters/sqlite-review-repository.js";
import { ListReviews, ResolveReview } from "./packages/core/dist/use-cases/resolve-review.js";
const withDb = (path, fn) => { const db = openConnection(path); try { return fn(() => new SqliteReviewUnitOfWork({ connection: db })); } finally { db.close(); } };
const fail = (fn) => { try { fn(); return "ok"; } catch (error) { return error.code; } };
withDb("out/t9.db", (uow) => {
  const page = new ListReviews({ unitOfWork: uow() }).execute({ status: "PENDING", afterId: 0, limit: 20 });
  assert.deepEqual(page.records.map((r) => [r.item.id, r.item.candidateProductId, r.sourceName]), [[1, 21, "Roteador WiFi 6 TP-Link"], [2, 28, "Processador AMD Ryzen 9 7950X"]]);
  assert.equal(page.nextAfterId, null);
  assert.equal(new ListReviews({ unitOfWork: uow() }).execute({ status: "PENDING", afterId: 0, limit: 1 }).nextAfterId, 1);
  assert.deepEqual(new ResolveReview({ unitOfWork: uow() }).execute({ kind: "link", reviewId: 1, productId: 21 }), { reviewId: 1, status: "LINKED", productId: 21, linkId: 256 });
  assert.equal(fail(() => new ResolveReview({ unitOfWork: uow() }).execute({ kind: "reject", reviewId: 1 })), "review_not_pending");
  assert.equal(fail(() => new ResolveReview({ unitOfWork: uow() }).execute({ kind: "reject", reviewId: 999 })), "review_not_found");
  assert.equal(fail(() => new ResolveReview({ unitOfWork: uow() }).execute({ kind: "link", reviewId: 2, productId: 99999 })), "product_not_found");
  assert.deepEqual(new ResolveReview({ unitOfWork: uow() }).execute({ kind: "reject", reviewId: 2 }), { reviewId: 2, status: "REJECTED", productId: null, linkId: null });
});
withDb("out/t9-create.db", (uow) => assert.deepEqual(new ResolveReview({ unitOfWork: uow() }).execute({ kind: "create", reviewId: 2 }), { reviewId: 2, status: "CREATED", productId: 977, linkId: 256 }));
console.log("reviews ok");
EOF
```
Expected: `reviews ok`.
- [ ] **Step 3: Scoped typecheck/lint.** Checkpoint: `resolve-review.ts`.

### Task T10: Parity check script

**Files:** Create `scripts/parity-check.sh` (mode `0755`)

**Interfaces:**
- Consumes: the CLI surface (spec §5.4, §7) and the Python CLI `.venv/bin/python -m catalog_consolidation`.
- Produces: `scripts/parity-check.sh` (full check, exit 0 when green) and `scripts/parity-check.sh dump <db>` (the three table dumps as JSON on stdout, reused by the web acceptance). It also honors `PARITY_TS_CLI` (default `node apps/cli/dist/main.js`; read only in this script) so the script can test itself.

- [ ] **Step 1: Write the script, spec §5.7 steps 1–9 in order.** It starts with `#!/usr/bin/env bash` and `set -euo pipefail`, then `cd "$(dirname "$0")/.."`. Helpers: `py()` (`.venv/bin/python -m catalog_consolidation "$@"`), `ts()` (`$PARITY_TS_CLI "$@"`; never `pnpm cli`, whose banner lines go to stdout), `normalize_run()` (`sed -E '1s/^run [0-9a-f]{32} /run <run> /'`), `same <a> <b> <label>` (`diff -u`; on difference print `parity: FAIL <label>` and exit 1), `expect_exit <code> <label> <cmd...>`, and `dump <db>` running one `sqlite3 -json` call per select and printing `[]` when the call prints nothing (sqlite3 emits no output for zero rows), with exactly these three selects:
  - `SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product ORDER BY Id`
  - `SELECT Id, SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType FROM SellerProduct ORDER BY Id`
  - `SELECT Id, SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, CandidateProductId, Score, Reason, Status FROM ProductMatchReview ORDER BY Id`
- [ ] **Step 2: Expected values hard-coded in the script.** Step 3 compares against this baseline, embedded as a heredoc:

```
run <run> input=data/ProductEntry.json dry_run=false committed=true rows_written=258
LINKED_EXACT                 200
LINKED_NORMALIZED             54
CREATED                        1
UNCHANGED                      1
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                2
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
```

  Other expected values: report `wc -l` = 269; row counts 976/255/2 (`jq length`); step 6 `rows_written=0`, UNCHANGED 256, SKIPPED_DUPLICATE_LISTING 11, HELD_FOR_REVIEW 2; step 7 on fresh `py-dry.db`/`ts-dry.db`: baseline counts, `committed=false`, 975/0/0. Step 8 runs after the step-6 re-dump: `bad.json` gives exit 2 on both; an unmigrated copy `unmigrated-{py,ts}.db` gives exit 2 on both; `review resolve --id 999 --reject` gives exit 2 on both with dumps unchanged. Step 9: `review list` stdout identical; `review resolve --id 1 --link 21` prints `review 1 -> LINKED product=21 link=256` on both; `review resolve --id 2 --reject`; `consolidate --report out/parity/{py,ts}-review.jsonl` with identical stdout, UNCHANGED 257 and HELD_FOR_REVIEW 1; the two reports are identical, each with `grep -c review_previously_rejected` = 1; dumps identical. The last line is `parity: OK (9/9 steps)`.
- [ ] **Step 3: Verify** (the TS CLI does not exist yet, so the script is tested Python against Python):

```bash
bash -n scripts/parity-check.sh && echo syntax-ok
PARITY_TS_CLI=".venv/bin/python -m catalog_consolidation" scripts/parity-check.sh; echo "exit=$?"
scripts/parity-check.sh dump out/parity/py.db | jq -s 'map(length)'
```
Expected: `syntax-ok`, the last script line `parity: OK (9/9 steps)`, `exit=0`, `[976,256,2]` (after step 9 one more link exists).
- [ ] **Step 4: Checkpoint.** `scripts/parity-check.sh`.

### Task T11: CLI composition root

**Files:** Create `apps/cli/src/main.ts`, `apps/cli/src/commands/migrate.ts`, `apps/cli/src/commands/consolidate.ts`, `apps/cli/src/commands/review.ts`

**Interfaces:**
- Consumes: the full `@catalog/core` barrel (after B2); `parseCommandLine`, `logEvent`, `newCorrelationId`, `startTimer`, `elapsedMs`, exit codes (T6).
- Produces: `main(argv: readonly string[]): Promise<ExitCode>`; `runMigrate(args: { db: string }): Promise<Readonly<Record<string, unknown>>>`; `runConsolidate(args: { db: string; input: string; report: string | null; dryRun: boolean; runId: string }): Readonly<Record<string, unknown>>`; `runReviewList(...)` / `runReviewResolve(...)` returning log fields. `main.ts` starts with `#!/usr/bin/env node` and ends with `process.exitCode = await main(process.argv.slice(2))`.

- [ ] **Step 1: Commands** (port `cli.py` / `cli_review.py`). Every command opens with `openConnection` and closes in `finally`; closing discards an open `BEGIN`. `migrate` prints `backup: <path>`, `applied NNNN <name>` (with the `(backfilled <n> products)` suffix on version 2), and `schema version: <n>` (with ` (up to date)` when nothing was applied), and returns `{ schemaVersion, appliedCount }`. `consolidate` runs `requireSchemaVersion`, then `ConsolidateFile` with `inputLabel: pythonPathLabel(input)` and `runId` = correlation id. It writes the report after the connection is closed (when `--report` is given), prints `formatSummary`, and returns `{ dryRun, committed, rowsWritten, total, counts: Object.fromEntries(counts) }`. `review list` prints the tab-separated header `Id SellerName SellerProductId Reason Score CandidateProductId SourceName`. Score is `formatFixed(score, 4)` or empty, candidate is empty when null, and `cleanDisplay(...) ?? ""` is applied to SellerName and SourceName. When more rows exist the page ends with `next: --after-id <id>`. It returns `{ status, rows, hasMore }`. `review resolve` prints `review <id> -> <STATUS>`, plus ` product=<p> link=<l>` when a product is involved, and returns `{ reviewId, status, productId, linkId }`.
- [ ] **Step 2: `main.ts` error mapping** (spec §7; stderr is `error: <message>` then one JSON log line `{ correlationId, errorType: error.name, durationMs }` on event `<event>.failed`). Events: `migrate`, `consolidate`, `review.list`, `review.resolve`. Success logs `<event>.finished` with `{ correlationId, durationMs, ...fields }`.

| Error | Exit | stderr message (migrate/consolidate) | stderr message (review) |
|---|---|---|---|
| `usage-error` | 2 | `usage: …` then `catalog-consolidation: error: <message>` (no log line) | same |
| `help` | 0 | help text on stdout | same |
| `InvalidInputFileError` | 2 | `invalid input file: <message>` | — |
| `DatabaseFileError` | 2 | `database: <message>` | `<message>` |
| `ReviewResolutionError` | 2 | — | `<message>` |
| `MigrationError` | 1 | `migration failed: <message>` | — |
| `isSqliteError` | 1 | `database failure (correlationId=<id>)` | same |
| anything else | 1 | `unexpected failure (correlationId=<id>)` | same |

- [ ] **Step 3: Verify the demo on a copy** after `pnpm -r --filter @catalog/core --filter @catalog/cli build`:

```bash
rm -rf out/t11 && mkdir -p out/t11 && cp data/catalog.db out/t11/catalog.db && cp data/catalog.db out/t11/raw.db
C="node apps/cli/dist/main.js"
$C migrate --db out/t11/catalog.db; $C migrate --db out/t11/catalog.db
$C consolidate --db out/t11/catalog.db --input ./data//ProductEntry.json --report out/t11/report.jsonl; echo "exit=$?"
$C consolidate --db out/t11/catalog.db --input data/ProductEntry.json 2>/dev/null | sed -n '1p;5p;6p;7p'
printf '{}' > out/t11/bad.json; $C consolidate --db out/t11/catalog.db --input out/t11/bad.json; echo "exit=$?"
$C consolidate --db out/t11/raw.db --input data/ProductEntry.json; echo "exit=$?"
$C review list --db out/t11/catalog.db 2>/dev/null
$C review resolve --db out/t11/catalog.db --id 999 --reject; echo "exit=$?"
$C --help > /dev/null; echo "exit=$?"; $C review list --db x --limit 0; echo "exit=$?"
```
Expected. The first migrate prints `backup: out/t11/catalog.db.pre-migrate-<stamp>.bak`, `applied 0001 seller_product_text_id`, `applied 0002 product_match_keys (backfilled 975 products)`, `applied 0003 review_queue`, `schema version: 3`. The second prints `schema version: 3 (up to date)`. The first consolidate prints the baseline header `run <32 hex> input=data/ProductEntry.json dry_run=false committed=true rows_written=258` (the label is normalized from `./data//…`), baseline counts, and `exit=0`. The re-run shows `rows_written=0`, `UNCHANGED                    256`, `SKIPPED_DUPLICATE_LISTING     11`, `HELD_FOR_REVIEW                2`. `bad.json` gives `error: invalid input file: not_an_array: out/t11/bad.json: top-level value is not a JSON array` and `exit=2`. The unmigrated copy gives `error: database: schema_outdated: schema version 0 < required 3; run: catalog-consolidation migrate --db …` and `exit=2`. `review list` prints the header plus rows `1 FootwearHub … FUZZY 0.9091 21 Roteador WiFi 6 TP-Link` and `2 SuperMart … FUZZY 0.9643 28 Processador AMD Ryzen 9 7950X`. The missing review gives `error: review_not_found: review 999 does not exist` and `exit=2`. Help gives `exit=0`. The bad limit prints usage and `exit=2`. Each non-usage command writes exactly one JSON log line on stderr.
- [ ] **Step 4: Run `scripts/parity-check.sh`.** Expected: `parity: OK (9/9 steps)`, exit 0. On red, fix only files you own. A difference in a core module goes under `### Out of scope` naming the step and diff.
- [ ] **Step 5: Package checks.** `pnpm --filter @catalog/cli typecheck && pnpm --filter @catalog/cli lint` exits 0. Checkpoint: the four files.

---

# Phase 2 — parity gate (orchestrator, after wave 3)

```bash
cd <repo>
pnpm -r --filter @catalog/core --filter @catalog/cli build && pnpm -r lint && pnpm -r typecheck
scripts/parity-check.sh; echo "exit=$?"
shasum -a 256 data/catalog.db data/ProductEntry.json
```
Expected: exit 0 everywhere, the final script line `parity: OK (9/9 steps)`, and the two recorded checksums. On red there is a bounded repair loop (`registries/policy.json` `repair`). Route the failing step's diff to the owning task's agent (normalization keys to T1, fuzzy scores to T2, report bytes or labels to T3, outcomes or counts to T8, review steps to T9/T11). That allows 2 fix attempts per check and then one escalation to `fable`. If it is still red, stop and report red with the diff. **Phase 3 does not start until this gate is green.** A handoff is written here.

# Phase 3 — web app

### Task T12: Web foundation (Q3 spike first)

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs,eslint.config.mjs,.env.example}`, `apps/web/src/instrumentation.ts`, `apps/web/src/app/{layout.tsx,error.tsx,not-found.tsx,globals.css}`, `apps/web/src/lib/{config.ts,catalog-db.ts,search-params.ts}`, `apps/web/src/components/Pagination.tsx`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Consumes: the full `@catalog/core` barrel.
- Produces (T13 and T14 code against these):
  - `config.ts`: `interface CatalogConfig { readonly dbPath: string }`, `getCatalogConfig(): CatalogConfig` (memoized only on success), `isNodeServerRuntime(): boolean`.
  - `search-params.ts`: `type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>`; `NOTICE_STATUSES = ["LINKED", "CREATED", "REJECTED"] as const` / `NoticeStatus`; `ACTION_ERROR_CODES = ["invalid_request", "no_candidate", "database"] as const`; `type ReviewErrorCode = ReviewResolutionErrorCode | ActionErrorCode`; `SEARCH_QUERY_MAX_LENGTH = 200`; `parsePositiveInteger(value: unknown): number | null` (`/^[1-9][0-9]*$/` and `<= Number.MAX_SAFE_INTEGER`); `parseNonNegativeInteger(value: unknown): number | null`; `parseCatalogSearchParams(raw): { afterId: number; limit: number; query: string | null }`; `parseReviewSearchParams(raw): { status: ReviewStatus; afterId: number; limit: number; notice: NoticeStatus | null; error: ReviewErrorCode | null; reviewId: number | null; productId: number | null }`. Array values and invalid values fall back to defaults (`after` 0, `limit` 20 within 1..100, `q` null when blank or over 200 code points, `status` `PENDING`).
  - `catalog-db.ts` (`import "server-only"`): `getSummaryCounts(): { products; sellerLinks; pendingReviews }`; `listProducts(args: { afterId: number; limit: number; query: string | null }): { rows: readonly ProductListRow[]; nextAfterId: number | null }` where `ProductListRow = { id; name; brand: string | null; category: string | null; sellerCount: number }`; `getProduct(args: { productId: number }): ProductDetail | null` (`id, name, brand, category, normalizedName, normalizedBrand`); `listSellerLinks(args: { productId: number }): { rows: readonly SellerLinkRow[]; hasMore: boolean }` (`id, sellerName, sellerProductId, sourceName, sourceBrand, sourceCategory, matchType`); `listReviewViews(args: { status: ReviewStatus; afterId: number; limit: number }): { views: readonly ReviewView[]; nextAfterId: number | null }` where `ReviewView = { record: ReviewRecord; candidate: CandidateProduct | null; liveCandidates: readonly CandidateProduct[] }` and `CandidateProduct = { id; name; brand; category }`; `type ReviewFormCommand = { kind: "link-candidate"; reviewId: number } | ResolveCommand`; `class MissingCandidateError extends Error`; `resolveReviewFromForm(command: ReviewFormCommand): ResolutionResult`.
  - `Pagination.tsx`: `Pagination(props: { basePath: string; params: Readonly<Record<string, string>>; nextAfterId: number | null; isFirstPage: boolean })` renders `<nav aria-label="Pagination">` with a "First page" link (omitting `after`) when not on the first page and a "Next" link (`after=<nextAfterId>`).

- [ ] **Step 1: Q3 spike (spec Q3).** Write `package.json` (`"name": "@catalog/web"`, private, engines; deps `next`, `react`, `react-dom`, `server-only`, `@catalog/core: workspace:*`; devDeps `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `eslint-config-next`; scripts `"dev": "next dev -H 127.0.0.1 -p 3000"`, `"build": "next build"`, `"start": "next start -H 127.0.0.1 -p 3000"`, `"lint": "eslint ."`, `"typecheck": "tsc --noEmit"`). Then `tsconfig.json` (extends the base, overriding `module: "ESNext"`, `moduleResolution: "Bundler"`, `jsx: "preserve"`, `lib: ["ES2023", "ES2024.String", "DOM", "DOM.Iterable"]`, `noEmit`, `plugins: [{ "name": "next" }]`), `next.config.ts` (`transpilePackages: ["@catalog/core"]`, `poweredByHeader: false`), and a minimal `layout.tsx`. Write `lib/config.ts` (step 2 contract) and the `getSummaryCounts` part of `lib/catalog-db.ts` (step 4 contract) first, then add a **temporary** `src/app/spike/page.tsx` (`export const dynamic = "force-dynamic"`) that renders `getSummaryCounts().products`. Run `pnpm install`, then:

```bash
cp out/parity/ts.db out/web.db
pnpm --filter @catalog/web build                          # default bundler of the pinned Next
pnpm --filter @catalog/web exec next build --webpack      # only if the pinned Next defaults to Turbopack; else --turbopack
CATALOG_DB_PATH=$PWD/out/web.db pnpm --filter @catalog/web start & sleep 6; curl -s http://127.0.0.1:3000/spike | grep -o '976'; kill %1
```
Expected: both builds exit 0 and `976` is printed. **Fallback chain**, applied in order until green, with the outcome recorded in the return envelope and a one-line WHY comment in `next.config.ts`: (F1) replace `transpilePackages` with `serverExternalPackages: ["@catalog/core"]`, so Node loads core's built ESM and `node:sqlite` natively; (F2) add a webpack `externals` function mapping `node:sqlite` to `commonjs node:sqlite`; (F3) spec's `createRequire` in `lib/catalog-db.ts` (only viable together with F1, because core imports `node:sqlite` statically). Delete `src/app/spike/` before the checkpoint.
- [ ] **Step 2: `config.ts`** (spec §6.6). It reads `process.env.CATALOG_DB_PATH` once per successful validation. Failure throws `Error` with message `CATALOG_DB_PATH <value or "(unset)">: <reason>; run: catalog-consolidation migrate --db <value or "<path>">`. The reasons are `is not set`, `is not a regular file`, or `schema version <n> < required 3` (via core `openConnection` + `readSchemaVersion`, then `close`). `isNodeServerRuntime()` returns `process.env.NEXT_RUNTIME === "nodejs"`. `.env.example` contains the single line `CATALOG_DB_PATH=../../out/catalog.db`.
- [ ] **Step 3: `src/instrumentation.ts`.** The file goes in `src/`, as Next requires when using a `src` dir. `register()` returns early unless `isNodeServerRuntime()`, then calls `getCatalogConfig()`. Check: `(CATALOG_DB_PATH= pnpm --filter @catalog/web start > out/web-start.log 2>&1; echo "exit=$?" >> out/web-start.log) & sleep 8; cat out/web-start.log`. If the log lacks a non-zero `exit=` (Next kept serving), change `register()` to catch the error, write `error: <message>\n` to stderr and `process.exit(1)`, kill the leftover server, and re-check. Expected: the message line and `exit=1`.
- [ ] **Step 4: `catalog-db.ts`** (spec §6.2). A private `withConnection(fn)` opens through `openConnection(getCatalogConfig().dbPath)`, calls `requireSchemaVersion`, runs `fn`, and calls `close()` in `finally`. Reads are autocommit and use spec §6.2's SQL verbatim. `listProducts` passes `limit + 1`. For the search, `query` is `normalize(q)`: when `null` the pattern parameter is `null`, otherwise it is `'%' + escapeLike(normalized) + '%'`, where `escapeLike` prefixes `%`, `_` and `\` with `\`. `listSellerLinks` uses `LIMIT 101`, and `hasMore` is true when the result has more than 100 rows. `listReviewViews` uses core `ListReviews` over `SqliteReviewUnitOfWork`. For each record it reads the candidate (`SELECT Id, Name, Brand, Category FROM Product WHERE Id = ?`; the page is bounded at 100). For PENDING AMBIGUOUS rows it fills `liveCandidates` from `new SqliteCatalogRepository({ connection }).findByNormalizedName({ normalizedName, normalizedBrand: normalize(sourceBrand) })`, or `[]` when `normalize(sourceName)` is `null`. `resolveReviewFromForm`: for `link-candidate` it reads `reviews.get` inside the same connection. A missing review throws `ReviewResolutionError({ code: "review_not_found", detail: \`review ${id} does not exist\` })`. A `null` candidate throws `MissingCandidateError`. Otherwise it builds `{ kind: "link", reviewId, productId: candidateProductId }`, and in every case runs `new ResolveReview({ unitOfWork: new SqliteReviewUnitOfWork({ connection }) }).execute(command)`. Rows are narrowed with core's row readers.
- [ ] **Step 5: Shell and tokens.** `globals.css` has `@import "tailwindcss";`, `:root` tokens `--background --foreground --muted --accent --success --danger --border` with a `prefers-color-scheme: dark` override (both schemes at >= 4.5:1 text contrast), `@theme inline` mapping them to `--color-*`, and a visible `:focus-visible` ring. `layout.tsx` has `next/font` (Geist + Geist Mono), `<html lang="en">`, and a header `<nav aria-label="Main">` linking `/` ("Catalog") and `/reviews` ("Review queue"). `error.tsx` (`'use client'`) shows "Something went wrong." plus `Reference: {error.digest}` and a "Try again" `<button>`; it never shows `error.message`. `not-found.tsx` shows "Not found." with a link home. `eslint.config.mjs` uses Next's flat config (`eslint-config-next`) + `typescript-eslint` strict + `"react/no-danger": "error"`. `postcss.config.mjs` uses `@tailwindcss/postcss`.
- [ ] **Step 6: `search-params.ts` and `Pagination.tsx`** per the Interfaces block. Quick check after build: `node --input-type=module -e` cannot import TSX, so search params are checked through the T13/T14 curl smoke instead.
- [ ] **Step 7: Build without a database (Review Focus 3).**

```bash
env -u CATALOG_DB_PATH pnpm --filter @catalog/web build; echo "exit=$?"
pnpm --filter @catalog/web typecheck && pnpm --filter @catalog/web lint
grep -rn "process.env" apps/web/src
```
Expected: `exit=0`, typecheck and lint exit 0, and grep hits only `apps/web/src/lib/config.ts`.
- [ ] **Step 8: Checkpoint.** The files under **Files**; `src/app/spike/` removed; the Q3 outcome (default bundler result, other bundler result, fallback used or `none`) in the return envelope.

### Task T13: Catalog pages

**Files:** Create `apps/web/src/app/page.tsx`, `apps/web/src/app/loading.tsx`, `apps/web/src/app/products/[id]/{page.tsx,loading.tsx,not-found.tsx}`, `apps/web/src/components/{SummaryTiles,ProductsTable,SearchForm}.tsx`

**Interfaces:**
- Consumes: `getSummaryCounts`, `listProducts`, `getProduct`, `listSellerLinks`, `parseCatalogSearchParams`, `parsePositiveInteger`, `Pagination` (T12).
- Produces: routes `/` and `/products/[id]`.

- [ ] **Step 1: `/`.** It is an async Server Component with `export const dynamic = "force-dynamic"`, and it awaits `props.searchParams`. `SummaryTiles` renders a `<dl>` with three tiles. Each count is the only child of its `<dd>` (`Products`, `Seller links`, `Pending reviews`). `SearchForm` is `<form method="get" action="/">` with `<label htmlFor="q">Search products</label>`, `<input id="q" name="q" maxLength={200} defaultValue>` and a `<button>`. `ProductsTable` renders `<table>` with `<caption>` and `<th scope="col">` headers `Id, Name, Brand, Category, Sellers`; the name links to `/products/<id>`. The empty state is `No products match “<q>”` (React-escaped text). `Pagination` sits below. `loading.tsx` shows skeleton tiles and rows.
- [ ] **Step 2: `/products/[id]`.** `parsePositiveInteger(id)` returning `null`, or `getProduct` returning `null`, both call `notFound()`. The page shows a `<dl>` of Name, Brand, Category, NormalizedName, NormalizedBrand, and a sellers table `SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType`. When `hasMore` is true it shows the note "Showing the first 100 seller links.". With no links it shows "No seller is linked to this product yet.". `not-found.tsx` shows "No product with this id." with a link home.
- [ ] **Step 3: Verify.**

```bash
pnpm --filter @catalog/web build && pnpm --filter @catalog/web typecheck && pnpm --filter @catalog/web exec eslint src/app/page.tsx src/app/loading.tsx "src/app/products" src/components/SummaryTiles.tsx src/components/ProductsTable.tsx src/components/SearchForm.tsx
cp out/parity/ts.db out/web.db
CATALOG_DB_PATH=$PWD/out/web.db pnpm --filter @catalog/web start & sleep 6
curl -s http://127.0.0.1:3000/ | grep -oE '<dd[^>]*>[0-9]+</dd>'
for u in / "/?limit=1000&after=-1" "/?q=router%20wifi" "/?q=zzzzqqq" /products/976 /products/abc /products/0 /products/99999; do printf '%s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000$u"; done
curl -s http://127.0.0.1:3000/products/976 | grep -c 'TestBrand&#x27;; SELECT 1; --'
curl -s "http://127.0.0.1:3000/?q=zzzzqqq" | grep -c 'No products match'
kill %1
```
Expected: the three `<dd>` values `976`, `255`, `2`; status codes `200 200 200 200 200 404 404 404`; both counts `>= 1`.
- [ ] **Step 4: Checkpoint.** The eight files.

### Task T14: Review queue and server action

**Files:** Create `apps/web/src/app/reviews/{page.tsx,loading.tsx,actions.ts}`, `apps/web/src/lib/review-messages.ts`, `apps/web/src/components/{ReviewCard,StatusTabs,Notice}.tsx`

**Interfaces:**
- Consumes: `listReviewViews`, `resolveReviewFromForm`, `MissingCandidateError`, `parseReviewSearchParams`, `parsePositiveInteger`, `NOTICE_STATUSES`, `ReviewErrorCode`, `Pagination` (T12); `ReviewResolutionError`, `DatabaseFileError`, `isSqliteError`, `formatFixed`, `REVIEW_STATUSES` (core).
- Produces: route `/reviews`; `resolveReviewAction(formData: FormData): Promise<never>`; `REVIEW_ERROR_MESSAGES: Record<ReviewErrorCode, string>`; `noticeMessage(args: { status: NoticeStatus; reviewId: number; productId: number | null }): string`.

- [ ] **Step 1: `review-messages.ts`** (exhaustive maps; a new code fails typecheck):

| Code | Message |
|---|---|
| `review_not_found` | This review does not exist. |
| `review_not_pending` | This review was already resolved. |
| `product_not_found` | That product does not exist. |
| `seller_sku_already_linked` | This seller SKU is already linked to a product. |
| `seller_already_linked_to_product` | This seller is already linked to that product. |
| `source_name_unnormalizable` | The seller's product name has no comparable form, so no product can be created from it. |
| `invalid_request` | The request was not valid. Reload the page and try again. |
| `no_candidate` | This review has no candidate product. Link it to a product id instead. |
| `database` | The catalog database could not be read or written. |

  Notices: LINKED gives `Review <r> linked to product <p>.`, CREATED gives `Review <r> created product <p>.`, REJECTED gives `Review <r> rejected.`
- [ ] **Step 2: `actions.ts`** (`'use server'`, spec §6.3). Parse `reviewId` (positive integer) and `action` from `["link-candidate", "link-other", "create", "reject"] as const`. `productId` is a positive integer and is required only for `link-other`. A parse failure redirects to `/reviews?error=invalid_request`. Inside `try`: `resolveReviewFromForm(...)`. Catches: `ReviewResolutionError` gives `error=<code>`; `MissingCandidateError` gives `error=no_candidate`; `DatabaseFileError` or `isSqliteError` gives `error=database`; anything else is rethrown. After the `try`: on success, `revalidatePath("/")`, `revalidatePath("/reviews")`, `revalidatePath("/products/[id]", "page")`, then `redirect(\`/reviews?status=PENDING&notice=${status}&review=${reviewId}&product=${productId}\`)` (the `&product=` part is present only when `productId !== null`). On error, `redirect(\`/reviews?status=PENDING&error=${code}&review=${reviewId}\`)`. `redirect` is never called inside the `try`.
- [ ] **Step 3: Components.** `StatusTabs` renders `<nav aria-label="Review status">` with one link per `REVIEW_STATUSES` entry (`?status=X`) and `aria-current="page"` on the active one. `Notice` renders `role="status" aria-live="polite"`: the success text in the `--success` token, the error text in `--danger`, and nothing when both are null. `ReviewCard` (PENDING) is an `<article aria-labelledby="review-<id>-title">` with two side-by-side sections. The seller section shows SourceName, SourceBrand, SourceCategory, seller and SKU. The candidate section shows Id, Name, Brand, Category and score `formatFixed(score, 4)`, or for AMBIGUOUS the live candidates list. Below them are forms, each `<form action={resolveReviewAction}>` with hidden `reviewId` and a `<button name="action" value="…">`: "Link to candidate" (only when `candidateProductId !== null`), "Link to #<id>" per live candidate (`link-other` + hidden `productId`), "Link to another product" (`link-other` with `<label>`ed `<input type="number" name="productId" min="1" required>`), "Create new product", and "Reject". No `'use client'` is needed.
- [ ] **Step 4: `/reviews` page.** `dynamic = "force-dynamic"`; it awaits `searchParams` and calls `parseReviewSearchParams`. PENDING renders `ReviewCard`s. Other statuses render a compact table (`<caption>`, `<th scope="col">`) with the CLI list columns. Empty states: `No PENDING reviews — run consolidate to queue some` (with `consolidate` in `<code>`), or `No <STATUS> reviews.`. `Pagination` sits below. The footer reads: "Local demo: no login. Anyone who can reach 127.0.0.1:3000 can resolve reviews.". `loading.tsx` shows skeleton cards.
- [ ] **Step 5: Verify rendering.**

```bash
pnpm --filter @catalog/web build && pnpm --filter @catalog/web typecheck && pnpm --filter @catalog/web exec eslint src/app/reviews src/lib/review-messages.ts src/components/ReviewCard.tsx src/components/StatusTabs.tsx src/components/Notice.tsx
cp out/parity/ts.db out/web.db && CATALOG_DB_PATH=$PWD/out/web.db pnpm --filter @catalog/web start & sleep 6
curl -s http://127.0.0.1:3000/reviews | grep -c '<article'
curl -s "http://127.0.0.1:3000/reviews?status=REJECTED" | grep -c 'No REJECTED reviews.'
curl -s "http://127.0.0.1:3000/reviews?status=PENDING&notice=LINKED&review=1&product=21" | grep -c 'Review 1 linked to product 21.'
curl -s "http://127.0.0.1:3000/reviews?status=bogus&error=bogus&limit=0" -o /dev/null -w '%{http_code}\n'
```
Expected: `2`, `1`, `1`, `200`.
- [ ] **Step 6: Verify the action in a browser (Review Focus 1).** Use the Browser pane on `http://127.0.0.1:3000/reviews`. Open a second tab on the same page. In tab 1 click "Link to candidate" on review 1: the notice reads `Review 1 linked to product 21.` and one card remains. In tab 2 (stale) click "Link to candidate" on review 1: it redirects to `?status=PENDING&error=review_not_pending&review=1` with "This review was already resolved." and no 500. `sqlite3 out/web.db "SELECT COUNT(*) FROM SellerProduct"` prints `256`. Then `kill %1`.
- [ ] **Step 7: Checkpoint.** The seven files.

---

## Final gate (orchestrator, once, after wave 5)

```bash
cd <repo>
pnpm install --frozen-lockfile                 # exit 0
pnpm -r build                                  # core (tsc) -> cli (tsc) -> web (next build); routes /, /products/[id], /reviews dynamic
pnpm -r lint && pnpm -r typecheck              # exit 0
scripts/parity-check.sh                        # parity: OK (9/9 steps), exit 0
grep -rhoE 'from "[^"]+"' packages/core/src | sort -u | grep -vE 'from "(node:[a-z]+|\.{1,2}/[^"]+)"'   # prints nothing
jq '.dependencies // {} | length' packages/core/package.json                               # 0
grep -rnE ':\s*any\b|<any>|as any\b|eslint-disable' packages/core/src                      # prints nothing
grep -rnE '`(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{' packages apps --include=*.ts --include=*.tsx  # prints nothing
grep -rln "dangerouslySetInnerHTML\|process.env" apps/web/src                              # apps/web/src/lib/config.ts only
shasum -a 256 data/catalog.db data/ProductEntry.json                                       # the two recorded checksums
```

Web smoke (spec §8, on the parity output):

```bash
cp out/parity/ts.db out/catalog.db
CATALOG_DB_PATH=$PWD/out/catalog.db pnpm --filter @catalog/web start &
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/             # 200, tiles 976 / 255 / 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/products/976 # 200, brand rendered as text
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/reviews      # 200, two PENDING cards
# Browser: review 1 (Roteador) -> "Link to candidate" -> notice "Review 1 linked to product 21."
kill %1
node apps/cli/dist/main.js consolidate --db out/catalog.db --input data/ProductEntry.json
# UNCHANGED 257, HELD_FOR_REVIEW 1, SKIPPED_DUPLICATE_LISTING 11, rows_written=0
```

Remaining acceptance criteria (spec §8):
- **Browser == CLI rows:** `cp out/parity/ts.db out/web-a.db && cp out/parity/ts.db out/cli-a.db`. Run `node apps/cli/dist/main.js review resolve --db out/cli-a.db --id 1 --link 21`, and resolve review 1 via "Link to candidate" with `CATALOG_DB_PATH=$PWD/out/web-a.db`. Then `diff <(scripts/parity-check.sh dump out/web-a.db) <(scripts/parity-check.sh dump out/cli-a.db)` is empty.
- **Startup failures:** `CATALOG_DB_PATH` unset, set to `out/missing.db`, or set to a raw copy `out/raw.db` (`cp data/catalog.db out/raw.db`) each make `pnpm --filter @catalog/web start` exit non-zero with the one-line message from T12 step 2.
- **Accessibility:** `pnpm dlx @axe-core/cli@<pinned at run time> http://127.0.0.1:3000/ http://127.0.0.1:3000/products/976 http://127.0.0.1:3000/reviews --exit` reports 0 critical violations. If it is unavailable offline, run axe DevTools in the browser and record the result.
- **Four states:** each route directory has `loading.tsx`, the root has `error.tsx`, and the empty states were verified in T13/T14.
- **Process:** `[tests] skipped — not requested`. ADR 0006 status goes to `accepted` with user confirmation (not edited by this plan's tasks). The change record is closed through `record-change`.

## Opt-in tests — `[opt-in: tests]` (only if the user asks; nothing depends on them)

Owner ameer (test-writer), model opus, run after the final gate. X0 comes first; X1–X6 are one wave with disjoint files. Each runs only its own file: `pnpm --filter @catalog/core exec vitest run <file>`.

- **X0 — vitest setup.** Modify `packages/core/package.json` (devDep `vitest` pinned exact, `"test": "vitest run"`) and `pnpm-lock.yaml`. Create `packages/core/vitest.config.ts` and `packages/core/tsconfig.test.json` (includes `src` + `test`, noEmit).
- **X1** `packages/core/test/normalization.test.ts`: the 16-row table, `cleanDisplay`, `ß`/`ẞ`, `pyStrip`/`pySplitJoin` vs `\s` (`\u001c`, `\u0085`, `﻿`).
- **X2** `packages/core/test/sequence-matcher.test.ts` + `test/fixtures/sequence-matcher-pairs.json`: ~30 catalog pairs with Python `ratio()`, `quick_ratio()`, `get_matching_blocks()`. The fixture is generated once by an inline `.venv/bin/python` heredoc over a migrated copy under `out/`.
- **X3** `packages/core/test/python-format.test.ts`: the 1/32 ties, `formatPythonFloat(0|1|0.4762)`, the `pythonPathLabel` table.
- **X4** `packages/core/test/matching.test.ts` + `test/fake-catalog-reader.ts`: the `tasks.md` T13 cases.
- **X5** `packages/core/test/consolidate-file.test.ts`, `test/resolve-review.test.ts`, `test/fake-unit-of-work.ts`: the `tasks.md` T15 cases plus the six review error codes.
- **X6** `packages/core/test/integration.test.ts`: migrate + consolidate on a temp copy (baseline, 976/255/2, re-run 0, dry-run 975/0/0).

## Phase 4 — Python removal and docs switch

**Requires explicit user confirmation; not executed as part of this plan's waves.** Preconditions are the final gate green and ADR 0006 accepted. Deliverables (spec §9):
1. Record golden files under `tests/golden/` from the Python CLI on a fresh copy: `report.jsonl`, the three `parity-check.sh dump` outputs after steps 3, 6 and 9, and the `review list` stdout. Switch `scripts/parity-check.sh` to compare the TS CLI against these files when `.venv` is absent.
2. Delete `src/`, `pyproject.toml`, `uv.lock`, `.venv/`, `__pycache__/`, and the Python lines of `.gitignore` (`.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `*.egg-info/`).
3. Rewrite `README.md`: requirements Node 24 + pnpm, commands (bin `catalog-consolidation` and `pnpm cli …`), the web app section, and limitations (no auth, local only, the `\p{M}` deviation from Q5).
4. Mark `docs/specs/catalog-consolidation/tasks.md` as superseded by the design spec (kept as history).

## Plan risks

- R-a Q3 bundling may need F1/F2. With F1, core is not transpiled by Next, so `pnpm --filter @catalog/core build` must precede `next dev`/`next build` (already the case per spec R4).
- R-b `exactOptionalPropertyTypes` may clash with Next's generated route types. If `next build`'s type step fails only inside `.next/types`, keep the flag and exclude `.next/types` from `include`, relying on `next build`'s own check. Record the decision.
- R-c Next may log a `register()` error and keep serving; T12 step 3 has the `process.exit(1)` fallback.
- R-d Parallel agents share one tree with no worktrees. Mitigated by the scoped verification protocol and barrier-level full checks.
- R-e Version pins come from the registry on the scaffold day and need network access. `pnpm install --frozen-lockfile` reproduces them afterwards.
