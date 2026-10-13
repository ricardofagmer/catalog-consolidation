// Closed set (plan 5.2): clients switch on these values, so adding one is a contract revision.
export const API_ERROR_CODES = [
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
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
