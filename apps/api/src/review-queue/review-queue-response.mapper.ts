import { REPORT_SCORE_DECIMALS } from "@catalog/domain";
import { roundHalfEven, type CandidateProduct, type ReviewView } from "@catalog/persistence";
import { CandidateProductDto, ReviewItemDto, ReviewPageDto } from "./dto/review-page.dto.js";
import type { ReviewQueuePage } from "./review-queue.service.js";

export function toReviewPageDto(page: ReviewQueuePage): ReviewPageDto {
  return new ReviewPageDto({ items: page.views.map(toReviewItemDto), nextCursor: page.nextAfterId });
}

function toReviewItemDto(view: ReviewView): ReviewItemDto {
  const { item, sourceName, sourceBrand, sourceCategory } = view.record;
  return new ReviewItemDto({
    id: item.id,
    status: item.status,
    reason: item.reason,
    // Same rounding the CLI and the web display use, so every surface shows the same score.
    similarity: item.score === null ? null : roundHalfEven(item.score, REPORT_SCORE_DECIMALS),
    sellerName: item.sellerName,
    sellerProductId: item.sellerProductId,
    sourceName,
    sourceBrand,
    sourceCategory,
    candidateProductId: item.candidateProductId,
    candidate: view.candidate === null ? null : toCandidateProductDto(view.candidate),
    liveCandidates: view.liveCandidates.map(toCandidateProductDto),
  });
}

function toCandidateProductDto(product: CandidateProduct): CandidateProductDto {
  return new CandidateProductDto({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
  });
}
