import { SellerLinkError, type SellerLinkErrorCode } from "@catalog/domain";
import { ApiProblem } from "../errors/index.js";

const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;

/**
 * Expected seller-link refusals become fixed client-safe problems; domain `detail` text is never
 * forwarded. Anything else (SQLite busy or failure included) returns null so the caller rethrows it
 * unchanged and the exception filter answers 503 database or 500 internal.
 */
export function toSellerLinkProblem(error: unknown): ApiProblem | null {
  return error instanceof SellerLinkError ? problemForCode(error.code) : null;
}

// No default branch: a new domain code makes this function fail to compile until it is mapped.
function problemForCode(code: SellerLinkErrorCode): ApiProblem {
  switch (code) {
    case "product_not_found":
      return new ApiProblem({ code, status: NOT_FOUND_STATUS, message: "product not found" });
    case "seller_link_not_found":
      return new ApiProblem({ code, status: NOT_FOUND_STATUS, message: "seller link not found" });
    case "seller_sku_already_linked":
      return new ApiProblem({ code, status: CONFLICT_STATUS, message: "seller SKU is already linked to a product" });
    case "seller_already_linked_to_product":
      return new ApiProblem({ code, status: CONFLICT_STATUS, message: "seller is already linked to the product" });
  }
}
