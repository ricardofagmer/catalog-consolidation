// Exhaustive by type: a new error code, notice status or review status fails typecheck until it has a sentence.
import type { ReviewStatus } from "@catalog/api-client";
import type { NoticeStatus, ReviewErrorCode, ReviewSearchParams } from "./search-params";

export const REVIEW_ERROR_MESSAGES: Record<ReviewErrorCode, string> = {
  review_not_found: "This review does not exist.",
  review_not_pending: "This review was already resolved.",
  product_not_found: "That product does not exist.",
  seller_sku_already_linked: "This seller SKU is already linked to a product.",
  seller_already_linked_to_product: "This seller is already linked to that product.",
  source_name_unnormalizable:
    "The seller's product name has no comparable form, so no product can be created from it.",
  invalid_request: "The request was not valid. Reload the page and try again.",
  no_candidate: "This review has no candidate product. Link it to a product id instead.",
};

export interface EmptyQueueCopy {
  readonly title: string;
  readonly description: string;
}

export const REVIEW_EMPTY_STATES: Record<ReviewStatus, EmptyQueueCopy> = {
  PENDING: {
    title: "No pending reviews",
    description:
      "Every seller entry is linked or resolved. Run consolidate to queue new entries the matcher cannot place with certainty.",
  },
  LINKED: {
    title: "No linked reviews",
    description: "Reviews resolved by linking the seller entry to a catalog product are listed here.",
  },
  CREATED: {
    title: "No reviews created a product",
    description: "Reviews resolved by creating a new catalog product are listed here.",
  },
  REJECTED: {
    title: "No rejected reviews",
    description: "Reviews closed without linking or creating a product are listed here.",
  },
};

/** What the queue page announces after a resolution: the outcome, or why the API refused it. */
export type ReviewNotice =
  | { readonly kind: "success"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

export function reviewNotice(
  params: Pick<ReviewSearchParams, "notice" | "error" | "reviewId" | "productId">,
): ReviewNotice | null {
  // The action never sets both; a hand-edited URL that does gets the refusal, the safer reading.
  if (params.error !== null) {
    return { kind: "error", text: REVIEW_ERROR_MESSAGES[params.error] };
  }
  if (params.notice === null || params.reviewId === null) {
    return null;
  }
  return {
    kind: "success",
    text: noticeMessage({ status: params.notice, reviewId: params.reviewId, productId: params.productId }),
  };
}

function noticeMessage(args: {
  readonly status: NoticeStatus;
  readonly reviewId: number;
  readonly productId: number | null;
}): string {
  const review = `Review ${String(args.reviewId)}`;
  // A hand-edited URL can drop `product`; the sentence then omits it rather than inventing one.
  const product = args.productId === null ? "a product" : `product ${String(args.productId)}`;
  switch (args.status) {
    case "LINKED":
      return `${review} linked to ${product}.`;
    case "CREATED":
      return `${review} created ${product}.`;
    case "REJECTED":
      return `${review} rejected.`;
  }
}
