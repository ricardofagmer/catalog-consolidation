// src/generated/ is openapi-typescript output from apps/api's OpenAPI document (nx run
// api-client:generate); it is git-ignored and must never be edited by hand.
export type { components, operations, paths } from "./generated/schema.js";
export { createApiClient, type ApiClient, type ApiClientOptions } from "./client.js";
export type {
  ApiErrorCode,
  CandidateProduct,
  ErrorBody,
  HealthStatus,
  MatchType,
  ProductDetail,
  ProductListItem,
  ProductPage,
  ProductSortField,
  ResolutionAction,
  ResolutionRequest,
  ResolutionResponse,
  ResolvedReviewStatus,
  ReviewItem,
  ReviewPage,
  ReviewReason,
  ReviewStatus,
  Seller,
  SellerLinkListItem,
  SellerLinkListPage,
  SellerLinkRequest,
  SellerList,
  SellerOffer,
  SellerOfferPage,
  SortOrder,
  Summary,
} from "./schemas.js";
