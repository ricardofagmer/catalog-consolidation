import type { components } from "./generated/schema.js";

// Aliases are derived by schema name so a renamed or removed DTO fails compilation here instead of
// silently widening a consumer's type.
type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];

export type Summary = Schema<"SummaryDto">;
export type ProductPage = Schema<"ProductPageDto">;
export type ProductListItem = Schema<"ProductListItemDto">;
export type ProductSortField = Schema<"ProductSortField">;
export type SortOrder = Schema<"SortOrder">;
export type SellerLinkListItem = Schema<"SellerLinkListItemDto">;
export type SellerLinkListPage = Schema<"SellerLinkListPageDto">;
export type ProductDetail = Schema<"ProductDetailDto">;
export type SellerOffer = Schema<"SellerOfferDto">;
export type SellerOfferPage = Schema<"SellerOfferPageDto">;
export type SellerLinkRequest = Schema<"SellerLinkRequestDto">;
export type SellerList = Schema<"SellerListDto">;
export type Seller = Schema<"SellerDto">;
export type ReviewPage = Schema<"ReviewPageDto">;
export type ReviewItem = Schema<"ReviewItemDto">;
export type CandidateProduct = Schema<"CandidateProductDto">;
export type ResolutionRequest = Schema<"ResolveReviewRequestDto">;
export type ResolutionResponse = Schema<"ResolutionResponseDto">;
export type ErrorBody = Schema<"ErrorBodyDto">;
export type HealthStatus = Schema<"HealthStatusDto">;
export type ApiErrorCode = Schema<"ApiErrorCode">;
export type ReviewStatus = Schema<"ReviewStatus">;
export type ReviewReason = Schema<"ReviewReason">;
export type MatchType = Schema<"MatchType">;
export type ResolutionAction = Schema<"ResolutionAction">;
export type ResolvedReviewStatus = Schema<"ResolvedReviewStatus">;
