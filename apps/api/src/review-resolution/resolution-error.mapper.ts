import { ReviewResolutionError, type ReviewResolutionErrorCode } from "@catalog/domain";
import { ApiProblem } from "../errors/index.js";
import { ReviewCandidateMissingError } from "./review-candidate-missing.error.js";

const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;
const UNPROCESSABLE_STATUS = 422;

/**
 * Expected resolution failures become fixed client-safe problems; domain `detail` text is never
 * forwarded. Anything else (SQLite busy or failure included) returns null so the caller rethrows it
 * unchanged and the exception filter answers 503 database or 500 internal, logging it once.
 */
export function toResolutionProblem(error: unknown): ApiProblem | null {
  if (error instanceof ReviewResolutionError) {
    return problemForCode(error.code);
  }
  if (error instanceof ReviewCandidateMissingError) {
    return new ApiProblem({
      code: "no_candidate",
      status: UNPROCESSABLE_STATUS,
      message: "review has no candidate product to link",
    });
  }
  return null;
}

// No default branch: a new domain code makes this function fail to compile until it is mapped.
function problemForCode(code: ReviewResolutionErrorCode): ApiProblem {
  switch (code) {
    case "review_not_found":
      return new ApiProblem({ code: "review_not_found", status: NOT_FOUND_STATUS, message: "review not found" });
    case "product_not_found":
      return new ApiProblem({ code: "product_not_found", status: NOT_FOUND_STATUS, message: "product not found" });
    case "review_not_pending":
      return new ApiProblem({ code: "review_not_pending", status: CONFLICT_STATUS, message: "review is not pending" });
    case "seller_sku_already_linked":
      return new ApiProblem({
        code: "seller_sku_already_linked",
        status: CONFLICT_STATUS,
        message: "seller SKU is already linked to a product",
      });
    case "seller_already_linked_to_product":
      return new ApiProblem({
        code: "seller_already_linked_to_product",
        status: CONFLICT_STATUS,
        message: "seller is already linked to the target product",
      });
    case "source_name_unnormalizable":
      return new ApiProblem({
        code: "source_name_unnormalizable",
        status: UNPROCESSABLE_STATUS,
        message: "review source name has no normalized form",
      });
  }
}
