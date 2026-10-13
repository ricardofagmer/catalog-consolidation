// Mirrors the API's limits for the two seller-link fields so the browser can refuse early; the API
// still validates, and its answer is the one that counts.
export const SELLER_FIELD_LIMITS = { sellerName: 100, sellerProductId: 64 } as const;

// HTML `pattern` is anchored on its own and compiled with the `v` flag, so no anchors or flags here.
export const SELLER_PRODUCT_ID_PATTERN = "[A-Za-z0-9._\\-]+";

// The API's cap on links per request.
export const MAX_LINKS_PER_SUBMIT = 50;
