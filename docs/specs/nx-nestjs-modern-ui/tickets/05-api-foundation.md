# 05: API foundation

**What to build:** A NestJS 11 `api` application that starts on 127.0.0.1:3001 with validated configuration, a Host allowlist, JSON-only request bodies, no CORS, a correlation id on every request and response, structured JSON logs, liveness and readiness endpoints that reflect the real database, and the generated OpenAPI document with a Swagger page. Business endpoints come in later tickets.

**Blocked by:** 03

**Closes checks:** C18, C19, C20, C21

**Status:** done

- [ ] Configuration (`CATALOG_DB_PATH`, `API_PORT`, `API_ALLOWED_HOSTS`) is read once at startup and validated; a missing or invalid value stops the process with one line
- [ ] A request with a `Host` outside the allowlist gets 421 `host_not_allowed`; `127.0.0.1:3001` and `localhost:3001` succeed
- [ ] A non-JSON POST gets 415 `unsupported_media_type` and writes nothing
- [ ] The process listens on 127.0.0.1 only and no response carries CORS headers; a cross-origin preflight gets no allow headers
- [ ] `/health/live` is 200 while the process runs; `/health/ready` is 200 on a migrated database and 503 for a missing or unmigrated one
- [ ] `/docs` serves the Swagger page and `/docs-json` the OpenAPI document

## Comments
