# Acceptance checks: Nx workspace, NestJS backend and a modern light/dark web UI

Feature: `nx-nestjs-modern-ui` | Derived from [plan.md](plan.md) (approved 2026-10-06) | Status: draft (awaiting review)

A check is an observable claim plus the non-test evidence that will prove it at final validation.
**No executable tests, fixtures, harnesses or test scripts are authored from this file**; the evidence
column names commands and observations an operator or the Verifier runs by hand. Executable tests are
authored only after the developer's explicit approval at the final stage, and then derived from these
claims. A check is never edited after approval: a gap goes back through the plan.

Conventions: "copy" means a fresh scratch copy of `data/catalog.db` under `out/`; "demo data" means
that copy migrated and consolidated with the CLI (976 products, 255 Seller Offers, 2 Review Items);
"golden" means the fixtures recorded in ticket 01. `data/` is never modified (C37).

## Workspace

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C1 | Nx knows every project (api, cli, web, domain, rules, persistence, consolidation, reviews, api-client); `build`, `lint`, `typecheck` succeed for all, and a second identical run is served from the cache. | R1, D5 | `nx show projects` lists the nine; `nx run-many -t build,lint,typecheck` exits 0; rerun output reports cache hits. |
| C2 | A web-tagged project importing a backend-tagged project fails lint; the real tree passes. | R2 | On a scratch copy of the workspace add one forbidden import to the web app; `nx lint web` exits non-zero naming the boundary rule. Same command on the real tree exits 0. |
| C3 | Changing one library selects only its dependents. | R3 | Without git, `nx show projects --affected --files=<one file in rules>` lists `rules` and its dependents (api, cli, and the libraries that depend on it) and excludes `web` and `api-client`. |

## CLI and rules

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C4 | On the provided data the CLI's stdout, exit codes, JSON reports and table contents equal the golden fixtures in every scenario (first run, re-run, dry run, error paths, review flow). | R4 | The golden check exits 0 and prints one OK line per scenario; shown at final validation and again right after the rules are re-homed. |
| C5 | Every help form (`-h`, `--help`, `-hh`, at every command level) prints help, exits 0, writes nothing and creates no backup. | R5 | For each form on a copy: exit code, usage text on stdout, database checksum unchanged, no `*.bak` beside it. |
| C6 | The CLI writes nothing from the Nest framework to stdout. | R6 | `migrate` and `consolidate` stdout captured with stderr discarded contain only the frozen summary lines (diffed against golden); no Nest bootstrap text. |
| C7 | A second `consolidate` on the same file writes zero rows. | R7 | Second-run summary shows `rows_written=0` and table counts unchanged. |
| C8 | A missing database, an unmigrated database or an invalid Seller File each give one `error:` line and exit 2 with nothing written. | R8 | Run the three cases on copies; capture exit code, stderr line count, checksum before and after. |
| C9 | An unexpected failure (backup-name collision; a non-SQLite file as database) exits 1, prints no stack trace and leaves the database unchanged. | R9 | Run both cases; capture exit code, absence of "at " stack lines, checksum. |
| C10 | Normalization, matching, consolidation and review resolution each exist in exactly one library that both api and cli depend on; web contains none. | R10, D1 | `nx graph --file` output shows api and cli depending on the same libraries; a search for the rule implementations finds each only under its library; no copy in apps. |

## API

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C11 | `GET /v1/summary` on demo data returns 976 products, 255 Seller Offers, 2 pending reviews. | R11 | `curl` the endpoint; compare the three numbers. |
| C12 | `GET /v1/products?q=camera` finds "Câmera Canon EOS R6"; default page is 20 rows, `limit=100` is accepted, `limit=101` gives 400 `invalid_request`; following the cursor yields a disjoint next page. | R12 | `curl` the four requests; compare names, row counts and ids across pages. |
| C13 | Product 976 returns 200 with the hostile brand intact as text; `abc` returns 400 `invalid_request`; `999999` returns 404 `product_not_found`; a product with many offers reports `hasMore` only past 100. | R13 | `curl` each id and read status, `code` and the brand string. |
| C14 | `GET /v1/reviews?status=PENDING` returns the two fuzzy items with Candidate ids 21 and 28 and scores 0.9091 and 0.9643; an ambiguous item (built on a scratch copy by adding a duplicate-name product) lists every live Candidate. | R14 | `curl` the list on demo data; repeat on the scratch copy for the ambiguous case. |
| C15 | Resolving review 1 with `link-candidate` returns 200 with review id, final status, product id and link id, produces the same table contents as `review resolve` on a twin copy, and a following CLI `consolidate` reports that entry UNCHANGED with `rows_written=0`. | R15 | `curl` POST on one copy, CLI resolve on a twin; table dump diff is empty; CLI re-run summary. |
| C16 | Posting the same resolution again returns 409 `review_not_pending` and adds no second link. | R16 | Second `curl` POST; status, `code`, and Seller Offer count unchanged. |
| C17 | Every error the API returns has exactly the four fields `statusCode`, `code`, `message`, `correlationId`, the code is in the closed set, and no body contains a stack trace, SQL text or seller text. | R17 | Trigger each reachable code (invalid input, unknown product, unknown review, not pending, both link conflicts, unnormalizable name, missing candidate, unsupported media, bad host, database); inspect each body for fields and forbidden content. |
| C18 | A request with a `Host` other than the allowlist is rejected with 421 `host_not_allowed`; `127.0.0.1:3001` and `localhost:3001` succeed. | R18 | `curl -H 'Host: evil.example:3001'` and the two allowed hosts. |
| C19 | A POST whose content type is not `application/json` returns 415 `unsupported_media_type` and writes nothing. | R19 | `curl` a form-encoded POST; status, `code`, row counts. |
| C20 | The API listens on 127.0.0.1 only and sends no CORS headers; a cross-origin preflight gets no permission headers. | R20 | `lsof -iTCP:3001 -sTCP:LISTEN` shows 127.0.0.1; response headers contain no `access-control-*`; `curl -X OPTIONS` with an `Origin` header returns no allow headers. |
| C21 | `/health/live` is 200 whenever the process runs; `/health/ready` is 200 on demo data and 503 for a missing database and for an unmigrated one. | R21 | `curl` both endpoints against the three database states. |
| C22 | `/docs-json` is valid OpenAPI describing every endpoint in plan 5.2 and the error body; `/docs` serves the Swagger UI. | R22, D3 | Parse the document and compare its paths and error schema to plan 5.2; `curl /docs` returns 200 HTML. |
| C23 | When another process holds the write lock, a resolution returns 503 `database` after waiting for the busy timeout, and the server logs exactly one structured event with an event name and error type but no message or seller text. | R23 | Hold `BEGIN IMMEDIATE` in a second SQLite session; `curl` the POST; read the response and the log line. |

## Web

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C24 | The web application contains no database or business-rule code and declares no backend dependency. | R24, D4 | Search `apps/web` for `node:sqlite` and for imports of backend libraries (no hits); read `apps/web/package.json` dependencies; `nx lint web` exits 0. |
| C25 | Page data reaches the browser only through the Next server; the browser never contacts the API port. | R25 | In the browser pane, load all three pages and list network requests (none to port 3001); the API's request log shows the calls arriving from the Next server. |
| C26 | With the API stopped, each page shows the designed error state and no stack trace. | R26, R29 | Stop the API, load `/`, `/reviews`, `/products/2`; read page text and screenshot. |
| C27 | The theme toggle offers light, dark and system; selecting each changes the interface immediately, the choice survives a reload, and a reload with dark stored paints dark from the first frame. | R27 | Browser: toggle through the three states, read the `html` class and a computed background colour, reload and screenshot straight away; confirm a blocking theme script precedes the content in the served HTML. |
| C28 | A sidebar (Catalog, Review queue) and a top bar with the toggle appear on desktop; below the small-screen breakpoint the sidebar is replaced by a drawer opened from a button. | R28 | Browser at desktop width and with the mobile preset: screenshots, drawer open/close interaction. |
| C29 | Every page has a loading state, a designed empty state (a search with no hits; an empty status tab) and the error state of C26. | R29 | Directory listing shows a loading file for each route; browser run of an empty search and an empty tab; screenshots. |
| C30 | While a resolution is pending its buttons are disabled; submitting the same resolution twice yields the "already resolved" notice and no second link. | R30 | Browser: observe the buttons' disabled state during submission (network throttled); repeat the POST and read the notice and the Seller Offer count. |
| C31 | In both themes body text contrast is at least 4.5:1; focus is visible; a skip link is the first focus stop; notices are in a live region present before they fill; repeated buttons carry review-specific names; with reduced motion requested no animation runs. | R31 | Compute the contrast ratio for every text/background token pair in both themes; Tab through a page with screenshots; read the DOM for the skip link, live region and button names; emulate reduced motion and read computed animation values. |
| C32 | The web app serves anti-framing and related security headers and rejects an unknown `Host`. | R32 | `curl -I` shows CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; a request with `Host: evil.example:3000` gets 421. |
| C33 | A missing or invalid API address stops the web server at startup with one `error:` line and exit 1; `next build` succeeds with the API down and the variable unset. | R33 | Start with the variable unset and with a malformed value (capture exit code and line count); run the production build with no API running. |
| C34 | `/products/abc` and `/products/999999` return HTTP 404 with the not-found page; a valid product returns 200. | R34 | `curl -s -o /dev/null -w '%{http_code}'` on the three ids; page text of the 404. |

## Python removal and documentation

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C35 | The golden fixtures and the Python archive existed, and the fixture check passed on the pre-existing TypeScript CLI, before any rule was moved. | R35, D1, D2 | Ticket 01's report: fixture file listing, `tar -tzf` of the archive showing the Python source, the check's passing output, and its timestamp preceding every later ticket's start. |
| C36 | At completion no Python source, project file, lock file or virtual environment remains, and following the README's quick start verbatim works. | R36, D2 | `find` for `*.py`, `pyproject.toml`, `uv.lock`, `.venv`, `.ruff_cache` returns nothing; execute the README's quick-start commands from a fresh copy and compare their output to the README. |

## Global safety

| ID | Claim | From | Proposed evidence |
|---|---|---|---|
| C37 | `data/catalog.db` and `data/ProductEntry.json` are byte-identical after all work. | R4, D2 | `shasum -a 256` of both files equals the recorded values (`733ff1d9...`, `1b0c861f...`). |

## Coverage

R1 C1 · R2 C2 · R3 C3 · R4 C4 C37 · R5 C5 · R6 C6 · R7 C7 · R8 C8 · R9 C9 · R10 C10 · R11 C11 ·
R12 C12 · R13 C13 · R14 C14 · R15 C15 · R16 C16 · R17 C17 · R18 C18 · R19 C19 · R20 C20 · R21 C21 ·
R22 C22 · R23 C23 · R24 C24 · R25 C25 · R26 C26 · R27 C27 · R28 C28 · R29 C26 C29 · R30 C30 ·
R31 C31 · R32 C32 · R33 C33 · R34 C34 · R35 C35 · R36 C36.
Doors: D1 C4 C10 C35 · D2 C35 C36 C37 · D3 C22 · D4 C24 · D5 C1.
