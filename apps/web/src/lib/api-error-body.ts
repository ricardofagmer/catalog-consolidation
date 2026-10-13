import type { ApiErrorCode } from "@catalog/api-client";

/** The parts of the API's four-field error body the web acts on; `message` is never kept. */
export interface ApiErrorFields {
  readonly code: ApiErrorCode;
  readonly correlationId: string;
}

// Runtime copy of the closed C-API code set: the generated client carries types only, and
// TypeScript types do not validate what arrives over the network.
const API_ERROR_CODES = [
  "invalid_request",
  "product_not_found",
  "review_not_found",
  "seller_link_not_found",
  "review_not_pending",
  "seller_sku_already_linked",
  "seller_already_linked_to_product",
  "source_name_unnormalizable",
  "no_candidate",
  "unsupported_media_type",
  "host_not_allowed",
  "database",
  "internal",
] as const satisfies readonly ApiErrorCode[];

// Same shape the API accepts for x-correlation-id; anything else is not written to a log line.
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Returns null for anything that is not a well-formed error body with a known code. */
export function readErrorBody(value: unknown): ApiErrorFields | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const statusCode: unknown = Reflect.get(value, "statusCode");
  const code: unknown = Reflect.get(value, "code");
  const message: unknown = Reflect.get(value, "message");
  const correlationId: unknown = Reflect.get(value, "correlationId");
  if (
    typeof statusCode !== "number" ||
    typeof message !== "string" ||
    typeof correlationId !== "string" ||
    !CORRELATION_ID_PATTERN.test(correlationId)
  ) {
    return null;
  }
  const knownCode = API_ERROR_CODES.find((member) => member === code);
  return knownCode === undefined ? null : { code: knownCode, correlationId };
}
