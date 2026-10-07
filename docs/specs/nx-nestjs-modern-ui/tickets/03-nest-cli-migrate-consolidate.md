# 03: Nest CLI: migrate and consolidate on providers

**What to build:** `migrate` and `consolidate` run through a NestJS standalone application whose rules live in injectable provider libraries (`domain`, `rules`, `persistence`, `consolidation`). Normalization, similarity matching (a transient factory over the same difflib port), matching, repositories, the connection factory, migration runner, Seller File reader, report writer and Consolidation are re-homed from `packages/core` with identical behavior. Nest's own logger is disabled so stdout carries only the program's output, and output is flushed through the exit code. Migration files are located without `import.meta`. `packages/core` stays in place until the web app stops using it.

**Blocked by:** 02

**Closes checks:** C6, C7, C8, C9

**Status:** done

- [ ] `migrate` and `consolidate` stdout, exit codes, JSON reports and table contents equal the golden fixtures for their scenarios, including dry run
- [ ] No Nest bootstrap text reaches stdout, and a second `consolidate` writes 0 rows
- [ ] A missing database, an unmigrated database and an invalid Seller File each give one `error:` line, exit 2 and leave the database unchanged
- [ ] A backup-name collision and a non-SQLite file as database exit 1 with no stack trace and no change to the database
- [ ] Every rule has one implementation in a library; the CLI app holds only command wiring and argument parsing
- [ ] Libraries compile as CommonJS with decorator metadata under TypeScript 6 (`node16` module resolution), and lint and typecheck are clean

## Comments
