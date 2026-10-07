// Page-facing catalog operations, all answered by the API. Matching, normalization and scoring live
// there; this module only sends requests and decides which failures a page has a designed state for.
import "server-only";
import type {
  ProductDetail,
  ProductPage,
  ResolutionRequest,
  ResolutionResponse,
  ReviewPage,
  ReviewStatus,
  Summary,
} from "@catalog/api-client";
import { failApiRequest, sendApiRequest, type ApiFailure } from "./api-transport";
import { isReviewErrorCode, type ReviewErrorCode } from "./search-params";

const NOT_FOUND_STATUS = 404;
const BAD_REQUEST_STATUS = 400;

export type ReviewResolutionOutcome =
  | { readonly kind: "resolved"; readonly result: ResolutionResponse }
  | { readonly kind: "rejected"; readonly code: ReviewErrorCode };

export async function getSummary(): Promise<Summary> {
  const operation = "summary";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/summary", { headers }),
  });
  return outcome.kind === "ok" ? outcome.data : failApiRequest({ operation, failure: outcome.failure });
}

export async function listProducts(args: {
  readonly afterId: number;
  readonly limit: number | null;
  readonly query: string | null;
}): Promise<ProductPage> {
  const operation = "products.list";
  const query = {
    after: args.afterId,
    ...(args.limit === null ? {} : { limit: args.limit }),
    ...(args.query === null ? {} : { q: args.query }),
  };
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/products", { headers, params: { query } }),
  });
  return outcome.kind === "ok" ? outcome.data : failApiRequest({ operation, failure: outcome.failure });
}

/** Null when the API says the id names no product, so the route answers a real 404. */
export async function findProductWithOffers(args: { readonly productId: number }): Promise<ProductDetail | null> {
  const operation = "products.get";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) =>
      client.GET("/v1/products/{id}", { headers, params: { path: { id: args.productId } } }),
  });
  if (outcome.kind === "ok") {
    return outcome.data;
  }
  return isUnknownProduct(outcome.failure) ? null : failApiRequest({ operation, failure: outcome.failure });
}

export async function listReviews(args: {
  readonly status: ReviewStatus;
  readonly afterId: number;
  readonly limit: number | null;
}): Promise<ReviewPage> {
  const operation = "reviews.list";
  const query = {
    status: args.status,
    after: args.afterId,
    ...(args.limit === null ? {} : { limit: args.limit }),
  };
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/reviews", { headers, params: { query } }),
  });
  return outcome.kind === "ok" ? outcome.data : failApiRequest({ operation, failure: outcome.failure });
}

/**
 * A closed set of expected refusals (already resolved, link conflicts, no candidate, ...) comes back
 * as a code for the form notice; a busy or missing database and every other failure throws.
 */
export async function resolveReview(args: {
  readonly reviewId: number;
  readonly request: ResolutionRequest;
}): Promise<ReviewResolutionOutcome> {
  const operation = "reviews.resolve";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) =>
      client.POST("/v1/reviews/{id}/resolution", {
        headers,
        params: { path: { id: args.reviewId } },
        body: args.request,
      }),
  });
  if (outcome.kind === "ok") {
    return { kind: "resolved", result: outcome.data };
  }
  const { code } = outcome.failure;
  return isReviewErrorCode(code) ? { kind: "rejected", code } : failApiRequest({ operation, failure: outcome.failure });
}

// The web already refuses non-integer ids before calling; invalid_request still covers ids the API
// bounds differently, so either answer is "no such product" rather than an error page.
function isUnknownProduct(failure: ApiFailure): boolean {
  return (
    (failure.statusCode === NOT_FOUND_STATUS && failure.code === "product_not_found") ||
    (failure.statusCode === BAD_REQUEST_STATUS && failure.code === "invalid_request")
  );
}
