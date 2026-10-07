# Tickets 03 + 04 (CLI part): evidence

Recorded 2026-10-06T18:21:58Z by backend-coordinator (IMPLEMENT). Node v24.21.0. Scratch output lives
under `out/ticket03/` (fresh directory, not deleted). "Old CLI" means the pre-change ESM build of
`apps/cli` on `@catalog/core`, copied to a session scratch directory before the rebuild and used
only for comparison.

## Changed

- `apps/cli/src/main.ts`: `import "reflect-metadata"` first; parses arguments, answers help and
  usage errors before Nest exists, then boots `NestFactory.createApplicationContext(CliModule,
  { logger: false, abortOnError: false })` per command, closes it in `finally`, sets
  `process.exitCode` (no `process.exit`). No top-level await (CommonJS).
- `apps/cli/src/cli.module.ts` (new): imports RulesModule, PersistenceModule, ConsolidationModule,
  ReviewsModule; provides MigrateCommand, ConsolidateCommand, ReviewCommand.
- `apps/cli/src/commands/{migrate,consolidate,review}.command.ts` (new; replace the deleted
  `commands/{migrate,consolidate,review}.ts`): injectable commands running the same flows on the
  lib providers.
- `apps/cli/src/arguments.ts`: only the import source changed (`@catalog/core` -> `@catalog/domain`).
- `scripts/parity-check.sh`: replaced by a 5-line wrapper that execs `scripts/golden-check.sh "$@"`;
  no Python and no comparison mode remain.
- `apps/cli/dist/` removed before the build so no stale ESM files from the old CLI remain.

## Build, typecheck, lint (scoped)

`NX_DAEMON=false pnpm exec nx run-many -t build,typecheck,lint -p cli`

```
✔  nx run domain:build  [local cache]
✔  nx run rules:build  [local cache]
✔  nx run persistence:build  [local cache]
✔  nx run reviews:build  [local cache]
✔  nx run consolidation:build  [local cache]
✔  nx run cli:typecheck
✔  nx run cli:build
✔  nx run cli:lint
 NX   Successfully ran targets build, typecheck, lint for project cli and 5 tasks it depends on
```

`grep -rn '@catalog/core\|import\.meta' apps/cli/src apps/cli/dist` -> 0 matches.

## C4: golden check (Nest CLI, no Python)

`bash scripts/golden-check.sh` (default `node apps/cli/dist/main.js`): every scenario printed
`golden: OK <name>`, ending with `golden: OK (22/22 scenarios)`, exit 0. `pnpm parity` (the wrapper)
also printed `golden: OK (22/22 scenarios)` with exit 0. Baseline: the old CLI also printed `golden: OK (22/22 scenarios)`
before the change. The golden scenarios also cover C8 (`error-missing-db`, `error-unmigrated-db`,
`error-invalid-seller-file`) and the help forms (`help-*`, `help-never-runs`).

## C5-C9 observations (scripted, scratch copies under out/ticket03)

```
## C5 help forms (unmigrated copy)
-h                                                                          exit=0 stdout1="usage: catalog-consolidation [-h] COMMAN" stderr_bytes=0
--help                                                                      exit=0 stdout1="usage: catalog-consolidation [-h] COMMAN" stderr_bytes=0
-hh                                                                         exit=0 stdout1="usage: catalog-consolidation [-h] COMMAN" stderr_bytes=0
migrate -h                                                                  exit=0 stdout1="usage: catalog-consolidation migrate [-h" stderr_bytes=0
migrate --help                                                              exit=0 stdout1="usage: catalog-consolidation migrate [-h" stderr_bytes=0
migrate -hh                                                                 exit=0 stdout1="usage: catalog-consolidation migrate [-h" stderr_bytes=0
consolidate -h                                                              exit=0 stdout1="usage: catalog-consolidation consolidate" stderr_bytes=0
consolidate --help                                                          exit=0 stdout1="usage: catalog-consolidation consolidate" stderr_bytes=0
consolidate -hh                                                             exit=0 stdout1="usage: catalog-consolidation consolidate" stderr_bytes=0
review -h                                                                   exit=0 stdout1="usage: catalog-consolidation review [-h]" stderr_bytes=0
review --help                                                               exit=0 stdout1="usage: catalog-consolidation review [-h]" stderr_bytes=0
review -hh                                                                  exit=0 stdout1="usage: catalog-consolidation review [-h]" stderr_bytes=0
review list -h                                                              exit=0 stdout1="usage: catalog-consolidation review list" stderr_bytes=0
review list --help                                                          exit=0 stdout1="usage: catalog-consolidation review list" stderr_bytes=0
review list -hh                                                             exit=0 stdout1="usage: catalog-consolidation review list" stderr_bytes=0
review resolve -h                                                           exit=0 stdout1="usage: catalog-consolidation review reso" stderr_bytes=0
review resolve --help                                                       exit=0 stdout1="usage: catalog-consolidation review reso" stderr_bytes=0
review resolve -hh                                                          exit=0 stdout1="usage: catalog-consolidation review reso" stderr_bytes=0
migrate --db <out>/help/catalog.db -h                                       exit=0 stdout1="usage: catalog-consolidation migrate [-h" stderr_bytes=0
consolidate --db <out>/help/catalog.db --input <out>/help/ProductEntry.json --help exit=0 stdout1="usage: catalog-consolidation consolidate" stderr_bytes=0
review resolve --db <out>/help/catalog.db --id 1 --reject -hh               exit=0 stdout1="usage: catalog-consolidation review reso" stderr_bytes=0
checksum before=733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404 after=733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404 same=yes
bak files: 0

## C6/C7 migrate + consolidate stdout (stderr discarded), second run
migrate exit=0
backup: <out>/main/catalog.db.pre-migrate-20261006T182103Z.bak
applied 0001 seller_product_text_id
applied 0002 product_match_keys (backfilled 975 products)
applied 0003 review_queue
schema version: 3
consolidate#1 exit=0
run 81b101697ce2469382533e22b3ce5eac input=out/ticket03/main/ProductEntry.json dry_run=false committed=true rows_written=258
LINKED_EXACT                 200
LINKED_NORMALIZED             54
CREATED                        1
UNCHANGED                      1
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                2
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
consolidate#2 exit=0
run ba6f3428aa834970845ec6a20550b758 input=out/ticket03/main/ProductEntry.json dry_run=false committed=true rows_written=0
LINKED_EXACT                   0
LINKED_NORMALIZED              0
CREATED                        0
UNCHANGED                    256
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                2
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
Nest text in stdout: 0 lines

## C8 expected failures: one error line, exit 2, db unchanged
missing-db: exit=2 error_lines=1 stack_lines=0 stdout_bytes=0 db_same=yes
  error: database: not_found: database file not found: <out>/c8/missing.db
unmigrated-db: exit=2 error_lines=1 stack_lines=0 stdout_bytes=0 db_same=yes
  error: database: schema_outdated: schema version 0 < required 3; run: catalog-consolidation migrate --db <out>/c8/catalog.db
invalid-seller-file: exit=2 error_lines=1 stack_lines=0 stdout_bytes=0 db_same=yes
  error: invalid input file: not_an_array: <out>/c8/object.json: top-level value is not a JSON array
missing.db created: no

## C9 unexpected failures: exit 1, no stack trace, db unchanged
ProductEntry.json
catalog.db
catalog.db.pre-migrate-20261006T182103Z.bak
backup-collision: exit=1 error_lines=1 stack_lines=0 db_same=yes stdout_bytes=0
error: unexpected failure (correlationId=c35cbc053c9441ce94c48f3d6478bca9)
{"timestamp":"2026-10-06T18:21:03.820Z","level":"error","service":"catalog_consolidation","event":"migrate.failed","correlationId":"c35cbc053c9441ce94c48f3d6478bca9","errorType":"Error","durationMs":7}
non-sqlite (migrate): exit=1 error_lines=1 stack_lines=0 db_same=yes bak=0
error: database failure (correlationId=8124b65fff2f4b8f8d57473b8d8e79bf)
{"timestamp":"2026-10-06T18:21:03.937Z","level":"error","service":"catalog_consolidation","event":"migrate.failed","correlationId":"8124b65fff2f4b8f8d57473b8d8e79bf","errorType":"Error","durationMs":5}
non-sqlite (consolidate): exit=1 error_lines=1 stack_lines=0 db_same=yes bak=0
error: database failure (correlationId=15aa4c7d6627447c8ae5c4317be5a2e9)
{"timestamp":"2026-10-06T18:21:04.056Z","level":"error","service":"catalog_consolidation","event":"consolidate.failed","correlationId":"15aa4c7d6627447c8ae5c4317be5a2e9","errorType":"Error","durationMs":5}
non-sqlite (review list): exit=1 error_lines=1 stack_lines=0 db_same=yes bak=0
error: database failure (correlationId=89d9c6d82a2747128749ab830692e32b)
{"timestamp":"2026-10-06T18:21:04.174Z","level":"error","service":"catalog_consolidation","event":"review.list.failed","correlationId":"89d9c6d82a2747128749ab830692e32b","errorType":"Error","durationMs":5}

## data files
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
```

## Old CLI vs Nest CLI (byte comparison; stderr JSON timestamp/correlationId/durationMs normalized)

```
same  no arguments (exit 2)
same  unknown command (exit 2)
same  migrate without --db (exit 2)
same  consolidate without --input (exit 2)
same  review without subcommand (exit 2)
same  review list bad status (exit 2)
same  review list --limit 0 (exit 2)
same  review list --limit 101 (exit 2)
same  review resolve two actions (exit 2)
same  review resolve no action (exit 2)
same  unknown option (exit 2)
same  -hh with junk (exit 0)
same  non-sqlite migrate (exit 1)
same  non-sqlite review resolve (exit 1)
same  unmigrated review list (exit 2)
compare: 15/15 identical
collision old: exit=1 db_same=yes stack_lines=0 stdout_bytes=0 error: unexpected failure (correlationId=<id>) log={"level":"error","service":"catalog_consolidation","event":"migrate.failed","errorType":"Error"}
collision new: exit=1 db_same=yes stack_lines=0 stdout_bytes=0 error: unexpected failure (correlationId=<id>) log={"level":"error","service":"catalog_consolidation","event":"migrate.failed","errorType":"Error"}
```

EPIPE path: not exercised. A `| head -1` reader did not cause EPIPE for either CLI because the
summary fits in the pipe buffer (both exited 0).

## Startup cost (observation only; 5 runs each, mean wall time, on a migrated scratch copy)

```
old consolidate (rerun, rows_written=0)  mean 36 ms over 5 runs
new consolidate (rerun, rows_written=0)  mean 93 ms over 5 runs
old --help                               mean 32 ms over 5 runs
new --help                               mean 84 ms over 5 runs
old review list                          mean 32 ms over 5 runs
new review list                          mean 91 ms over 5 runs
```

About 55-60 ms extra per invocation. Help does not boot Nest, but it still pays the static
`@nestjs/core` import cost.

## Data files (unchanged)

```
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
```

## Tests

None authored or run: `[tests] pending — final-stage user approval required`.
