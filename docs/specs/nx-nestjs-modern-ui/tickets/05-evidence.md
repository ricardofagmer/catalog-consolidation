# Ticket 05 evidence: API foundation (C18, C19, C20, C21)

Date: 2026-10-06. Worker: backend-coordinator (borisenko), IMPLEMENT, scope `apps/api/src/**`.
All runtime checks ran against scratch copies under `out/ticket05/` (never `data/`). Every server
started was stopped by PID; `lsof` shows no listener on 3001 afterwards. No tests were authored.

## Scratch databases

```
$ mkdir out/ticket05 && cp data/catalog.db out/ticket05/catalog.db
$ cp data/catalog.db out/ticket05/unmigrated-copy.db           # schema version 0 (data/ copy is unmigrated)
$ node -e '...new DatabaseSync("out/ticket05/empty.db")...'     # empty SQLite file, no tables
$ node apps/cli/dist/main.js migrate --db out/ticket05/catalog.db
backup: catalog.db.pre-migrate-20261006T190219Z.bak
applied 0001 seller_product_text_id
applied 0002 product_match_keys (backfilled 975 products)
applied 0003 review_queue
schema version: 3
```

## Build, typecheck, lint (scoped, `--skip-nx-cache` for the api tasks)

```
$ NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p api --skip-nx-cache
 NX   Running targets build, typecheck, lint for project api and 5 tasks it depends on:
- api
> nx run domain:build
$ tsc -p tsconfig.json
> nx run rules:build
$ tsc -p tsconfig.json
> nx run consolidation:build
$ tsc -p tsconfig.json
> nx run reviews:build
$ tsc -p tsconfig.json
> nx run persistence:build
$ tsc -p tsconfig.json
> nx run api:typecheck
$ tsc -p tsconfig.json --noEmit
> nx run api:build
$ tsc -p tsconfig.json
> nx run api:lint
$ eslint src
 NX   Successfully ran targets build, typecheck, lint for project api and 5 tasks it depends on
  Run duration:      3.4s
  Cache:             Skipped (--skip-nx-cache)
  Critical path:     3.4s (4 tasks)
  Recoverable time:  <1ms
```

## C18 Host allowlist, C19 JSON-only bodies, C20 loopback and no CORS, correlation id

Server: `CATALOG_DB_PATH=out/ticket05/catalog.db API_PORT=3001 node apps/api/dist/main.js` (background).

```
$ lsof -nP -iTCP:3001 -sTCP:LISTEN
COMMAND   PID          USER   FD   TYPE            DEVICE SIZE/OFF NODE NAME
node    37758 ricardofagmer   14u  IPv4 0xd1bc371075bf5c6      0t0  TCP 127.0.0.1:3001 (LISTEN)

$ curl -s -i -H Host: evil.example:3001 http://127.0.0.1:3001/health/live
HTTP/1.1 421 Misdirected Request
x-correlation-id: 318d6610-1bdc-4583-ab72-8ac9ed46a23f
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 128

{"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"318d6610-1bdc-4583-ab72-8ac9ed46a23f"}

$ curl -s -i -H Host: evil.example:3001 http://127.0.0.1:3001/docs
HTTP/1.1 421 Misdirected Request
x-correlation-id: 7735f610-313f-4bba-a45e-48d1a27af93a
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 128

{"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"7735f610-313f-4bba-a45e-48d1a27af93a"}

$ curl -s -i -H Host: 127.0.0.1:3001 http://127.0.0.1:3001/health/live
HTTP/1.1 200 OK
x-correlation-id: 45e7c30f-4486-421e-8c0a-00e4bca7097b
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i -H Host: localhost:3001 http://127.0.0.1:3001/health/live
HTTP/1.1 200 OK
x-correlation-id: af2e38f1-1b82-42ce-833e-0b9a2ab96bcb
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i -X POST -H Content-Type: application/x-www-form-urlencoded --data a=1 http://127.0.0.1:3001/health/live
HTTP/1.1 415 Unsupported Media Type
x-correlation-id: d2487497-8fba-4671-aedb-e0bb9c0d8134
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 155

{"statusCode":415,"code":"unsupported_media_type","message":"request body must be application/json","correlationId":"d2487497-8fba-4671-aedb-e0bb9c0d8134"}

$ curl -s -i -X POST -H Content-Type: application/json --data {"a":1} http://127.0.0.1:3001/v1/nowhere
HTTP/1.1 404 Not Found
x-correlation-id: 845089e0-e246-43b5-9683-dfafa7f74efe
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 126

{"statusCode":404,"code":"invalid_request","message":"route not found","correlationId":"845089e0-e246-43b5-9683-dfafa7f74efe"}

$ curl -s -i -X POST -H Content-Type: application/json --data {bad http://127.0.0.1:3001/v1/nowhere
HTTP/1.1 400 Bad Request
x-correlation-id: d0c93b0a-5e64-44cb-a8bb-3df794d5d613
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 126

{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"d0c93b0a-5e64-44cb-a8bb-3df794d5d613"}

$ curl -s -i -H Origin: http://evil.example http://127.0.0.1:3001/health/live
HTTP/1.1 200 OK
x-correlation-id: 75f86ff1-3960-4186-ad92-24b2dd536c95
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i -X OPTIONS -H Origin: http://evil.example -H Access-Control-Request-Method: POST http://127.0.0.1:3001/health/live
HTTP/1.1 404 Not Found
x-correlation-id: ce86321c-1786-4533-87a4-5c91277813f2
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 126

{"statusCode":404,"code":"invalid_request","message":"route not found","correlationId":"ce86321c-1786-4533-87a4-5c91277813f2"}

$ curl -s -i http://127.0.0.1:3001/health/ready
HTTP/1.1 200 OK
x-correlation-id: bb7bdfab-3f49-417d-8266-11a1f6ce4b21
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i -H x-correlation-id: trace-abc.123_X http://127.0.0.1:3001/health/live
HTTP/1.1 200 OK
x-correlation-id: trace-abc.123_X
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i -H x-correlation-id: bad id with spaces! http://127.0.0.1:3001/health/live
HTTP/1.1 200 OK
x-correlation-id: 0550b986-2b16-4a75-9539-c2c8937f6596
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 15

{"status":"ok"}

$ curl -s -i http://127.0.0.1:3001/nope?q=secret-search
HTTP/1.1 404 Not Found
x-correlation-id: 3866d6d7-306b-405d-809f-924d0dc482f2
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 126

{"statusCode":404,"code":"invalid_request","message":"route not found","correlationId":"3866d6d7-306b-405d-809f-924d0dc482f2"}

```

Note: `OPTIONS` with `Origin` + `Access-Control-Request-Method` gets 404 `invalid_request` and no
`access-control-*` header (no CORS is enabled).

### 415 writes nothing

```
POST form /health/ready -> 415
POST form /v1/reviews/1/resolution -> 415
POST form /docs -> 415
POST text/plain -> 415
scratch db sha256 before=5b8cbe42d5c207c02ebe3bbfd03700d7d0cb20c28ace4c05a6259b3159384688 after=5b8cbe42d5c207c02ebe3bbfd03700d7d0cb20c28ace4c05a6259b3159384688 equal=yes
```

## Swagger page, OpenAPI document, body limit, headers

```
$ curl -s -i http://127.0.0.1:3001/docs (first 20 lines)
HTTP/1.1 200 OK
x-correlation-id: e33ec832-0e5f-422f-ac6f-e26e9013f53d
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: text/html; charset=utf-8
Content-Length: 3126
ETag: W/"c36-CoJIbFAUj2LvfbhQh9ycBoxTpas"
Date: Tue, 06 Oct 2026 19:02:44 GMT
Connection: keep-alive
Keep-Alive: timeout=5


<!-- HTML for static distribution bundle build -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="./docs/swagger-ui.css" >

$ curl -s -i -L http://127.0.0.1:3001/docs/ | head -c 600

<!-- HTML for static distribution bundle build -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="./swagger-ui.css" >
  <link rel="icon" type="image/png" href="./favicon-32x32.png" sizes="32x32" /><link rel="icon" type="image/png" href="./favicon-16x16.png" sizes="16x16" />
  <style>
    html
    {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *,
    *:before,
    *:after
    {
      box-sizing: inherit;
    }

    body {
      margin:0;
  
$ curl -s -o /dev/null -w "%{http_code} %{content_type}
" for swagger assets
docs/swagger-ui.css 200 text/css; charset=utf-8
docs/swagger-ui-bundle.js 200 text/javascript; charset=utf-8
docs/swagger-ui-init.js 200 application/javascript; charset=utf-8

$ curl -s -i http://127.0.0.1:3001/docs-json | head -12
HTTP/1.1 200 OK
x-correlation-id: 0e32f018-ebc3-451a-8e30-f5e88678483b
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 2294
ETag: W/"8f6-M9HLEpu+shVXQ/6F1mrFlvlRb5A"
Date: Tue, 06 Oct 2026 19:02:44 GMT
Connection: keep-alive
Keep-Alive: timeout=5


$ curl -s http://127.0.0.1:3001/docs-json | node -e (parse, list paths and schemas)
openapi 3.0.0 paths /health/live,/health/ready schemas ApiErrorCode,ErrorBodyDto,HealthStatusDto
{"200":{"description":"","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HealthStatusDto"}}}},"421":{"description":"Host header not allowed (code host_not_allowed)","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorBodyDto"}}}},"503":{"description":"Database unavailable (code database)","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ErrorBodyDto"}}}}}
{"type":"object","properties":{"statusCode":{"type":"number","description":"HTTP status of the response","example":400},"code":{"description":"Stable machine-readable code","allOf":[{"$ref":"#/components/schemas/ApiErrorCode"}]},"message":{"type":"string","description":"Human-readable summary; never echoes request values"},"correlationId":{"type":"string","description":"Request correlation id, also sent in the x-correlation-id header"}},"required":["statusCode","code","message","correlationId"]}

$ curl -s -o /dev/null -w "%{http_code}
" http://127.0.0.1:3001/docs-yaml
404

$ head -c 20000 /dev/zero | tr " " a | (printf "{\"a\":\""; cat; printf "\"}") | curl -s -i -X POST -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:3001/v1/nowhere | tail -1
HTTP/1.1 413 Payload Too Large
{"statusCode":413,"code":"invalid_request","message":"request body exceeds 16kb","correlationId":"1ed058c8-d222-4a79-8eb1-ff7863cc23d3"}
$ curl -s -i -X POST http://127.0.0.1:3001/health/live (no content-type)
{"statusCode":415,"code":"unsupported_media_type","message":"request body must be application/json","correlationId":"91f74f26-9344-4211-b0b4-802f0df68e4c"} 415
$ curl -s -X POST -H "Content-Type: application/json; charset=utf-8" --data "{}" http://127.0.0.1:3001/health/live
{"statusCode":404,"code":"invalid_request","message":"route not found","correlationId":"1e1f703a-3e19-4175-a6c4-5704be5d7664"} 404

$ curl -s -D - -o /dev/null for all responses above: grep -ci access-control
0
$ curl -s -I http://127.0.0.1:3001/health/live | grep -i x-powered-by (expect nothing)
grep exit=1
```

## Request logs (structured JSON; no query string, no bodies, no rejected values)

From `out/ticket05/server.log` and `out/ticket05/run2.log` (routing-table lines omitted):

```
$ grep -n "secret-search\|bad id\|aaaa\|stack\|evil" out/ticket05/server.log ; echo "exit=$?"
exit=1
{"level":"info","timestamp":"2026-10-06T19:03:30.626Z","service":"catalog_consolidation_api","context":"NestFactory","msg":"Starting Nest application..."}
{"level":"info","timestamp":"2026-10-06T19:03:30.627Z","service":"catalog_consolidation_api","context":"NestApplication","msg":"Nest application successfully started"}
{"level":"info","timestamp":"2026-10-06T19:03:30.796Z","service":"catalog_consolidation_api","correlationId":"03a215cf-5250-489c-9329-137282c353f1","req":{"method":"GET","path":"/health/live"},"event":"api.request","res":{"status":200},"durationMs":3,"msg":"request completed"}
{"level":"warn","timestamp":"2026-10-06T19:03:30.812Z","service":"catalog_consolidation_api","event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/v1/nowhere","status":400,"correlationId":"a3bdb080-30e7-45c6-a892-76440f8f814c","msg":"request rejected"}
{"level":"warn","timestamp":"2026-10-06T19:03:30.820Z","service":"catalog_consolidation_api","event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/v1/nowhere","status":413,"correlationId":"0a983701-32ed-4433-a30d-e13f464d1168","msg":"request rejected"}
{"level":"warn","timestamp":"2026-10-06T19:03:30.827Z","service":"catalog_consolidation_api","correlationId":"1d01f27e-2263-4e56-8e0f-c9c8c83e986b","req":{"method":"GET","path":"/v1/nowhere"},"event":"api.request","res":{"status":404},"durationMs":0,"msg":"request completed"}
```

## C21 health: live and ready

`/health/ready` on the migrated copy returned 200 `{"status":"ok"}` (C18 section above). Failure cases:

```
== readiness, missing database (out/ticket05/vanishing.db) ==
(moved out/ticket05/vanishing.db away after startup)
$ curl -s -i http://127.0.0.1:3001/health/ready
HTTP/1.1 503 Service Unavailable
x-correlation-id: 123bab39-76a9-43c6-b7c4-b532ca761b30
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 124

{"statusCode":503,"code":"database","message":"database unavailable","correlationId":"123bab39-76a9-43c6-b7c4-b532ca761b30"}

$ curl -s http://127.0.0.1:3001/health/live
{"status":"ok"} 200
[ready-missing stopped; listeners on 3001: 0]
log lines for /health/ready:
{"level":"info","timestamp":"2026-10-06T19:03:41.847Z","service":"catalog_consolidation_api","context":"RouterExplorer","msg":"Mapped {/health/ready, GET} route"}
{"level":"error","timestamp":"2026-10-06T19:03:42.053Z","service":"catalog_consolidation_api","event":"api.database.failed","errorType":"DatabaseFileError.not_found","correlationId":"123bab39-76a9-43c6-b7c4-b532ca761b30","msg":"database failure"}
{"level":"error","timestamp":"2026-10-06T19:03:42.053Z","service":"catalog_consolidation_api","correlationId":"123bab39-76a9-43c6-b7c4-b532ca761b30","req":{"method":"GET","path":"/health/ready"},"event":"api.request","res":{"status":503},"durationMs":1,"msg":"request failed"}

== readiness, unmigrated database (out/ticket05/unmigrated-copy.db) ==
$ curl -s -i http://127.0.0.1:3001/health/ready
HTTP/1.1 503 Service Unavailable
x-correlation-id: 6de88782-713b-4d4d-b5b4-5ffb4866752a
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 124

{"statusCode":503,"code":"database","message":"database unavailable","correlationId":"6de88782-713b-4d4d-b5b4-5ffb4866752a"}

$ curl -s http://127.0.0.1:3001/health/live
{"status":"ok"} 200
[ready-unmigrated stopped; listeners on 3001: 0]
log lines for /health/ready:
{"level":"info","timestamp":"2026-10-06T19:03:42.318Z","service":"catalog_consolidation_api","context":"RouterExplorer","msg":"Mapped {/health/ready, GET} route"}
{"level":"error","timestamp":"2026-10-06T19:03:42.396Z","service":"catalog_consolidation_api","event":"api.database.failed","errorType":"DatabaseFileError.schema_outdated","correlationId":"6de88782-713b-4d4d-b5b4-5ffb4866752a","msg":"database failure"}
{"level":"error","timestamp":"2026-10-06T19:03:42.396Z","service":"catalog_consolidation_api","correlationId":"6de88782-713b-4d4d-b5b4-5ffb4866752a","req":{"method":"GET","path":"/health/ready"},"event":"api.request","res":{"status":503},"durationMs":3,"msg":"request failed"}

== readiness, empty database (out/ticket05/empty.db) ==
$ curl -s -i http://127.0.0.1:3001/health/ready
HTTP/1.1 503 Service Unavailable
x-correlation-id: 17f70f33-d13d-4685-928f-de58322a022b
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 124

{"statusCode":503,"code":"database","message":"database unavailable","correlationId":"17f70f33-d13d-4685-928f-de58322a022b"}

$ curl -s http://127.0.0.1:3001/health/live
{"status":"ok"} 200
[ready-empty stopped; listeners on 3001: 0]
log lines for /health/ready:
{"level":"info","timestamp":"2026-10-06T19:03:42.662Z","service":"catalog_consolidation_api","context":"RouterExplorer","msg":"Mapped {/health/ready, GET} route"}
{"level":"error","timestamp":"2026-10-06T19:03:42.728Z","service":"catalog_consolidation_api","event":"api.database.failed","errorType":"DatabaseFileError.schema_outdated","correlationId":"17f70f33-d13d-4685-928f-de58322a022b","msg":"database failure"}
{"level":"error","timestamp":"2026-10-06T19:03:42.728Z","service":"catalog_consolidation_api","correlationId":"17f70f33-d13d-4685-928f-de58322a022b","req":{"method":"GET","path":"/health/ready"},"event":"api.request","res":{"status":503},"durationMs":1,"msg":"request failed"}

```

## Startup validation, custom allowlist, graceful shutdown, OpenAPI writer

Each case runs with a clean environment (`env -i PATH HOME`).

```
$ node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: CATALOG_DB_PATH is not set

$ CATALOG_DB_PATH= node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: CATALOG_DB_PATH is not set

$ CATALOG_DB_PATH=out/ticket05/does-not-exist.db node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: CATALOG_DB_PATH "out/ticket05/does-not-exist.db": is not a regular file

$ CATALOG_DB_PATH=out/ticket05 node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: CATALOG_DB_PATH "out/ticket05": is not a regular file

$ CATALOG_DB_PATH=out/ticket05/catalog.db API_PORT=abc node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: API_PORT must be an integer between 1 and 65535

$ CATALOG_DB_PATH=out/ticket05/catalog.db API_PORT=0 node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: API_PORT must be an integer between 1 and 65535

$ CATALOG_DB_PATH=out/ticket05/catalog.db API_PORT=70000 node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: API_PORT must be an integer between 1 and 65535

$ CATALOG_DB_PATH=out/ticket05/catalog.db API_ALLOWED_HOSTS='127.0.0.1:3001,bad host' node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: API_ALLOWED_HOSTS must be a comma-separated list of host[:port] entries

== port already in use ==
$ CATALOG_DB_PATH=out/ticket05/catalog.db node apps/api/dist/main.js
exit=1 stdout_lines=0 stderr_lines=1
error: the API failed to start (EADDRINUSE)

== custom allowlist via API_ALLOWED_HOSTS ==
$ curl -s -H "Host: api.internal:3001" http://127.0.0.1:3001/health/live
{"status":"ok"} 200
$ curl -s http://127.0.0.1:3001/health/live  (Host 127.0.0.1:3001 not in the custom list)
{"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"546f93d6-a067-474e-9711-b52cce264314"} 421
== graceful shutdown on SIGTERM ==
process exited after SIGTERM; listeners on 3001: 0

== openapi writer, no database configured ==
$ node apps/api/dist/openapi.js
exit=0 stdout_lines=1 stderr_lines=0

wrote /Users/ricardofagmer/vtex/apps/api/dist/openapi.json
openapi 3.0.0 title Catalog consolidation API paths /health/live,/health/ready schemas ApiErrorCode,ErrorBodyDto,HealthStatusDto
same as /docs-json served earlier? compare after normalising:
$ (start server, curl /docs-json > out/ticket05/docs-json.json, stop)
docs-json equals dist/openapi.json: true
```

## Data files untouched

```
$ shasum -a 256 data/catalog.db data/ProductEntry.json
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
```

## Not exercised at runtime

- The global ValidationPipe `exceptionFactory` (400 `invalid_request` naming fields) has no DTO
  endpoint in this ticket; it is verified by typecheck/lint only and is first exercised by 06B/07.
- The 500 `internal` path has no route that can throw; its mapping is code-reviewed only.

## Security review follow-ups

Two findings from the independent security review, fixed in the API foundation (2026-10-06).

1. MEDIUM, clickjacking: `/docs` (Swagger UI) was framable, so a hostile page could frame it and
   trick a click on "Try it out" + "Execute" for a write. `apps/api/src/http/baseline-headers.middleware.ts`
   `BASELINE_HEADERS` now adds `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`
   (no other CSP directive, so Swagger UI's inline scripts keep working). That constant, via
   `applyBaselineHeaders`, is the only source: the middleware and `ApiExceptionFilter` (early 421/415
   rejections) both call it, so the filter file needed no change.
2. LOW, malformed percent-encoding: Express's router throws a `URIError` tagged `status` 400 without
   `type`, which used to fall through to 500 `internal` / `api.internal.failed`.
   `apps/api/src/errors/exception-classification.ts` adds `classifyUntypedClientFailure` (after the
   unchanged body-parser branch): an `Error` without `type` that carries a 400-499 `status` keeps that
   status, and a bare `URIError` becomes 400; both answer `invalid_request` with the fixed
   status message (the raw segment is never echoed) and log as `api.request.rejected`.

### Scoped gate

```
$ NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p api
✔  nx run api:typecheck
✔  nx run api:build
✔  nx run api:lint
 NX   Successfully ran targets build, typecheck, lint for project api and 5 tasks it depends on
```

### Runtime (scratch copy of out/ticket06a/catalog.db in out/ticket05b/, port 3031)

```
$ cp out/ticket06a/catalog.db out/ticket05b/catalog.db
$ CATALOG_DB_PATH=out/ticket05b/catalog.db API_PORT=3031 node apps/api/dist/main.js   (pid 48305, started 16:11:23 after the 16:11:16 build)
$ curl -si http://127.0.0.1:3031/health/live
HTTP/1.1 200 OK
x-correlation-id: c53e144d-c61b-4510-92dd-d73049cf7683
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"status":"ok"}

$ curl -si http://127.0.0.1:3031/docs  (headers + first bytes)
HTTP/1.1 200 OK
x-correlation-id: bf81c8d6-622a-408c-8abb-90279d0f649c
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: text/html; charset=utf-8


<!-- HTML for static distribution bundle build -->
...(HTML continues)
$ curl -si -H "Host: evil.example:3031" http://127.0.0.1:3031/health/live
HTTP/1.1 421 Misdirected Request
x-correlation-id: c3c5c4f2-243d-4f17-a62d-1a9ae4440389
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"statusCode":421,"code":"host_not_allowed","message":"host not allowed","correlationId":"c3c5c4f2-243d-4f17-a62d-1a9ae4440389"}

$ curl -si -X POST -H "Content-Type: text/plain" --data x http://127.0.0.1:3031/health/live
HTTP/1.1 415 Unsupported Media Type
x-correlation-id: b1db1ebb-8595-4a02-8716-19ba28142a19
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"statusCode":415,"code":"unsupported_media_type","message":"request body must be application/json","correlationId":"b1db1ebb-8595-4a02-8716-19ba28142a19"}

$ curl --path-as-is -si http://127.0.0.1:3031/nope/%E0
HTTP/1.1 400 Bad Request
x-correlation-id: c93f8057-72ba-4d74-aa82-9392b1b1e28b
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"c93f8057-72ba-4d74-aa82-9392b1b1e28b"}

$ curl --path-as-is -si http://127.0.0.1:3031/health/%E0
HTTP/1.1 400 Bad Request
x-correlation-id: 88cccab8-6689-4f69-afca-638dce153614
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"88cccab8-6689-4f69-afca-638dce153614"}

$ curl --path-as-is -si http://127.0.0.1:3031/v1/products/%E0
HTTP/1.1 400 Bad Request
x-correlation-id: 7fd6e3ba-f653-4886-a631-758ca86422b3
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cache-Control: no-store
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Content-Type: application/json; charset=utf-8

{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"7fd6e3ba-f653-4886-a631-758ca86422b3"}

$ curl -s -X POST -H "Content-Type: application/json" --data "{bad" http://127.0.0.1:3031/health/live
{"statusCode":400,"code":"invalid_request","message":"invalid request","correlationId":"7507730f-695c-46cf-bc20-d8d6e9c1fb43"} 400
$ curl -s -X POST -H "Content-Type: application/json" --data <20kb JSON> http://127.0.0.1:3031/health/live
{"statusCode":413,"code":"invalid_request","message":"request body exceeds 16kb","correlationId":"5c52639f-8693-483e-8763-cade0e5bbbc6"} 413
```

Server log (event lines for the requests above; `api.internal.failed` count 0):

```
"event":"api.request.rejected","code":"host_not_allowed","method":"GET","path":"/health/live","status":421,"correlationId":"c3c5c4f2-243d-4f17-a62d-1a9ae4440389","msg":"request rejected"
"event":"api.request.rejected","code":"unsupported_media_type","method":"POST","path":"/health/live","status":415,"correlationId":"b1db1ebb-8595-4a02-8716-19ba28142a19","msg":"request rejected"
"event":"api.request.rejected","code":"invalid_request","method":"GET","path":"/nope/%E0","status":400,"correlationId":"c93f8057-72ba-4d74-aa82-9392b1b1e28b","msg":"request rejected"
"event":"api.request.rejected","code":"invalid_request","method":"GET","path":"/health/%E0","status":400,"correlationId":"88cccab8-6689-4f69-afca-638dce153614","msg":"request rejected"
"event":"api.request.rejected","code":"invalid_request","method":"GET","path":"/v1/products/%E0","status":400,"correlationId":"7fd6e3ba-f653-4886-a631-758ca86422b3","msg":"request rejected"
"event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/health/live","status":400,"correlationId":"7507730f-695c-46cf-bc20-d8d6e9c1fb43","msg":"request rejected"
"event":"api.request.rejected","code":"invalid_request","method":"POST","path":"/health/live","status":413,"correlationId":"5c52639f-8693-483e-8763-cade0e5bbbc6","msg":"request rejected"
$ grep -c api.internal.failed out/ticket05b/server.log
0
```

Malformed JSON still answers 400 with message `invalid request`, unchanged and as already recorded in
07-evidence.md: that body-parser error reaches the filter as an `HttpException`, classified before
the body-failure branch. The 413 `request body exceeds 16kb` path is intact.

```
$ kill 48305
listeners on 3031: 0
$ shasum -a 256 data/catalog.db
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
```
