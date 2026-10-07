# Ticket 01 evidence: golden fixtures and Python archive

Status: OK. Fixtures were recorded from the Python CLI on 2026-10-06T17:31:34Z. Six scenarios were
re-baselined from the TypeScript CLI under ruling R-4. The fixture check passes on
`node apps/cli/dist/main.js` with Python off PATH: 22/22 scenarios at 2026-10-06T17:34:56Z.

## Rulings applied (.specs/features/nx-nestjs-modern-ui/ledger.md R-4)

- (a) Help text (placeholder names, usage wrapping) and the malformed-JSON error detail: the
  current TypeScript behavior is accepted. Only the files that differed were replaced with
  TypeScript output (16 files in 6 scenarios: `error-invalid-seller-file`, `help-migrate`,
  `help-consolidate`, `help-review-list`, `help-review-resolve`, `help-never-runs`). Each of these
  scenarios carries `"rebaselinedFrom": "ts-cli"` and a `rebaselineReason` in
  `fixtures/golden/manifest.json`; `recording.json` records the re-baseline too. `help-root` and
  `help-review` did not need a re-baseline: once `-hh` was fixed, the TS output equalled Python's.
  All other fixtures remain as Python recorded them. The check does not compare the annotation
  fields.
- (b) `-hh`: the Python fixtures were kept (help and exit 0 at every level). `apps/cli/src/arguments.ts`
  now treats any `-h+` bundle as help, both at the group levels (root, review) and in the leaf
  pre-scan. The CLI was rebuilt with the package's own build script (`pnpm run build` in
  `apps/cli`, i.e. `tsc -p tsconfig.json`), and nothing else was run.

```diff
--- apps/cli/src/arguments.ts (before)
+++ apps/cli/src/arguments.ts (after)
@@ -32,6 +32,8 @@
 const PROGRAM_NAME = "catalog-consolidation";
 const PROGRAM_DESCRIPTION = "Consolidate seller product files into the marketplace catalog.";
 const HELP_FLAGS: ReadonlySet<string> = new Set(["-h", "--help"]);
+// argparse expands a bundle of short flags, so `-hh` (any run of h) is help at every level.
+const BUNDLED_HELP_PATTERN = /^-h+$/u;
 const HELP_ROW: HelpRow = { indent: 2, label: "-h, --help", help: "show this help message and exit" };
 // argparse moves a help string to its own line once the label column would pass this position.
 const MAX_HELP_POSITION = 24;
@@ -238,7 +240,7 @@
   const usage = usageLine(group.path, `[-h] ${group.metavar} ...`);
   const commandIndex = args.findIndex((arg) => !arg.startsWith("-"));
   const leadingOptions = commandIndex === -1 ? args : args.slice(0, commandIndex);
-  if (leadingOptions.some((arg) => HELP_FLAGS.has(arg))) {
+  if (leadingOptions.some(isHelpFlag)) {
     return { kind: "help", text: groupHelp(group, usage) };
   }
   if (leadingOptions.length > 0) {
@@ -269,7 +271,7 @@
       allowPositionals: false,
       tokens: true,
     });
-    // Bundled short flags (`-hh`) slip past the exact-match pre-scan but still set help here;
+    // Mixed short-flag bundles that set help slip past the pre-scan but still set it here;
     // argparse answers them with help too, so the command must not run.
     if (values["help"] === true) {
       return { kind: "help", text: leafHelp(spec, usage) };
@@ -302,6 +304,10 @@
   );
 }
 
+function isHelpFlag(arg: string): boolean {
+  return HELP_FLAGS.has(arg) || BUNDLED_HELP_PATTERN.test(arg);
+}
+
 // argparse lets -h win over unknown or missing flags, so help is resolved before strict parsing.
 function requestsHelp(options: readonly OptionSpec[], args: readonly string[]): boolean {
   const valued = valuedOptionFlags(options);
@@ -310,7 +316,7 @@
     if (arg === undefined || arg === "--") {
       return false;
     }
-    if (HELP_FLAGS.has(arg)) {
+    if (isHelpFlag(arg)) {
       return true;
     }
     if (valued.has(arg) && isOptionValue(args[index + 1])) {
```

## data/ checksums (C37)

These values matched before any work, after recording, after re-baselining, and after the final
golden check and parity check:

```
733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db
1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json
```

Both golden scripts compare these checksums before and after each run, and abort if they differ.

## Recording

`scripts/golden-record.sh` (one-time; needs `.venv/bin/python`; deleted in ticket 13) ran
`scripts/golden-check.sh produce` against `.venv/bin/python -m catalog_consolidation`. It used
scratch copies under `out/golden-record/run-20261006T143130-29573` and copied the normalized
outputs to `fixtures/golden`. The re-baseline outputs were produced in
`out/golden-record/ts-rebaseline-20261006T143421`.

```
{
  "recordedAt": "2026-10-06T17:31:34Z",
  "cli": ".venv/bin/python -m catalog_consolidation",
  "python": "Python 3.12.14",
  "sqlite3": "3.54.0",
  "dataSha256": [
    "733ff1d9cc20253da48a9f8b33d7241503e4a06e7c68f65f7fa00ef14466c404  data/catalog.db",
    "1b0c861fe568c19e8b1cebcf774ee3d1d95baf8c42e35129e4ae806ece04b8f6  data/ProductEntry.json"
  ],
  "rebaseline": {
    "at": "2026-10-06T17:34:36Z",
    "ruling": ".specs/features/nx-nestjs-modern-ui/ledger.md R-4",
    "cli": "node apps/cli/dist/main.js",
    "producedIn": "out/golden-record/ts-rebaseline-20261006T143421",
    "scenarios": [
      "error-invalid-seller-file",
      "help-migrate",
      "help-consolidate",
      "help-review-list",
      "help-review-resolve",
      "help-never-runs"
    ],
    "files": "only the files that differed from the Python recording (help stdout, malformed-JSON stderr)"
  }
}
```

Normalizations (also listed in `fixtures/golden/manifest.json`):
- run id -> `<run>`
- migrate backup timestamp -> `<timestamp>`
- program name -> `<prog>`
- JSON log `timestamp`, `correlationId` and `durationMs` -> placeholders (keys and key order kept)
- `correlationId=<hex>` -> `correlationId=<id>`
- absolute scratch directory -> `<work>`
- table dumps omit `CreatedAt`

Commands run from a scratch directory holding copies of `data/`, so paths in the outputs look the
way an operator would type them (`data/...`).

## Fixture listing

```
$ du -sh fixtures/golden; find fixtures/golden -type f | wc -l
2.3M	fixtures/golden
268

$ find fixtures/golden -type f | sort
fixtures/golden/consolidate-after-review/01-consolidate.args
fixtures/golden/consolidate-after-review/01-consolidate.exit
fixtures/golden/consolidate-after-review/01-consolidate.stderr
fixtures/golden/consolidate-after-review/01-consolidate.stdout
fixtures/golden/consolidate-after-review/counts.json
fixtures/golden/consolidate-after-review/report.jsonl
fixtures/golden/consolidate-after-review/table-product-match-review.json
fixtures/golden/consolidate-after-review/table-product.json
fixtures/golden/consolidate-after-review/table-seller-product.json
fixtures/golden/consolidate-after-review/table-sqlite-sequence.json
fixtures/golden/consolidate-dry-run/01-migrate.args
fixtures/golden/consolidate-dry-run/01-migrate.exit
fixtures/golden/consolidate-dry-run/01-migrate.stderr
fixtures/golden/consolidate-dry-run/01-migrate.stdout
fixtures/golden/consolidate-dry-run/02-consolidate-dry-run.args
fixtures/golden/consolidate-dry-run/02-consolidate-dry-run.exit
fixtures/golden/consolidate-dry-run/02-consolidate-dry-run.stderr
fixtures/golden/consolidate-dry-run/02-consolidate-dry-run.stdout
fixtures/golden/consolidate-dry-run/backup.txt
fixtures/golden/consolidate-dry-run/counts.json
fixtures/golden/consolidate-dry-run/report.jsonl
fixtures/golden/consolidate-dry-run/table-product-match-review.json
fixtures/golden/consolidate-dry-run/table-product.json
fixtures/golden/consolidate-dry-run/table-seller-product.json
fixtures/golden/consolidate-dry-run/table-sqlite-sequence.json
fixtures/golden/consolidate-first/01-consolidate.args
fixtures/golden/consolidate-first/01-consolidate.exit
fixtures/golden/consolidate-first/01-consolidate.stderr
fixtures/golden/consolidate-first/01-consolidate.stdout
fixtures/golden/consolidate-first/counts.json
fixtures/golden/consolidate-first/report.jsonl
fixtures/golden/consolidate-first/table-product-match-review.json
fixtures/golden/consolidate-first/table-product.json
fixtures/golden/consolidate-first/table-seller-product.json
fixtures/golden/consolidate-first/table-sqlite-sequence.json
fixtures/golden/consolidate-rerun/01-consolidate-again.args
fixtures/golden/consolidate-rerun/01-consolidate-again.exit
fixtures/golden/consolidate-rerun/01-consolidate-again.stderr
fixtures/golden/consolidate-rerun/01-consolidate-again.stdout
fixtures/golden/consolidate-rerun/report.jsonl
fixtures/golden/consolidate-rerun/tables.txt
fixtures/golden/error-invalid-seller-file/01-consolidate-object.args
fixtures/golden/error-invalid-seller-file/01-consolidate-object.exit
fixtures/golden/error-invalid-seller-file/01-consolidate-object.stderr
fixtures/golden/error-invalid-seller-file/01-consolidate-object.stdout
fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.args
fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.exit
fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.stderr
fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.stdout
fixtures/golden/error-invalid-seller-file/03-consolidate-absent.args
fixtures/golden/error-invalid-seller-file/03-consolidate-absent.exit
fixtures/golden/error-invalid-seller-file/03-consolidate-absent.stderr
fixtures/golden/error-invalid-seller-file/03-consolidate-absent.stdout
fixtures/golden/error-invalid-seller-file/report-absent.jsonl.absent
fixtures/golden/error-invalid-seller-file/report-malformed.jsonl.absent
fixtures/golden/error-invalid-seller-file/report-object.jsonl.absent
fixtures/golden/error-invalid-seller-file/tables.txt
fixtures/golden/error-missing-db/01-migrate-missing.args
fixtures/golden/error-missing-db/01-migrate-missing.exit
fixtures/golden/error-missing-db/01-migrate-missing.stderr
fixtures/golden/error-missing-db/01-migrate-missing.stdout
fixtures/golden/error-missing-db/02-consolidate-missing.args
fixtures/golden/error-missing-db/02-consolidate-missing.exit
fixtures/golden/error-missing-db/02-consolidate-missing.stderr
fixtures/golden/error-missing-db/02-consolidate-missing.stdout
fixtures/golden/error-missing-db/03-review-list-missing.args
fixtures/golden/error-missing-db/03-review-list-missing.exit
fixtures/golden/error-missing-db/03-review-list-missing.stderr
fixtures/golden/error-missing-db/03-review-list-missing.stdout
fixtures/golden/error-missing-db/04-review-resolve-missing.args
fixtures/golden/error-missing-db/04-review-resolve-missing.exit
fixtures/golden/error-missing-db/04-review-resolve-missing.stderr
fixtures/golden/error-missing-db/04-review-resolve-missing.stdout
fixtures/golden/error-missing-db/data-files.txt
fixtures/golden/error-unmigrated-db/01-consolidate-unmigrated.args
fixtures/golden/error-unmigrated-db/01-consolidate-unmigrated.exit
fixtures/golden/error-unmigrated-db/01-consolidate-unmigrated.stderr
fixtures/golden/error-unmigrated-db/01-consolidate-unmigrated.stdout
fixtures/golden/error-unmigrated-db/02-review-list-unmigrated.args
fixtures/golden/error-unmigrated-db/02-review-list-unmigrated.exit
fixtures/golden/error-unmigrated-db/02-review-list-unmigrated.stderr
fixtures/golden/error-unmigrated-db/02-review-list-unmigrated.stdout
fixtures/golden/error-unmigrated-db/03-review-resolve-unmigrated.args
fixtures/golden/error-unmigrated-db/03-review-resolve-unmigrated.exit
fixtures/golden/error-unmigrated-db/03-review-resolve-unmigrated.stderr
fixtures/golden/error-unmigrated-db/03-review-resolve-unmigrated.stdout
fixtures/golden/error-unmigrated-db/catalog-db.txt
fixtures/golden/error-unmigrated-db/data-files.txt
fixtures/golden/help-consolidate/01-help-h.args
fixtures/golden/help-consolidate/01-help-h.exit
fixtures/golden/help-consolidate/01-help-h.stderr
fixtures/golden/help-consolidate/01-help-h.stdout
fixtures/golden/help-consolidate/02-help--help.args
fixtures/golden/help-consolidate/02-help--help.exit
fixtures/golden/help-consolidate/02-help--help.stderr
fixtures/golden/help-consolidate/02-help--help.stdout
fixtures/golden/help-consolidate/03-help-hh.args
fixtures/golden/help-consolidate/03-help-hh.exit
fixtures/golden/help-consolidate/03-help-hh.stderr
fixtures/golden/help-consolidate/03-help-hh.stdout
fixtures/golden/help-migrate/01-help-h.args
fixtures/golden/help-migrate/01-help-h.exit
fixtures/golden/help-migrate/01-help-h.stderr
fixtures/golden/help-migrate/01-help-h.stdout
fixtures/golden/help-migrate/02-help--help.args
fixtures/golden/help-migrate/02-help--help.exit
fixtures/golden/help-migrate/02-help--help.stderr
fixtures/golden/help-migrate/02-help--help.stdout
fixtures/golden/help-migrate/03-help-hh.args
fixtures/golden/help-migrate/03-help-hh.exit
fixtures/golden/help-migrate/03-help-hh.stderr
fixtures/golden/help-migrate/03-help-hh.stdout
fixtures/golden/help-never-runs/01-migrate-help.args
fixtures/golden/help-never-runs/01-migrate-help.exit
fixtures/golden/help-never-runs/01-migrate-help.stderr
fixtures/golden/help-never-runs/01-migrate-help.stdout
fixtures/golden/help-never-runs/02-consolidate-help.args
fixtures/golden/help-never-runs/02-consolidate-help.exit
fixtures/golden/help-never-runs/02-consolidate-help.stderr
fixtures/golden/help-never-runs/02-consolidate-help.stdout
fixtures/golden/help-never-runs/03-review-resolve-help.args
fixtures/golden/help-never-runs/03-review-resolve-help.exit
fixtures/golden/help-never-runs/03-review-resolve-help.stderr
fixtures/golden/help-never-runs/03-review-resolve-help.stdout
fixtures/golden/help-never-runs/catalog-db.txt
fixtures/golden/help-never-runs/data-files.txt
fixtures/golden/help-review-list/01-help-h.args
fixtures/golden/help-review-list/01-help-h.exit
fixtures/golden/help-review-list/01-help-h.stderr
fixtures/golden/help-review-list/01-help-h.stdout
fixtures/golden/help-review-list/02-help--help.args
fixtures/golden/help-review-list/02-help--help.exit
fixtures/golden/help-review-list/02-help--help.stderr
fixtures/golden/help-review-list/02-help--help.stdout
fixtures/golden/help-review-list/03-help-hh.args
fixtures/golden/help-review-list/03-help-hh.exit
fixtures/golden/help-review-list/03-help-hh.stderr
fixtures/golden/help-review-list/03-help-hh.stdout
fixtures/golden/help-review-resolve/01-help-h.args
fixtures/golden/help-review-resolve/01-help-h.exit
fixtures/golden/help-review-resolve/01-help-h.stderr
fixtures/golden/help-review-resolve/01-help-h.stdout
fixtures/golden/help-review-resolve/02-help--help.args
fixtures/golden/help-review-resolve/02-help--help.exit
fixtures/golden/help-review-resolve/02-help--help.stderr
fixtures/golden/help-review-resolve/02-help--help.stdout
fixtures/golden/help-review-resolve/03-help-hh.args
fixtures/golden/help-review-resolve/03-help-hh.exit
fixtures/golden/help-review-resolve/03-help-hh.stderr
fixtures/golden/help-review-resolve/03-help-hh.stdout
fixtures/golden/help-review/01-help-h.args
fixtures/golden/help-review/01-help-h.exit
fixtures/golden/help-review/01-help-h.stderr
fixtures/golden/help-review/01-help-h.stdout
fixtures/golden/help-review/02-help--help.args
fixtures/golden/help-review/02-help--help.exit
fixtures/golden/help-review/02-help--help.stderr
fixtures/golden/help-review/02-help--help.stdout
fixtures/golden/help-review/03-help-hh.args
fixtures/golden/help-review/03-help-hh.exit
fixtures/golden/help-review/03-help-hh.stderr
fixtures/golden/help-review/03-help-hh.stdout
fixtures/golden/help-root/01-help-h.args
fixtures/golden/help-root/01-help-h.exit
fixtures/golden/help-root/01-help-h.stderr
fixtures/golden/help-root/01-help-h.stdout
fixtures/golden/help-root/02-help--help.args
fixtures/golden/help-root/02-help--help.exit
fixtures/golden/help-root/02-help--help.stderr
fixtures/golden/help-root/02-help--help.stdout
fixtures/golden/help-root/03-help-hh.args
fixtures/golden/help-root/03-help-hh.exit
fixtures/golden/help-root/03-help-hh.stderr
fixtures/golden/help-root/03-help-hh.stdout
fixtures/golden/manifest.json
fixtures/golden/migrate-up-to-date/01-migrate-again.args
fixtures/golden/migrate-up-to-date/01-migrate-again.exit
fixtures/golden/migrate-up-to-date/01-migrate-again.stderr
fixtures/golden/migrate-up-to-date/01-migrate-again.stdout
fixtures/golden/migrate-up-to-date/data-files.txt
fixtures/golden/migrate-up-to-date/schema-version.json
fixtures/golden/migrate-up-to-date/tables.txt
fixtures/golden/migrate/01-migrate.args
fixtures/golden/migrate/01-migrate.exit
fixtures/golden/migrate/01-migrate.stderr
fixtures/golden/migrate/01-migrate.stdout
fixtures/golden/migrate/backup.txt
fixtures/golden/migrate/data-files.txt
fixtures/golden/migrate/product-normalized-keys.json
fixtures/golden/migrate/schema-version.json
fixtures/golden/recording.json
fixtures/golden/review-list-after-resolve/01-list-pending.args
fixtures/golden/review-list-after-resolve/01-list-pending.exit
fixtures/golden/review-list-after-resolve/01-list-pending.stderr
fixtures/golden/review-list-after-resolve/01-list-pending.stdout
fixtures/golden/review-list-after-resolve/02-list-linked.args
fixtures/golden/review-list-after-resolve/02-list-linked.exit
fixtures/golden/review-list-after-resolve/02-list-linked.stderr
fixtures/golden/review-list-after-resolve/02-list-linked.stdout
fixtures/golden/review-list-after-resolve/03-list-rejected.args
fixtures/golden/review-list-after-resolve/03-list-rejected.exit
fixtures/golden/review-list-after-resolve/03-list-rejected.stderr
fixtures/golden/review-list-after-resolve/03-list-rejected.stdout
fixtures/golden/review-list/01-list.args
fixtures/golden/review-list/01-list.exit
fixtures/golden/review-list/01-list.stderr
fixtures/golden/review-list/01-list.stdout
fixtures/golden/review-list/02-list-limit-1.args
fixtures/golden/review-list/02-list-limit-1.exit
fixtures/golden/review-list/02-list-limit-1.stderr
fixtures/golden/review-list/02-list-limit-1.stdout
fixtures/golden/review-list/03-list-after-1.args
fixtures/golden/review-list/03-list-after-1.exit
fixtures/golden/review-list/03-list-after-1.stderr
fixtures/golden/review-list/03-list-after-1.stdout
fixtures/golden/review-list/04-list-linked.args
fixtures/golden/review-list/04-list-linked.exit
fixtures/golden/review-list/04-list-linked.stderr
fixtures/golden/review-list/04-list-linked.stdout
fixtures/golden/review-resolve-already-resolved/01-resolve-1-reject-again.args
fixtures/golden/review-resolve-already-resolved/01-resolve-1-reject-again.exit
fixtures/golden/review-resolve-already-resolved/01-resolve-1-reject-again.stderr
fixtures/golden/review-resolve-already-resolved/01-resolve-1-reject-again.stdout
fixtures/golden/review-resolve-already-resolved/02-resolve-2-create-again.args
fixtures/golden/review-resolve-already-resolved/02-resolve-2-create-again.exit
fixtures/golden/review-resolve-already-resolved/02-resolve-2-create-again.stderr
fixtures/golden/review-resolve-already-resolved/02-resolve-2-create-again.stdout
fixtures/golden/review-resolve-already-resolved/03-resolve-999-unknown.args
fixtures/golden/review-resolve-already-resolved/03-resolve-999-unknown.exit
fixtures/golden/review-resolve-already-resolved/03-resolve-999-unknown.stderr
fixtures/golden/review-resolve-already-resolved/03-resolve-999-unknown.stdout
fixtures/golden/review-resolve-already-resolved/tables.txt
fixtures/golden/review-resolve-create/01-resolve-1-create.args
fixtures/golden/review-resolve-create/01-resolve-1-create.exit
fixtures/golden/review-resolve-create/01-resolve-1-create.stderr
fixtures/golden/review-resolve-create/01-resolve-1-create.stdout
fixtures/golden/review-resolve-create/02-list-created.args
fixtures/golden/review-resolve-create/02-list-created.exit
fixtures/golden/review-resolve-create/02-list-created.stderr
fixtures/golden/review-resolve-create/02-list-created.stdout
fixtures/golden/review-resolve-create/03-consolidate.args
fixtures/golden/review-resolve-create/03-consolidate.exit
fixtures/golden/review-resolve-create/03-consolidate.stderr
fixtures/golden/review-resolve-create/03-consolidate.stdout
fixtures/golden/review-resolve-create/counts.json
fixtures/golden/review-resolve-create/report.jsonl
fixtures/golden/review-resolve-create/table-product-match-review.json
fixtures/golden/review-resolve-create/table-product.json
fixtures/golden/review-resolve-create/table-seller-product.json
fixtures/golden/review-resolve-create/table-sqlite-sequence.json
fixtures/golden/review-resolve-link/01-resolve-1-link.args
fixtures/golden/review-resolve-link/01-resolve-1-link.exit
fixtures/golden/review-resolve-link/01-resolve-1-link.stderr
fixtures/golden/review-resolve-link/01-resolve-1-link.stdout
fixtures/golden/review-resolve-link/counts.json
fixtures/golden/review-resolve-link/table-product-match-review.json
fixtures/golden/review-resolve-link/table-product.json
fixtures/golden/review-resolve-link/table-seller-product.json
fixtures/golden/review-resolve-link/table-sqlite-sequence.json
fixtures/golden/review-resolve-reject/01-resolve-2-reject.args
fixtures/golden/review-resolve-reject/01-resolve-2-reject.exit
fixtures/golden/review-resolve-reject/01-resolve-2-reject.stderr
fixtures/golden/review-resolve-reject/01-resolve-2-reject.stdout
fixtures/golden/review-resolve-reject/counts.json
fixtures/golden/review-resolve-reject/table-product-match-review.json
fixtures/golden/review-resolve-reject/table-product.json
fixtures/golden/review-resolve-reject/table-seller-product.json
fixtures/golden/review-resolve-reject/table-sqlite-sequence.json
```

## Archive listing

```
$ shasum -a 256 .engineos/archived/2026/10/python-reference-2026-10-06.tar.gz
45e48f227ea2c7de38261c2e805a688210fb2e904f01dc2e5e1e55f98ec658e9  .engineos/archived/2026/10/python-reference-2026-10-06.tar.gz
$ tar -tzf .engineos/archived/2026/10/python-reference-2026-10-06.tar.gz
src/catalog_consolidation/
src/catalog_consolidation/__init__.py
src/catalog_consolidation/cli_review.py
src/catalog_consolidation/adapters/
src/catalog_consolidation/cli.py
src/catalog_consolidation/use_cases/
src/catalog_consolidation/domain/
src/catalog_consolidation/__main__.py
src/catalog_consolidation/domain/models.py
src/catalog_consolidation/domain/limits.py
src/catalog_consolidation/domain/ports.py
src/catalog_consolidation/domain/__init__.py
src/catalog_consolidation/domain/matching.py
src/catalog_consolidation/domain/errors.py
src/catalog_consolidation/domain/normalization.py
src/catalog_consolidation/use_cases/__init__.py
src/catalog_consolidation/use_cases/resolve_review.py
src/catalog_consolidation/use_cases/consolidate_file.py
src/catalog_consolidation/adapters/sqlite_review_repository.py
src/catalog_consolidation/adapters/sqlite_migrations.py
src/catalog_consolidation/adapters/__init__.py
src/catalog_consolidation/adapters/sqlite_connection.py
src/catalog_consolidation/adapters/sqlite_catalog_repository.py
src/catalog_consolidation/adapters/json_entry_reader.py
src/catalog_consolidation/adapters/report_writer.py
pyproject.toml
uv.lock
README.md
migrations/
migrations/0001_seller_product_text_id.sql
migrations/0003_review_queue.sql
migrations/0002_product_match_keys.sql
```

The archive contains:
- `src/catalog_consolidation`, without `__pycache__` or egg-info
- `pyproject.toml` and `uv.lock`
- the current `README.md`, which documents running the Python CLI
- `migrations/`: the Python runner resolves them from the repo root, so they are included to make
  the archive self-contained

It has no `.venv`. The working tree has no `tests/` directory to archive.

## Final fixture check against the TypeScript CLI (passing)

2026-10-06T17:34:56Z. The command was `scripts/golden-check.sh`, using the default
`node apps/cli/dist/main.js`. It ran under `env -i` with a PATH holding only symlinks to node, bash
and the shell tools; `command -v python || command -v python3` returned none. Exit code 0:

```
python on PATH: none
golden: OK migrate
golden: OK migrate-up-to-date
golden: OK consolidate-first
golden: OK consolidate-rerun
golden: OK consolidate-dry-run
golden: OK error-missing-db
golden: OK error-unmigrated-db
golden: OK error-invalid-seller-file
golden: OK review-list
golden: OK review-resolve-link
golden: OK review-resolve-reject
golden: OK review-resolve-already-resolved
golden: OK review-list-after-resolve
golden: OK consolidate-after-review
golden: OK review-resolve-create
golden: OK help-root
golden: OK help-migrate
golden: OK help-consolidate
golden: OK help-review
golden: OK help-review-list
golden: OK help-review-resolve
golden: OK help-never-runs
golden: OK (22/22 scenarios)
```

## Parity script (untouched) after the -hh change

```
$ scripts/parity-check.sh | tail -1   (exit 0)
parity: OK (9/9 steps)
```

## History: first check against the TypeScript CLI (before R-4)

2026-10-06T17:31:47Z, exit 1, 14/22 OK. Drift: help placeholder names and wrapping, `-hh` at the
root and review levels (exit 2 instead of help), and the malformed-JSON message
(`invalid JSON at line 1 column 17` versus `invalid JSON`). Full output:

```
python on PATH: none
golden: OK migrate
golden: OK migrate-up-to-date
golden: OK consolidate-first
golden: OK consolidate-rerun
golden: OK consolidate-dry-run
golden: OK error-missing-db
golden: OK error-unmigrated-db
diff -ru fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.stderr out/golden-check/run-20261006T143147-K8n6/actual/error-invalid-seller-file/02-consolidate-malformed.stderr
--- fixtures/golden/error-invalid-seller-file/02-consolidate-malformed.stderr	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/error-invalid-seller-file/02-consolidate-malformed.stderr	2026-10-06 14:31:48
@@ -1,2 +1,2 @@
-error: invalid input file: not_json: data/malformed.json: invalid JSON at line 1 column 17
+error: invalid input file: not_json: data/malformed.json: invalid JSON
 {"timestamp":"<timestamp>","level":"error","service":"catalog_consolidation","event":"consolidate.failed","correlationId":"<id>","errorType":"InvalidInputFileError","durationMs":"<ms>"}
golden: FAIL error-invalid-seller-file
golden: OK review-list
golden: OK review-resolve-link
golden: OK review-resolve-reject
golden: OK review-resolve-already-resolved
golden: OK review-list-after-resolve
golden: OK consolidate-after-review
golden: OK review-resolve-create
diff -ru fixtures/golden/help-root/03-help-hh.exit out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.exit
--- fixtures/golden/help-root/03-help-hh.exit	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.exit	2026-10-06 14:31:49
@@ -1 +1 @@
-0
+2
diff -ru fixtures/golden/help-root/03-help-hh.stderr out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.stderr
--- fixtures/golden/help-root/03-help-hh.stderr	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.stderr	2026-10-06 14:31:49
@@ -0,0 +1,2 @@
+usage: <prog> [-h] COMMAND ...
+<prog>: error: unrecognized arguments: -hh
diff -ru fixtures/golden/help-root/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.stdout
--- fixtures/golden/help-root/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-root/03-help-hh.stdout	2026-10-06 14:31:49
@@ -1,12 +0,0 @@
-usage: <prog> [-h] COMMAND ...
-
-Consolidate seller product files into the marketplace catalog.
-
-positional arguments:
-  COMMAND
-    migrate      apply pending schema migrations
-    consolidate  consolidate a seller product file
-    review       list or resolve held review queue rows
-
-options:
-  -h, --help     show this help message and exit
golden: FAIL help-root
diff -ru fixtures/golden/help-migrate/01-help-h.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/01-help-h.stdout
--- fixtures/golden/help-migrate/01-help-h.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/01-help-h.stdout	2026-10-06 14:31:49
@@ -1,5 +1,5 @@
-usage: <prog> migrate [-h] --db DB
+usage: <prog> migrate [-h] --db PATH
 
 options:
   -h, --help  show this help message and exit
-  --db DB     path to the SQLite catalog
+  --db PATH   path to the SQLite catalog
diff -ru fixtures/golden/help-migrate/02-help--help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/02-help--help.stdout
--- fixtures/golden/help-migrate/02-help--help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/02-help--help.stdout	2026-10-06 14:31:49
@@ -1,5 +1,5 @@
-usage: <prog> migrate [-h] --db DB
+usage: <prog> migrate [-h] --db PATH
 
 options:
   -h, --help  show this help message and exit
-  --db DB     path to the SQLite catalog
+  --db PATH   path to the SQLite catalog
diff -ru fixtures/golden/help-migrate/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/03-help-hh.stdout
--- fixtures/golden/help-migrate/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-migrate/03-help-hh.stdout	2026-10-06 14:31:49
@@ -1,5 +1,5 @@
-usage: <prog> migrate [-h] --db DB
+usage: <prog> migrate [-h] --db PATH
 
 options:
   -h, --help  show this help message and exit
-  --db DB     path to the SQLite catalog
+  --db PATH   path to the SQLite catalog
golden: FAIL help-migrate
diff -ru fixtures/golden/help-consolidate/01-help-h.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/01-help-h.stdout
--- fixtures/golden/help-consolidate/01-help-h.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/01-help-h.stdout	2026-10-06 14:31:49
@@ -1,10 +1,8 @@
-usage: <prog> consolidate [-h] --db DB --input INPUT
-                                                   [--report REPORT]
-                                                   [--dry-run]
+usage: <prog> consolidate [-h] --db PATH --input PATH [--report PATH] [--dry-run]
 
 options:
-  -h, --help       show this help message and exit
-  --db DB          path to the SQLite catalog
-  --input INPUT    seller JSON file (array of entries)
-  --report REPORT  write one JSON line per entry to this path
-  --dry-run        run every decision, then roll back instead of committing
+  -h, --help     show this help message and exit
+  --db PATH      path to the SQLite catalog
+  --input PATH   seller JSON file (array of entries)
+  --report PATH  write one JSON line per entry to this path
+  --dry-run      run every decision, then roll back instead of committing
diff -ru fixtures/golden/help-consolidate/02-help--help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/02-help--help.stdout
--- fixtures/golden/help-consolidate/02-help--help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/02-help--help.stdout	2026-10-06 14:31:49
@@ -1,10 +1,8 @@
-usage: <prog> consolidate [-h] --db DB --input INPUT
-                                                   [--report REPORT]
-                                                   [--dry-run]
+usage: <prog> consolidate [-h] --db PATH --input PATH [--report PATH] [--dry-run]
 
 options:
-  -h, --help       show this help message and exit
-  --db DB          path to the SQLite catalog
-  --input INPUT    seller JSON file (array of entries)
-  --report REPORT  write one JSON line per entry to this path
-  --dry-run        run every decision, then roll back instead of committing
+  -h, --help     show this help message and exit
+  --db PATH      path to the SQLite catalog
+  --input PATH   seller JSON file (array of entries)
+  --report PATH  write one JSON line per entry to this path
+  --dry-run      run every decision, then roll back instead of committing
diff -ru fixtures/golden/help-consolidate/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/03-help-hh.stdout
--- fixtures/golden/help-consolidate/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-consolidate/03-help-hh.stdout	2026-10-06 14:31:49
@@ -1,10 +1,8 @@
-usage: <prog> consolidate [-h] --db DB --input INPUT
-                                                   [--report REPORT]
-                                                   [--dry-run]
+usage: <prog> consolidate [-h] --db PATH --input PATH [--report PATH] [--dry-run]
 
 options:
-  -h, --help       show this help message and exit
-  --db DB          path to the SQLite catalog
-  --input INPUT    seller JSON file (array of entries)
-  --report REPORT  write one JSON line per entry to this path
-  --dry-run        run every decision, then roll back instead of committing
+  -h, --help     show this help message and exit
+  --db PATH      path to the SQLite catalog
+  --input PATH   seller JSON file (array of entries)
+  --report PATH  write one JSON line per entry to this path
+  --dry-run      run every decision, then roll back instead of committing
golden: FAIL help-consolidate
diff -ru fixtures/golden/help-review/03-help-hh.exit out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.exit
--- fixtures/golden/help-review/03-help-hh.exit	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.exit	2026-10-06 14:31:50
@@ -1 +1 @@
-0
+2
diff -ru fixtures/golden/help-review/03-help-hh.stderr out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.stderr
--- fixtures/golden/help-review/03-help-hh.stderr	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.stderr	2026-10-06 14:31:50
@@ -0,0 +1,2 @@
+usage: <prog> review [-h] ACTION ...
+<prog> review: error: unrecognized arguments: -hh
diff -ru fixtures/golden/help-review/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.stdout
--- fixtures/golden/help-review/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review/03-help-hh.stdout	2026-10-06 14:31:50
@@ -1,9 +0,0 @@
-usage: <prog> review [-h] ACTION ...
-
-positional arguments:
-  ACTION
-    list      list review queue rows, oldest first
-    resolve   resolve one PENDING review row
-
-options:
-  -h, --help  show this help message and exit
golden: FAIL help-review
diff -ru fixtures/golden/help-review-list/01-help-h.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/01-help-h.stdout
--- fixtures/golden/help-review-list/01-help-h.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/01-help-h.stdout	2026-10-06 14:31:50
@@ -1,13 +1,9 @@
-usage: <prog> review list [-h] --db DB
-                                                   [--status {PENDING,LINKED,CREATED,REJECTED}]
-                                                   [--limit LIMIT]
-                                                   [--after-id AFTER_ID]
+usage: <prog> review list [-h] --db PATH [--status PENDING|LINKED|CREATED|REJECTED] [--limit N] [--after-id ID]
 
 options:
   -h, --help            show this help message and exit
-  --db DB               path to the SQLite catalog
-  --status {PENDING,LINKED,CREATED,REJECTED}
+  --db PATH             path to the SQLite catalog
+  --status PENDING|LINKED|CREATED|REJECTED
                         queue status to list (default PENDING)
-  --limit LIMIT         rows per page, 1..100 (default 20)
-  --after-id AFTER_ID   return rows with an Id greater than this (from the
-                        previous page's next: line)
+  --limit N             rows per page, 1..100 (default 20)
+  --after-id ID         return rows with an Id greater than this (from the previous page's next: line)
diff -ru fixtures/golden/help-review-list/02-help--help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/02-help--help.stdout
--- fixtures/golden/help-review-list/02-help--help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/02-help--help.stdout	2026-10-06 14:31:50
@@ -1,13 +1,9 @@
-usage: <prog> review list [-h] --db DB
-                                                   [--status {PENDING,LINKED,CREATED,REJECTED}]
-                                                   [--limit LIMIT]
-                                                   [--after-id AFTER_ID]
+usage: <prog> review list [-h] --db PATH [--status PENDING|LINKED|CREATED|REJECTED] [--limit N] [--after-id ID]
 
 options:
   -h, --help            show this help message and exit
-  --db DB               path to the SQLite catalog
-  --status {PENDING,LINKED,CREATED,REJECTED}
+  --db PATH             path to the SQLite catalog
+  --status PENDING|LINKED|CREATED|REJECTED
                         queue status to list (default PENDING)
-  --limit LIMIT         rows per page, 1..100 (default 20)
-  --after-id AFTER_ID   return rows with an Id greater than this (from the
-                        previous page's next: line)
+  --limit N             rows per page, 1..100 (default 20)
+  --after-id ID         return rows with an Id greater than this (from the previous page's next: line)
diff -ru fixtures/golden/help-review-list/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/03-help-hh.stdout
--- fixtures/golden/help-review-list/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-list/03-help-hh.stdout	2026-10-06 14:31:50
@@ -1,13 +1,9 @@
-usage: <prog> review list [-h] --db DB
-                                                   [--status {PENDING,LINKED,CREATED,REJECTED}]
-                                                   [--limit LIMIT]
-                                                   [--after-id AFTER_ID]
+usage: <prog> review list [-h] --db PATH [--status PENDING|LINKED|CREATED|REJECTED] [--limit N] [--after-id ID]
 
 options:
   -h, --help            show this help message and exit
-  --db DB               path to the SQLite catalog
-  --status {PENDING,LINKED,CREATED,REJECTED}
+  --db PATH             path to the SQLite catalog
+  --status PENDING|LINKED|CREATED|REJECTED
                         queue status to list (default PENDING)
-  --limit LIMIT         rows per page, 1..100 (default 20)
-  --after-id AFTER_ID   return rows with an Id greater than this (from the
-                        previous page's next: line)
+  --limit N             rows per page, 1..100 (default 20)
+  --after-id ID         return rows with an Id greater than this (from the previous page's next: line)
golden: FAIL help-review-list
diff -ru fixtures/golden/help-review-resolve/01-help-h.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/01-help-h.stdout
--- fixtures/golden/help-review-resolve/01-help-h.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/01-help-h.stdout	2026-10-06 14:31:50
@@ -1,11 +1,9 @@
-usage: <prog> review resolve [-h] --db DB --id ID
-                                                      (--create | --reject | --link PRODUCT_ID)
+usage: <prog> review resolve [-h] --db PATH --id N (--create | --reject | --link PRODUCT_ID)
 
 options:
   -h, --help         show this help message and exit
-  --db DB            path to the SQLite catalog
-  --id ID            review row Id
-  --create           create a new catalog product from the seller's values and
-                     link it
+  --db PATH          path to the SQLite catalog
+  --id N             review row Id
+  --create           create a new catalog product from the seller's values and link it
   --reject           reject the row; later re-sends stay held for review
   --link PRODUCT_ID  link the seller SKU to this existing catalog product
diff -ru fixtures/golden/help-review-resolve/02-help--help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/02-help--help.stdout
--- fixtures/golden/help-review-resolve/02-help--help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/02-help--help.stdout	2026-10-06 14:31:50
@@ -1,11 +1,9 @@
-usage: <prog> review resolve [-h] --db DB --id ID
-                                                      (--create | --reject | --link PRODUCT_ID)
+usage: <prog> review resolve [-h] --db PATH --id N (--create | --reject | --link PRODUCT_ID)
 
 options:
   -h, --help         show this help message and exit
-  --db DB            path to the SQLite catalog
-  --id ID            review row Id
-  --create           create a new catalog product from the seller's values and
-                     link it
+  --db PATH          path to the SQLite catalog
+  --id N             review row Id
+  --create           create a new catalog product from the seller's values and link it
   --reject           reject the row; later re-sends stay held for review
   --link PRODUCT_ID  link the seller SKU to this existing catalog product
diff -ru fixtures/golden/help-review-resolve/03-help-hh.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/03-help-hh.stdout
--- fixtures/golden/help-review-resolve/03-help-hh.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-review-resolve/03-help-hh.stdout	2026-10-06 14:31:50
@@ -1,11 +1,9 @@
-usage: <prog> review resolve [-h] --db DB --id ID
-                                                      (--create | --reject | --link PRODUCT_ID)
+usage: <prog> review resolve [-h] --db PATH --id N (--create | --reject | --link PRODUCT_ID)
 
 options:
   -h, --help         show this help message and exit
-  --db DB            path to the SQLite catalog
-  --id ID            review row Id
-  --create           create a new catalog product from the seller's values and
-                     link it
+  --db PATH          path to the SQLite catalog
+  --id N             review row Id
+  --create           create a new catalog product from the seller's values and link it
   --reject           reject the row; later re-sends stay held for review
   --link PRODUCT_ID  link the seller SKU to this existing catalog product
golden: FAIL help-review-resolve
diff -ru fixtures/golden/help-never-runs/01-migrate-help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/01-migrate-help.stdout
--- fixtures/golden/help-never-runs/01-migrate-help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/01-migrate-help.stdout	2026-10-06 14:31:50
@@ -1,5 +1,5 @@
-usage: <prog> migrate [-h] --db DB
+usage: <prog> migrate [-h] --db PATH
 
 options:
   -h, --help  show this help message and exit
-  --db DB     path to the SQLite catalog
+  --db PATH   path to the SQLite catalog
diff -ru fixtures/golden/help-never-runs/02-consolidate-help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/02-consolidate-help.stdout
--- fixtures/golden/help-never-runs/02-consolidate-help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/02-consolidate-help.stdout	2026-10-06 14:31:50
@@ -1,10 +1,8 @@
-usage: <prog> consolidate [-h] --db DB --input INPUT
-                                                   [--report REPORT]
-                                                   [--dry-run]
+usage: <prog> consolidate [-h] --db PATH --input PATH [--report PATH] [--dry-run]
 
 options:
-  -h, --help       show this help message and exit
-  --db DB          path to the SQLite catalog
-  --input INPUT    seller JSON file (array of entries)
-  --report REPORT  write one JSON line per entry to this path
-  --dry-run        run every decision, then roll back instead of committing
+  -h, --help     show this help message and exit
+  --db PATH      path to the SQLite catalog
+  --input PATH   seller JSON file (array of entries)
+  --report PATH  write one JSON line per entry to this path
+  --dry-run      run every decision, then roll back instead of committing
diff -ru fixtures/golden/help-never-runs/03-review-resolve-help.stdout out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/03-review-resolve-help.stdout
--- fixtures/golden/help-never-runs/03-review-resolve-help.stdout	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/help-never-runs/03-review-resolve-help.stdout	2026-10-06 14:31:50
@@ -1,11 +1,9 @@
-usage: <prog> review resolve [-h] --db DB --id ID
-                                                      (--create | --reject | --link PRODUCT_ID)
+usage: <prog> review resolve [-h] --db PATH --id N (--create | --reject | --link PRODUCT_ID)
 
 options:
   -h, --help         show this help message and exit
-  --db DB            path to the SQLite catalog
-  --id ID            review row Id
-  --create           create a new catalog product from the seller's values and
-                     link it
+  --db PATH          path to the SQLite catalog
+  --id N             review row Id
+  --create           create a new catalog product from the seller's values and link it
   --reject           reject the row; later re-sends stay held for review
   --link PRODUCT_ID  link the seller SKU to this existing catalog product
golden: FAIL help-never-runs
--- fixtures/golden/manifest.json	2026-10-06 14:31:34
+++ out/golden-check/run-20261006T143147-K8n6/actual/manifest.json	2026-10-06 14:31:50
@@ -277,7 +277,7 @@
         {
           "step": "03-help-hh",
           "args": "-hh",
-          "exit": 0
+          "exit": 2
         }
       ]
     },
@@ -340,7 +340,7 @@
         {
           "step": "03-help-hh",
           "args": "review -hh",
-          "exit": 0
+          "exit": 2
         }
       ]
     },
golden: FAIL manifest.json (commands or exit codes)
golden: FAIL (8 drifted, 14/22 scenarios OK; outputs in out/golden-check/run-20261006T143147-K8n6)
```
