import "server-only";
import { cache } from "react";
import type { ProductDetail } from "@catalog/api-client";
import { findProductWithOffers } from "../../../lib/catalog-api";
import { parsePositiveInteger } from "../../../lib/search-params";

// Memoized per request: the layout checks existence and the page renders the same product, with
// one API call. A malformed id never reaches the API.
export const findProduct = cache(async (rawId: string): Promise<ProductDetail | null> => {
  const productId = parsePositiveInteger(rawId);
  return productId === null ? null : findProductWithOffers({ productId });
});
