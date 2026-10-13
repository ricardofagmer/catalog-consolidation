// The API error codes a seller-link form answers with a message; every other code goes to error.tsx.
// Exhaustive by type: a code added here fails typecheck until it has a sentence.
import type { ApiErrorCode } from "@catalog/api-client";

export const SELLER_LINK_ERROR_CODES = [
  "invalid_request",
  "product_not_found",
  "seller_link_not_found",
  "seller_sku_already_linked",
  "seller_already_linked_to_product",
] as const satisfies readonly ApiErrorCode[];
export type SellerLinkErrorCode = (typeof SELLER_LINK_ERROR_CODES)[number];

export const SELLER_LINK_ERROR_MESSAGES: Record<SellerLinkErrorCode, string> = {
  invalid_request:
    "The seller name or seller product id is not valid. The id may only use letters, digits, dot, underscore and hyphen.",
  product_not_found: "This product no longer exists. Reload the page.",
  seller_link_not_found: "This seller link no longer exists. Reload the page.",
  seller_sku_already_linked: "That seller product id is already linked to a product for this seller.",
  seller_already_linked_to_product: "This seller is already linked to this product.",
};

export function isSellerLinkErrorCode(value: ApiErrorCode | null): value is SellerLinkErrorCode {
  return SELLER_LINK_ERROR_CODES.some((member) => member === value);
}
