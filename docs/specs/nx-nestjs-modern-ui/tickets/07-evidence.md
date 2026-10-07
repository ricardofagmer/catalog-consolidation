# Ticket 07 evidence: resolve endpoint and error contract (C15, C16, C17, C22, C23)

Date: 2026-10-06. Worker: backend-coordinator (borisenko), IMPLEMENT, exclusive scope
`apps/api/src/review-resolution/**`. Contracts honored: C-API rev1, C-REVIEWS rev1 (frozen).
All runtime checks ran on scratch copies under `out/ticket07/` (never `data/`), API on port 3021
only; every server was stopped by PID (`lsof` shows no listener on 3021 afterwards). No tests were
authored.

## Files

- `apps/api/src/review-resolution/review-resolution.module.ts` (scaffold body replaced; imports PersistenceModule, RulesModule, ReviewsModule)
- `apps/api/src/review-resolution/review-resolution.controller.ts` (`POST /v1/reviews/:id/resolution`, 200, `@ApiProblemResponses(400, 404, 409, 415, 421, 422, 503, 500)`)
- `apps/api/src/review-resolution/review-resolution.service.ts` (one `DatabaseAccess.write`; link-candidate reads the queue row via `SqliteReviewRepository`; `ReviewsService.resolve` on `ReviewUnitOfWorkFactory.create({ connection, mode: "immediate" })`)
- `apps/api/src/review-resolution/resolution-request.ts` (`ResolutionRequest` union)
- `apps/api/src/review-resolution/resolution-request.mapper.ts` (DTO -> request)
- `apps/api/src/review-resolution/resolution-response.mapper.ts` (`ResolutionResult` -> `ResolutionResponseDto`)
- `apps/api/src/review-resolution/resolution-error.mapper.ts` (exhaustive switch over `ReviewResolutionErrorCode`, no default branch; plus `no_candidate`; anything else returns null and is rethrown unchanged)
- `apps/api/src/review-resolution/review-candidate-missing.error.ts`
- `apps/api/src/review-resolution/dto/review-id-params.dto.ts` (digits-only positive safe integer)
- `apps/api/src/review-resolution/dto/resolve-review-request.dto.ts` (`action` closed set; `productId` required for link-other, rejected otherwise)
- `apps/api/src/review-resolution/dto/resolution-response.dto.ts` (`reviewId`, `status` LINKED|CREATED|REJECTED, `productId` int|null, `linkId` int|null)

## Build, typecheck, lint (scoped)

```
$ NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p api --skip-nx-cache
✔  nx run domain:build
✔  nx run rules:build
✔  nx run reviews:build
✔  nx run consolidation:build
✔  nx run persistence:build
✔  nx run api:typecheck
✔  nx run api:build
✔  nx run api:lint
 NX   Successfully ran targets build, typecheck, lint for project api and 5 tasks it depends on
```

## Scratch databases

```
$ mkdir out/ticket07
$ cp out/ticket06a/catalog.db out/ticket07/{api.db,cli.db,api2.db,lock.db,final.db}   # 976 products, 255 links, reviews 1 (cand 21) + 2 (cand 28) PENDING
$ cp data/catalog.db out/ticket07/unmigrated.db                                         # schema version 0
```

## C15 link-candidate via API equals the CLI on a twin, then consolidate is a no-op

```
$ curl -s -i -X POST -H 'Content-Type: application/json' -d '{"action":"link-candidate"}' http://127.0.0.1:3021/v1/reviews/1/resolution
HTTP/1.1 200 OK
x-correlation-id: 8c2d1340-164b-4bd9-89cc-84e05d8dd5ec
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8

{"reviewId":1,"status":"LINKED","productId":21,"linkId":256}

$ node apps/cli/dist/main.js review resolve --db out/ticket07/cli.db --id 1 --link 21
review 1 -> LINKED product=21 link=256

# node:sqlite dump of Product, SellerProduct, ProductMatchReview ordered by Id, CreatedAt columns excluded (out/ticket07/dump.cjs)
$ node out/ticket07/dump.cjs out/ticket07/api.db tables > api.dump; node out/ticket07/dump.cjs out/ticket07/cli.db tables > cli.dump
$ diff api.dump cli.dump && echo "IDENTICAL (excluding timestamp columns)"
IDENTICAL (excluding timestamp columns)          # 1237 lines each

$ cp out/ticket07/api.db out/ticket07/api-consolidate.db
$ node apps/cli/dist/main.js consolidate --db out/ticket07/api-consolidate.db --input data/ProductEntry.json --report out/ticket07/consolidate-report.jsonl
run 2f0beae16e924dc0a5f4d5383934f41f input=data/ProductEntry.json dry_run=false committed=true rows_written=0
LINKED_EXACT                   0
LINKED_NORMALIZED              0
CREATED                        0
UNCHANGED                    257
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                1
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
$ grep a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1 out/ticket07/consolidate-report.jsonl
{"index":57,"sellerName":"FootwearHub","sellerProductId":"a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1","outcome":"UNCHANGED","productId":21,...}
```

Note: the very first POST attempt was sent from zsh with an unsplit `-H` variable, which produced a
malformed header line; Node's HTTP parser answered a bare `400` (`Connection: close`, no body) before
any application code ran, and no data changed. The request above is the properly formed retry.

## C16 the same resolution again

```
SellerProduct 256      (before)
$ POST /v1/reviews/1/resolution {"action":"link-candidate"}
{"statusCode":409,"code":"review_not_pending","message":"review is not pending","correlationId":"c3fa6717-dc45-4b6c-b0dd-25e1538e7da8"}
  -> HTTP 409
SellerProduct 256      (after: no second link)
```

## Every action once on a fresh pending review

```
$ POST /v1/reviews/2/resolution {"action":"create"}                   (api.db)
{"reviewId":2,"status":"CREATED","productId":977,"linkId":257}  -> HTTP 200
  Product 977 {Name:'Processador AMD Ryzen 9 7950X', Brand:'AMD', NormalizedName:'processador amd ryzen 9 7950x'}; SellerProduct 257 {SuperMart, ProductId 977, MatchType CREATED}
$ POST /v1/reviews/1/resolution {"action":"link-other","productId":30} (api2.db)
{"reviewId":1,"status":"LINKED","productId":30,"linkId":256}    -> HTTP 200
  SellerProduct 256 {FootwearHub, ProductId 30, MatchType REVIEWED}
$ POST /v1/reviews/2/resolution {"action":"reject"}                   (api2.db)
{"reviewId":2,"status":"REJECTED","productId":null,"linkId":null} -> HTTP 200
  api2.db: Product 976, SellerProduct 256, review 2 REJECTED
```
link-candidate is C15 above (and again on `final.db` after the last rebuild: 200 `{"reviewId":1,"status":"LINKED","productId":21,"linkId":256}`).

## C17 every reachable error code

Scratch-only rows added to `out/ticket07/api.db` with `out/ticket07/seed-scratch.cjs` (refuses any path outside out/ticket07/):

```
{"Id":10,"SellerName":"ScratchSeller","SellerProductId":"scratch-no-candidate","SourceName":"Scratch Widget","CandidateProductId":null,"Status":"PENDING"}
{"Id":11,"SellerName":"ScratchSeller","SellerProductId":"scratch-unnormalizable","SourceName":"!!!","CandidateProductId":21,"Status":"PENDING"}
{"Id":12,"SellerName":"MegaStore","SellerProductId":"a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d","SourceName":"Scratch Linked Sku","CandidateProductId":2,"Status":"PENDING"}   # SKU already in SellerProduct 1
{"Id":13,"SellerName":"MegaStore","SellerProductId":"scratch-new-sku","SourceName":"Scratch Same Product","CandidateProductId":2,"Status":"PENDING"}           # MegaStore already linked to product 2
```

Each body is checked by `out/ticket07/check-body.cjs`: keys exactly `statusCode,code,message,correlationId`
in that order, code in the closed `API_ERROR_CODES`, and the message contains none of the seller
names/SKUs/source names seeded above, nor `SELECT`, `SQLITE`, stack frames or the bad host.

```
--- path id abc
$ POST /v1/reviews/abc/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"60b36edf-2a3a-471f-b998-adae37face0a"}
  check: keys=EXACT code=closed-set leaks=none
--- path id 0
$ POST /v1/reviews/0/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"c277cb63-1fde-4ee9-95e4-747808cd882b"}
  check: keys=EXACT code=closed-set leaks=none
--- path id -1
$ POST /v1/reviews/-1/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"9ddf7da9-9b38-4985-a1fc-6cf533263ad8"}
  check: keys=EXACT code=closed-set leaks=none
--- path id 1e3
$ POST /v1/reviews/1e3/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"91c31aad-9098-4563-9cbc-70a55bf40007"}
  check: keys=EXACT code=closed-set leaks=none
--- missing action
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: action","correlationId":"a8b8fef1-d41c-4355-8941-76dd6a800d15"}
  check: keys=EXACT code=closed-set leaks=none
--- unknown action
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"merge"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: action","correlationId":"70ae6cc3-4652-4f45-bd0c-30373d646003"}
  check: keys=EXACT code=closed-set leaks=none
--- productId on reject
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"reject","productId":21} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"cdceec70-b1d6-48ec-a8a7-711911120f07"}
  check: keys=EXACT code=closed-set leaks=none
--- productId on link-candidate
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-candidate","productId":21} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"c32488ec-7224-4537-a96e-2b1988983e63"}
  check: keys=EXACT code=closed-set leaks=none
--- link-other without productId
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-other"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"6b101c4c-d3b6-49cd-b00e-f733471101ec"}
  check: keys=EXACT code=closed-set leaks=none
--- link-other productId as string
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-other","productId":"21"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"9cc1badb-5893-4e9c-9908-61b5e96adae4"}
  check: keys=EXACT code=closed-set leaks=none
--- link-other productId 0
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-other","productId":0} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"37816396-5321-4848-8412-994bf7001c33"}
  check: keys=EXACT code=closed-set leaks=none
--- link-other productId 1.5
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-other","productId":1.5} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: productId","correlationId":"14e3d439-63c4-463d-8f9f-d939b961fa36"}
  check: keys=EXACT code=closed-set leaks=none
--- extra property
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"reject","note":"ScratchSeller"} 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: note","correlationId":"a12ac775-b189-46f7-8983-e3babf73f472"}
  check: keys=EXACT code=closed-set leaks=none
--- invalid JSON text
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action": reject 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"59823903-9400-4102-967e-fb2c20661fca"}
  check: keys=EXACT code=closed-set leaks=none
--- JSON array body
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] [{"action":"reject"}] 
  HTTP 400 {"statusCode":400,"code":"invalid_request","message":"invalid request fields: 0, action","correlationId":"e998338d-8686-40b2-bbf5-f1949caca6e6"}
  check: keys=EXACT code=closed-set leaks=none
--- unknown review id (reject)
$ POST /v1/reviews/999999/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 404 {"statusCode":404,"code":"review_not_found","message":"review not found","correlationId":"667f51aa-0dde-4dd6-97d0-dc98bf272685"}
  check: keys=EXACT code=closed-set leaks=none
--- unknown review id (link-candidate)
$ POST /v1/reviews/999999/resolution  [Content-Type: application/json] {"action":"link-candidate"} 
  HTTP 404 {"statusCode":404,"code":"review_not_found","message":"review not found","correlationId":"be1cbcd7-cc34-4b09-9374-1f65792e2d21"}
  check: keys=EXACT code=closed-set leaks=none
--- unknown product for link-other
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"link-other","productId":999999} 
  HTTP 404 {"statusCode":404,"code":"product_not_found","message":"product not found","correlationId":"92f53cb1-7b8d-4fd3-8e16-70c587d5bb34"}
  check: keys=EXACT code=closed-set leaks=none
--- not pending (review 1)
$ POST /v1/reviews/1/resolution  [Content-Type: application/json] {"action":"reject"} 
  HTTP 409 {"statusCode":409,"code":"review_not_pending","message":"review is not pending","correlationId":"4fff3fd7-7258-4bea-930d-acbbc6c9d247"}
  check: keys=EXACT code=closed-set leaks=none
--- seller_sku_already_linked (review 12 create)
$ POST /v1/reviews/12/resolution  [Content-Type: application/json] {"action":"create"} 
  HTTP 409 {"statusCode":409,"code":"seller_sku_already_linked","message":"seller SKU is already linked to a product","correlationId":"0517d216-0df3-4653-98ca-3c278d51a8c0"}
  check: keys=EXACT code=closed-set leaks=none
--- seller_already_linked_to_product (review 13 link-other 2)
$ POST /v1/reviews/13/resolution  [Content-Type: application/json] {"action":"link-other","productId":2} 
  HTTP 409 {"statusCode":409,"code":"seller_already_linked_to_product","message":"seller is already linked to the target product","correlationId":"ad1905ee-39a3-44ca-8bdb-94255a4be642"}
  check: keys=EXACT code=closed-set leaks=none
--- source_name_unnormalizable (review 11 create)
$ POST /v1/reviews/11/resolution  [Content-Type: application/json] {"action":"create"} 
  HTTP 422 {"statusCode":422,"code":"source_name_unnormalizable","message":"review source name has no normalized form","correlationId":"8899de52-7ad8-4667-bc4f-c26c7d3e249e"}
  check: keys=EXACT code=closed-set leaks=none
--- no_candidate (review 10 link-candidate)
$ POST /v1/reviews/10/resolution  [Content-Type: application/json] {"action":"link-candidate"} 
  HTTP 422 {"statusCode":422,"code":"no_candidate","message":"review has no candidate product to link","correlationId":"eeadbc8a-f0f2-4c87-97cf-3bfed1a02f78"}
  check: keys=EXACT code=closed-set leaks=none
--- form-encoded body
$ POST /v1/reviews/2/resolution  [Content-Type: application/x-www-form-urlencoded] action=reject 
  HTTP 415 {"statusCode":415,"code":"unsupported_media_type","message":"request body must be application/json","correlationId":"7f3bf29a-e3c3-4ec6-9580-31b54d8cb5b6"}
  check: keys=EXACT code=closed-set leaks=none
--- bad Host
$ POST /v1/reviews/2/resolution  [Content-Type: application/json] {"action":"reject"} -H Host: evil.example:3021
  HTTP 421 {"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"8d2c0c23-e713-4b7e-b44e-c5111e570ef2"}
  check: keys=EXACT code=closed-set leaks=none
```
Full table summary before and after the probes is identical (`diff before-c17.txt after-c17.txt`:
"NO DATA CHANGE across C17 probes").

503 `database` (server started on the unmigrated scratch copy):
```
$ POST /v1/reviews/1/resolution {"action":"link-candidate"}   (server on unmigrated.db, schema version 0)
  HTTP 503 {"statusCode":503,"code":"database","message":"database unavailable","correlationId":"b6e4ae11-cd8e-4d73-b02c-1664462c586c"}
  check: keys=EXACT code=closed-set leaks=none
server log:
{"level":"error",...,"event":"api.database.failed","errorType":"DatabaseFileError.schema_outdated","correlationId":"b6e4ae11-...","msg":"database failure"}
{"level":"error",...,"correlationId":"b6e4ae11-...","req":{"method":"POST","path":"/v1/reviews/1/resolution"},"event":"api.request","res":{"status":503},"durationMs":3,"msg":"request failed"}
```

`500 internal` is declared but not reachable from valid inputs (only the defensive unexpected-status
branch of the response mapper or a defect would raise it); unexercised.

## C23 busy write lock -> 503 after the busy timeout, one structured event

`out/ticket07/hold-lock.cjs` holds `BEGIN IMMEDIATE` on `out/ticket07/lock.db` for 9 s in a separate process.

```
2026-10-06T19:10:47.472Z lock held (BEGIN IMMEDIATE) on out/ticket07/lock.db
2026-10-06T19:10:47Z POST link-candidate while the lock is held
  HTTP 503 time_total=5.204760s
{"statusCode":503,"code":"database","message":"database unavailable","correlationId":"50affb07-ea74-485d-a693-090a658a5e49"}
  check: keys=EXACT code=closed-set leaks=none
Product 976
SellerProduct 255                     # nothing written
2026-10-06T19:10:56.476Z lock released
2026-10-06T19:10:56Z POST link-candidate after release
{"reviewId":1,"status":"LINKED","productId":21,"linkId":256}
  HTTP 200 time_total=0.003811s
SellerProduct 256
```
Server log for the failed request (startup lines omitted):
```
{"level":"error","timestamp":"2026-10-06T19:10:53.192Z","service":"catalog_consolidation_api","event":"api.database.failed","errorType":"SqliteError.5","correlationId":"50affb07-ea74-485d-a693-090a658a5e49","msg":"database failure"}
{"level":"error","timestamp":"2026-10-06T19:10:53.193Z","service":"catalog_consolidation_api","correlationId":"50affb07-ea74-485d-a693-090a658a5e49","req":{"method":"POST","path":"/v1/reviews/1/resolution"},"event":"api.request","res":{"status":503},"durationMs":5197,"msg":"request failed"}
--- api.database.failed count: 1
```
`SqliteError.5` is SQLITE_BUSY; 5197 ms >= the 5000 ms busy timeout. Exactly one `api.database.failed`
event (event name + errorType + correlationId, no message, SQL or seller text); the second line is the
standard request completion log (method, path without query, status only).

## C22 OpenAPI

```
$ node apps/api/dist/openapi.js
wrote apps/api/dist/openapi.json
openapi 3.0.0 paths: /health/live /health/ready /v1/summary /v1/products /v1/products/{id} /v1/reviews /v1/reviews/{id}/resolution
POST /v1/reviews/{id}/resolution operationId ReviewResolutionController_resolve tags [reviews]
parameters [{"name":"id","required":true,"in":"path","description":"Review queue row id (digits only)","schema":{"minimum":1,"maximum":9007199254740991,"example":1,"type":"integer"}}]
requestBody $ref ResolveReviewRequestDto (required: action; action -> enum ResolutionAction [link-candidate, link-other, create, reject]; productId integer 1..2^53-1)
200 Review resolved; ids come from the committed transaction -> ResolutionResponseDto (required reviewId, status [LINKED, CREATED, REJECTED], productId int nullable, linkId int nullable)
400/404/409/415/421/422/500/503 -> ErrorBodyDto (required statusCode, code -> ApiErrorCode, message, correlationId)
$ curl -s http://127.0.0.1:3021/docs-json   -> HTTP 200
served /docs-json equals dist/openapi.json: true has resolution path: true ErrorBodyDto: true
```
The document is written to `apps/api/dist/openapi.json` (the foundation's path), not a root `dist/`.

## Source data untouched

```
$ shasum -a 256 data/catalog.db data/ProductEntry.json
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
$ lsof -nP -iTCP:3021 -sTCP:LISTEN | wc -l
0
```

## Observations outside this scope (foundation, owner worker 05 / orchestrator)

- Invalid JSON text answers 400 `invalid_request` with message `invalid request`, not the
  `request body is not valid JSON` text present in `errors/exception-classification.ts`
  `BODY_FAILURE_MESSAGES`: the body-parser error reaches the filter as an `HttpException`, which is
  classified before `classifyBodyFailure`. Contract-compliant (four fields, closed code); only the
  message is less specific.
- A request with a malformed header line is rejected by Node's HTTP parser with a bare 400 and no
  body, before Nest runs; it cannot carry the four-field body.

## Audit follow-ups

Two security-audit findings, fixed on 2026-10-06 (backend-coordinator, IMPLEMENT).

**Correction.** The C22 note above ("`500 internal` is declared but not reachable from valid inputs") was
too strong: a client could reach it. A JSON body nested a few thousand levels deep (14 KB, under the
16 KB limit) made class-transformer, run by the global `ValidationPipe({ transform: true })`, recurse
until `RangeError`, answered 500 `internal` and logged as `api.internal.failed`. After the fix no
client input reaches 500; it remains only for defects (the response mapper's defensive branch).

**Fix 1 (LOW, deep nesting).** `apps/api/src/http/json-body-depth.middleware.ts` (`JsonBodyDepthMiddleware`)
walks the parsed body with an explicit stack, never deeper than `MAX_JSON_BODY_DEPTH = 16` (top-level
body = depth 1), and rejects deeper bodies with `validationProblem([])`: 400 `invalid_request`, message
`invalid request`, no input echoed. `configureHttpPipeline` mounts it immediately after the JSON body
parser, so it covers every JSON endpoint; the rejection is logged once as `api.request.rejected`.
Shallow nesting keeps the existing ValidationPipe outcome (C4 below).

**Fix 2 (INFO, ordering).** `apps/api/src/review-resolution/review-resolution.service.ts` `candidateCommand`
now checks the status before the candidate:
```
before:  const productId = record.item.candidateProductId;
         if (productId === null) {            // 422 no_candidate even for a resolved review
after:   if (record.item.status !== "PENDING") { throw review_not_pending }   // 409
         const productId = record.item.candidateProductId;
         if (productId === null) {            // 422 only for PENDING reviews
```
Statuses never return to PENDING, so answering from the pre-read is final; PENDING reviews keep the
same outcomes and order (404 unknown, 422 no candidate, then ReviewsService inside the transaction).

### Evidence

Scratch only: `out/audit-followup/` holds `before-dist` (copy of the pre-fix `apps/api/dist`),
`after-dist` (`pnpm exec tsc -p apps/api/tsconfig.json --outDir out/audit-followup/after-dist`, exit 0),
two copies of `out/ticket07/api.db` with review 10 (no candidate) set to `AMBIGUOUS`, and `probe.sh`.
Server: `CATALOG_DB_PATH=<scratch db> API_PORT=3051 node <phase>-dist/main.js`, stopped after each run.

```
$ pnpm exec tsc -p apps/api/tsconfig.json --noEmit         -> exit 0
payloads: nested-arrays.json 14024 B ("x": 7000 nested arrays), nested-objects.json 15625 B ("x": 2600
nested objects), nested-action.json 14011 B ("action": 7000 nested arrays)
```

| Probe | Before | After |
|---|---|---|
| C1 14 KB nested arrays in `x` | 500 internal | 400 invalid_request "invalid request" |
| C2 15.6 KB nested objects in `x` | 500 internal | 400 invalid_request "invalid request" |
| C3 14 KB nested arrays in `action` | 500 internal | 400 invalid_request "invalid request" |
| C4 `{"action":"reject","x":{"a":{"b":1}}}` | 400 "invalid request fields: x" | same |
| C5 top-level `[1,2]` | 400 "invalid request fields: 0, 1, action" | same |
| C6 `{}` | 400 "invalid request fields: action" | same |
| C7 text/plain | 415 unsupported_media_type | same |
| C8 link-candidate review 999 | 404 review_not_found | same |
| C9 link-candidate, AMBIGUOUS PENDING review 10, no candidate | 422 no_candidate | same |
| C10 reject review 10 | 200 REJECTED | same |
| C11 link-candidate, review 10 now REJECTED | **422 no_candidate** | **409 review_not_pending** |
| C12 reject review 13 | n/a (before run probed link-candidate on review 12: 409 seller_sku_already_linked) | 200 REJECTED |
| C13 reject review 13 again | n/a | 409 review_not_pending |
| C14 GET /v1/reviews | 200 | 200 |

After-run responses (C1-C3, C11):
```
--- C1 14 KB nested arrays in x
{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"1800c193-1296-43fd-a136-045c5e58ed7a"}
  -> HTTP 400
--- C2 15.6 KB nested objects in x
{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"8ff752d0-4b87-469f-b86c-9962d329fee1"}
  -> HTTP 400
--- C3 14 KB nested arrays in action
{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"b763c2c9-a0a1-4cac-9caa-f0e0479205d9"}
  -> HTTP 400
--- C11 link-candidate on the now REJECTED AMBIGUOUS review
{"statusCode":409,"code":"review_not_pending","message":"review is not pending","correlationId":"12b27522-3aed-45fa-9029-a23d1082a082"}
  -> HTTP 409
```
After-run log lines for C1-C3 (one `api.request.rejected` each, correlation ids match the responses):
```
{"level":"warn","timestamp":"2026-10-06T19:21:03.480Z","service":"catalog_consolidation_api","event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/v1/reviews/13/resolution","status":400,"correlationId":"1800c193-1296-43fd-a136-045c5e58ed7a","msg":"request rejected"}
{"level":"warn","timestamp":"2026-10-06T19:21:03.490Z","service":"catalog_consolidation_api","event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/v1/reviews/13/resolution","status":400,"correlationId":"8ff752d0-4b87-469f-b86c-9962d329fee1","msg":"request rejected"}
{"level":"warn","timestamp":"2026-10-06T19:21:03.499Z","service":"catalog_consolidation_api","event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/v1/reviews/13/resolution","status":400,"correlationId":"b763c2c9-a0a1-4cac-9caa-f0e0479205d9","msg":"request rejected"}
```
Before-run log lines for C1-C3:
```
{"level":"error","timestamp":"2026-10-06T19:20:52.258Z","service":"catalog_consolidation_api","event":"api.internal.failed","errorType":"RangeError","correlationId":"6d4a050f-2f98-49be-bc2e-92ff71505d51","msg":"unexpected failure"}
{"level":"error","timestamp":"2026-10-06T19:20:52.274Z","service":"catalog_consolidation_api","event":"api.internal.failed","errorType":"RangeError","correlationId":"fdaab425-6659-4feb-a548-dfa8bc3561bb","msg":"unexpected failure"}
{"level":"error","timestamp":"2026-10-06T19:20:52.286Z","service":"catalog_consolidation_api","event":"api.internal.failed","errorType":"RangeError","correlationId":"6346fbf3-752f-46ff-9ea1-ad6694a02260","msg":"unexpected failure"}
```
```
$ grep -c api.internal.failed   before-server.log=3  after-server.log=0
$ grep -c api.request.rejected  before-server.log=1  after-server.log=4   (after: C1-C3 + C7 415)
$ node {before,after}-dist/openapi.js; shasum -a 256
b4810648223ba20b1d1a025c72042ffe69bd40cab50b02e53fc137fe8eeba5c8  before-dist/openapi.json
b4810648223ba20b1d1a025c72042ffe69bd40cab50b02e53fc137fe8eeba5c8  after-dist/openapi.json
b4810648223ba20b1d1a025c72042ffe69bd40cab50b02e53fc137fe8eeba5c8  apps/api/dist/openapi.json
$ shasum -a 256 data/catalog.db data/ProductEntry.json      (unchanged)
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
$ lsof -nP -iTCP:3051 -sTCP:LISTEN | wc -l
       0
```
OpenAPI is byte-identical before and after (contract C-API rev1 unchanged). No tests were authored;
`[tests] pending — final-stage user approval required`.
