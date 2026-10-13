// Closed sort vocabulary of the product page. Each value maps to a fixed ORDER BY fragment in the
// read model, so request text never reaches SQL.
export const PRODUCT_SORT_FIELDS = ["id", "name", "brand", "category", "sellers", "sellerCount"] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PRODUCT_SORT_FIELD: ProductSortField = "id";
export const DEFAULT_SORT_ORDER: SortOrder = "asc";

export const PRODUCT_PAGE_MAX_OFFSET = 1_000_000;

/** Only the id-ascending order is a keyset; every other order pages by offset. */
export function isKeysetOrder(args: { readonly sort: ProductSortField; readonly order: SortOrder }): boolean {
  return args.sort === DEFAULT_PRODUCT_SORT_FIELD && args.order === DEFAULT_SORT_ORDER;
}

export function isProductSortField(value: unknown): value is ProductSortField {
  return PRODUCT_SORT_FIELDS.some((field) => field === value);
}

export function isSortOrder(value: unknown): value is SortOrder {
  return SORT_ORDERS.some((order) => order === value);
}
