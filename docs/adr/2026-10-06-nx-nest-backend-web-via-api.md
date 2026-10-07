---
status: accepted
---

# Nx workspace with a NestJS backend; the web app reaches data only through the API

The web app no longer reads SQLite. A NestJS API is the only web-facing process that touches the database, the Next.js app calls it from the server side only, and the repository becomes an Nx workspace on top of the existing pnpm one. This reverses two decisions of [ADR 0006](0006-typescript-shared-core.md) ("Next.js reads SQLite directly" and "no JSON API"); its choice of TypeScript for every part stays.

## Considered options

- **Keep Next.js reading SQLite directly** (the status quo). Least moving parts, but the user asked for a backend that owns data access, and a web server holding a database connection cannot be protected independently of the pages.
- **Single-page app served by Nest.** Rejected: it rewrites every working page and gives up server rendering and the reviewed 404/streaming behavior.
- **Nest serving the pages.** Rejected: loses Next.js routing and its build pipeline for no gain.
- **Browser calling the API directly.** Rejected: needs CORS and a public API origin, and moves data fetching into client components. The Next server calls the API instead, so the browser never talks to Nest.

## Consequences

- Two long-running processes (web on one loopback port, API on another) instead of one, and a typed client between them.
- Nx adds caching, `affected` runs and module-boundary lint rules (the web app cannot import database code). Targets are inferred from each tool's own config rather than hand-written executors.
- The web package drops `node:sqlite`, the startup database check and the connection code; the API takes them over.
- Revisit if the API must be called from third-party browsers (CORS, auth) or if the two-process cost proves larger than the isolation benefit.
