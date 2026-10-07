#!/usr/bin/env bash
# Golden-file check for the catalog CLI: replays every recorded scenario against a CLI and diffs
# the normalized outputs with fixtures/golden (recorded once from the Python reference CLI, see
# scripts/golden-record.sh and docs/adr/2026-10-06-remove-python-golden-fixtures.md).
#
#   scripts/golden-check.sh                 check; prints "golden: OK <scenario>" per scenario and
#                                           "golden: OK (N/N scenarios)"; exit 0 green, 1 on drift
#   scripts/golden-check.sh produce <dir>   write the normalized outputs to <dir> (must not exist)
#                                           without comparing; used by the recorder
#
# GOLDEN_CLI   command under test (default "node apps/cli/dist/main.js"). Never "pnpm cli": pnpm
#              prints banner lines to stdout, and stdout is compared. Commands run from inside a
#              scratch directory, so any word naming an existing repo-relative path is made absolute.
# GOLDEN_PROG  program name the CLI prints in help and usage lines (default
#              "catalog-consolidation"); it is normalized to <prog>.
#
# Nothing here needs Python. data/ is only ever read; every command runs on scratch copies under a
# fresh out/golden-check/run-* directory (kept for inspection, never deleted by this script).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$ROOT"

readonly FIXTURES=fixtures/golden
readonly SOURCE_DB=data/catalog.db
readonly SOURCE_INPUT=data/ProductEntry.json
# argparse wraps help at the terminal width; pin it so recording and checking see the same width.
readonly HELP_COLUMNS=80

readonly DUMP_PRODUCT='SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product ORDER BY Id'
readonly DUMP_SELLER_PRODUCT='SELECT Id, SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType FROM SellerProduct ORDER BY Id'
readonly DUMP_REVIEW='SELECT Id, SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, CandidateProductId, Score, Reason, Status FROM ProductMatchReview ORDER BY Id'
readonly DUMP_SEQUENCE='SELECT name, seq FROM sqlite_sequence ORDER BY name'
readonly SELECT_SCHEMA_VERSION='SELECT Version, Name, Checksum FROM SchemaVersion ORDER BY Version'
readonly SELECT_NORMALIZED='SELECT Id, NormalizedName, NormalizedBrand FROM Product ORDER BY Id'

# Scenario order is execution order: the main work directory carries state from one to the next.
readonly SCENARIOS=(
  "migrate|migrate a fresh copy: stdout (backup path normalized), one valid backup, SchemaVersion rows, backfilled keys"
  "migrate-up-to-date|migrate an already migrated copy again"
  "consolidate-first|first consolidation: stdout, JSONL report, tables without CreatedAt (976/255/2)"
  "consolidate-rerun|idempotent re-run: rows_written=0, tables unchanged"
  "consolidate-dry-run|dry run on a fresh migrated copy: every decision, nothing committed (975/0/0)"
  "error-missing-db|commands against a database file that does not exist"
  "error-unmigrated-db|commands against an unmigrated copy; the copy stays byte-identical"
  "error-invalid-seller-file|invalid seller files (wrong shape, malformed JSON, missing file); tables unchanged"
  "review-list|review list: default page, paging with --limit/--after-id, empty status"
  "review-resolve-link|review resolve --link, then the tables"
  "review-resolve-reject|review resolve --reject, then the tables"
  "review-resolve-already-resolved|resolving an already resolved row and an unknown row; tables unchanged"
  "review-list-after-resolve|review list per status after the decisions"
  "consolidate-after-review|consolidation after review: REVIEWED rows stay authoritative"
  "review-resolve-create|review resolve --create on a copy taken before the review flow, then consolidation"
  "help-root|help forms at the top level"
  "help-migrate|help forms for migrate"
  "help-consolidate|help forms for consolidate"
  "help-review|help forms for review"
  "help-review-list|help forms for review list"
  "help-review-resolve|help forms for review resolve"
  "help-never-runs|help on a full command line runs nothing; the unmigrated copy stays byte-identical"
)

die() {
  echo "golden: $1" >&2
  exit 2
}

for tool in sqlite3 jq shasum diff; do
  command -v "$tool" > /dev/null || die "required tool not found: $tool"
done

read -r -a CLI_WORDS <<< "${GOLDEN_CLI:-node apps/cli/dist/main.js}"
[[ ${#CLI_WORDS[@]} -gt 0 ]] || die "GOLDEN_CLI is set but empty"
CLI=()
for word in "${CLI_WORDS[@]}"; do
  if [[ $word != /* && $word != -* && -e $ROOT/$word ]]; then
    CLI+=("$ROOT/$word")
  else
    CLI+=("$word")
  fi
done
readonly PROG=${GOLDEN_PROG:-catalog-consolidation}

# --- normalization --------------------------------------------------------------------------

escape_sed() {
  printf '%s' "$1" | sed -e 's/[][\.*^$/&|]/\\&/g'
}

# Volatile parts of stdout/stderr text become placeholders; the rest of every line is the contract.
normalize_text() {
  local work_logical=$1 work_physical=$2
  sed -E \
    -e "s|$(escape_sed "$work_physical")|<work>|g" \
    -e "s|$(escape_sed "$work_logical")|<work>|g" \
    -e "s|$(escape_sed "$PROG")|<prog>|g" \
    -e '1s/^run [0-9a-f]{32} /run <run> /' \
    -e 's/^backup: (.*)\.pre-migrate-.*\.bak$/backup: \1.pre-migrate-<timestamp>.bak/' \
    -e 's/correlationId=[0-9a-f]+/correlationId=<id>/g'
}

# JSON log lines keep their keys, key order and stable values; timing and ids become placeholders.
normalize_log_lines() {
  jq -R -r '
    . as $line
    | (try fromjson catch null) as $json
    | if ($json | type) == "object" then
        $json
        | (if has("timestamp") then .timestamp = "<timestamp>" else . end)
        | (if has("correlationId") then .correlationId = "<id>" else . end)
        | (if has("durationMs") then .durationMs = "<ms>" else . end)
        | tojson
      else $line end'
}

# --- recording primitives -------------------------------------------------------------------

new_work() {
  local name=$1
  WORK=$RUN/work/$name
  mkdir -p "$WORK/data" "$WORK/reports"
  cp "$SOURCE_DB" "$WORK/data/catalog.db"
  cp "$SOURCE_INPUT" "$WORK/data/ProductEntry.json"
}

use_work() {
  WORK=$RUN/work/$1
}

begin_scenario() {
  SCENARIO=$1
  DEST=$OUTPUT/$SCENARIO
  STEP=0
  mkdir -p "$DEST" "$RUN/raw/$SCENARIO"
}

# run_cli <name> <args...>: runs the CLI from the work directory and records the arguments, the
# exit code, and normalized stdout and stderr as <NN>-<name>.{args,exit,stdout,stderr}.
run_cli() {
  local name=$1
  shift
  STEP=$((STEP + 1))
  local base
  base=$(printf '%02d-%s' "$STEP" "$name")
  local raw=$RUN/raw/$SCENARIO/$base exit_code=0 physical
  printf '%s\n' "$*" > "$DEST/$base.args"
  (cd "$WORK" && COLUMNS=$HELP_COLUMNS "${CLI[@]}" "$@") > "$raw.stdout" 2> "$raw.stderr" || exit_code=$?
  printf '%s\n' "$exit_code" > "$DEST/$base.exit"
  physical=$(cd "$WORK" && pwd -P)
  normalize_text "$WORK" "$physical" < "$raw.stdout" > "$DEST/$base.stdout"
  normalize_text "$WORK" "$physical" < "$raw.stderr" | normalize_log_lines > "$DEST/$base.stderr"
}

query_json() {
  local db=$1 sql=$2 rows
  rows=$(sqlite3 -readonly -json "$db" "$sql")
  if [[ -z $rows ]]; then
    echo '[]'
  else
    printf '%s\n' "$rows"
  fi
}

# Tables without CreatedAt, plus the row counts as one line.
dump_tables() {
  local db=$WORK/data/catalog.db
  query_json "$db" "$DUMP_PRODUCT" > "$DEST/table-product.json"
  query_json "$db" "$DUMP_SELLER_PRODUCT" > "$DEST/table-seller-product.json"
  query_json "$db" "$DUMP_REVIEW" > "$DEST/table-product-match-review.json"
  query_json "$db" "$DUMP_SEQUENCE" > "$DEST/table-sqlite-sequence.json"
  jq -s -c 'map(length)' "$DEST/table-product.json" "$DEST/table-seller-product.json" \
    "$DEST/table-product-match-review.json" > "$DEST/counts.json"
}

snapshot_tables() {
  local db=$WORK/data/catalog.db
  {
    query_json "$db" "$DUMP_PRODUCT"
    query_json "$db" "$DUMP_SELLER_PRODUCT"
    query_json "$db" "$DUMP_REVIEW"
    query_json "$db" "$DUMP_SEQUENCE"
  } > "$RUN/raw/$SCENARIO/$1.snapshot"
}

# Records whether the tables equal the snapshot taken under <name> earlier in this scenario.
record_tables_unchanged() {
  local name=$1 now=$RUN/raw/$SCENARIO/$1.after
  local db=$WORK/data/catalog.db
  {
    query_json "$db" "$DUMP_PRODUCT"
    query_json "$db" "$DUMP_SELLER_PRODUCT"
    query_json "$db" "$DUMP_REVIEW"
    query_json "$db" "$DUMP_SEQUENCE"
  } > "$now"
  if cmp -s "$RUN/raw/$SCENARIO/$name.snapshot" "$now"; then
    echo 'tables unchanged' > "$DEST/tables.txt"
  else
    echo 'tables CHANGED' > "$DEST/tables.txt"
  fi
}

record_file_unchanged() {
  local relative=$1 label=$2
  if cmp -s "$SOURCE_DB" "$WORK/$relative"; then
    echo "scratch $relative byte-identical to the source catalog" > "$DEST/$label"
  else
    echo "scratch $relative MODIFIED" > "$DEST/$label"
  fi
}

record_data_files() {
  (cd "$WORK/data" && ls -1) \
    | sed -E 's/\.pre-migrate-.*\.bak$/.pre-migrate-<timestamp>.bak/' > "$DEST/data-files.txt"
}

# The pre-migrate backup's content is compared through .dump, not cmp: the SQLite backup API
# rewrites the database header, so a correct backup is never byte-identical to its source.
record_backup() {
  local backups=("$WORK"/data/catalog.db.pre-migrate-*.bak) integrity content=differs
  if [[ ${#backups[@]} -ne 1 || ! -f ${backups[0]} ]]; then
    echo "backups=$(find "$WORK/data" -name 'catalog.db.pre-migrate-*.bak' | wc -l | tr -d ' ')" > "$DEST/backup.txt"
    return
  fi
  integrity=$(sqlite3 -readonly "${backups[0]}" 'PRAGMA integrity_check')
  sqlite3 -readonly "${backups[0]}" .dump > "$RUN/raw/$SCENARIO/backup.sql"
  if cmp -s "$RUN/source.sql" "$RUN/raw/$SCENARIO/backup.sql"; then
    content=equals-source-dump
  fi
  printf 'backups=1 integrity=%s content=%s\n' "$integrity" "$content" > "$DEST/backup.txt"
}

copy_report() {
  local report=$WORK/reports/$1
  if [[ -f $report ]]; then
    cp "$report" "$DEST/$2"
  else
    echo "no report written" > "$DEST/$2.absent"
  fi
}

# --- scenarios ------------------------------------------------------------------------------

record_all() {
  sqlite3 -readonly "$SOURCE_DB" .dump > "$RUN/source.sql"

  new_work main
  begin_scenario migrate
  run_cli migrate migrate --db data/catalog.db
  record_backup
  record_data_files
  query_json "$WORK/data/catalog.db" "$SELECT_SCHEMA_VERSION" > "$DEST/schema-version.json"
  query_json "$WORK/data/catalog.db" "$SELECT_NORMALIZED" > "$DEST/product-normalized-keys.json"

  begin_scenario migrate-up-to-date
  snapshot_tables before
  run_cli migrate-again migrate --db data/catalog.db
  record_data_files
  query_json "$WORK/data/catalog.db" "$SELECT_SCHEMA_VERSION" > "$DEST/schema-version.json"
  record_tables_unchanged before

  begin_scenario consolidate-first
  run_cli consolidate consolidate --db data/catalog.db --input data/ProductEntry.json --report reports/first.jsonl
  copy_report first.jsonl report.jsonl
  dump_tables

  begin_scenario consolidate-rerun
  snapshot_tables before
  run_cli consolidate-again consolidate --db data/catalog.db --input data/ProductEntry.json --report reports/rerun.jsonl
  copy_report rerun.jsonl report.jsonl
  record_tables_unchanged before
  # The create branch of the review flow starts from this state, before any decision is taken.
  mkdir -p "$RUN/work/fork/data" "$RUN/work/fork/reports"
  sqlite3 -readonly "$WORK/data/catalog.db" ".backup '$RUN/work/fork/data/catalog.db'"
  cp "$SOURCE_INPUT" "$RUN/work/fork/data/ProductEntry.json"

  new_work dry
  begin_scenario consolidate-dry-run
  run_cli migrate migrate --db data/catalog.db
  record_backup
  run_cli consolidate-dry-run consolidate --db data/catalog.db --input data/ProductEntry.json --dry-run --report reports/dry.jsonl
  copy_report dry.jsonl report.jsonl
  dump_tables

  new_work errors
  begin_scenario error-missing-db
  run_cli migrate-missing migrate --db data/missing.db
  run_cli consolidate-missing consolidate --db data/missing.db --input data/ProductEntry.json
  run_cli review-list-missing review list --db data/missing.db
  run_cli review-resolve-missing review resolve --db data/missing.db --id 1 --reject
  record_data_files

  begin_scenario error-unmigrated-db
  run_cli consolidate-unmigrated consolidate --db data/catalog.db --input data/ProductEntry.json
  run_cli review-list-unmigrated review list --db data/catalog.db
  run_cli review-resolve-unmigrated review resolve --db data/catalog.db --id 1 --reject
  record_file_unchanged data/catalog.db catalog-db.txt
  record_data_files

  use_work main
  begin_scenario error-invalid-seller-file
  printf '{}' > "$WORK/data/object.json"
  printf '[{"SellerName": ' > "$WORK/data/malformed.json"
  snapshot_tables before
  run_cli consolidate-object consolidate --db data/catalog.db --input data/object.json --report reports/object.jsonl
  run_cli consolidate-malformed consolidate --db data/catalog.db --input data/malformed.json --report reports/malformed.jsonl
  run_cli consolidate-absent consolidate --db data/catalog.db --input data/absent.json --report reports/absent.jsonl
  copy_report object.jsonl report-object.jsonl
  copy_report malformed.jsonl report-malformed.jsonl
  copy_report absent.jsonl report-absent.jsonl
  record_tables_unchanged before

  begin_scenario review-list
  run_cli list review list --db data/catalog.db
  run_cli list-limit-1 review list --db data/catalog.db --limit 1
  run_cli list-after-1 review list --db data/catalog.db --limit 1 --after-id 1
  run_cli list-linked review list --db data/catalog.db --status LINKED

  begin_scenario review-resolve-link
  run_cli resolve-1-link review resolve --db data/catalog.db --id 1 --link 21
  dump_tables

  begin_scenario review-resolve-reject
  run_cli resolve-2-reject review resolve --db data/catalog.db --id 2 --reject
  dump_tables

  begin_scenario review-resolve-already-resolved
  snapshot_tables before
  run_cli resolve-1-reject-again review resolve --db data/catalog.db --id 1 --reject
  run_cli resolve-2-create-again review resolve --db data/catalog.db --id 2 --create
  run_cli resolve-999-unknown review resolve --db data/catalog.db --id 999 --reject
  record_tables_unchanged before

  begin_scenario review-list-after-resolve
  run_cli list-pending review list --db data/catalog.db
  run_cli list-linked review list --db data/catalog.db --status LINKED
  run_cli list-rejected review list --db data/catalog.db --status REJECTED

  begin_scenario consolidate-after-review
  run_cli consolidate consolidate --db data/catalog.db --input data/ProductEntry.json --report reports/after-review.jsonl
  copy_report after-review.jsonl report.jsonl
  dump_tables

  use_work fork
  begin_scenario review-resolve-create
  run_cli resolve-1-create review resolve --db data/catalog.db --id 1 --create
  run_cli list-created review list --db data/catalog.db --status CREATED
  dump_tables
  run_cli consolidate consolidate --db data/catalog.db --input data/ProductEntry.json --report reports/after-create.jsonl
  copy_report after-create.jsonl report.jsonl

  new_work help
  local level form
  for level in root migrate consolidate review review-list review-resolve; do
    begin_scenario "help-$level"
    for form in -h --help -hh; do
      case $level in
        root) run_cli "help$form" "$form" ;;
        review-list) run_cli "help$form" review list "$form" ;;
        review-resolve) run_cli "help$form" review resolve "$form" ;;
        *) run_cli "help$form" "$level" "$form" ;;
      esac
    done
  done

  begin_scenario help-never-runs
  run_cli migrate-help migrate --db data/catalog.db -h
  run_cli consolidate-help consolidate --db data/catalog.db --input data/ProductEntry.json --help
  run_cli review-resolve-help review resolve --db data/catalog.db --id 1 --reject -h
  record_file_unchanged data/catalog.db catalog-db.txt
  record_data_files
}

write_manifest() {
  local entry name description
  {
    for entry in "${SCENARIOS[@]}"; do
      name=${entry%%|*}
      description=${entry#*|}
      jq -n -c --arg name "$name" --arg description "$description" --arg dir "$OUTPUT/$name" '
        {name: $name, description: $description, commands: []}' > "$RUN/raw/manifest-$name.json"
      local args_file
      for args_file in "$OUTPUT/$name"/*.args; do
        [[ -f $args_file ]] || continue
        jq -c --arg step "$(basename "$args_file" .args)" \
          --arg args "$(cat "$args_file")" \
          --argjson exit "$(cat "${args_file%.args}.exit")" \
          '.commands += [{step: $step, args: $args, exit: $exit}]' \
          "$RUN/raw/manifest-$name.json" > "$RUN/raw/manifest-$name.next"
        mv "$RUN/raw/manifest-$name.next" "$RUN/raw/manifest-$name.json"
      done
      cat "$RUN/raw/manifest-$name.json"
    done
  } | jq -s '{
      cwd: "a scratch directory holding data/catalog.db and data/ProductEntry.json copies",
      normalizations: [
        "run id on the first stdout line of consolidate -> <run>",
        "migrate backup path timestamp -> <timestamp>",
        "program name in help and usage lines -> <prog>",
        "JSON log lines: timestamp, correlationId, durationMs -> placeholders; key order kept",
        "correlationId=<hex> in messages -> correlationId=<id>",
        "absolute scratch directory -> <work>",
        "table dumps omit CreatedAt"
      ],
      scenarios: .
    }' > "$OUTPUT/manifest.json"
}

data_checksums() {
  shasum -a 256 "$SOURCE_DB" "$SOURCE_INPUT"
}

produce() {
  local data_before data_after
  data_before=$(data_checksums)
  mkdir -p "$OUTPUT" "$RUN/raw"
  record_all
  write_manifest
  data_after=$(data_checksums)
  [[ $data_before == "$data_after" ]] || die "data/ changed during the run; this must never happen"
}

if [[ ${1:-} == produce ]]; then
  [[ $# -eq 2 ]] || die "usage: scripts/golden-check.sh produce <new-dir>"
  [[ ! -e $2 ]] || die "refusing to write into existing path: $2"
  mkdir -p "$2"
  RUN=$(cd "$2" && pwd -P)
  OUTPUT=$RUN/actual
  produce
  echo "golden: produced ${#SCENARIOS[@]} scenarios in $2/actual"
  exit 0
fi
[[ $# -eq 0 ]] || die "usage: scripts/golden-check.sh [produce <new-dir>]"
[[ -f $FIXTURES/manifest.json ]] || die "no fixtures at $FIXTURES (record them with scripts/golden-record.sh)"

mkdir -p out/golden-check
RUN=$(mktemp -d "$ROOT/out/golden-check/run-$(date +%Y%m%dT%H%M%S)-XXXX")
OUTPUT=$RUN/actual
produce

expected_names=$(jq -r '.scenarios[].name' "$FIXTURES/manifest.json")
actual_names=$(jq -r '.scenarios[].name' "$OUTPUT/manifest.json")
if [[ $expected_names != "$actual_names" ]]; then
  diff -u <(printf '%s\n' "$expected_names") <(printf '%s\n' "$actual_names") || true
  echo "golden: FAIL scenario list differs from $FIXTURES/manifest.json" >&2
  exit 1
fi

total=0
failed=0
for entry in "${SCENARIOS[@]}"; do
  name=${entry%%|*}
  total=$((total + 1))
  if diff -ru "$FIXTURES/$name" "$OUTPUT/$name"; then
    echo "golden: OK $name"
  else
    echo "golden: FAIL $name"
    failed=$((failed + 1))
  fi
done
# Re-baseline annotations are provenance of the fixtures, not CLI behavior; they are not compared.
jq 'del(.scenarios[].rebaselinedFrom, .scenarios[].rebaselineReason)' "$FIXTURES/manifest.json" \
  > "$RUN/expected-manifest.json"
if ! diff -u "$RUN/expected-manifest.json" "$OUTPUT/manifest.json"; then
  echo "golden: FAIL manifest.json (commands or exit codes)"
  manifest_drift=1
fi

if [[ $failed -ne 0 || ${manifest_drift:-0} -ne 0 ]]; then
  echo "golden: FAIL ($failed drifted, $((total - failed))/$total scenarios OK; outputs in ${RUN#"$ROOT"/})" >&2
  exit 1
fi
echo "golden: OK ($total/$total scenarios)"
