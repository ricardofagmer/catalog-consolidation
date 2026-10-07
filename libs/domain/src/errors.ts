export type InputFileErrorCode =
  | "unreadable"
  | "too_large"
  | "not_utf8"
  | "not_json"
  | "not_an_array"
  | "too_many_entries";
export type DatabaseFileErrorCode = "not_found" | "schema_outdated";
export type MigrationErrorCode = "invalid_filename" | "version_gap" | "checksum_mismatch" | "rows_lost";

// A runtime list because the web app validates the `?error=` query parameter against it.
export const REVIEW_RESOLUTION_ERROR_CODES = [
  "review_not_found",
  "review_not_pending",
  "product_not_found",
  "seller_sku_already_linked",
  "seller_already_linked_to_product",
  "source_name_unnormalizable",
] as const;
export type ReviewResolutionErrorCode = (typeof REVIEW_RESOLUTION_ERROR_CODES)[number];

// `detail` never carries seller-supplied text: paths, sizes, versions, ids and statuses only.

/** Base of every expected, typed failure. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class InvalidInputFileError extends DomainError {
  readonly code: InputFileErrorCode;
  readonly detail: string;

  constructor(args: { readonly code: InputFileErrorCode; readonly detail: string }) {
    super(`${args.code}: ${args.detail}`);
    this.name = "InvalidInputFileError";
    this.code = args.code;
    this.detail = args.detail;
  }
}

export class DatabaseFileError extends DomainError {
  readonly code: DatabaseFileErrorCode;
  readonly detail: string;

  constructor(args: { readonly code: DatabaseFileErrorCode; readonly detail: string }) {
    super(`${args.code}: ${args.detail}`);
    this.name = "DatabaseFileError";
    this.code = args.code;
    this.detail = args.detail;
  }
}

export class MigrationError extends DomainError {
  readonly code: MigrationErrorCode;
  readonly detail: string;

  constructor(args: { readonly code: MigrationErrorCode; readonly detail: string }) {
    super(`${args.code}: ${args.detail}`);
    this.name = "MigrationError";
    this.code = args.code;
    this.detail = args.detail;
  }
}

/** A resolution the queue row or the catalog does not allow; nothing was written. */
export class ReviewResolutionError extends DomainError {
  readonly code: ReviewResolutionErrorCode;
  readonly detail: string;

  constructor(args: { readonly code: ReviewResolutionErrorCode; readonly detail: string }) {
    super(`${args.code}: ${args.detail}`);
    this.name = "ReviewResolutionError";
    this.code = args.code;
    this.detail = args.detail;
  }
}
