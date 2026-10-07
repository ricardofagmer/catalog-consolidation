---
status: accepted
---

# Business rules become NestJS 11 providers; the CLI is a Nest standalone application

`@catalog/core` is dissolved. Every rule it holds (text helpers, normalization, the difflib port, matching, consolidation, review resolution, repositories, migrations, reader, report writer) becomes an injectable Nest provider, and the CLI boots a Nest application context with no HTTP server so it runs the same providers in-process. The backend is NestJS 11 with the official `@nx/nest` plugin, compiled as CommonJS. This supersedes the "framework-free shared core" part of [ADR 0006](0006-typescript-shared-core.md); the invariant it protected (one implementation of each rule, shared by CLI and API) remains. Related: [Nx and Nest backend](2026-10-06-nx-nest-backend-web-via-api.md).

## Considered options

- **Keep a framework-free core with thin Nest adapters.** Recommended during the interview and rejected by the user. It would have kept the CLI and its byte-for-byte checks untouched.
- **NestJS 12 (ESM-only).** Matches the all-ESM workspace, but `@nx/nest` declares support only for Nest `>=10 <12`, so project config would be hand-written.
- **Wrap only the stateful parts.** Pure functions stay plain; only use cases and I/O become providers. Rejected for uniformity: everything is injectable.

## Consequences

- Pure code (normalization, text helpers) gains dependency-injection ceremony it does not need. `SequenceMatcher` holds per-comparison state, so it is exposed through a transient factory provider rather than a singleton.
- The CLI pays a Nest startup cost on every command and must keep stdout clean: Nest's own logger is disabled in the CLI context, so only the program's output reaches stdout.
- CommonJS output means `import.meta.url` (used to locate the migrations folder) is replaced by a CommonJS-safe path resolution, and the web app stays ESM and imports none of these libraries.
- The rules are re-homed (~2,600 lines), so behavior is protected only by the golden fixtures of [the Python-removal ADR](2026-10-06-remove-python-golden-fixtures.md). The fixtures are recorded before any code moves.
- Revisit if `@nx/nest` gains Nest 12 support (move to ESM Nest) or if injected pure functions measurably hurt readability.
