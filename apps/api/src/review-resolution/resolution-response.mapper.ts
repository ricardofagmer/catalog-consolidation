import type { ResolutionResult } from "@catalog/domain";
import { RESOLVED_REVIEW_STATUSES, ResolutionResponseDto } from "./dto/resolution-response.dto.js";

export function toResolutionResponse(result: ResolutionResult): ResolutionResponseDto {
  const status = RESOLVED_REVIEW_STATUSES.find((member) => member === result.status);
  if (status === undefined) {
    // A resolution never leaves a review PENDING; reaching this is a defect, answered as 500 internal.
    throw new Error(`review ${String(result.reviewId)} resolved to an unexpected status`);
  }
  return new ResolutionResponseDto({
    reviewId: result.reviewId,
    status,
    productId: result.productId,
    linkId: result.linkId,
  });
}
