# Catalog Consolidation — Implementation Plan (tasks)

Date: 2026-10-05
Status: ready for dispatch
Risk: low (local SQLite file, no production surface) — autonomy ceiling A2
Source of truth for decisions: `.engineos/changes/2026-10-05-catalog-consolidation-design.md`
(frozen sections A–I). This plan implements those contracts; it does not renegotiate them.

## Goal

A command-line system that receives a seller product file (`ProductEntry.json`), matches each
entry against the marketplace catalog (`catalog.db`, SQLite), links the seller to the existing
product when it is the same product, creates the product only when it is genuinely new, holds
uncertain matches for human review, and reports one outcome per entry — idempotently and
all-or-nothing per run.

## Architecture in three lines

1. Ports and adapters: a stdlib-only `domain/` (frozen dataclasses, `normalize`, `match_entry`,
   `Protocol` ports), one use case `ConsolidateFile`, and adapters for SQLite, JSON input and the report.
2. `cli.py` is the composition root (argparse, wiring, exit codes); there is no HTTP layer.
3. Schema evolves through forward-only SQL migrations applied by a small runner that tracks
   `SchemaVersion`, with the `NormalizedName`/`NormalizedBrand` backfill done by the same Python normalizer.

## Tech stack

Python 3.12 (needed for `sqlite3.Connection.autocommit`), standard library only at runtime
(`sqlite3`, `json`, `unicodedata`, `re`, `difflib`, `argparse`, `dataclasses`, `hashlib`,
`logging`). Dev tools pinned exact: `pytest`, `ruff`, `pyright`. Environment managed with
`uv` (`uv.lock` committed).

## Related documents

- PRD: [../../prds/0001-catalog-consolidation.md](../../prds/0001-catalog-consolidation.md)
- ADR 0001 — Python stdlib CLI: [../../adr/0001-python-stdlib-cli.md](../../adr/0001-python-stdlib-cli.md)
- ADR 0002 — Product identity = normalized name + compatible brand: [../../adr/0002-product-identity-normalized-name-and-brand.md](../../adr/0002-product-identity-normalized-name-and-brand.md)
- ADR 0003 — Seller link schema and golden record: [../../adr/0003-seller-link-schema-and-golden-record.md](../../adr/0003-seller-link-schema-and-golden-record.md)
- ADR 0004 — Review queue for uncertain matches: [../../adr/0004-review-queue-for-uncertain-matches.md](../../adr/0004-review-queue-for-uncertain-matches.md)
- ADR 0005 — All-or-nothing idempotent runs: [../../adr/0005-all-or-nothing-idempotent-runs.md](../../adr/0005-all-or-nothing-idempotent-runs.md)

## Conventions applied (from `rules/backend-python.md` and `rules/data.md`)

Applied: `domain/` imports the standard library only; ports are `typing.Protocol`; domain values
are `@dataclass(frozen=True)` with tuples, never lists; closed sets are `Literal[...]`; every
size cap lives in `domain/limits.py`; typed `DomainError` hierarchy; adapter constructors are
keyword-only; the use case is the transaction boundary and repositories never commit; every SQL
statement is parameterized; migrations are forward-only, one file per change, never edited once
shipped; reads are bounded (`LIMIT`, keyset batches, or streamed cursors — never an unbounded
`fetchall()`); `X | None`, PEP 8 names, no `print()` outside the CLI's user-facing output.

Not applicable, and deliberately not built: FastAPI routers, Pydantic schemas, `pydantic-settings`,
`/healthz`/`/readyz`, HTTP exception handlers and the `{ statusCode, code, message, correlationId }`
error body. There is no HTTP surface (frozen decision A, ADR 0001). Their roles are taken by:
boundary validation in `adapters/json_entry_reader.py` (stdlib), configuration = CLI arguments
parsed once in `cli.py`, and error mapping = exit codes in `cli.py`.

Tests are opt-in (EngineOS policy). Every test lives in a task marked `[opt-in: tests]`; no
implementation task depends on one.

---

## Frozen contracts

Every parallel task codes against this section verbatim. T0 writes it into code; later tasks
import it and never change it. A contract that looks wrong is reported to the orchestrator, not
edited.

### Repository layout (final)

```
pyproject.toml
uv.lock
.gitignore
README.md
migrations/
  0001_seller_product_text_id.sql
  0002_product_match_keys.sql
  0003_review_queue.sql
src/catalog_consolidation/
  __init__.py
  __main__.py
  cli.py
  domain/
    __init__.py
    errors.py
    limits.py
    matching.py
    models.py
    normalization.py
    ports.py
  use_cases/
    __init__.py
    consolidate_file.py
  adapters/
    __init__.py
    json_entry_reader.py
    report_writer.py
    sqlite_catalog_repository.py
    sqlite_connection.py
    sqlite_migrations.py
tests/                         (only if the [opt-in: tests] tasks are taken)
  unit/
  integration/
```

### `domain/limits.py`

```python
from typing import Final

MAX_INPUT_FILE_BYTES: Final = 10 * 1024 * 1024
MAX_INPUT_ENTRIES: Final = 100_000

MAX_SELLER_PRODUCT_ID_LENGTH: Final = 64
MAX_SELLER_NAME_LENGTH: Final = 100
MAX_NAME_LENGTH: Final = 200
MAX_BRAND_LENGTH: Final = 100
MAX_CATEGORY_LENGTH: Final = 100

# Seller SKU is opaque: charset allowlist only, UUID shape is a warning, not a rule.
SELLER_PRODUCT_ID_PATTERN: Final = r"[A-Za-z0-9._-]+"
UUID_PATTERN: Final = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

FUZZY_REVIEW_THRESHOLD: Final = 0.80
MAX_EXACT_CANDIDATES: Final = 50
FUZZY_SCAN_BATCH_SIZE: Final = 500
BACKFILL_BATCH_SIZE: Final = 500
REPORT_SCORE_DECIMALS: Final = 4
```

Patterns are applied with `re.fullmatch`.

### `domain/models.py`

```python
from dataclasses import dataclass
from typing import Final, Literal

OutcomeCode = Literal[
    "LINKED_EXACT",
    "LINKED_NORMALIZED",
    "CREATED",
    "UNCHANGED",
    "SKIPPED_DUPLICATE_LISTING",
    "HELD_FOR_REVIEW",
    "REJECTED_INVALID",
    "CONFLICT_SELLER_SKU",
]
# Fixed order used by the stdout summary and by every count table.
OUTCOME_CODES: Final[tuple[OutcomeCode, ...]] = (
    "LINKED_EXACT",
    "LINKED_NORMALIZED",
    "CREATED",
    "UNCHANGED",
    "SKIPPED_DUPLICATE_LISTING",
    "HELD_FOR_REVIEW",
    "REJECTED_INVALID",
    "CONFLICT_SELLER_SKU",
)

MatchType = Literal["EXACT", "NORMALIZED", "CREATED", "REVIEWED"]  # REVIEWED = human-confirmed via `review resolve --link`
ReviewReason = Literal["FUZZY", "AMBIGUOUS"]
ReviewStatus = Literal["PENDING", "LINKED", "CREATED", "REJECTED"]

WarningCode = Literal[
    "non_uuid_seller_sku",
    "unknown_fields_ignored",
    "blank_brand_treated_as_null",
    "blank_category_treated_as_null",
    "ambiguous_candidates",
    "review_previously_rejected",
]
ViolationCode = Literal[
    "not_an_object",
    "missing",
    "not_a_string",
    "blank",
    "too_long",
    "invalid_charset",
    "unnormalizable",
]
FieldName = Literal["record", "Id", "SellerName", "Name", "Brand", "Category"]


@dataclass(frozen=True)
class FieldViolation:
    field: FieldName
    code: ViolationCode


@dataclass(frozen=True)
class SellerEntry:
    """A record that passed boundary validation."""

    index: int  # 0-based position in the input array
    seller_name: str  # stripped
    seller_product_id: str  # exactly as received (charset already validated)
    name: str  # exactly as received; used for the EXACT comparison and stored as SourceName
    brand: str | None  # as received; blank string becomes None (with a warning)
    category: str | None  # as received; blank string becomes None (with a warning)
    warnings: tuple[WarningCode, ...]


@dataclass(frozen=True)
class RejectedEntry:
    """A record that failed boundary validation; reported, never written."""

    index: int
    seller_name: str | None  # present when that field itself was valid
    seller_product_id: str | None  # present when that field itself was valid
    violations: tuple[FieldViolation, ...]  # all violations, in field order
    warnings: tuple[WarningCode, ...]


@dataclass(frozen=True)
class CatalogProduct:
    id: int
    name: str
    brand: str | None
    category: str | None
    normalized_name: str | None
    normalized_brand: str | None


@dataclass(frozen=True)
class FuzzyCandidate:
    product_id: int
    normalized_name: str


@dataclass(frozen=True)
class MatchQuery:
    raw_name: str
    normalized_name: str  # never None: the use case rejects unnormalizable names first
    normalized_brand: str | None


@dataclass(frozen=True)
class LinkDecision:
    product_id: int
    match_type: Literal["EXACT", "NORMALIZED"]


@dataclass(frozen=True)
class HoldDecision:
    reason: ReviewReason
    candidate_product_id: int | None  # FUZZY: best candidate; AMBIGUOUS: None
    score: float | None  # FUZZY: best ratio; AMBIGUOUS: None
    candidate_product_ids: tuple[int, ...]  # ascending ids


@dataclass(frozen=True)
class CreateDecision:
    best_score: float | None  # best fuzzy ratio below threshold; None when the pool was empty


MatchDecision = LinkDecision | HoldDecision | CreateDecision


@dataclass(frozen=True)
class SellerLink:
    id: int
    seller_name: str
    seller_product_id: str
    product_id: int
    match_type: MatchType


@dataclass(frozen=True)
class NewSellerLink:
    seller_name: str
    seller_product_id: str
    product_id: int
    source_name: str
    source_brand: str | None
    source_category: str | None
    match_type: MatchType


@dataclass(frozen=True)
class NewProduct:
    name: str  # clean_display(entry.name)
    brand: str | None  # clean_display(entry.brand)
    category: str | None  # clean_display(entry.category)
    normalized_name: str
    normalized_brand: str | None


@dataclass(frozen=True)
class ReviewItem:
    id: int
    seller_name: str
    seller_product_id: str
    candidate_product_id: int | None
    score: float | None
    reason: ReviewReason
    status: ReviewStatus


@dataclass(frozen=True)
class NewReviewItem:
    seller_name: str
    seller_product_id: str
    source_name: str
    source_brand: str | None
    source_category: str | None
    candidate_product_id: int | None
    score: float | None
    reason: ReviewReason


@dataclass(frozen=True)
class ProductKeySource:
    product_id: int
    name: str
    brand: str | None


@dataclass(frozen=True)
class EntryOutcome:
    index: int
    seller_name: str | None
    seller_product_id: str | None
    outcome: OutcomeCode
    product_id: int | None
    review_reason: ReviewReason | None
    score: float | None  # unrounded; the report writer rounds
    warnings: tuple[WarningCode, ...]
    errors: tuple[str, ...]  # "<code>:<field>", e.g. "too_long:Name"; empty unless REJECTED_INVALID


@dataclass(frozen=True)
class RunSummary:
    run_id: str  # uuid4().hex, also the log correlationId
    input_label: str  # the --input path as typed
    total: int
    counts: tuple[tuple[OutcomeCode, int], ...]  # every code in OUTCOME_CODES order, zeros included
    rows_written: int
    dry_run: bool
    committed: bool


@dataclass(frozen=True)
class ConsolidationResult:
    outcomes: tuple[EntryOutcome, ...]  # in input order
    summary: RunSummary
```

`product_id` per outcome: LINKED_* / CREATED / UNCHANGED / SKIPPED_DUPLICATE_LISTING = the
product the seller is (or already was) linked to; CONFLICT_SELLER_SKU = the product the SKU is
already linked to; HELD_FOR_REVIEW = candidate id (FUZZY) or `None` (AMBIGUOUS);
REJECTED_INVALID = `None`. `score` is set only when a fuzzy pass ran (HELD FUZZY, CREATED).

### `domain/errors.py`

```python
from typing import Literal

InputFileErrorCode = Literal[
    "unreadable", "too_large", "not_utf8", "not_json", "not_an_array", "too_many_entries"
]
DatabaseFileErrorCode = Literal["not_found", "schema_outdated"]
MigrationErrorCode = Literal["invalid_filename", "version_gap", "checksum_mismatch", "rows_lost"]


class DomainError(Exception):
    """Base of every expected, typed failure."""


class InvalidInputFileError(DomainError):
    def __init__(self, *, code: InputFileErrorCode, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code: InputFileErrorCode = code
        self.detail = detail


class DatabaseFileError(DomainError):
    def __init__(self, *, code: DatabaseFileErrorCode, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code: DatabaseFileErrorCode = code
        self.detail = detail


class MigrationError(DomainError):
    def __init__(self, *, code: MigrationErrorCode, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code: MigrationErrorCode = code
        self.detail = detail
```

`detail` never contains seller-supplied text (only paths, sizes, versions, file names).

### `domain/normalization.py` (signatures)

```python
def normalize(text: str | None) -> str | None: ...
def clean_display(text: str | None) -> str | None: ...
```

`normalize` — exactly frozen rule B, in this order:
1. `unicodedata.normalize("NFKD", text)`, drop every char where `unicodedata.combining(ch)` is non-zero.
2. `casefold()`.
3. Delete the five quote characters `"` `'` `’` (U+2019) `“` (U+201C) `”` (U+201D).
4. Replace every run of characters outside `[0-9a-z]` with one space.
5. Collapse whitespace and strip. Empty result, or `None` input, returns `None`.

`clean_display` — `" ".join(text.split())`; `None` or blank returns `None`. Used for the display
values of a CREATED product only (frozen rule C).

Reference table (verified by the planner against the rule on 2026-10-05):

| Input | `normalize` |
|---|---|
| `Câmera Canon EOS R6` | `camera canon eos r6` |
| `Smart TV Samsung 55"` | `smart tv samsung 55` |
| `Smart TV Samsung  55"` | `smart tv samsung 55` |
| `iPad Pro 12.9''` | `ipad pro 12 9` |
| `Levi's` / `Levi’s` / `Levis` | `levis` |
| `BLACK+DECKER` / `Black+Decker` | `black decker` |
| `Basketball Spalding  Official` | `basketball spalding official` |
| `Rock “N” Roll` | `rock n roll` |
| `Straße` | `strasse` |
| `TestBrand'; SELECT 1; --` | `testbrand select 1` |
| `   ` / `!!!` / `None` | `None` |

### `domain/matching.py` (signature and algorithm)

```python
def match_entry(*, query: MatchQuery, catalog: CatalogReader) -> MatchDecision: ...
```

1. `candidates = catalog.find_by_normalized_name(normalized_name=query.normalized_name,
   normalized_brand=query.normalized_brand)` (already brand-compatible, ascending id).
   - exactly 1 → `LinkDecision(product_id, "EXACT" if candidate.name == query.raw_name else "NORMALIZED")`.
   - more than 1 → `HoldDecision(reason="AMBIGUOUS", candidate_product_id=None, score=None,
     candidate_product_ids=<ids ascending>)`.
2. 0 candidates → iterate `catalog.list_brand_compatible(normalized_brand=query.normalized_brand)`
   (ascending id), `ratio = difflib.SequenceMatcher(None, query.normalized_name,
   candidate.normalized_name, autojunk=False).ratio()`. Keep the best; replace only on a strictly
   greater ratio (ties go to the lowest id). Optional speed-up allowed: skip a candidate when
   `quick_ratio()` is strictly below the current best (an upper bound — results unchanged).
   - best ratio `>= FUZZY_REVIEW_THRESHOLD` → `HoldDecision(reason="FUZZY",
     candidate_product_id=<best id>, score=<best ratio>, candidate_product_ids=(<best id>,))`.
   - otherwise → `CreateDecision(best_score=<best ratio or None when the pool was empty>)`.

Brand compatibility (both repository queries): `normalized_brand IS NULL` on either side, or equal.
Fuzzy never links (frozen rule B).

### `domain/ports.py`

```python
from collections.abc import Iterator
from typing import Protocol

from catalog_consolidation.domain.models import (
    CatalogProduct, FuzzyCandidate, NewProduct, NewReviewItem, NewSellerLink,
    ProductKeySource, RejectedEntry, ReviewItem, SellerEntry, SellerLink,
)


class CatalogReader(Protocol):
    def find_by_normalized_name(
        self, *, normalized_name: str, normalized_brand: str | None
    ) -> tuple[CatalogProduct, ...]: ...

    def list_brand_compatible(self, *, normalized_brand: str | None) -> Iterator[FuzzyCandidate]: ...


class CatalogRepository(CatalogReader, Protocol):
    def find_link_by_sku(self, *, seller_name: str, seller_product_id: str) -> SellerLink | None: ...

    def find_link_by_seller_product(self, *, seller_name: str, product_id: int) -> SellerLink | None: ...

    def find_review_by_sku(self, *, seller_name: str, seller_product_id: str) -> ReviewItem | None: ...

    def insert_product(self, product: NewProduct) -> int: ...

    def insert_link(self, link: NewSellerLink) -> int: ...

    def enqueue_review(self, review: NewReviewItem) -> int: ...

    # Products written by other tools arrive with NULL match keys; the use case heals them
    # at the start of every run so they stay visible to matching (decision recorded 2026-10-05).
    def list_products_missing_match_keys(
        self, *, after_id: int, limit: int
    ) -> tuple[ProductKeySource, ...]: ...

    def set_match_keys(
        self, *, product_id: int, normalized_name: str, normalized_brand: str | None
    ) -> None: ...


class UnitOfWork(Protocol):
    @property
    def catalog(self) -> CatalogRepository: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...

    def rows_written(self) -> int: ...  # rows inserted/updated since this unit of work was built


class EntrySource(Protocol):
    def read(self) -> tuple[SellerEntry | RejectedEntry, ...]: ...  # raises InvalidInputFileError
```

(`ruff format` will expand the import; the symbol set is what is frozen.)

### `adapters/sqlite_connection.py`

```python
REQUIRED_SCHEMA_VERSION: Final = 3

def open_connection(db_path: Path) -> sqlite3.Connection: ...
def read_schema_version(connection: sqlite3.Connection) -> int: ...
def require_schema_version(connection: sqlite3.Connection, *, required: int = REQUIRED_SCHEMA_VERSION) -> None: ...
```

- `open_connection`: raises `DatabaseFileError(code="not_found")` when `db_path` is not an
  existing file (sqlite would otherwise create an empty database silently). Then
  `sqlite3.connect(db_path, autocommit=True)`, `PRAGMA foreign_keys = ON`,
  `PRAGMA busy_timeout = 5000`, then `connection.autocommit = False` (opens the implicit
  transaction; from here every statement runs inside a transaction that only `commit()` /
  `rollback()` ends, and `executescript` does not auto-commit).
- `read_schema_version`: `0` when table `SchemaVersion` is absent, else `MAX(Version)`.
- `require_schema_version`: raises `DatabaseFileError(code="schema_outdated", detail="schema
  version <n> < required <m>; run: python -m catalog_consolidation migrate --db <path>")`.

### Adapter constructors (keyword-only)

```python
# adapters/json_entry_reader.py
class JsonEntryReader:  # implements EntrySource
    def __init__(self, *, path: Path, max_bytes: int = MAX_INPUT_FILE_BYTES,
                 max_entries: int = MAX_INPUT_ENTRIES) -> None: ...

# adapters/sqlite_catalog_repository.py
class SqliteCatalogRepository:  # implements CatalogRepository
    def __init__(self, *, connection: sqlite3.Connection) -> None: ...
class SqliteUnitOfWork:  # implements UnitOfWork
    def __init__(self, *, connection: sqlite3.Connection) -> None: ...

# adapters/sqlite_migrations.py
@dataclass(frozen=True)
class MigrationFile:
    version: int
    name: str  # e.g. "seller_product_text_id"
    path: Path
    checksum: str  # sha256 hex of the file bytes

@dataclass(frozen=True)
class AppliedMigration:
    version: int
    name: str
    backfilled_rows: int | None

@dataclass(frozen=True)
class MigrationReport:
    backup_path: Path | None  # None when nothing was pending
    applied: tuple[AppliedMigration, ...]
    schema_version: int

def default_migrations_dir() -> Path: ...  # <repo root>/migrations, resolved from __file__
class SqliteMigrationRunner:
    def __init__(self, *, connection: sqlite3.Connection, db_path: Path, migrations_dir: Path) -> None: ...
    def pending(self) -> tuple[MigrationFile, ...]: ...
    def apply_pending(self) -> MigrationReport: ...

# adapters/report_writer.py
def to_report_record(outcome: EntryOutcome) -> dict[str, object]: ...
def write_jsonl_report(*, path: Path, outcomes: Sequence[EntryOutcome]) -> None: ...
def format_summary(summary: RunSummary) -> str: ...
```

### Use case (`use_cases/consolidate_file.py`)

```python
class ConsolidateFile:
    def __init__(self, *, unit_of_work: UnitOfWork, entry_source: EntrySource, input_label: str,
                 run_id: str) -> None: ...
    def execute(self, *, dry_run: bool) -> ConsolidationResult: ...
```

Frozen per-entry algorithm (this order produces the acceptance baseline; the planner verified it
on the real data with a read-only simulation on 2026-10-05):

```
entries = entry_source.read()            # InvalidInputFileError propagates; nothing written
heal match keys (same transaction):      # keyset over list_products_missing_match_keys(after_id, BACKFILL_BATCH_SIZE);
                                         # set_match_keys only when normalize(name) is not None, so a product whose
                                         # name normalizes to nothing stays NULL and a re-run still writes 0 rows
for item in entries (file order):
  RejectedEntry                          -> REJECTED_INVALID, errors = "<code>:<field>" per violation
  q.normalized_name = normalize(name)
  None                                   -> REJECTED_INVALID, errors = ("unnormalizable:Name",)
  link = find_link_by_sku(seller, sku)
  link exists:
      link.match_type == "REVIEWED"                         -> UNCHANGED (human decision is authoritative; added 2026-10-05)
      d = match_entry(q)
      d is LinkDecision and d.product_id == link.product_id -> UNCHANGED (product_id = link.product_id)
      otherwise                                             -> CONFLICT_SELLER_SKU (product_id = link.product_id), no write
  review = find_review_by_sku(seller, sku)
  review exists                          -> HELD_FOR_REVIEW, no write
                                            (product_id = review.candidate_product_id, review_reason/score from the row;
                                             add warning "review_previously_rejected" when status == "REJECTED")
  d = match_entry(q)
  HoldDecision                           -> enqueue_review(...) -> HELD_FOR_REVIEW
                                            (AMBIGUOUS adds warning "ambiguous_candidates")
  CreateDecision                         -> insert_product(NewProduct(clean_display(...), normalized keys))
                                            insert_link(match_type="CREATED", Source* = raw entry values) -> CREATED
  LinkDecision:
      find_link_by_seller_product(seller, d.product_id) exists -> SKIPPED_DUPLICATE_LISTING, no write
      else insert_link(match_type=d.match_type) -> LINKED_EXACT | LINKED_NORMALIZED
after the loop: rows = unit_of_work.rows_written()
  dry_run  -> unit_of_work.rollback(), committed = False
  else     -> unit_of_work.commit(),   committed = True
any exception inside the loop or commit -> unit_of_work.rollback(); re-raise
```

Every outcome carries the entry's validation `warnings`. Writes made earlier in the run are
visible to later entries (same connection, same transaction) — that is what makes two sellers
sending the same new product produce 1 CREATED + 1 LINKED (frozen rule G).

### Report record (`--report`, one JSON object per line, input order)

Keys and order are fixed; `json.dumps(record, ensure_ascii=False, separators=(",", ":"))`:

```json
{"index":180,"sellerName":"MegaStore","sellerProductId":"09835342345-4678-9abc-def012345678","outcome":"CREATED","productId":976,"reviewReason":null,"score":0.4762,"warnings":["non_uuid_seller_sku"],"errors":[]}
```

`score` rounded to `REPORT_SCORE_DECIMALS`, `null` when absent. The file is written to
`<path>.tmp` and moved with `os.replace` (no half-written report); parent directories are created.
(The example is the real first-run record for `Security Test Product` on the 2026-10-05 data.)

### Stdout summary (exact format)

```
run <run_id> input=<input_label> dry_run=<true|false> committed=<true|false> rows_written=<n>
LINKED_EXACT                 200
LINKED_NORMALIZED             54
CREATED                        1
UNCHANGED                      1
SKIPPED_DUPLICATE_LISTING     11
HELD_FOR_REVIEW                2
REJECTED_INVALID               0
CONFLICT_SELLER_SKU            0
TOTAL                        269
```

Each count line is `f"{code:<26}{count:>6}"`; all eight codes always printed, in `OUTCOME_CODES` order.

### CLI (frozen decision H)

```
python -m catalog_consolidation migrate     --db PATH
python -m catalog_consolidation consolidate --db PATH --input PATH [--report PATH] [--dry-run]
```

`cli.main(argv: Sequence[str] | None = None) -> int`. Exit codes:

| Code | When |
|---|---|
| 0 | run finished (committed, or rolled back by `--dry-run`), including runs with REJECTED_INVALID / CONFLICT / HELD entries; `migrate` finished |
| 2 | invalid input: `InvalidInputFileError`; `DatabaseFileError` (db path missing, schema not migrated); argparse usage errors (argparse's own code) |
| 1 | anything else (`MigrationError`, `sqlite3.Error`, unexpected exceptions) — transaction rolled back |

Errors go to stderr as one line `error: <message>` plus one structured JSON log line
(`event`, `correlationId`, `errorType`, `durationMs`); never a traceback, never seller-supplied text.

### SQL — `SchemaVersion` (created by the runner, not a migration file)

```sql
CREATE TABLE IF NOT EXISTS SchemaVersion (
  Version   INTEGER PRIMARY KEY,
  Name      TEXT NOT NULL,
  Checksum  TEXT NOT NULL,
  AppliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### SQL — `migrations/0001_seller_product_text_id.sql`

```sql
-- SellerProductId becomes the seller's opaque TEXT SKU; adds traceability columns and the
-- idempotency keys. SQLite cannot change a column type in place, so the table is rebuilt.
-- SellerProduct is empty in the delivered catalog; any pre-existing row is preserved with
-- SourceName/SourceBrand/SourceCategory copied from its catalog product and MatchType 'EXACT'.
-- Safe with foreign_keys=ON: no table references SellerProduct.
CREATE TABLE SellerProduct_new (
  Id              INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerName      TEXT NOT NULL,
  ProductId       INTEGER NOT NULL CONSTRAINT FK_Product_Id REFERENCES Product (Id),
  SellerProductId TEXT NOT NULL,
  SourceName      TEXT NOT NULL,
  SourceBrand     TEXT,
  SourceCategory  TEXT,
  MatchType       TEXT NOT NULL CHECK (MatchType IN ('EXACT', 'NORMALIZED', 'CREATED', 'REVIEWED')),
  CreatedAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_SellerProduct_SellerSku UNIQUE (SellerName, SellerProductId),
  CONSTRAINT UQ_SellerProduct_SellerProduct UNIQUE (SellerName, ProductId)
);

INSERT INTO SellerProduct_new
  (Id, SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType)
SELECT sp.Id, sp.SellerName, sp.ProductId, CAST(sp.SellerProductId AS TEXT),
       p.Name, p.Brand, p.Category, 'EXACT'
FROM SellerProduct AS sp
JOIN Product AS p ON p.Id = sp.ProductId;

DROP TABLE SellerProduct;
ALTER TABLE SellerProduct_new RENAME TO SellerProduct;

CREATE INDEX IX_SellerProduct_ProductId ON SellerProduct (ProductId);
```

### SQL — `migrations/0002_product_match_keys.sql`

```sql
-- Match keys computed by the Python normalizer (one implementation of rule B). The runner
-- backfills every existing row inside the same transaction right after this script.
-- Not UNIQUE: two brands may legitimately share a generic product name.
ALTER TABLE Product ADD COLUMN NormalizedName TEXT;
ALTER TABLE Product ADD COLUMN NormalizedBrand TEXT;
CREATE INDEX IX_Product_NormalizedName ON Product (NormalizedName);
```

### SQL — `migrations/0003_review_queue.sql`

```sql
-- Uncertain matches (fuzzy or ambiguous) wait here for a human; they are never auto-linked.
CREATE TABLE ProductMatchReview (
  Id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  SellerName         TEXT NOT NULL,
  SellerProductId    TEXT NOT NULL,
  SourceName         TEXT NOT NULL,
  SourceBrand        TEXT,
  SourceCategory     TEXT,
  CandidateProductId INTEGER CONSTRAINT FK_ProductMatchReview_Candidate REFERENCES Product (Id),
  Score              REAL,
  Reason             TEXT NOT NULL CHECK (Reason IN ('FUZZY', 'AMBIGUOUS')),
  Status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (Status IN ('PENDING', 'LINKED', 'CREATED', 'REJECTED')),
  CreatedAt          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT UQ_ProductMatchReview_SellerSku UNIQUE (SellerName, SellerProductId)
);

CREATE INDEX IX_ProductMatchReview_Status ON ProductMatchReview (Status);
```

### SQL — repository statements (all parameterized, `?` placeholders)

```sql
-- find_by_normalized_name (params: name, brand, brand, MAX_EXACT_CANDIDATES)
SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product
WHERE NormalizedName = ? AND (? IS NULL OR NormalizedBrand IS NULL OR NormalizedBrand = ?)
ORDER BY Id LIMIT ?;

-- list_brand_compatible (params: brand, brand, after_id, FUZZY_SCAN_BATCH_SIZE) — keyset batches
SELECT Id, NormalizedName FROM Product
WHERE NormalizedName IS NOT NULL AND (? IS NULL OR NormalizedBrand IS NULL OR NormalizedBrand = ?)
  AND Id > ?
ORDER BY Id LIMIT ?;

-- find_link_by_sku
SELECT Id, SellerName, SellerProductId, ProductId, MatchType FROM SellerProduct
WHERE SellerName = ? AND SellerProductId = ?;

-- find_link_by_seller_product
SELECT Id, SellerName, SellerProductId, ProductId, MatchType FROM SellerProduct
WHERE SellerName = ? AND ProductId = ?;

-- find_review_by_sku
SELECT Id, SellerName, SellerProductId, CandidateProductId, Score, Reason, Status
FROM ProductMatchReview WHERE SellerName = ? AND SellerProductId = ?;

-- insert_product
INSERT INTO Product (Name, Brand, Category, NormalizedName, NormalizedBrand) VALUES (?, ?, ?, ?, ?);

-- insert_link
INSERT INTO SellerProduct
  (SellerName, ProductId, SellerProductId, SourceName, SourceBrand, SourceCategory, MatchType)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- enqueue_review
INSERT INTO ProductMatchReview
  (SellerName, SellerProductId, SourceName, SourceBrand, SourceCategory, CandidateProductId, Score, Reason)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- list_products_missing_match_keys (params: after_id, BACKFILL_BATCH_SIZE) — keyset batches
SELECT Id, Name, Brand FROM Product WHERE NormalizedName IS NULL AND Id > ? ORDER BY Id LIMIT ?;

-- set_match_keys
UPDATE Product SET NormalizedName = ?, NormalizedBrand = ? WHERE Id = ?;

-- backfill (runner, keyset batches of BACKFILL_BATCH_SIZE)
SELECT Id, Name, Brand FROM Product WHERE Id > ? ORDER BY Id LIMIT ?;
UPDATE Product SET NormalizedName = ?, NormalizedBrand = ? WHERE Id = ?;
```

Brand appears twice in the parameter tuple because SQLite `?` placeholders are positional; named
placeholders (`:brand`) are an acceptable equivalent.

---

## Acceptance baseline (real data, 2026-10-05)

On a fresh copy of `data/catalog.db` migrated to version 3, consolidating `data/ProductEntry.json`:

| Outcome | First run | Re-run |
|---|---|---|
| LINKED_EXACT | 200 | 0 |
| LINKED_NORMALIZED | 54 | 0 |
| CREATED | 1 (`Security Test Product`, best ratio 0.4762) | 0 |
| UNCHANGED | 1 (GardenStore re-send of `e5e5e5e5-…`) | 256 |
| SKIPPED_DUPLICATE_LISTING | 11 | 11 |
| HELD_FOR_REVIEW | 2 (`Roteador WiFi 6 TP-Link` 0.9091, `Processador AMD Ryzen 9 7950X` 0.9643) | 2 |
| REJECTED_INVALID | 0 | 0 |
| CONFLICT_SELLER_SKU | 0 | 0 |
| TOTAL | 269 | 269 |
| rows_written | 258 (255 links + 1 product + 2 reviews) | 0 |

After the first run: `SellerProduct` = 255 rows, `Product` = 976 rows, `ProductMatchReview` = 2
rows. Report: 269 lines, 3 carry `non_uuid_seller_sku`.

---

## Environment setup (every task uses it)

```bash
cd <repo>
uv sync --python 3.12 --extra dev       # creates .venv, installs the package editable + dev tools
```

Scoped checks for a task that owns files `F...`: `.venv/bin/ruff check F... && .venv/bin/ruff format --check F... && .venv/bin/pyright F...`.
Agents never run repo-wide formatters or git writes; the final gate is the orchestrator's.

---

## Tasks

### T0 — Project scaffold and frozen contracts in code

- Owner domain: backend-python
- depends_on: none
- Size: L (~330 lines)
- Owns: `pyproject.toml`, `uv.lock`, `.gitignore`, `src/catalog_consolidation/__init__.py`,
  `src/catalog_consolidation/domain/__init__.py`, `src/catalog_consolidation/domain/models.py`,
  `src/catalog_consolidation/domain/ports.py`, `src/catalog_consolidation/domain/errors.py`,
  `src/catalog_consolidation/domain/limits.py`, `src/catalog_consolidation/use_cases/__init__.py`,
  `src/catalog_consolidation/adapters/__init__.py`, `src/catalog_consolidation/adapters/sqlite_connection.py`

Steps:
- [ ] Write `pyproject.toml`:
  ```toml
  [build-system]
  requires = ["setuptools>=69"]
  build-backend = "setuptools.build_meta"

  [project]
  name = "catalog-consolidation"
  version = "0.1.0"
  requires-python = ">=3.12"
  dependencies = []

  [project.optional-dependencies]
  dev = ["pytest==8.3.5", "ruff==0.11.13", "pyright==1.1.402"]

  [tool.setuptools.packages.find]
  where = ["src"]

  [tool.ruff]
  line-length = 100
  target-version = "py312"
  src = ["src", "tests"]

  [tool.ruff.lint]
  select = ["E", "W", "F", "I", "N", "B", "UP", "S", "SIM", "RUF"]

  [tool.ruff.lint.per-file-ignores]
  "tests/**" = ["S101"]

  [tool.pyright]
  include = ["src"]
  pythonVersion = "3.12"
  typeCheckingMode = "strict"
  venvPath = "."
  venv = ".venv"

  [tool.pytest.ini_options]
  testpaths = ["tests"]
  ```
  If a pinned version is not resolvable at implementation time, bump to the newest published
  release and keep the exact `==` pin.
- [ ] Write `.gitignore`: `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `out/`, `*.bak`, `*.tmp`.
- [ ] Write `domain/limits.py`, `domain/models.py`, `domain/errors.py`, `domain/ports.py` exactly as in **Frozen contracts**.
- [ ] Write `adapters/sqlite_connection.py` (`REQUIRED_SCHEMA_VERSION`, `open_connection`, `read_schema_version`, `require_schema_version`) as frozen.
- [ ] Empty `__init__.py` files (no barrels re-exporting internals).
- [ ] `uv lock` and `uv sync --python 3.12 --extra dev`.

Acceptance:
- `uv sync --python 3.12 --extra dev` exits 0 and `uv.lock` exists.
- `.venv/bin/python -c "from catalog_consolidation.domain.models import OUTCOME_CODES; print(len(OUTCOME_CODES))"` prints `8`.
- `.venv/bin/python -c "import sqlite3,pathlib; from catalog_consolidation.adapters.sqlite_connection import open_connection, read_schema_version; c=open_connection(pathlib.Path('data/catalog.db')); print(c.execute('PRAGMA foreign_keys').fetchone()[0], read_schema_version(c)); c.rollback(); c.close()"` prints `1 0`.
- `.venv/bin/ruff check src && .venv/bin/ruff format --check src && .venv/bin/pyright` exits 0.

### T1 — Normalization

- Owner domain: backend-python
- depends_on: T0
- Size: S (~40 lines)
- Owns: `src/catalog_consolidation/domain/normalization.py`

Steps:
- [ ] Implement `normalize` with the five ordered steps of rule B; the quote deletion is a
  module-level `str.maketrans` table; the non-alphanumeric run is a module-level compiled
  `re.compile(r"[^0-9a-z]+")`.
- [ ] Implement `clean_display`.
- [ ] Docstrings state WHY the order matters (quotes deleted before step 4, so `55"` becomes `55`, not `55 `; NFKD before casefold so `Câmera` loses the accent).

Acceptance:
- `.venv/bin/python -c "from catalog_consolidation.domain.normalization import normalize as n; print([n(x) for x in ['Câmera Canon EOS R6', 'Smart TV Samsung 55\"', \"iPad Pro 12.9''\", \"Levi's\", 'BLACK+DECKER', 'Basketball Spalding  Official', '   ', None]])"`
  prints `['camera canon eos r6', 'smart tv samsung 55', 'ipad pro 12 9', 'levis', 'black decker', 'basketball spalding official', None, None]`.
- `.venv/bin/python -c "from catalog_consolidation.domain.normalization import clean_display as c; print([c('Basketball Spalding  Official '), c('  ')])"` prints `['Basketball Spalding Official', None]`.
- Scoped ruff + pyright on the file exit 0.

### T2 — Migration SQL files

- Owner domain: dba
- depends_on: T0
- Size: S (~70 lines)
- Owns: `migrations/0001_seller_product_text_id.sql`, `migrations/0002_product_match_keys.sql`, `migrations/0003_review_queue.sql`

Steps:
- [ ] Write the three files exactly as in **Frozen contracts** (comments state WHY; no `BEGIN`/`COMMIT` inside the files — the runner owns the transaction).
- [ ] Dry-check on a scratch copy, never on `data/catalog.db`.

Acceptance:
- ```bash
  mkdir -p out && cp data/catalog.db out/t2.db
  .venv/bin/python -c "import sqlite3; c=sqlite3.connect('out/t2.db', autocommit=True); c.execute('PRAGMA foreign_keys=ON'); c.autocommit=False; [c.executescript(open(f'migrations/{f}').read()) for f in ['0001_seller_product_text_id.sql','0002_product_match_keys.sql','0003_review_queue.sql']]; c.commit(); print(c.execute('PRAGMA integrity_check').fetchone()[0], c.execute('PRAGMA foreign_key_check').fetchall(), c.execute(\"SELECT type FROM pragma_table_info('SellerProduct') WHERE name='SellerProductId'\").fetchone()[0])"
  ```
  prints `ok [] TEXT`.
- `sqlite3 out/t2.db ".indexes"` lists `IX_Product_NormalizedName`, `IX_ProductMatchReview_Status`, `IX_SellerProduct_ProductId` (plus the autoindexes of the UNIQUE constraints).
- `rm out/t2.db` afterwards.

### T3 — JSON entry reader with validation limits

- Owner domain: backend-python
- depends_on: T0
- Size: M (~170 lines)
- Owns: `src/catalog_consolidation/adapters/json_entry_reader.py`

Steps:
- [ ] File-level checks, in order, each raising `InvalidInputFileError` (run fails before any write):
  path is not a readable file → `unreadable`; `stat().st_size > max_bytes` → `too_large`; read at most
  `max_bytes + 1` bytes and re-check size (guards a file growing between stat and read); decode
  `utf-8-sig` failure → `not_utf8`; `json.loads` `ValueError` or `RecursionError` → `not_json`;
  top level not a `list` → `not_an_array`; `len > max_entries` → `too_many_entries`.
- [ ] Record-level validation (frozen rule F), collecting ALL violations in field order
  `Id, SellerName, Name, Brand, Category`:
  - not a `dict` → `FieldViolation("record", "not_an_object")`.
  - `Id`: missing → `missing`; not `str` → `not_a_string`; `strip()` empty → `blank`; length > 64 → `too_long`; not `re.fullmatch(SELLER_PRODUCT_ID_PATTERN)` → `invalid_charset`. Valid and not `re.fullmatch(UUID_PATTERN)` → warning `non_uuid_seller_sku`.
  - `SellerName`: missing / not_a_string / blank / too_long (>100, measured on the raw value). Stored stripped.
  - `Name`: missing / not_a_string / blank / too_long (>200). Stored exactly as received.
  - `Brand`, `Category`: absent key or `None` → `None`; not `str` → `not_a_string`; length > 100 → `too_long`; blank string → `None` plus warning `blank_brand_treated_as_null` / `blank_category_treated_as_null`. Stored as received otherwise (the hostile `TestBrand'; SELECT 1; --` passes unchanged).
  - Keys outside the five → warning `unknown_fields_ignored` (key names are not echoed).
- [ ] Return `SellerEntry` when there are no violations, otherwise `RejectedEntry` carrying the
  seller name / SKU only if those two fields were themselves valid.
- [ ] No logging of record contents.

Acceptance:
- `.venv/bin/python -c "from pathlib import Path; from catalog_consolidation.adapters.json_entry_reader import JsonEntryReader; from catalog_consolidation.domain.models import SellerEntry; r=JsonEntryReader(path=Path('data/ProductEntry.json')).read(); print(len(r), sum(isinstance(e, SellerEntry) for e in r), sum('non_uuid_seller_sku' in e.warnings for e in r))"` prints `269 269 3`.
- `printf '{}' > out/bad.json && .venv/bin/python -c "from pathlib import Path; from catalog_consolidation.adapters.json_entry_reader import JsonEntryReader; JsonEntryReader(path=Path('out/bad.json')).read()"` exits non-zero with `InvalidInputFileError: not_an_array: ...` on stderr.
- `printf '[{\"Id\":\"a b\",\"SellerName\":\"S\",\"Name\":\"\",\"Brand\":7,\"X\":1}]' > out/rec.json && .venv/bin/python -c "from pathlib import Path; from catalog_consolidation.adapters.json_entry_reader import JsonEntryReader; e=JsonEntryReader(path=Path('out/rec.json')).read()[0]; print([(v.field, v.code) for v in e.violations], e.warnings)"` prints `[('Id', 'invalid_charset'), ('Name', 'blank'), ('Brand', 'not_a_string')] ('unknown_fields_ignored',)`.
- Scoped ruff + pyright exit 0.

### T4 — Report writer and stdout summary

- Owner domain: backend-python
- depends_on: T0
- Size: S (~70 lines)
- Owns: `src/catalog_consolidation/adapters/report_writer.py`

Steps:
- [ ] `to_report_record`: dict with the fixed key order `index, sellerName, sellerProductId, outcome, productId, reviewReason, score, warnings, errors`; `score` rounded with `round(score, REPORT_SCORE_DECIMALS)`; tuples become lists.
- [ ] `write_jsonl_report`: create parent dirs, write UTF-8 lines to `<path>.tmp`, `flush` + `os.fsync`, then `os.replace` onto `path`; delete the temp file on failure and re-raise.
- [ ] `format_summary`: exactly the frozen stdout format (header line, eight count lines, `TOTAL`); booleans rendered lowercase.

Acceptance:
- `.venv/bin/python -c "from catalog_consolidation.adapters.report_writer import format_summary; from catalog_consolidation.domain.models import RunSummary, OUTCOME_CODES; print(format_summary(RunSummary(run_id='r1', input_label='in.json', total=3, counts=tuple((c, 1 if c=='CREATED' else 0) for c in OUTCOME_CODES), rows_written=2, dry_run=True, committed=False)))"`
  prints the header `run r1 input=in.json dry_run=true committed=false rows_written=2`, eight count lines in vocabulary order with `CREATED` at `1`, and a `TOTAL` line with `3`.
- Writing two outcomes to `out/r.jsonl` produces exactly 2 lines, each parseable by `json.loads`, and no `out/r.jsonl.tmp` remains.
- Scoped ruff + pyright exit 0.

### T5 — Matching

- Owner domain: backend-python
- depends_on: T0
- Size: M (~80 lines)
- Owns: `src/catalog_consolidation/domain/matching.py`

Steps:
- [ ] Implement `match_entry` exactly per the frozen algorithm (exact → ambiguous → fuzzy → create).
- [ ] Imports: stdlib (`difflib`) and `catalog_consolidation.domain.*` only — it does NOT import `normalization` (the use case passes normalized keys in `MatchQuery`).
- [ ] Deterministic ties (lowest id wins); never return `LinkDecision` from the fuzzy branch.

Acceptance:
- An inline fake reader proves the branches (run as a one-off script under `out/`, not committed):
  exact raw-equal → `LinkDecision(match_type='EXACT')`; normalized-only → `NORMALIZED`; two candidates →
  `HoldDecision(reason='AMBIGUOUS', candidate_product_ids=(lower, higher))`; `router wifi 6 tp link` vs
  `roteador wifi 6 tp link` → `HoldDecision(reason='FUZZY')` with `score` `0.9090…`; no
  compatible products → `CreateDecision(best_score=None)`.
- Scoped ruff + pyright exit 0.

### T6 — SQLite repository and unit of work

- Owner domain: backend-python
- depends_on: T0 (schema from frozen DDL; behavioral smoke after T2)
- Size: M (~180 lines)
- Owns: `src/catalog_consolidation/adapters/sqlite_catalog_repository.py`

Steps:
- [ ] `SqliteCatalogRepository(*, connection)` implementing every `CatalogRepository` method with the frozen SQL; map rows to frozen dataclasses; `MatchType`/`ReviewReason`/`ReviewStatus` values are narrowed against the Literal sets (a value outside the set raises `ValueError` — the CHECK constraints make it impossible in practice).
- [ ] `list_brand_compatible` is a generator over keyset batches of `FUZZY_SCAN_BATCH_SIZE` (bounded memory; never `fetchall()` on the whole table).
- [ ] `list_products_missing_match_keys` / `set_match_keys` with the frozen SQL (keyset on `Id`, bounded by `limit`).
- [ ] `insert_*` return `cursor.lastrowid` (asserted non-`None` by narrowing, raising `RuntimeError` otherwise).
- [ ] `SqliteUnitOfWork(*, connection)`: `catalog` property returns one `SqliteCatalogRepository`; `commit()` / `rollback()` delegate to the connection; `rows_written()` returns `connection.total_changes` minus the value captured at construction.
- [ ] No `commit`/`rollback` inside the repository class.

Acceptance:
- Scoped ruff + pyright exit 0.
- After T2 lands (wave barrier smoke, run by this task's agent if T2 is already merged, otherwise by the orchestrator at the wave-1 barrier): on `out/t6.db` migrated with the T2 dry-check one-liner, inserting a product, a link and a review through `SqliteUnitOfWork`, then `rollback()`, leaves all three tables at their pre-insert counts; inserting the same `(SellerName, SellerProductId)` link twice raises `sqlite3.IntegrityError`.

### T7 — Migration runner and match-key backfill

- Owner domain: dba
- depends_on: T1, T2
- Size: M (~170 lines)
- Owns: `src/catalog_consolidation/adapters/sqlite_migrations.py`

Steps:
- [ ] Discover `migrations/*.sql` with names matching `^(\d{4})_([a-z0-9_]+)\.sql$` (else `MigrationError(code="invalid_filename")`); versions must be contiguous from 1 (else `version_gap`); checksum = sha256 of the bytes.
- [ ] Ensure `SchemaVersion` exists (frozen DDL); for every already-applied version compare the stored checksum with the file (mismatch → `MigrationError(code="checksum_mismatch")` — a shipped migration was edited).
- [ ] If anything is pending: back up first with `sqlite3.Connection.backup` to `<db>.pre-migrate-<UTC %Y%m%dT%H%M%SZ>.bak` next to the database (recovery path, since migrations are forward-only).
- [ ] Apply each pending migration in its own transaction: `executescript(file text)`; for version 2 run the backfill (keyset batches of `BACKFILL_BATCH_SIZE`, `UPDATE ... SET NormalizedName = normalize(Name), NormalizedBrand = normalize(Brand)`); insert the `SchemaVersion` row with parameters; `commit()`. Any exception → `rollback()` and re-raise (the failed migration leaves no partial state).
- [ ] Return `MigrationReport` (`backfilled_rows` set for version 2 only).
- [ ] `default_migrations_dir()` = `Path(__file__).resolve().parents[3] / "migrations"`.

Acceptance:
- ```bash
  cp data/catalog.db out/t7.db
  .venv/bin/python -c "import pathlib; from catalog_consolidation.adapters.sqlite_connection import open_connection; from catalog_consolidation.adapters.sqlite_migrations import SqliteMigrationRunner, default_migrations_dir; p=pathlib.Path('out/t7.db'); c=open_connection(p); print(SqliteMigrationRunner(connection=c, db_path=p, migrations_dir=default_migrations_dir()).apply_pending())"
  ```
  prints a `MigrationReport` with three applied migrations, `backfilled_rows=975` on version 2, `schema_version=3`, and a `backup_path` that exists.
- `sqlite3 out/t7.db "SELECT COUNT(*) FROM Product WHERE NormalizedName IS NOT NULL; SELECT NormalizedName, NormalizedBrand FROM Product WHERE Id = 661;"` prints `975` and `grass trimmer string|black decker`.
- Running the same one-liner again prints `applied=()`, `backup_path=None`, `schema_version=3`.
- Scoped ruff + pyright exit 0.

### T8 — Use case: consolidate a file

- Owner domain: backend-python
- depends_on: T0, T1, T5
- Size: M (~150 lines)
- Owns: `src/catalog_consolidation/use_cases/consolidate_file.py`

Steps:
- [ ] Implement `ConsolidateFile` with the frozen per-entry algorithm, in that exact order, including the "heal match keys" step before the loop (normalizer from `domain/normalization.py` — never SQL).
- [ ] Build `MatchQuery(raw_name=entry.name, normalized_name=normalize(entry.name), normalized_brand=normalize(entry.brand))`; reject unnormalizable names as `REJECTED_INVALID` with error `unnormalizable:Name`.
- [ ] CREATED product: `NewProduct(name=clean_display(entry.name), brand=clean_display(entry.brand), category=clean_display(entry.category), normalized_name=..., normalized_brand=...)`; link `Source*` fields = raw entry values.
- [ ] Transaction boundary: `try` around the loop + commit/rollback; `except Exception: unit_of_work.rollback(); raise`. `dry_run` always rolls back.
- [ ] Count outcomes into `RunSummary.counts` in `OUTCOME_CODES` order (zeros included); `rows_written` read before commit/rollback.
- [ ] Imports only `domain.*` (no `sqlite3`, no adapters).

Acceptance:
- Scoped ruff + pyright exit 0.
- `grep -nE "sqlite3|adapters" src/catalog_consolidation/use_cases/consolidate_file.py` prints nothing.
- End-to-end behavior is accepted in T9 against the baseline.

### T9 — CLI composition root

- Owner domain: backend-python
- depends_on: T3, T4, T6, T7, T8
- Size: M (~160 lines)
- Owns: `src/catalog_consolidation/cli.py`, `src/catalog_consolidation/__main__.py`

Steps:
- [ ] `argparse` with subcommands `migrate --db` and `consolidate --db --input [--report] [--dry-run]`; `main(argv) -> int`; `__main__.py` is `raise SystemExit(main())`.
- [ ] `migrate`: `open_connection` → `SqliteMigrationRunner(...).apply_pending()` → print `backup: <path>` (when any), one `applied <NNNN> <name>` line per migration (`(backfilled <n> products)` suffix on version 2), then `schema version: <n>` (`(up to date)` suffix when nothing was pending).
- [ ] `consolidate`: `run_id = uuid4().hex`; `open_connection` → `require_schema_version` → wire `SqliteUnitOfWork`, `JsonEntryReader`, `ConsolidateFile` → `execute(dry_run=...)` → `write_jsonl_report` when `--report` → print `format_summary`.
- [ ] Exit-code mapping exactly per the frozen table; `connection.close()` in `finally`.
- [ ] Logging: stdlib `logging` on logger `catalog_consolidation.cli`, a small JSON formatter to stderr; events `consolidate.finished` (`correlationId`=run id, `durationMs`, `dryRun`, `committed`, `rowsWritten`, per-outcome counts) and `consolidate.failed` / `migrate.failed` (`correlationId`, `errorType`, `durationMs`). No seller data in logs; no tracebacks to the user (unexpected errors print `error: unexpected failure (correlationId=<id>)`).

Acceptance (the end-to-end demo — see **Final gate**): the first run prints the baseline summary
with `committed=true rows_written=258`; the re-run prints `UNCHANGED 256`, `SKIPPED_DUPLICATE_LISTING 11`,
`HELD_FOR_REVIEW 2`, `rows_written=0`; `printf '{}' > out/bad.json` then `consolidate --input out/bad.json`
exits `2`; `consolidate` on an unmigrated copy exits `2` with the `migrate` hint; scoped ruff + pyright exit 0.

### T10 — Stretch: `review list` / `review resolve`

- Owner domain: backend-python
- depends_on: T9
- Size: M (~250 lines)
- Owns: `src/catalog_consolidation/cli_review.py`, `src/catalog_consolidation/use_cases/resolve_review.py`,
  `src/catalog_consolidation/adapters/sqlite_review_repository.py`; edits `src/catalog_consolidation/cli.py`
  (register the `review` subparser and dispatch — no other change) and appends a `ReviewRepository`
  Protocol to `src/catalog_consolidation/domain/ports.py` (append only). No other wave-4 task touches these files.
- `resolve --link` writes `MatchType='REVIEWED'`, already allowed by migration 0001 (R2 resolved 2026-10-05).

Steps:
- [ ] `python -m catalog_consolidation review list --db PATH [--status PENDING|LINKED|CREATED|REJECTED] [--limit N] [--after-id ID]`: default status `PENDING`, default limit 20, max 100, keyset on `Id`; tab-separated columns `Id SellerName SellerProductId Reason Score CandidateProductId SourceName`; last line `next: --after-id <id>` when more rows exist.
- [ ] `python -m catalog_consolidation review resolve --db PATH --id N (--create | --reject | --link PRODUCT_ID)`, one transaction, only from `PENDING`:
  - `--create`: insert the product from the row's `Source*` values (`clean_display` + `normalize`), insert the link with `MatchType='CREATED'`, set `Status='CREATED'`.
  - `--reject`: set `Status='REJECTED'` (a later re-send reports `HELD_FOR_REVIEW` + `review_previously_rejected`).
  - `--link PRODUCT_ID`: insert the link with `MatchType='REVIEWED'` and the row's `Source*` values, set `Status='LINKED'`; `PRODUCT_ID` must exist (else `error: ...`, exit 2).
  - Seller already linked to that product, or row not `PENDING` → `error: ...`, exit 2, nothing written.

Acceptance:
- After the demo run: `review list --db out/catalog.db` prints 2 rows (`Roteador WiFi 6 TP-Link`, `Processador AMD Ryzen 9 7950X`), both `FUZZY`.
- `review resolve --db out/catalog.db --id <roteador id> --reject` exits 0; `review list` now prints 1 row; re-running `consolidate` still reports `HELD_FOR_REVIEW 2` with `rows_written=0`.
- Scoped ruff + pyright exit 0.

### T11 — README

- Owner domain: backend-python
- depends_on: T9 (and T10 when taken)
- Size: S (~150 lines)
- Owns: `README.md`

Steps:
- [ ] Sections: what it does (one paragraph); requirements (Python 3.12, `uv`); setup (`uv sync --python 3.12 --extra dev`); how to run (the demo commands from **Final gate**, on a copy under `out/`, with the real summary output pasted from an actual run); outcome vocabulary table (the eight codes, one line each); decisions summary (identity = normalized name + compatible brand, category not identity, fuzzy never auto-links, golden record never overwritten, one transaction per run, idempotent re-runs) each linking its ADR under `docs/adr/`; schema changes (the three migrations, backup file); exit codes; known limitations (Plan risks R1, R3, R4, R6 restated for operators, plus the non-goals of decision I); link to the PRD.
- [ ] Review commands documented only if T10 merged; otherwise listed under known limitations.

Acceptance:
- Every command in the README, run in order from a clean `out/`, reproduces the printed outputs (run ids excepted).
- Every relative link resolves: `grep -oE "\]\(([^)]+)\)" README.md` targets all exist.

### Tests — `[opt-in: tests]`

Dispatched only if the user opts in. No implementation task depends on them. All run in wave 4
(after T9), each with disjoint files. Agents write tests and run only their own files
(`.venv/bin/pytest -q <own files>`); the full suite runs once at the final gate.

#### T12 `[opt-in: tests]` — Normalization table and domain import purity

- Owner domain: backend-python · depends_on: T1, T5 · Size: S
- Owns: `tests/unit/test_normalization.py`, `tests/unit/test_domain_import_purity.py`; edits `pyproject.toml` `[tool.pyright] include` to `["src", "tests"]` (only edit; no other wave-4 task touches `pyproject.toml`).
- [ ] Table-driven `pytest.mark.parametrize` over every row of the frozen reference table (`Câmera`, `55"` with and without the mark, `12.9''`, `Levi's`/`Levi’s`/`Levis`, `BLACK+DECKER`/`Black+Decker`, double spaces, curly quotes, `Straße`, hostile brand, blank/`!!!`/`None`) plus `clean_display` cases.
- [ ] Purity test: `ast`-parse every `src/catalog_consolidation/domain/*.py`; every imported top-level module is in `sys.stdlib_module_names` or is `catalog_consolidation.domain`.
- Acceptance: `.venv/bin/pytest -q tests/unit/test_normalization.py tests/unit/test_domain_import_purity.py` passes; temporarily adding `import sqlite3` to `domain/models.py` makes the purity test fail (revert after).

#### T13 `[opt-in: tests]` — Matching

- Owner domain: backend-python · depends_on: T5 · Size: S
- Owns: `tests/unit/fake_catalog_reader.py`, `tests/unit/test_matching.py`
- [ ] `FakeCatalogReader` is a `@dataclass` implementing `CatalogReader` over a tuple of `CatalogProduct` (applies the same brand-compatibility rule) — no `MagicMock`.
- [ ] Cases: raw-equal → EXACT; normalized-only → NORMALIZED; entry brand `None` matches a branded product; product brand `None` matches a branded entry; different brands with the same name → not a candidate; two candidates → AMBIGUOUS with ascending ids; fuzzy at 0.9091 (`roteador`/`router`) → HOLD FUZZY; ratio exactly `0.80` → HOLD; below → CREATE with `best_score`; empty pool → `CreateDecision(best_score=None)`; equal ratios → lowest id.
- Acceptance: `.venv/bin/pytest -q tests/unit/test_matching.py` passes.

#### T14 `[opt-in: tests]` — Input validation

- Owner domain: backend-python · depends_on: T3 · Size: S
- Owns: `tests/unit/test_json_entry_reader.py`
- [ ] File-level: each `InputFileErrorCode` (`too_large` via `max_bytes=10`, `too_many_entries` via `max_entries=1`, `not_utf8` with `b"\xff"`, `not_json`, `not_an_array`, missing path → `unreadable`).
- [ ] Record-level: every `ViolationCode` reachable by the reader, all violations collected in field order, length boundaries (64/65 Id, 200/201 Name), non-UUID warning, unknown keys warning, blank brand → `None` + warning, hostile brand passes verbatim, non-object record.
- Acceptance: `.venv/bin/pytest -q tests/unit/test_json_entry_reader.py` passes.

#### T15 `[opt-in: tests]` — Use case semantics

- Owner domain: backend-python · depends_on: T8 · Size: M
- Owns: `tests/unit/fake_unit_of_work.py`, `tests/unit/test_consolidate_file.py`
- [ ] `FakeUnitOfWork` / `FakeCatalogRepository` dataclasses implementing the ports in memory (records `commit`/`rollback` calls, counts rows written).
- [ ] Cases: two sellers send the same new product → CREATED then LINKED_EXACT; same seller re-sends same SKU → UNCHANGED; same seller same SKU different product → CONFLICT_SELLER_SKU, no write; same seller new SKU for an already-linked product → SKIPPED_DUPLICATE_LISTING; queued review → HELD, no write; REJECTED review → HELD + `review_previously_rejected`; unnormalizable name → REJECTED_INVALID `unnormalizable:Name`; dry-run → rollback, no commit, `committed=False`; exception raised by `insert_link` → rollback called, exception re-raised; second run over the same entries → `rows_written=0`.
- Acceptance: `.venv/bin/pytest -q tests/unit/test_consolidate_file.py` passes.

#### T16 `[opt-in: tests]` — Integration on the real data

- Owner domain: backend-python · depends_on: T9 · Size: M
- Owns: `tests/integration/conftest.py`, `tests/integration/test_consolidate_end_to_end.py`
- [ ] Fixture copies `data/catalog.db` and `data/ProductEntry.json` into `tmp_path` (the originals are never opened for writing).
- [ ] Drive `catalog_consolidation.cli.main([...])` with `capsys`; assert: `migrate` exit 0 and 975 non-null `NormalizedName`; second `migrate` reports up to date and creates no backup; first `consolidate` exit 0 with the baseline (200/54/1/1/11/2/0/0, total 269, `rows_written=258`); table counts 255/976/2; report has 269 lines and 3 `non_uuid_seller_sku`; `Product.Brand` of `Security Test Product` equals `TestBrand'; SELECT 1; --`; re-run → 256/11/2, `rows_written=0`, table counts unchanged; `--dry-run` on a fresh migrated copy → baseline counts, `committed=false`, table counts 0/975/0; invalid file → exit 2; unmigrated db → exit 2; `PRAGMA foreign_key_check` empty and `PRAGMA integrity_check` = `ok` after the run.
- Acceptance: `.venv/bin/pytest -q tests/integration` passes in under 10 s.

---

## Wave plan

Dependencies: T0 → {T1, T2, T3, T4, T5, T6}; {T1, T2} → T7; {T1, T5} → T8; {T3, T4, T6, T7, T8} → T9;
T9 → {T10, T12–T16}; {T9, T10} → T11. File scopes inside each wave are disjoint.

| Wave | Tasks (agent) | Notes |
|---|---|---|
| 0 | T0 (borisenko) | single owner; freezes contracts in code |
| 1 | T1, T3, T4, T5, T6 (borisenko ×5), T2 (ronaldo) | 6 agents, all code against T0 |
| 2 | T7 (ronaldo), T8 (borisenko) | barrier: T6 behavioral smoke runs here if not done in wave 1 |
| 3 | T9 (borisenko) | first end-to-end run of the baseline |
| 4 | T10 stretch (borisenko); T12, T13, T14, T15, T16 `[opt-in: tests]` (ameer ×5) | at most 6; drop the test tasks if not opted in, drop T10 if stretch is not taken |
| 5 | T11 (borisenko) | README written from the real outputs |

Model: `opus` (build tier) for every task; T0 may be dispatched at design tier (also `opus` today).

```
[fanout] waves=6 wave0=borisenko:T0 wave1=borisenko:T1, ronaldo:T2, borisenko:T3, borisenko:T4, borisenko:T5, borisenko:T6 wave2=ronaldo:T7, borisenko:T8 wave3=borisenko:T9 wave4=borisenko:T10, ameer:T12, ameer:T13, ameer:T14, ameer:T15, ameer:T16 wave5=borisenko:T11 model=opus
```

Each dispatch brief carries: MODE: IMPLEMENT, the owned files above, a pointer to **Frozen
contracts** in this file, risk low / autonomy A2, `rules/backend-python.md` + `rules/data.md`
(+ `rules/testing.md` for T12–T16), whether tests are in scope (only T12–T16), and the return
envelope. A handoff (`templates/handoff.md`) is written at every barrier.

---

## Final gate (run once, after the last wave)

```bash
cd <repo>
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/pyright
.venv/bin/pytest -q          # only if T12–T16 were taken
```

End-to-end demo (always; works on a copy so `data/` stays pristine):

```bash
rm -rf out && mkdir -p out && cp data/catalog.db out/catalog.db

.venv/bin/python -m catalog_consolidation migrate --db out/catalog.db
# backup: out/catalog.db.pre-migrate-<timestamp>.bak
# applied 0001 seller_product_text_id
# applied 0002 product_match_keys (backfilled 975 products)
# applied 0003 review_queue
# schema version: 3

.venv/bin/python -m catalog_consolidation consolidate --db out/catalog.db \
  --input data/ProductEntry.json --report out/report.jsonl
# run <id> input=data/ProductEntry.json dry_run=false committed=true rows_written=258
# LINKED_EXACT 200 | LINKED_NORMALIZED 54 | CREATED 1 | UNCHANGED 1
# SKIPPED_DUPLICATE_LISTING 11 | HELD_FOR_REVIEW 2 | REJECTED_INVALID 0 | CONFLICT_SELLER_SKU 0 | TOTAL 269
# exit code 0

sqlite3 out/catalog.db "SELECT COUNT(*) FROM SellerProduct; SELECT COUNT(*) FROM Product; SELECT COUNT(*) FROM ProductMatchReview;"
# 255 / 976 / 2
wc -l < out/report.jsonl                          # 269
grep -c non_uuid_seller_sku out/report.jsonl      # 3

.venv/bin/python -m catalog_consolidation consolidate --db out/catalog.db --input data/ProductEntry.json
# ... committed=true rows_written=0 ; UNCHANGED 256 | SKIPPED_DUPLICATE_LISTING 11 | HELD_FOR_REVIEW 2 | TOTAL 269

printf '{}' > out/bad.json
.venv/bin/python -m catalog_consolidation consolidate --db out/catalog.db --input out/bad.json; echo "exit=$?"
# error: invalid input file: not_an_array: ...   exit=2
```

(The summary lines above are condensed with `|`; the real output is one code per line in the frozen format.)

---

## Plan risks

- **R1 — Products written by other tools have no match keys. RESOLVED 2026-10-05.** A product added
  by another writer has `NULL` keys and would be invisible to matching. `consolidate` now heals rows
  with `NormalizedName IS NULL` at the start of every run, in the same transaction, with the Python
  normalizer (frozen use-case algorithm; ports `list_products_missing_match_keys` / `set_match_keys`).
- **R2 — `review resolve --link` MatchType. RESOLVED 2026-10-05.** `'REVIEWED'` is part of the
  `MatchType` CHECK in migration 0001 (nothing shipped yet, so no migration 0004 is needed); T10
  ships `--link`.
- **R3 — Fuzzy scan is O(catalog) per unmatched entry.** Fine here (the planner's simulation of the
  whole file took 0.02 s; only 3 entries reach the fuzzy pass), but at 10^6 products each unmatched
  entry scans every brand-compatible row. Scaling needs a blocking index (e.g. token or trigram
  table) — a later ADR, not this plan.
- **R4 — Exit code 2 for database problems. ACCEPTED 2026-10-05.** A missing database path and an
  unmigrated schema exit 2 alongside an invalid input file (all operator-fixable input problems);
  decision H in the change record was amended to match.
- **R5 — Report written after commit.** If writing `--report` fails after a successful commit, the
  run exits 1 with the database committed. A re-run is safe (idempotent) but reports
  UNCHANGED/SKIPPED/HELD instead of the original outcomes. Mitigation: run with `--dry-run --report`
  first when the per-entry report of the first run matters.
- **R6 — Category is not identity.** Two catalog products with the same normalized name and brand
  but different categories would make every matching entry AMBIGUOUS (held), and an entry can never
  be told apart by category. Accepted by decision B; the current catalog has no such pair.
- **R7 — Migrations live outside the package.** `default_migrations_dir()` resolves the repository's
  `migrations/` from the source tree, so the tool must run from an editable install (which
  `uv sync` provides). A wheel install would not find them; packaging them as package data is a
  later change.
- **R8 — Legacy `SellerProduct` rows.** None exist today; if any did, migration 0001 would copy them
  with `SourceName` = the catalog name and `MatchType='EXACT'` (the only facts known about a link an
  operator made against the catalog row itself).
- **R9 — `pyright` from PyPI downloads Node on first run.** Offline machines get an infra skip at the
  Stop gate (not a red). Pin is still exact.
- **R10 — Baseline is data-specific.** The counts are tied to the files fetched on 2026-10-05; the
  planner re-verified them with a read-only simulation of exactly this plan's algorithm and order
  (first run 200/54/11/2/1/1, `rows_written` 258; re-run 256/11/2, 0 writes).

## Out of scope (decision I, restated)

Review-queue UI (only the stretch CLI), price/stock/offers, a `Seller` table, translation
dictionaries, ML/embedding matching, concurrent runs (SQLite's write lock plus `busy_timeout`
serialize them; a lost race exits 1 with the run rolled back), HTTP API.

## Definition of done

- [ ] T0–T9 and T11 merged; T10 merged or explicitly dropped; T12–T16 merged or `[tests] skipped — not requested` stated.
- [ ] Final gate green with output shown: `ruff check`, `ruff format --check`, `pyright` (+ `pytest -q` when tests were taken).
- [ ] End-to-end demo reproduces the acceptance baseline exactly, re-run writes zero rows, invalid file exits 2.
- [ ] `data/catalog.db` and `data/ProductEntry.json` unchanged (`git diff --stat data/` empty, or checksums equal to the downloaded files).
- [ ] README links resolve to the PRD and ADRs 0001–0005.
- [ ] Change record `.engineos/changes/2026-10-05-catalog-consolidation-design.md` (or its implementation successor) lists every file changed, the "what was made" account, and is archived via `record-change`.
