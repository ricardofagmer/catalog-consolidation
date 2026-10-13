export const MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_INPUT_ENTRIES = 100_000;
// Python's json decoder recurses once per array/object level and raises RecursionError (exit 2,
// not_json) past this depth; V8 parses far deeper, so the cap is explicit. Measured through the
// Python CLI on CPython 3.12.14 (the pinned .venv): depth 9994 consolidates, 9995 exits 2.
export const MAX_JSON_NESTING_DEPTH = 9994;

export const MAX_SELLER_PRODUCT_ID_LENGTH = 64;
export const MAX_SELLER_NAME_LENGTH = 100;
export const MAX_NAME_LENGTH = 200;
export const MAX_BRAND_LENGTH = 100;
export const MAX_CATEGORY_LENGTH = 100;

// Seller SKU is opaque: charset allowlist only, UUID shape is a warning, not a rule.
// Both are anchored because Python applies them with re.fullmatch.
export const SELLER_PRODUCT_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
export const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u;

export const FUZZY_REVIEW_THRESHOLD = 0.8;
export const MAX_EXACT_CANDIDATES = 50;
export const FUZZY_SCAN_BATCH_SIZE = 500;
export const BACKFILL_BATCH_SIZE = 500;
export const REPORT_SCORE_DECIMALS = 4;

export const REVIEW_PAGE_DEFAULT_LIMIT = 20;
export const REVIEW_PAGE_MAX_LIMIT = 100;

export const REQUIRED_SCHEMA_VERSION = 5;
