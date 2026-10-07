# Ticket 06 evidence, worker 06B: API read endpoints (C11, C12, C13, C14)

Date: 2026-10-06. Worker: backend-coordinator (borisenko), IMPLEMENT, scope
`apps/api/src/catalog/**` and `apps/api/src/review-queue/**`. Contracts honored: C-API rev1,
C-READMODEL rev1, C-REVIEWS rev1. No tests authored. All runtime checks ran on scratch copies under
`out/ticket06b/` (never `data/`), port 3011 only; every server was stopped by PID and `lsof` shows no
listener on 3011 afterwards.

## Files

- `apps/api/src/catalog/`: `catalog.module.ts`, `catalog.controller.ts`, `catalog.service.ts`,
  `catalog-response.mapper.ts`, `query-value.transforms.ts`, `dto/{list-products-query,product-params,summary,product-page,product-detail}.dto.ts`
- `apps/api/src/review-queue/`: `review-queue.module.ts`, `review-queue.controller.ts`, `review-queue.service.ts`,
  `review-queue-response.mapper.ts`, `query-value.transforms.ts`, `dto/{list-reviews-query,review-page}.dto.ts`

## Decisions and deviations

- Integer query/path values use a strict `@Transform` (canonical unsigned decimal, safe integer) instead of
  `@Type(() => Number)`: `Number()` would turn `""` into 0, `0x10` into 16 and `1e2` into 100, all of which
  would pass validation. Non-canonical input stays a string and fails `@IsInt` -> 400 invalid_request.
- `similarity` is the stored score rounded half-to-even to 4 decimals (`roundHalfEven`, `REPORT_SCORE_DECIMALS`),
  the same value the CLI and web display (0.9090909... -> 0.9091).
- `ReviewItemDto` also carries `candidateProductId` (the proposed id even if that product is gone).
  `ReviewRecord` has no resolution fields or timestamps (`CreatedAt` exists in the table but not in the
  domain record), so none are exposed; adding them is a C-READMODEL/C-DOMAIN revision, not 06B scope.
- `q` blank or whitespace-only means no filter (web behavior); over 200 code points is 400, where the web
  silently ignored it. Unknown query keys and repeated keys are 400 (global `forbidNonWhitelisted`).
- `query-value.transforms.ts` is duplicated in both feature dirs because C-API forbids imports between
  feature modules (two copies; abstract on the third).
- Product not found is `ApiProblem` 404 `product_not_found`, thrown inside the read callback so product and
  offers come from one connection.
- "Câmera Canon EOS R6" in the demo data is the source name of Seller Offer 56 (NORMALIZED) on product 18
  "Camera Canon EOS R6"; `q=camera` and `q=Câmera` both return product 18 and its detail shows the accented offer.

## Build, typecheck, lint (scoped)

```
$ NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p api --skip-nx-cache --output-style=static
> nx run domain:build
> nx run rules:build
> nx run consolidation:build
> nx run reviews:build
> nx run persistence:build
> nx run api:typecheck
> nx run api:build
> nx run api:lint
 NX   Successfully ran targets build, typecheck, lint for project api and 5 tasks it depends on
$ grep -rnE "SELECT|INSERT|prepare\(" apps/api/src/catalog apps/api/src/review-queue   # exit 1: no SQL in the app
```

## Scratch databases

```
$ mkdir -p out/ticket06b && cp out/ticket06a/catalog.db out/ticket06b/catalog.db   # demo db, schema 3
$ cp data/catalog.db out/ticket06b/unmigrated.db                                     # schema 0, for the 503 path
$ cp out/ticket06b/catalog.db out/ticket06b/ambiguous.db && node out/ticket06b/make-ambiguous.cjs out/ticket06b/ambiguous.db
inserted products 977, 978; review 3
```

## Demo database: C11, C12, C13, C14, OpenAPI

Server: `CATALOG_DB_PATH=out/ticket06b/catalog.db API_PORT=3011 node apps/api/dist/main.js` (background,
PID 45336). Script `out/ticket06b/smoke.sh`, full output `out/ticket06b/smoke.log`:

```
$ curl -s '/v1/summary'
{"products":976,"sellerOffers":255,"pendingReviews":2}
[status 200]

## C12
q=camera items: 14 names: 18:Camera Canon EOS R6 | 43:Security Camera Nest | 211:Pet Camera with Treat Dispenser | 277:Action Camera Insta360 | 292:Backup Camera Wireless | 731:Waterproof Camera Disposable | 732:Action Camera 4K | 733:Underwater Camera Housing | 737:Camera Backpack DSLR | 738:Camera Lens 50mm Prime | 739:Camera Lens 24-70mm Zoom | 744:Camera Battery Charger | 746:Camera Strap Neck | 747:Camera Bag Shoulder nextCursor: null
q=Câmera items: 14 names: 18:Camera Canon EOS R6 | 43:Security Camera Nest | 211:Pet Camera with Treat Dispenser | 277:Action Camera Insta360 | 292:Backup Camera Wireless | 731:Waterproof Camera Disposable | 732:Action Camera 4K | 733:Underwater Camera Housing | 737:Camera Backpack DSLR | 738:Camera Lens 50mm Prime | 739:Camera Lens 24-70mm Zoom | 744:Camera Battery Charger | 746:Camera Strap Neck | 747:Camera Bag Shoulder
q=CAMERA items: 14
default: items 20 first {"id":1,"name":"Knife Set Professional","brand":"Wusthof","category":"Kitchen","sellerCount":0} nextCursor 20
q= (blank): items 20 nextCursor 20
limit=100: items 100 ids 1..100 nextCursor 100
page1 1..20 page2 (after=20) 21..40 overlap 0
after=975: items 976 nextCursor null
$ curl -s '/v1/products?limit=101'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"f5e43f22-ac68-4439-b9b1-2a845d951407"}
[status 400]

$ curl -s '/v1/products?limit=0'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"dd178f2b-69c4-4675-9eba-19036e132af3"}
[status 400]

$ curl -s '/v1/products?after=-1'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: after","correlationId":"a5b4f0ce-acc1-45d2-a48b-d35fdc504ed0"}
[status 400]

$ curl -s '/v1/products?after=abc'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: after","correlationId":"52f1d39f-040a-42e1-ae70-411bae736c05"}
[status 400]

$ curl -s '/v1/products?limit=1.5'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"585bd42b-a936-4388-b846-0d7eaa568179"}
[status 400]

$ curl -s '/v1/products?limit='
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"a009289e-f687-4589-9d99-d68de4b1398e"}
[status 400]

$ curl -s '/v1/products?limit=0x10'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"15c3a322-2257-475f-bd01-1947f5df9cb6"}
[status 400]

$ curl -s '/v1/products?limit=1e2'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"03cdab61-aac6-47cc-bfd7-5adcab4b7bc4"}
[status 400]

$ curl -s '/v1/products?limit=1&limit=2'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"c186205f-18c8-4ec3-9e8b-8d45484c9d65"}
[status 400]

$ curl -s '/v1/products?q=<201 x a>'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: q","correlationId":"9d56fda3-8042-4310-bf75-c5349cf4745d"}
[status 400]

$ curl -s '/v1/products?unknown=1'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: unknown","correlationId":"c8f1e61e-2f43-4ebd-9379-27480258c61b"}
[status 400]

$ curl -s '/v1/products?q=<200 x a>'
{"items":[],"nextCursor":null}
[status 200]

## C13
$ curl -s '/v1/products/976'
{"id":976,"name":"Security Test Product","brand":"TestBrand'; SELECT 1; --","category":"Electronics","normalizedName":"security test product","normalizedBrand":"testbrand select 1","offers":{"items":[{"id":177,"sellerName":"MegaStore","sellerProductId":"09835342345-4678-9abc-def012345678","sourceName":"Security Test Product","sourceBrand":"TestBrand'; SELECT 1; --","sourceCategory":"Electronics","matchType":"CREATED"}],"hasMore":false}}
[status 200]

$ curl -s '/v1/products/abc'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"96ea027c-ce1a-46bd-b12c-b5f74c38ede4"}
[status 400]

$ curl -s '/v1/products/0'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"b306f204-e22f-4d8d-8375-2fc5386054d1"}
[status 400]

$ curl -s '/v1/products/-1'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"f24e89df-d9da-4533-9b1e-58fa0672c78f"}
[status 400]

$ curl -s '/v1/products/1.5'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"35bcfb52-1e6c-4dbf-963e-002a8e58eb5f"}
[status 400]

$ curl -s '/v1/products/999999'
{"statusCode":404,"code":"product_not_found","message":"product not found","correlationId":"11ab9df1-43e9-42b4-93df-86df8bf0c88f"}
[status 404]

$ curl -s '/v1/products/99999999999999999999'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"1c5f9071-2392-4c30-a0c0-3189576969dd"}
[status 400]

product 1: Knife Set Professional offers 0 hasMore false first offer undefined
## C14
$ curl -s '/v1/reviews?status=PENDING'
{"items":[{"id":1,"status":"PENDING","reason":"FUZZY","similarity":0.9091,"sellerName":"FootwearHub","sellerProductId":"a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1","sourceName":"Roteador WiFi 6 TP-Link","sourceBrand":"TP-Link","sourceCategory":"Networking","candidateProductId":21,"candidate":{"id":21,"name":"Router WiFi 6 TP-Link","brand":"TP-Link","category":"Networking"},"liveCandidates":[]},{"id":2,"status":"PENDING","reason":"FUZZY","similarity":0.9643,"sellerName":"SuperMart","sellerProductId":"b4b4b4b4-c5c5-4d6d-e7e7-f8f8f8f8f8f8","sourceName":"Processador AMD Ryzen 9 7950X","sourceBrand":"AMD","sourceCategory":"Components","candidateProductId":28,"candidate":{"id":28,"name":"Processor AMD Ryzen 9 7950X","brand":"AMD","category":"Components"},"liveCandidates":[]}],"nextCursor":null}
[status 200]

$ curl -s '/v1/reviews'
{"items":[{"id":1,"status":"PENDING","reason":"FUZZY","similarity":0.9091,"sellerName":"FootwearHub","sellerProductId":"a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1","sourceName":"Roteador WiFi 6 TP-Link","sourceBrand":"TP-Link","sourceCategory":"Networking","candidateProductId":21,"candidate":{"id":21,"name":"Router WiFi 6 TP-Link","brand":"TP-Link","category":"Networking"},"liveCandidates":[]},{"id":2,"status":"PENDING","reason":"FUZZY","similarity":0.9643,"sellerName":"SuperMart","sellerProductId":"b4b4b4b4-c5c5-4d6d-e7e7-f8f8f8f8f8f8","sourceName":"Processador AMD Ryzen 9 7950X","sourceBrand":"AMD","sourceCategory":"Components","candidateProductId":28,"candidate":{"id":28,"name":"Processor AMD Ryzen 9 7950X","brand":"AMD","category":"Components"},"liveCandidates":[]}],"nextCursor":null}
[status 200]

$ curl -s '/v1/reviews?status=LINKED'
{"items":[],"nextCursor":null}
[status 200]

$ curl -s '/v1/reviews?limit=1'
{"items":[{"id":1,"status":"PENDING","reason":"FUZZY","similarity":0.9091,"sellerName":"FootwearHub","sellerProductId":"a7a7a7a7-b8b8-4c9c-d0d0-e1e1e1e1e1e1","sourceName":"Roteador WiFi 6 TP-Link","sourceBrand":"TP-Link","sourceCategory":"Networking","candidateProductId":21,"candidate":{"id":21,"name":"Router WiFi 6 TP-Link","brand":"TP-Link","category":"Networking"},"liveCandidates":[]}],"nextCursor":1}
[status 200]

$ curl -s '/v1/reviews?status=BOGUS'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: status","correlationId":"a3ea55bd-1396-4d74-83ef-9e9ee7864104"}
[status 400]

$ curl -s '/v1/reviews?status=pending'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: status","correlationId":"33ecc178-a8e8-4077-9d81-a23e3ff3b533"}
[status 400]

$ curl -s '/v1/reviews?limit=101'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: limit","correlationId":"37964cf8-51f1-4390-ab8a-7498ac1ca110"}
[status 400]

$ curl -s '/v1/reviews?after=-1'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: after","correlationId":"2548bc11-f725-4afc-9f0a-4702b1b3247d"}
[status 400]

## headers / host
HTTP/1.1 200 OK
x-correlation-id: d4a95393-0b26-4a08-9c19-b5b492256fcf
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 54
ETag: W/"36-bpsp2w6lp2U9XbCQkswnGfdhzik"
Date: Tue, 06 Oct 2026 19:09:43 GMT
Connection: keep-alive

HTTP/1.1 421 Misdirected Request
x-correlation-id: ed6fed6d-ced3-454a-b806-ffc453933777
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 128
ETag: W/"80-1DuDi44Q6rEOz4Udn9aO7NJ7WPc"
Date: Tue, 06 Oct 2026 19:09:43 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"ed6fed6d-ced3-454a-b806-ffc453933777"}
## docs-json paths
/health/live get 200/421
/health/ready get 200/421/503
/v1/summary get 200/421/500/503
/v1/products get 200/400/421/500/503
/v1/products/{id} get 200/400/404/421/500/503
/v1/reviews get 200/400/421/500/503
/v1/reviews/{id}/resolution post 200/400/404/409/415/421/422/500/503
params /v1/products: [{"name":"q","required":false,"in":"query","description":"Accent- and case-insensitive product name search; blank means no filter","schema":{"maxLength":200,"example":"camera","type":"string"}},{"name":"after","required":false,"in":"query","description":"Keyset cursor: return products with an id greater than this (the previous page's nextCursor)","schema":{"minimum":0,"default":0,"type":"integer"}},{"name":"limit","required":false,"in":"query","description":"Page size","schema":{"minimum":1,"maximum":100,"default":20,"type":"integer"}}]
params /v1/products/{id}: [{"name":"id","required":true,"in":"path","description":"Product id","schema":{"minimum":1,"example":976,"type":"integer"}}]
params /v1/reviews: [{"name":"status","required":false,"in":"query","description":"Queue items in this status","schema":{"$ref":"#/components/schemas/ReviewStatus"}},{"name":"after","required":false,"in":"query","description":"Keyset cursor: return reviews with an id greater than this (the previous page's nextCursor)","schema":{"minimum":0,"default":0,"type":"integer"}},{"name":"limit","required":false,"in":"query","description":"Page size","schema":{"minimum":1,"maximum":100,"default":20,"type":"integer"}}]
SellerOfferDto.matchType: {"description":"How the offer was linked: EXACT and NORMALIZED by the consolidator, CREATED when it created the product, REVIEWED when a reviewer linked it","allOf":[{"$ref":"#/components/schemas/MatchType"}]} MatchType: {"type":"string","enum":["EXACT","NORMALIZED","CREATED","REVIEWED"],"description":"How the offer was linked: EXACT and NORMALIZED by the consolidator, CREATED when it created the product, REVIEWED when a reviewer linked it"}
ReviewItemDto props: id,status,reason,similarity,sellerName,sellerProductId,sourceName,sourceBrand,sourceCategory,candidateProductId,candidate,liveCandidates
ReviewItemDto.candidate: {"nullable":true,"description":"The proposed product as it is now; null when none was proposed or it no longer exists","type":"object","allOf":[{"$ref":"#/components/schemas/CandidateProductDto"}]}

$ curl -s /v1/products/18
{"id":18,"name":"Camera Canon EOS R6","brand":"Canon","category":"Photography","normalizedName":"camera canon eos r6","normalizedBrand":"canon","offers":{"items":[{"id":17,"sellerName":"CleaningWorld","sellerProductId":"e7f8a9b0-c1d2-4e5f-4a5b-6c7d8e9f0a1b","sourceName":"Camera Canon EOS R6","sourceBrand":"Canon","sourceCategory":"Photography","matchType":"EXACT"},{"id":56,"sellerName":"GardenStore","sellerProductId":"e5e5e5e5-f6f6-4a7a-b8b8-c9c9c9c9c9c9","sourceName":"Câmera Canon EOS R6","sourceBrand":"Canon","sourceCategory":"Photography","matchType":"NORMALIZED"}],"hasMore":false}}
$ grep -h '^{"statusCode"' out/ticket06b/smoke.log | <check key set>
error bodies checked: 22 with other key sets: 0
$ grep -c 'q=camera\|limit=' out/ticket06b/server.log      # request log carries the path without query
0
```

## 503 database path (second instance on the non-migrated scratch copy)

```
$ CATALOG_DB_PATH=out/ticket06b/unmigrated.db API_PORT=3011 node apps/api/dist/main.js   (after the first was killed)
/v1/summary          -> 503 {"statusCode":503,"code":"database","message":"database unavailable","correlationId":"58d5f91c-..."}
/v1/products?q=camera-> 503 {"statusCode":503,"code":"database","message":"database unavailable",...}
/v1/products/976     -> 503 {"statusCode":503,"code":"database","message":"database unavailable",...}
/v1/reviews          -> 503 {"statusCode":503,"code":"database","message":"database unavailable",...}
/health/ready        -> 503 {"statusCode":503,"code":"database","message":"database unavailable",...}
server log: 5 x {"event":"api.database.failed","errorType":"DatabaseFileError.schema_outdated","correlationId":...}
            (one per request); lines containing SELECT, Roteador or TestBrand: 0
```

## Ambiguous review with live candidates (scratch copy `ambiguous.db`)

Two products inserted with the same match key (`roteador wifi 6 tp link` / `tp link`) and one PENDING
AMBIGUOUS review whose source normalizes to that key (`out/ticket06b/make-ambiguous.cjs`).

```
$ curl -s '/v1/reviews?after=2'
{"items":[{"id":3,"status":"PENDING","reason":"AMBIGUOUS","similarity":null,"sellerName":"ScratchSeller","sellerProductId":"scratch-ambiguous-1","sourceName":"Roteador WiFi 6 TP-Link","sourceBrand":"TP-Link","sourceCategory":"Networking","candidateProductId":null,"candidate":null,"liveCandidates":[{"id":977,"name":"Roteador WiFi 6 TP-Link","brand":"TP-Link","category":"Networking"},{"id":978,"name":"Roteador WiFi 6 TP Link","brand":"TP Link","category":"Networking"}]}],"nextCursor":null}
[status 200]
$ curl -s '/v1/nope'
{"statusCode":404,"code":"invalid_request","message":"route not found","correlationId":"1a23876d-..."}
$ curl -s -H 'x-correlation-id: smoke-06b.1' '/v1/products/abc'
{"statusCode":400,"code":"invalid_request","message":"invalid request fields: id","correlationId":"smoke-06b.1"}
$ lsof -nP -iTCP:3011 -sTCP:LISTEN     # exit 1: no listener left
```

## Not exercised

- `offers.hasMore = true`: no demo product has more than 100 Seller Offers (product 976 and 18 report false);
  the cap and flag are the read model's (`LIMIT 101`, slice 100).

## Data integrity

```
$ shasum -a 256 data/catalog.db data/ProductEntry.json
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
```
