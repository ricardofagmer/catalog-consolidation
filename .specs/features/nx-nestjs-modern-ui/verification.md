# Verification: Nx workspace, NestJS backend and a modern light/dark web UI

Feature: `nx-nestjs-modern-ui` | Date: 2026-10-07 | Claims: [checks.md](checks.md) C1-C37

Method: an independent Verifier (`critic`, alias vera, read-only, opus) tried to refute each claim on
scratch copies under `out/verifier/`, using the built `dist`/`.next` output, the nine-project Nx graph and
servers it started itself on ports 3091/3092. The orchestrator ran the browser claims in the in-app
browser on 2026-10-07 (ledger.md) and applied the Verifier's fixes afterwards; those fixes were re-checked
as noted below. **No executable test was authored or run: `[tests] pending — final-stage user approval required`.**

## Verdict

PROVEN WITH GAPS. No claim failed. Two defects the claims did not cover were found and fixed (README API
table, `nx affected` graph). Browser-only claims rest on the orchestrator's single browser run. C22 was
checked structurally, not with an OpenAPI validator.

## Claims

| ID | Verdict | Evidence |
|---|---|---|
| C1 | VERIFIED | `nx show projects` lists the nine. `nx run-many -t build,lint,typecheck` exits 0 on a fresh workspace copy (`pnpm install --frozen-lockfile --offline`) and again after the final fixes with `--skip-nx-cache` (29 tasks). Identical rerun: 28/29 cache hits; the one miss is `api:openapi` (`cache:false` in nx.json, by design). A `--skip-nx-cache` run does not populate the cache. |
| C2 | VERIFIED | Workspace copy: a `@catalog/persistence` import under `apps/web/src/lib` makes `nx lint web` exit 1 ("scope:web can only depend on scope:web, scope:client"); without it, exit 0. |
| C3 | VERIFIED | `--affected --files=libs/rules/src/normalization.service.ts` gives rules, consolidation, api, cli, persistence, reviews (not web, not api-client). After the fix below, `apps/api/src/main.ts` gives api, api-client, web. |
| C4 | VERIFIED | `scripts/golden-check.sh`: `golden: OK (22/22 scenarios)`, run on the real tree before and after Python removal and at the end. Caveat: six fixtures were re-baselined from the TypeScript CLI (fixtures/golden/recording.json), so the check detects drift from the recorded behavior, not shared bugs. |
| C5 | VERIFIED | 25 help forms (`-h`, `--help`, `-hh` at all levels): exit 0, one usage line, DB sha unchanged, no `.bak`. |
| C6 | VERIFIED | `migrate` stdout is exactly the five frozen lines, `consolidate` ten; no Nest text; golden diff passes. |
| C7 | VERIFIED | Second `consolidate`: `rows_written=0`, `UNCHANGED 256`, counts 976/255. |
| C8 | VERIFIED | Missing DB, unmigrated DB and three invalid Seller Files: exit 2, one `error:` line, sha unchanged, nothing created. |
| C9 | VERIFIED | Backup-name collision and non-SQLite file: exit 1, no stack lines, sha unchanged. |
| C10 | VERIFIED | Nx graph: api and cli depend on the same five backend libraries; web only on api-client. Rule classes live only in `libs/rules/src` (matching.service.ts:15, normalization.service.ts:18), `libs/reviews/src/reviews.service.ts:18`, `libs/consolidation/src/consolidation.service.ts:16`. API resolution delegates to `ReviewsService` (review-resolution.service.ts:25). |
| C11 | VERIFIED | `GET /v1/summary` returns 976 / 255 / 2. |
| C12 | VERIFIED (reading) | `q=camera` and `q=Câmera` return product 18 "Camera Canon EOS R6"; the accented "Câmera Canon EOS R6" is offer 56's `sourceName` on its detail page. Default page 20, `limit=100` accepted, `limit=101` gives 400 `invalid_request`, cursor pages are disjoint. The check's literal wording (the list shows "Câmera…") is not met; accent-insensitive search is. |
| C13 | VERIFIED | Product 976 returns 200 with the brand intact; `abc`, `0`, `1.0`, `1e3` give 400; `999999` gives 404 `product_not_found`; 100 offers gives `hasMore:false`, 101 gives 100 rows and `hasMore:true`. |
| C14 | VERIFIED | PENDING returns reviews 1 and 2, candidates 21 and 28, scores 0.9091 and 0.9643; on a scratch copy with a duplicate-name product the ambiguous item lists live candidates [21, 977]. |
| C15 | VERIFIED | POST link-candidate on review 1: 200 `{reviewId:1,status:LINKED,productId:21,linkId:256}`; table dump equals the CLI `--link 21` twin (1240 lines); CLI `consolidate` reports that entry UNCHANGED with `rows_written=0`. |
| C16 | VERIFIED | Repeating any resolution gives 409 `review_not_pending`; Seller Offer count stays 256. |
| C17 | VERIFIED (gap) | Every reachable code was triggered; each body has exactly `statusCode, code, message, correlationId`; no stack, SQL or seller text. `internal` (500) has no reachable trigger and is covered by code path only (`exception-classification.ts`). A request with no `Host` header gets Node's empty 400 before Nest runs (outside the application's reach). |
| C18 | VERIFIED | `evil.example:*`, `LOCALHOST:3091`, bare `127.0.0.1` give 421 `host_not_allowed`; `127.0.0.1:3091` and `localhost:3091` give 200. |
| C19 | VERIFIED (fixed) | Form, text/plain, multipart, no content type: 415 `unsupported_media_type`, rows unchanged. The Verifier found `application/json;charset=latin1` returned 415 with code `invalid_request`; fixed in `exception-classification.ts` and re-checked on a scratch API: `{"statusCode":415,"code":"unsupported_media_type",...}`; malformed JSON still 400 `invalid_request`. |
| C20 | VERIFIED | `lsof`: `127.0.0.1:3091` only; no `access-control-*` header; preflight OPTIONS gets 404 with no allow headers. |
| C21 | VERIFIED (gap) | live 200; ready 200 on demo data, 503 `database` after the file is removed and on an unmigrated copy; a missing DB at startup is refused by config (exit 1). Gap: during a write-lock wait `/health/live` answered after 4.94 s (accepted LOW2; README now says a liveness probe needs a timeout above 5 s). |
| C22 | VERIFIED (structural) | `/docs` 200 HTML Swagger UI; `/docs-json` is OpenAPI 3.0.0 with all seven operations, the four-field `ErrorBodyDto`, an `ApiErrorCode` enum equal to the closed set, and all 48 `$ref`s resolve; equal to `apps/api/dist/openapi.json`. No OpenAPI validator was run. |
| C23 | VERIFIED | With `BEGIN IMMEDIATE` held by `sqlite3`, POST took 5.22 s and returned 503 `database`; exactly one `api.database.failed` event with `errorType` `SqliteError.5`, no message or seller text; rows unchanged. |
| C24 | VERIFIED | No `node:sqlite` or backend library import under `apps/web/src`; the only `@catalog` dependency in `apps/web/package.json` is `@catalog/api-client`; `nx lint web` exits 0. The Verifier found `next.config.ts` was outside the boundary rule (blanket config-file ignore); narrowed to `**/eslint.config.mjs` and the full gate re-run green. |
| C25 | PARTLY VERIFIED | The API log shows `/v1/*` calls arriving from the Next server; API access is `server-only` (api-transport.ts:3, catalog-api.ts:3); no client component fetches; `.next/static` contains no API origin. The browser network list was recorded only before the redesign (09-evidence.md:65) and was not re-run after tickets 10-12. |
| C26 | VERIFIED (server) + BROWSER (orchestrator) | API stopped: `/` and `/reviews` 200 and `/products/2` 500, each rendering the designed error state with a reference id and no stack, path or ECONNREFUSED text (browser run 2026-10-07). |
| C27 | Source VERIFIED + BROWSER (orchestrator) | theme-provider.tsx:13-17 (class, system, enableSystem, storageKey `theme`); toggle offers Light/Dark/System (theme-toggle.tsx:18-20); the next-themes script precedes the skip link and header in the served HTML. Toggle, persistence and no-flash from the browser run (ledger.md). |
| C28 | Source VERIFIED + BROWSER (orchestrator) | app-sidebar.tsx:9 (`hidden … md:flex`), mobile-nav.tsx:25,29 (Sheet, `md:hidden`); drawer interaction from the browser run. |
| C29 | Source VERIFIED + BROWSER (orchestrator) | `loading.tsx` for (catalog), products/[id] and reviews; browser run: empty search (`?q=zzzzqqq`) and empty REJECTED tab show the designed EmptyState. |
| C30 | PARTLY VERIFIED + BROWSER (orchestrator) | SubmitButton.tsx sets `disabled` and `aria-busy`; the API answers a repeat with 409 and no second link; stale-tab double submit shows "This review was already resolved." (browser run). The throttled-network observation was not repeated. |
| C31 | Source VERIFIED (contrast computed) + BROWSER (orchestrator) | Contrast computed from globals.css for both themes: every text pair at least 4.5:1 (lowest: light warning 4.72, light success 4.81, dark primary on accent 4.99); ring at least 5.72:1; skip link first focusable; role=status/alert regions are in the server HTML; review-specific `aria-label`s ("Reject review 1"); reduced-motion rule at globals.css:161-170; solid 2px focus outline measured in the browser. |
| C32 | VERIFIED | `curl -I`: CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`; `Host: evil.example:3000` gets 421. |
| C33 | VERIFIED | `next start` with `API_BASE_URL` unset, empty, not a URL, ftp, with userinfo, path or query: exit 1 with exactly one `error:` line; `next build` succeeds with the variable unset and no API. |
| C34 | VERIFIED | `/products/abc`, `/0`, `/1.5`, `/999999`, `/nope` return 404; `/products/18` and `/976` return 200 with the hostile brand escaped. |
| C35 | Order VERIFIED; pre-move pass by prior evidence | Archive `.engineos/archived/2026/10/python-reference-2026-10-06.tar.gz` (32 entries) matches the Python sources byte for byte (checked again before deletion); archive and fixtures predate every later ticket. The pass on the pre-move TypeScript CLI is recorded only in 01-evidence.md:5; that CLI no longer exists to re-run. |
| C36 | VERIFIED | No `*.py`, `*.pyc`, `pyproject.toml`, `uv.lock`, `.venv`, `.ruff_cache`, `__pycache__` or egg-info outside `node_modules`, `out`, `.nx` and the archive. The README quick start and the API/web commands were executed verbatim from a fresh copy and matched. The Verifier found the README's API table wrong (`cursor`, `link-product`, `/v1/health/*`); corrected against the generated OpenAPI document (`after`, `link-other`, `/health/*`). |
| C37 | VERIFIED | sha256 `733ff1d9…c404` and `1b0c861f…04b8f6`, unchanged at the end of every phase including after the final fixes. |

## Fixes applied after the Verifier (all re-gated)

1. README API table and notes (4 lines) corrected; limitations now mention the liveness probe timeout and the fixed web Host port.
2. `libs/api-client/package.json` gains `implicitDependencies: ["api"]` so `nx affected` carries API changes to the client and web.
3. `apps/api/src/errors/exception-classification.ts`: charset 415 maps to `unsupported_media_type`.
4. `eslint.module-boundaries.mjs`: the ignore is narrowed to `**/eslint.config.mjs`.
5. Dead `apps/web/src/components/ui/separator.tsx` and stale `.gitignore` Python entries removed.
Final gate after these: `nx run-many -t build,lint,typecheck --skip-nx-cache` exit 0 (29 tasks); golden 22/22; data sha unchanged.

## Remaining risks and follow-ups (not blocking)

- Liveness stalls for the busy timeout while another process holds the write lock (accepted, documented in the API ADR and README).
- The web Host allowlist is fixed to `127.0.0.1:3000` (`apps/web/src/proxy.ts:6`); documented, not configurable.
- `apps/cli/src/arguments.ts` is 497 lines (accepted earlier); `scripts/golden-check.sh` 471 lines (script).
- `api-error-body.ts` checks the web's error-code list with `satisfies`, which catches unknown but not missing codes.
- `PythonFormat` / `pythonPathLabel` identifiers and history comments still mention Python (naming only; golden-protected).
- ADRs 0002-0005 still read `Status: proposed`.
- Invalid-JSON bodies answer "invalid request" instead of the more specific parse message.
- Focus is not moved after a successful resolution unmounts its card; `Pagination` right-alignment now also applies on `/reviews`; label "Seller links" versus the glossary's "Seller Offers" (unchanged on purpose).

## Not verifiable without tests or a browser

C25 browser network list after the redesign; the rendered behavior of C26-C31 beyond the orchestrator's single run; formal OpenAPI validation (C22); `internal` 500 trigger (C17); the pre-move golden pass (C35).

## Cleanup

No listeners on 3000, 3001, 3091, 3092 at the end; data checksums above; scratch trees under `out/` are git-ignored build scratch.
