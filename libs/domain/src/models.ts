// Fixed order used by the stdout summary and by every count table.
export const OUTCOME_CODES = [
  "LINKED_EXACT",
  "LINKED_NORMALIZED",
  "CREATED",
  "UNCHANGED",
  "SKIPPED_DUPLICATE_LISTING",
  "HELD_FOR_REVIEW",
  "REJECTED_INVALID",
  "CONFLICT_SELLER_SKU",
] as const;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];

// REVIEWED = human-confirmed via `review resolve --link`.
export const MATCH_TYPES = ["EXACT", "NORMALIZED", "CREATED", "REVIEWED"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const REVIEW_REASONS = ["FUZZY", "AMBIGUOUS"] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_STATUSES = ["PENDING", "LINKED", "CREATED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const WARNING_CODES = [
  "non_uuid_seller_sku",
  "unknown_fields_ignored",
  "blank_brand_treated_as_null",
  "blank_category_treated_as_null",
  "ambiguous_candidates",
  "review_previously_rejected",
  "brand_unverified_null",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export const VIOLATION_CODES = [
  "not_an_object",
  "missing",
  "not_a_string",
  "blank",
  "too_long",
  "invalid_charset",
  "unnormalizable",
] as const;
export type ViolationCode = (typeof VIOLATION_CODES)[number];

export const FIELD_NAMES = ["record", "Id", "SellerName", "Name", "Brand", "Category"] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export interface FieldViolation {
  readonly field: FieldName;
  readonly code: ViolationCode;
}

/** A record that passed boundary validation. */
export interface SellerEntry {
  readonly kind: "entry";
  readonly index: number;
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly warnings: readonly WarningCode[];
}

/** A record that failed boundary validation; reported, never written. */
export interface RejectedEntry {
  readonly kind: "rejected";
  readonly index: number;
  readonly sellerName: string | null;
  readonly sellerProductId: string | null;
  readonly violations: readonly FieldViolation[];
  readonly warnings: readonly WarningCode[];
}

export type InputEntry = SellerEntry | RejectedEntry;

export interface CatalogProduct {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly normalizedName: string | null;
  readonly normalizedBrand: string | null;
}

export interface FuzzyCandidate {
  readonly productId: number;
  readonly normalizedName: string;
}

export interface MatchQuery {
  readonly rawName: string;
  readonly normalizedName: string;
  readonly normalizedBrand: string | null;
}

// How the brand took part in an exact-key link, judged on the normalized brands the matcher
// compares: a NULL brand is compatible with any brand, so one NULL side leaves identity unconfirmed.
export type BrandCheck = "matched" | "both_null" | "one_side_null";

export interface LinkDecision {
  readonly kind: "link";
  readonly productId: number;
  readonly matchType: "EXACT" | "NORMALIZED";
  readonly brandCheck: BrandCheck;
}

export interface HoldDecision {
  readonly kind: "hold";
  readonly reason: ReviewReason;
  readonly candidateProductId: number | null;
  readonly score: number | null;
  readonly candidateProductIds: readonly number[];
}

export interface CreateDecision {
  readonly kind: "create";
  readonly bestScore: number | null;
}

export type MatchDecision = LinkDecision | HoldDecision | CreateDecision;

export interface SellerLink {
  readonly id: number;
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly productId: number;
  readonly matchType: MatchType;
}

export interface NewSellerLink {
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly productId: number;
  readonly sourceName: string;
  readonly sourceBrand: string | null;
  readonly sourceCategory: string | null;
  readonly matchType: MatchType;
}

export interface NewProduct {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly normalizedName: string;
  readonly normalizedBrand: string | null;
}

export interface ReviewItem {
  readonly id: number;
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly candidateProductId: number | null;
  readonly score: number | null;
  readonly reason: ReviewReason;
  readonly status: ReviewStatus;
}

export interface NewReviewItem {
  readonly sellerName: string;
  readonly sellerProductId: string;
  readonly sourceName: string;
  readonly sourceBrand: string | null;
  readonly sourceCategory: string | null;
  readonly candidateProductId: number | null;
  readonly score: number | null;
  readonly reason: ReviewReason;
}

export interface ProductKeySource {
  readonly productId: number;
  readonly name: string;
  readonly brand: string | null;
}

/** A queue row with the seller's original values, as a reviewer needs them. */
export interface ReviewRecord {
  readonly item: ReviewItem;
  readonly sourceName: string;
  readonly sourceBrand: string | null;
  readonly sourceCategory: string | null;
}

export interface EntryOutcome {
  readonly index: number;
  readonly sellerName: string | null;
  readonly sellerProductId: string | null;
  readonly outcome: OutcomeCode;
  readonly productId: number | null;
  readonly reviewReason: ReviewReason | null;
  // Unrounded; the report writer rounds.
  readonly score: number | null;
  readonly warnings: readonly WarningCode[];
  // "<code>:<field>", e.g. "too_long:Name"; empty unless REJECTED_INVALID.
  readonly errors: readonly string[];
}

export interface RunSummary {
  readonly runId: string;
  readonly inputLabel: string;
  readonly total: number;
  // Every code in OUTCOME_CODES order, zeros included.
  readonly counts: readonly (readonly [OutcomeCode, number])[];
  readonly rowsWritten: number;
  readonly dryRun: boolean;
  readonly committed: boolean;
}

export interface ConsolidationResult {
  readonly outcomes: readonly EntryOutcome[];
  readonly summary: RunSummary;
}

export type ResolveCommand =
  | { readonly kind: "create"; readonly reviewId: number }
  | { readonly kind: "reject"; readonly reviewId: number }
  | { readonly kind: "link"; readonly reviewId: number; readonly productId: number };

export interface ResolutionResult {
  readonly reviewId: number;
  readonly status: ReviewStatus;
  // The product the seller is now linked to; null on reject.
  readonly productId: number | null;
  // The new SellerProduct row; null on reject.
  readonly linkId: number | null;
}

export interface ReviewPage {
  readonly records: readonly ReviewRecord[];
  // Set when more rows exist past this page.
  readonly nextAfterId: number | null;
}

export function isSellerEntry(entry: InputEntry): entry is SellerEntry {
  return entry.kind === "entry";
}

export function isRejectedEntry(entry: InputEntry): entry is RejectedEntry {
  return entry.kind === "rejected";
}

export function isLinkDecision(decision: MatchDecision): decision is LinkDecision {
  return decision.kind === "link";
}

export function isHoldDecision(decision: MatchDecision): decision is HoldDecision {
  return decision.kind === "hold";
}

export function isCreateDecision(decision: MatchDecision): decision is CreateDecision {
  return decision.kind === "create";
}

function isMemberOf<T extends string>(vocabulary: readonly T[], value: unknown): value is T {
  return vocabulary.some((member) => member === value);
}

export function isMatchType(value: unknown): value is MatchType {
  return isMemberOf(MATCH_TYPES, value);
}

export function isReviewReason(value: unknown): value is ReviewReason {
  return isMemberOf(REVIEW_REASONS, value);
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return isMemberOf(REVIEW_STATUSES, value);
}

export function isOutcomeCode(value: unknown): value is OutcomeCode {
  return isMemberOf(OUTCOME_CODES, value);
}
