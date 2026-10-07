---
status: accepted
---

# REST API with OpenAPI from DTO classes; loopback, Host allowlist, JSON-only; one connection per operation

The API is REST. Request and response shapes are DTO classes validated with class-validator and described with `@nestjs/swagger`; the generated OpenAPI document produces a typed client library the Next.js server uses. The API exposes only what the UI needs (summary, products, product detail with Seller Offers, the review queue, resolving a review, health). Consolidate and migrate stay CLI-only.

It binds to 127.0.0.1, rejects any `Host` header not on its allowlist, accepts only `application/json` request bodies (anything else gets 415) and sends no CORS headers. Each operation opens its own SQLite connection, closes it in `finally`, and read paths use a read-only connection.

## Considered options

- **Shared zod schemas** (no generated client): one source of truth for validation and types, but less idiomatic in Nest and nothing guarantees the server returns the documented shape.
- **GraphQL / tRPC:** more machinery than three screens need; tRPC is not idiomatic Nest and gives no OpenAPI page for a live session.
- **A shared service token between Next and the API:** strongest, but another secret to configure in both apps. Loopback + Host allowlist + JSON-only already stops DNS rebinding and cross-site form posts.
- **One shared SQLite connection for the process:** slightly faster, but a failed operation can leave a transaction open for the next request. A leaked transaction was the main bug source in the previous rewrite.

## Consequences

- A request from any web page to the loopback port cannot succeed: cross-site form posts are not JSON, JSON posts need a preflight that never gets CORS headers, and rebinding fails the Host check.
- Write contention is handled in one place: resolving a review takes the database write lock up front, so a busy database waits for the timeout instead of failing immediately.
- Adding an endpoint means a DTO and a regenerated client; the client is a build output, not hand-edited.
- Revisit if the API is ever exposed beyond loopback (add authentication, TLS and a token), or if per-operation connections show up in profiles.
- Event-loop stall: node:sqlite is synchronous and the catalog uses a rollback journal, so while another process (for example the CLI during consolidate or migrate) holds a write lock, an API request waits up to the 5 s busy timeout and stalls every other request, health checks included. Accepted for a loopback single-user tool; the API cannot create the contention itself. Revisit with WAL mode (a DBA decision that changes the database file) or a short busy timeout on read connections if it shows up in practice.
