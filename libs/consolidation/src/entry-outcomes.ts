import type {
  EntryOutcome,
  MatchType,
  NewSellerLink,
  OutcomeCode,
  RejectedEntry,
  ReviewItem,
  ReviewReason,
  SellerEntry,
  WarningCode,
} from "@catalog/domain";

export function newLink(args: { entry: SellerEntry; productId: number; matchType: MatchType }): NewSellerLink {
  return {
    sellerName: args.entry.sellerName,
    sellerProductId: args.entry.sellerProductId,
    productId: args.productId,
    matchType: args.matchType,
  };
}

export function pendingReviewOutcome(args: { entry: SellerEntry; review: ReviewItem }): EntryOutcome {
  const { entry, review } = args;
  const extraWarnings: readonly WarningCode[] = review.status === "REJECTED" ? ["review_previously_rejected"] : [];
  return outcomeFor(entry, {
    outcome: "HELD_FOR_REVIEW",
    productId: review.candidateProductId,
    reviewReason: review.reason,
    score: review.score,
    extraWarnings,
  });
}

export function rejectedOutcome(entry: RejectedEntry): EntryOutcome {
  return {
    index: entry.index,
    sellerName: entry.sellerName,
    sellerProductId: entry.sellerProductId,
    outcome: "REJECTED_INVALID",
    productId: null,
    reviewReason: null,
    score: null,
    warnings: entry.warnings,
    errors: entry.violations.map((violation) => `${violation.code}:${violation.field}`),
  };
}

interface OutcomeFields {
  readonly outcome: OutcomeCode;
  readonly productId?: number | null;
  readonly reviewReason?: ReviewReason | null;
  readonly score?: number | null;
  readonly extraWarnings?: readonly WarningCode[];
  readonly errors?: readonly string[];
}

export function outcomeFor(entry: SellerEntry, fields: OutcomeFields): EntryOutcome {
  return {
    index: entry.index,
    sellerName: entry.sellerName,
    sellerProductId: entry.sellerProductId,
    outcome: fields.outcome,
    productId: fields.productId ?? null,
    reviewReason: fields.reviewReason ?? null,
    score: fields.score ?? null,
    warnings: [...entry.warnings, ...(fields.extraWarnings ?? [])],
    errors: fields.errors ?? [],
  };
}
