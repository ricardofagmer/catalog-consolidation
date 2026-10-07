// URL search params are untrusted input: every value is narrowed here, and anything invalid falls
// back to its default instead of erroring, so a hand-edited URL still renders a page.
// Paging semantics (defaults, cursors) belong to the API; this only keeps a hand-edited value from
// turning into an API 400 and the error page.
import type { ApiErrorCode, ResolvedReviewStatus, ReviewStatus } from "@catalog/api-client";

export type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>;

export const NOTICE_STATUSES = ["LINKED", "CREATED", "REJECTED"] as const satisfies readonly ResolvedReviewStatus[];
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export const REVIEW_STATUSES = ["PENDING", "LINKED", "CREATED", "REJECTED"] as const satisfies readonly ReviewStatus[];

// The API error codes a resolve form answers with a notice; every other code goes to error.tsx.
export const REVIEW_ERROR_CODES = [
  "review_not_found",
  "review_not_pending",
  "product_not_found",
  "seller_sku_already_linked",
  "seller_already_linked_to_product",
  "source_name_unnormalizable",
  "invalid_request",
  "no_candidate",
] as const satisfies readonly ApiErrorCode[];
export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

// C-API bounds: q at most 200 code points, limit 1..100.
export const SEARCH_QUERY_MAX_LENGTH = 200;
const PAGE_MAX_LIMIT = 100;

export interface CatalogSearchParams {
  readonly afterId: number;
  /** Null means the API's default page size. */
  readonly limit: number | null;
  readonly query: string | null;
}

export interface ReviewSearchParams {
  readonly status: ReviewStatus;
  readonly afterId: number;
  /** Null means the API's default page size. */
  readonly limit: number | null;
  readonly notice: NoticeStatus | null;
  readonly error: ReviewErrorCode | null;
  readonly reviewId: number | null;
  readonly productId: number | null;
}

const DEFAULT_AFTER_ID = 0;
const DEFAULT_REVIEW_STATUS: ReviewStatus = "PENDING";
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

export function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

export function parseNonNegativeInteger(value: unknown): number | null {
  return value === "0" ? 0 : parsePositiveInteger(value);
}

export function parseCatalogSearchParams(raw: RawSearchParams): CatalogSearchParams {
  return {
    afterId: parseAfterId(raw),
    limit: parseLimit(raw),
    query: parseQuery(singleValue(raw.q)),
  };
}

export function parseReviewSearchParams(raw: RawSearchParams): ReviewSearchParams {
  const status = singleValue(raw.status);
  return {
    status: memberOrNull(REVIEW_STATUSES, status) ?? DEFAULT_REVIEW_STATUS,
    afterId: parseAfterId(raw),
    limit: parseLimit(raw),
    notice: memberOrNull(NOTICE_STATUSES, singleValue(raw.notice)),
    error: memberOrNull(REVIEW_ERROR_CODES, singleValue(raw.error)),
    reviewId: parsePositiveInteger(singleValue(raw.review)),
    productId: parsePositiveInteger(singleValue(raw.product)),
  };
}

// A repeated key (`?after=1&after=2`) is ambiguous, so it is treated as absent.
function singleValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseAfterId(raw: RawSearchParams): number {
  return parseNonNegativeInteger(singleValue(raw.after)) ?? DEFAULT_AFTER_ID;
}

function parseLimit(raw: RawSearchParams): number | null {
  const limit = parsePositiveInteger(singleValue(raw.limit));
  return limit !== null && limit <= PAGE_MAX_LIMIT ? limit : null;
}

function parseQuery(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  // Counted in code points, not UTF-16 units, so the limit means the same for every script.
  return [...value].length <= SEARCH_QUERY_MAX_LENGTH ? value : null;
}

export function isReviewErrorCode(value: ApiErrorCode | null): value is ReviewErrorCode {
  return REVIEW_ERROR_CODES.some((member) => member === value);
}

function memberOrNull<T extends string>(vocabulary: readonly T[], value: string | undefined): T | null {
  return vocabulary.find((member) => member === value) ?? null;
}
