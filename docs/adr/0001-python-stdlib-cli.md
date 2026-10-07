# 0001. Build the consolidator as a Python 3.12 standard-library CLI

Date: 2026-10-05
Status: superseded by 0006

## Context

The challenge asks for a system that "receives a file" of seller products and merges it into an
existing SQLite catalog (`data/catalog.db`, 975 products, `SellerProduct` empty). The input is a
48 KB JSON array of 269 entries; the only persistent store is a SQLite file. Evaluators will read
the code and question the decisions live, so readability and a frictionless `git clone && run`
matter more than throughput. The design record
(`../../.engineos/changes/2026-10-05-catalog-consolidation-design.md`, section A) freezes the
stack; this ADR records why. Related: [PRD](../prds/0001-catalog-consolidation.md),
[0005 run semantics](0005-all-or-nothing-idempotent-runs.md).

## Options considered

1. **Python 3.12, standard library only, CLI entry point** (`sqlite3`, `json`, `unicodedata`,
   `re`, `difflib`, `argparse`, `dataclasses`), laid out as ports and adapters
   (`domain/`, `use_cases/`, `adapters/`, `cli.py` as the composition root).
   - Pros: zero runtime dependencies (`sqlite3` and a Unicode normalizer ship with the
     interpreter); one command to run; the whole matching rule is readable in two small modules;
     `difflib` gives a deterministic, dependency-free similarity score.
   - Cons: no type-level schema for the DB (hand-written SQL, no ORM); `difflib` is a crude
     similarity measure compared with specialised libraries; a CLI has no concurrency story
     beyond "one run at a time".
2. **NestJS + TypeORM service** (team default stack for backend work).
   - Pros: DTO validation, migrations and repository patterns come with the framework;
     matches the team's existing conventions.
   - Cons: `node_modules` plus a native SQLite driver (`better-sqlite3`/`sqlite3`) as runtime
     dependencies for a single batch job; dependency-injection and module wiring are ceremony
     that hides the 150 lines that actually matter; slower for an evaluator to read.
3. **HTTP API (any stack) exposing `POST /consolidate`**.
   - Pros: mirrors how a marketplace would eventually ingest feeds; easy to demo with curl.
   - Cons: adds authentication, upload limits, process lifecycle and a server to run, none of
     which the brief asks for; the hard problem (identity and matching) is unchanged by the
     transport.

## Decision

Option 1. The deciding reasons: (a) the problem is a deterministic batch transformation over a
local file, so a process that starts, runs one transaction and exits is the simplest correct
shape; (b) zero runtime dependencies removes every setup failure mode on the evaluator's
machine; (c) the ports-and-adapters layout keeps the identity rules (`domain/normalization.py`,
`domain/matching.py`) free of `sqlite3` and `argparse`, so they can be tested and discussed in
isolation. Development tooling (`pytest`, `ruff`, `pyright`) is pinned to exact versions and is
not needed at runtime.

## Consequences

- Easier: running, reading and testing; the normalizer is one Python function reused for the
  catalog backfill and for incoming entries (one implementation of the rule).
- Harder: schema evolution is hand-written SQL applied by a small runner tracking
  `SchemaVersion` (see [0003](0003-seller-link-schema-and-golden-record.md)); there is no ORM to
  catch a column typo before runtime.
- We commit to maintaining: the forward-only migration runner, the `domain/` import-purity test
  (stdlib imports only), and pinned dev dependencies.
- Revisit when: files must be ingested continuously or by several sellers concurrently (an HTTP
  or queue adapter becomes a real requirement); the catalog grows past roughly 100k products,
  where the O(catalog) fuzzy pass per unmatched entry stops being acceptable; or the matching
  rule needs a similarity library beyond `difflib`. The adapter boundary is where those changes
  land; the domain modules should not move.
