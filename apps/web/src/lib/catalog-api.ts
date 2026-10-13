// Page-facing catalog operations, all answered by the API. Matching, normalization and scoring live
// there; this module only sends requests and decides which failures a page has a designed state for.
import "server-only";
import type {
  ProductDetail,
  ProductPage,
  ProductSortField,
  ResolutionRequest,
  ResolutionResponse,
  ReviewPage,
  ReviewStatus,
  SellerLinkListPage,
  SellerLinkRequest,
  SellerList,
  SortOrder,
  Summary,
} from "@catalog/api-client";
import { failApiRequest, sendApiRequest, type ApiFailure } from "./api-transport";
import { isSellerLinkErrorCode, type SellerLinkErrorCode } from "./seller-link-messages";
import { isReviewErrorCode, type ReviewErrorCode } from "./search-params";

const NOT_FOUND_STATUS = 404;
const BAD_REQUEST_STATUS = 400;
const JSON_CONTENT_TYPE = { "Content-Type": "application/json" } as const;

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

// Pages by offset, never `after`: the API accepts its id keyset only for id order, and the web lists
// by any column.
export async function listProducts(args: {
  readonly sort: ProductSortField;
  readonly order: SortOrder;
  readonly offset: number;
  readonly limit: number | null;
  readonly query: string | null;
}): Promise<ProductPage> {
  const operation = "products.list";
  const query = {
    sort: args.sort,
    order: args.order,
    offset: args.offset,
    ...(args.limit === null ? {} : { limit: args.limit }),
    ...(args.query === null ? {} : { q: args.query }),
  };
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/products", { headers, params: { query } }),
  });
  return outcome.kind === "ok" ? outcome.data : failApiRequest({ operation, failure: outcome.failure });
}

export async function listSellerLinks(args: {
  readonly afterId: number;
  readonly limit: number | null;
}): Promise<SellerLinkListPage> {
  const operation = "sellerLinks.list";
  const query = {
    after: args.afterId,
    ...(args.limit === null ? {} : { limit: args.limit }),
  };
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/seller-links", { headers, params: { query } }),
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

export type SellerLinkOutcome =
  | { readonly kind: "done" }
  | { readonly kind: "rejected"; readonly code: SellerLinkErrorCode };

/** Every registered seller, by name: the options of the add form's combobox and the edit select. */
export async function listSellers(): Promise<SellerList> {
  const operation = "sellers.list";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) => client.GET("/v1/sellers", { headers }),
  });
  return outcome.kind === "ok" ? outcome.data : failApiRequest({ operation, failure: outcome.failure });
}

/** Links every listed seller to the product in one request: all are added, or none. */
export async function addSellerLinks(args: {
  readonly productId: number;
  readonly links: readonly SellerLinkRequest[];
}): Promise<SellerLinkOutcome> {
  const operation = "sellerLinks.add";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) =>
      client.POST("/v1/products/{id}/seller-links", {
        headers,
        params: { path: { id: args.productId } },
        body: { links: [...args.links] },
      }),
  });
  return outcome.kind === "ok" ? { kind: "done" } : sellerLinkRefusal({ operation, failure: outcome.failure });
}

export async function updateSellerLink(args: {
  readonly productId: number;
  readonly linkId: number;
  readonly request: SellerLinkRequest;
}): Promise<SellerLinkOutcome> {
  const operation = "sellerLinks.update";
  const outcome = await sendApiRequest({
    operation,
    send: (client, headers) =>
      client.PUT("/v1/products/{id}/seller-links/{linkId}", {
        headers,
        params: { path: { id: args.productId, linkId: args.linkId } },
        body: args.request,
      }),
  });
  return outcome.kind === "ok" ? { kind: "done" } : sellerLinkRefusal({ operation, failure: outcome.failure });
}

export async function removeSellerLink(args: {
  readonly productId: number;
  readonly linkId: number;
}): Promise<SellerLinkOutcome> {
  const operation = "sellerLinks.remove";
  const outcome = await sendApiRequest({
    operation,
    send: async (client, headers) => {
      // The API answers 204 with no body, which sendApiRequest would read as a failure; the DELETE
      // has no body but, like every API write, must declare JSON.
      const result = await client.DELETE("/v1/products/{id}/seller-links/{linkId}", {
        headers: { ...headers, ...JSON_CONTENT_TYPE },
        params: { path: { id: args.productId, linkId: args.linkId } },
      });
      return { data: result.response.ok ? true : undefined, error: result.error, response: result.response };
    },
  });
  return outcome.kind === "ok" ? { kind: "done" } : sellerLinkRefusal({ operation, failure: outcome.failure });
}

// A closed set of expected refusals comes back as a code for the form; anything else throws.
function sellerLinkRefusal(args: { readonly operation: string; readonly failure: ApiFailure }): SellerLinkOutcome {
  const { code } = args.failure;
  return isSellerLinkErrorCode(code) ? { kind: "rejected", code } : failApiRequest(args);
}

// The web already refuses non-integer ids before calling; invalid_request still covers ids the API
// bounds differently, so either answer is "no such product" rather than an error page.
function isUnknownProduct(failure: ApiFailure): boolean {
  return (
    (failure.statusCode === NOT_FOUND_STATUS && failure.code === "product_not_found") ||
    (failure.statusCode === BAD_REQUEST_STATUS && failure.code === "invalid_request")
  );
}
