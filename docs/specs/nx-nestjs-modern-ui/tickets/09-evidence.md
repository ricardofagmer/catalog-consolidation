# 09 evidence: web on the API

Date: 2026-10-06. Worker: frontend-coordinator (IMPLEMENT, risk medium, A2). Not a git repo; no git writes.
Toolchain: node v24, Next.js 16.3.8 (Turbopack), openapi-fetch 0.17.0. Scratch artifacts: `out/web-smoke/` (git-ignored); browser driver scripts in `out/web-smoke/scripts/`.

## Files

| Change | Path (under `apps/web/`) |
|---|---|
| deleted | `src/lib/catalog-db.ts` |
| new | `src/lib/api-transport.ts` (`server-only`; one memoized client, 10 s absolute timeout, `cache: "no-store"`, no retries, `x-correlation-id` per request, one structured failure log line, `CatalogApiError`, readiness probe) |
| new | `src/lib/catalog-api.ts` (`server-only`; `getSummary`, `listProducts`, `findProductWithOffers`, `listReviews`, `resolveReview`) |
| new | `src/lib/api-error-body.ts` (runtime check of the four-field error body against the closed code set) |
| new | `src/lib/api-boot-check.ts` (boot: config check, then a background readiness probe) |
| new | `src/lib/format-score.ts` (prints the API's already-rounded similarity with 4 decimals) |
| rewritten | `src/lib/config.ts` (`API_BASE_URL` only), `src/instrumentation.ts` |
| edited | `src/lib/search-params.ts`, `src/lib/review-messages.ts`, `src/app/(catalog)/page.tsx`, `src/app/products/[id]/{find-product.ts,layout.tsx,page.tsx}`, `src/app/reviews/{page.tsx,actions.ts}`, `src/components/{ReviewCard,SummaryTiles,ProductsTable,StatusTabs}.tsx`, `next.config.ts` (only `transpilePackages` and its comment removed; `SECURITY_HEADERS` unchanged), `.env.example` (now `API_BASE_URL=http://127.0.0.1:3001`) |
| unchanged | `src/proxy.ts`, `eslint.config.mjs`, `error.tsx`, both `not-found.tsx`, layouts and loading files |

## Static checks

```
grep -rn "node:sqlite\|@catalog/core\|catalog-db" apps/web/src apps/web/next.config.ts apps/web/eslint.config.mjs   -> exit 1 (no hit)
grep -rn "@catalog/" apps/web/src | grep -v @catalog/api-client                                                  -> exit 1 (no hit)
"use client" modules: src/app/error.tsx (imports react only), src/components/SubmitButton.tsx (react, react-dom only)
pnpm exec tsc -p apps/web/tsconfig.json --noEmit                                  -> exit 0
NX_DAEMON=false pnpm exec nx run web:lint                                         -> Successfully ran target lint for project web
env -u API_BASE_URL NX_DAEMON=false pnpm exec nx run web:build  (API down: nothing on 3061/3000)
  -> ƒ /   ○ /_not-found   ƒ /products/[id]   ƒ /reviews   ƒ Proxy (Middleware)
  -> Successfully ran target build for project web; no `error:` line during the build
grep -rlE "3061|API_BASE_URL" apps/web/.next/static                               -> exit 1 (browser bundles clean)
```

## Smoke setup

`out/web-smoke/catalog.db` = copy of `data/catalog.db` (schema 0, 975 products: not migrated), then on the copy only:
`migrate --db catalog.db` (applied 0001-0003, schema 3) and `consolidate --db catalog.db --input data/ProductEntry.json`
(LINKED_EXACT 200, LINKED_NORMALIZED 54, CREATED 1, HELD_FOR_REVIEW 2). API: `CATALOG_DB_PATH=<copy> API_PORT=3061
API_ALLOWED_HOSTS=127.0.0.1:3061,localhost:3061 node apps/api/dist/main.js`; `GET /v1/summary` -> `{"products":976,"sellerOffers":255,"pendingReviews":2}`.
Web: `API_BASE_URL=http://127.0.0.1:3061 pnpm exec next start -H 127.0.0.1 -p 3000` from `apps/web`; no `warn:` line (API ready).

## Pages (curl)

```
/                 200  tiles: 976, 255, 2 ; 20 product links
/?q=camera        200  /products/18 "Camera Canon EOS R6", /products/43 "Security Camera Nest", /products/211 ...
/products/18      200  "Seller links for this product" table: CleaningWorld "Camera Canon EOS R6" EXACT;
                       GardenStore "Câmera Canon EOS R6" NORMALIZED  (the accented text is the seller's SourceName;
                       the two seller names carry no accent)
/products/976     200  Brand <dd>TestBrand&#x27;; SELECT 1; --</dd>  (escaped text)
/products/abc     404    /products/999999 404    /products/0 404    /products/-1 404    /products/1.5 404
```

Headless Chrome over CDP (`scripts/cdp-smoke.mjs`) renders the h1: `/products/abc` and `/products/999999` -> "No product with this id." (the products not-found page; the server HTML streams it in the RSC payload, as before); `/products/18` -> "Camera Canon EOS R6".

## Review resolve (real browser, then curl as a no-JS browser)

Browser (`scripts/cdp-smoke.mjs`, first DB copy): click "Link to candidate" on review 1 ->
`/reviews?status=PENDING&notice=LINKED&review=1&product=21`, notice "Review 1 linked to product 21.", pending list now "Review 2 (FUZZY)".

Stale second tab (`scripts/cdp-stale.mjs`, fresh copy `catalog2.db`): tabs A and B load `/reviews`; A clicks link-candidate on
review 1 -> "Review 1 linked to product 21."; B still shows review 1's form, clicks the same button ->
`/reviews?status=PENDING&error=review_not_pending&review=1`, notice "This review was already resolved."

Browser network log over all of the above: `browser request hosts: 127.0.0.1:3000`, `requests to :3061: 0 of 151` and `0 of 39`.

API log (`out/web-smoke/api2.log`, correlation id, path, status) for those calls:
```
0e971ebc-d87c-4a1f-98f3-56ef227794d2 /v1/reviews/1/resolution 200
6c0d97bf-bc20-4d07-b7cf-d44d0d249ec1 /v1/reviews/1/resolution 409
```

curl POST with the form's `$ACTION_ID_40c5...` field and `Origin: http://127.0.0.1:3000`:
```
reviewId=1 action=link-candidate (already linked)        -> 303 Location: /reviews?status=PENDING&error=review_not_pending&review=1
reviewId=2, no action field                              -> 303 Location: /reviews?error=invalid_request
reviewId=2 action=link-other productId=999999            -> 303 Location: /reviews?status=PENDING&error=product_not_found&review=2
                                                            page notice: "That product does not exist."
```

### The correlation ids in the API log are the web's

With the web pointed at a stub (`scripts/stub-503.mjs`, port 3062) that answers every request 503 `database` and echoes `x-correlation-id`, both logs show the same ids:
```
stub received: GET /v1/summary x-correlation-id 086b0d3b-...   web logged: {"event":"api.request.failed","operation":"summary","statusCode":503,"code":"database","errorType":null,"correlationId":"086b0d3b-25f3-42c4-a82f-562afb1c3a07"}
stub received: GET /v1/products/18 7711fd8d-...                web logged: operation products.get, correlationId 7711fd8d-f6b3-4434-b589-308a25668b0e
stub received: POST /v1/reviews/2/resolution 8ed8cb5c-...      web logged: operation reviews.resolve, correlationId 8ed8cb5c-e89b-4201-ab62-828d5e377d85
```
The stub's body text `SECRET-BODY-TEXT` appears in no page (`grep -c` = 0) and in no web log line.

## Error state (API stopped / API answering 503)

API stopped, web started with `API_BASE_URL=http://127.0.0.1:3061`: stderr `warn: API at http://127.0.0.1:3061 is not ready; pages will show the error state until it is`; the server keeps running.
```
/              HTTP 200 (the (catalog) loading.tsx boundary has already streamed); payload carries only E{"digest":"338716920"}
/reviews       HTTP 200 (same reason)
/products/18   HTTP 500 (the product layout sits above loading.tsx)
HTML grep for CatalogApiError | "catalog API request failed" | chunks/ssr | ECONNREFUSED | 3061: 0 hits
web log per failed call: {"event":"api.request.failed","operation":"summary","statusCode":null,"code":null,"errorType":"TypeError","correlationId":"977982f4-..."}
```
Real browser (`scripts/cdp-error.mjs`, API answering 503): `/` and `/products/18` show "Something went wrong. / Reference: <digest> / Try again", without a stack or message. A no-JS POST to the action while the API answers 503 returns `500 Internal Server Error` (body "Internal Server Error"). Next also prints its own `⨯ Error [CatalogApiError]` line with a stack to the server's stderr; that line never reaches the client.

## Boot validation (`pnpm exec next start` from apps/web; stdout separate)

```
API_BASE_URL unset                         exit=1  stderr: error: API_BASE_URL is not set; set it, for example: API_BASE_URL=http://127.0.0.1:3001
API_BASE_URL=ftp://x                       exit=1  stderr: error: API_BASE_URL must use the http: or https: scheme; set it, for example: API_BASE_URL=http://127.0.0.1:3001
API_BASE_URL=http://u:p@127.0.0.1:3061     exit=1  stderr: error: API_BASE_URL must not contain a username or password; set it, for example: API_BASE_URL=http://127.0.0.1:3001
API_BASE_URL=http://127.0.0.1:3061/v1      exit=1  stderr: error: API_BASE_URL must not contain a path; set it, ...
API_BASE_URL=http://127.0.0.1:3061/?a=1    exit=1  stderr: error: API_BASE_URL must not contain a query string or fragment; set it, ...
API_BASE_URL="not a url"                   exit=1  stderr: error: API_BASE_URL is not a valid URL; set it, ...
```
Each run: exactly one stderr line (`grep -c '^error:'` = 1), nothing else on stderr.

Readiness semantics: after config validation, `register()` starts one background `GET /health/ready` through the same client (3 s deadline combined with the 10 s client deadline, new correlation id). Ready means HTTP 200 with body `{status:"ok"}`; any other status, a refused connection or a timeout writes the single `warn:` line. Startup does not wait for the probe, never exits because of it, and does not retry it. The check is skipped when `NEXT_RUNTIME !== "nodejs"` or `NEXT_PHASE === "phase-production-build"`.

## Headers and Host

```
curl -I http://127.0.0.1:3000/
HTTP/1.1 200 OK
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
(no X-Powered-By)
curl -H 'Host: evil.example:3000' http://127.0.0.1:3000/   -> 421
```

## Cleanup

All servers stopped by pid (web `next-server` and its `pnpm exec` parent, API `node dist/main.js`, stub, and the private headless Chrome instances, found by their `--user-data-dir` under `out/web-smoke`; the user's own Chrome was not touched).
`lsof -nP -iTCP:3000 -iTCP:3061 -iTCP:3062 -sTCP:LISTEN` -> exit 1 (nothing listening).

## Finding outside this ticket (not changed: headers are frozen verbatim)

With `Referrer-Policy: no-referrer`, Chrome sends `Origin: null` on a native (not yet hydrated / no-JS) form POST. Next's Server Actions CSRF check then refuses it (`x-forwarded-host ... does not match origin header with value null ... Aborting the action`, 500). Hydrated React submissions send a real Origin and work. This comes from the existing header, not from this change; `Referrer-Policy: same-origin` would keep cross-site referrers hidden and fix the no-JS path.
