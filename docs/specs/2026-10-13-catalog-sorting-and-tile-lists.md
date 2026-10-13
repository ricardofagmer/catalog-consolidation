# Catalog sorting, seller-count column and clickable summary tiles

Status: accepted (2026-10-13) | Risk: medium (additive internal API contract) | Contract revision: r1

## Problem

The catalog table is fixed in product-id order, its headers are inert, and the three summary tiles
(Products, Seller links, Pending reviews) are numbers with nowhere to go. Users want the catalog
ordered by name by default, sortable by any column, and each tile to open the list it counts.

## Decisions (user, 2026-10-13)

- Sorting is server-side over the whole catalog; the web default is Name ascending.
- The Sellers column sorts by the first linked seller name (alphabetical).
- No quantity exists in the data (`Product` table and `data/ProductEntry.json` carry none), so a
  numeric "Sellers #" column (count of linked sellers) is shown instead.
- Tiles open dedicated pages: Products -> the catalog table (`/#products`), Seller links -> a new
  `/seller-links` page, Pending reviews -> `/reviews?status=PENDING`.

Rejected alternative: composite keyset cursor `(sortValue, id)` as an opaque string. It would change
`nextCursor` from integer to string (breaking v1) and nullable sort keys complicate the predicate.
Offset paging over a ~1k-row SQLite catalog is cheap, so non-id sorts page by `offset` and the
existing id keyset stays intact for current API consumers.

## Frozen contract r1 (owner: backend-coordinator)

### GET /v1/products — additive

New optional query params:

| Param | Type | Default | Notes |
|---|---|---|---|
| `sort` | enum `ProductSortField`: `id` `name` `brand` `category` `sellers` `sellerCount` | `id` | allowlisted; mapped to fixed SQL fragments, never interpolated from input |
| `order` | enum `SortOrder`: `asc` `desc` | `asc` | |
| `offset` | integer, 0..1000000 | `0` | rows to skip before the page |

- `after > 0` is valid only with `sort=id&order=asc`; `after > 0` together with `offset > 0` is
  invalid. Both violations answer 400 `invalid_request` (existing problem shape).
- Sort semantics: `name`/`brand`/`category` case-insensitive (`COLLATE NOCASE`); NULL values last in
  both directions; `sellers` = first seller name in name order (`MIN(s.Name)`), products without
  sellers last; `sellerCount` = number of SellerProduct rows; every sort ties by `p.Id ASC`.
- Response `ProductPageDto` gains `nextOffset: integer | null` = `offset + items.length` when more rows
  exist, else null. `nextCursor` keeps its meaning (last id when more rows exist) only for
  `sort=id&order=asc`; for other sorts it is null.
- `ProductListItemDto` is unchanged; the web derives the seller count from `sellerNames.length`.

### GET /v1/seller-links — new

Query: `after` (integer >= 0, default 0, keyset on SellerProduct.Id), `limit` (same bounds/defaults
as `/v1/products`). Problems: 400, 421, 500, 503.

`SellerLinkListPageDto { items: SellerLinkListItemDto[]; nextCursor: integer | null }`, items in
ascending link id order.

`SellerLinkListItemDto { id: integer; productId: integer; productName: string; sellerName: string;
sellerProductId: string; matchType: MatchType }`.

### @catalog/api-client aliases

`ProductSortField`, `SortOrder`, `SellerLinkListItem`, `SellerLinkListPage` exported from
`libs/api-client/src/schemas.ts` and `index.ts` (`Schema<"...">` aliases; generated schema refreshed by
`nx run api-client:generate` at the final gate).

## Web behaviour

- Catalog URL params: `q`, `limit`, `sort` (default `name`), `order` (default `asc`), `offset`
  (default 0). Invalid values fall back to defaults. Catalog paging uses `offset`.
- Every column header is a link: clicking the active column toggles order, another column starts
  `asc`; the link keeps `q`/`limit` and drops `offset`. `aria-sort` on the active `<th>`.
- New "Sellers #" numeric column (`sellerCount` sort).
- Tiles are links (stretched link inside `<dt>`; the count stays the only child of `<dd>` because the
  verification scrapes it), keyboard-focusable with a visible focus ring.
- `/seller-links`: paginated table (link id, product -> `/products/:id`, seller, seller SKU, match type)
  with loading, empty and error states.

## Tickets

| Id | Deliverable | Exclusive paths | Prereq | Owner |
|---|---|---|---|---|
| T1 | Sorted/offset product page + seller-link list in the read model and API; client aliases | `libs/persistence/src/**`, `apps/api/src/catalog/**`, `libs/api-client/src/schemas.ts`, `libs/api-client/src/index.ts` | contract r1 | backend-coordinator |
| T2 | Sortable table, Sellers # column, tile links, `/seller-links` page | `apps/web/src/**` | contract r1 | frontend-coordinator |
| T3 | Final proof: api-client generate, typecheck, lint, build, golden check | — | T1, T2 integrated + user consent | supervisor |

## Acceptance criteria

1. `/` lists products by name ascending; header clicks re-sort the whole catalog across pages.
2. `GET /v1/products` without new params answers exactly as before (id keyset).
3. Seller links tile opens `/seller-links` listing all 257 links across pages.
4. Pending reviews tile opens the pending review queue; Products tile lands on the table.
5. "Sellers #" equals the number of names in the Sellers cell.
