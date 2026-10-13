// The catalog read model the web used to own. The caller owns the connection (open, read-only
// pragma, schema check, close), so these queries never decide connection lifetime or write mode.
import { Injectable } from "@nestjs/common";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { REVIEW_PAGE_MAX_LIMIT, type ReviewRecord } from "@catalog/domain";
import { NormalizationService } from "@catalog/rules";
import {
  catalogProductToCandidate,
  toCandidateProduct,
  toProductDetail,
  toProductListRow,
  toSellerLinkListRow,
  toSellerLinkRow,
  toSellerRow,
  type CandidateProduct,
  type ProductDetail,
  type ProductPage,
  type ReviewView,
  type SellerLinkListPage,
  type SellerLinkPage,
  type SellerRow,
  type SummaryCounts,
} from "./catalog-read-model-rows.js";
import {
  PRODUCT_PAGE_MAX_OFFSET,
  isKeysetOrder,
  isProductSortField,
  isSortOrder,
  type ProductSortField,
  type SortOrder,
} from "./product-sort.js";
import { SqliteCatalogRepository } from "./sqlite-catalog-repository.js";
import { asRow, bindOptionalText, readInteger } from "./sqlite-connection.js";

const COUNT_COLUMN = "COUNT(*)";
const SELLER_LINKS_SHOWN = 100;

const COUNT_PRODUCTS = "SELECT COUNT(*) FROM Product";
const COUNT_SELLER_LINKS = "SELECT COUNT(*) FROM SellerProduct";
const COUNT_PENDING_REVIEWS = "SELECT COUNT(*) FROM ProductMatchReview WHERE Status = 'PENDING'";

const SELECT_PRODUCT_PAGE_COLUMNS =
  "SELECT p.Id, p.Name, p.Brand, p.Category,\n" +
  "       (SELECT json_group_array(n.Name) FROM (SELECT s.Name FROM SellerProduct sp\n" +
  "         JOIN Seller s ON s.Id = sp.SellerId WHERE sp.ProductId = p.Id ORDER BY s.Name) n) AS SellerNames\n" +
  "FROM Product p\n";
// Same Seller join as SellerNames, so a product's SellerCount always equals the names it lists.
const JOIN_SELLER_SORT_KEYS =
  "LEFT JOIN (SELECT sp.ProductId, MIN(s.Name) AS FirstSellerName, COUNT(*) AS SellerCount\n" +
  "  FROM SellerProduct sp JOIN Seller s ON s.Id = sp.SellerId GROUP BY sp.ProductId) k ON k.ProductId = p.Id\n";
// The doubled backslash is JavaScript escaping: SQLite receives ESCAPE '\'.
const PRODUCT_PAGE_FILTER = "WHERE p.Id > ? AND (? IS NULL OR p.NormalizedName LIKE ? ESCAPE '\\')\n";
const PRODUCT_PAGE_WINDOW = " LIMIT ? OFFSET ?";

const SQL_DIRECTIONS: Readonly<Record<SortOrder, string>> = { asc: "ASC", desc: "DESC" };

interface ProductOrdering {
  readonly joinsSellerKeys: boolean;
  readonly orderBy: (direction: string) => string;
}

// The only ORDER BY text that ever reaches SQL. `x IS NULL` is 0 for values, so NULLs sort last in
// both directions; p.Id breaks ties so consecutive offset pages never overlap or skip a row.
const PRODUCT_ORDERINGS: Readonly<Record<ProductSortField, ProductOrdering>> = {
  id: { joinsSellerKeys: false, orderBy: (direction) => `p.Id ${direction}` },
  // Product.Name is NOT NULL, so it needs no NULL placement.
  name: { joinsSellerKeys: false, orderBy: (direction) => `p.Name COLLATE NOCASE ${direction}, p.Id ASC` },
  brand: { joinsSellerKeys: false, orderBy: (direction) => nullsLastNoCase("p.Brand", direction) },
  category: { joinsSellerKeys: false, orderBy: (direction) => nullsLastNoCase("p.Category", direction) },
  sellers: {
    joinsSellerKeys: true,
    orderBy: (direction) => `k.FirstSellerName IS NULL, k.FirstSellerName ${direction}, p.Id ASC`,
  },
  sellerCount: { joinsSellerKeys: true, orderBy: (direction) => `COALESCE(k.SellerCount, 0) ${direction}, p.Id ASC` },
};

const SELECT_PRODUCT = "SELECT Id, Name, Brand, Category, NormalizedName, NormalizedBrand FROM Product WHERE Id = ?";

const SELECT_SELLER_LINKS =
  "SELECT sp.Id, s.Name AS SellerName, sp.SellerProductId, sp.MatchType\n" +
  "FROM SellerProduct sp JOIN Seller s ON s.Id = sp.SellerId WHERE sp.ProductId = ? ORDER BY sp.Id LIMIT 101";

const SELECT_SELLERS = "SELECT Id, Name FROM Seller ORDER BY Name COLLATE NOCASE, Id";

const SELECT_SELLER_LINK_PAGE =
  "SELECT sp.Id, sp.ProductId, p.Name AS ProductName, s.Name AS SellerName, sp.SellerProductId, sp.MatchType\n" +
  "FROM SellerProduct sp JOIN Seller s ON s.Id = sp.SellerId JOIN Product p ON p.Id = sp.ProductId\n" +
  "WHERE sp.Id > ? ORDER BY sp.Id LIMIT ?";

const SELECT_CANDIDATE = "SELECT Id, Name, Brand, Category FROM Product WHERE Id = ?";

const LIKE_SPECIAL_CHARACTERS = /[%_\\]/g;

export interface ReadModelConnectionArgs {
  readonly connection: DatabaseSync;
}

export interface ListProductsArgs extends ReadModelConnectionArgs {
  readonly afterId: number;
  readonly limit: number;
  readonly query: string | null;
  readonly sort: ProductSortField;
  readonly order: SortOrder;
  readonly offset: number;
}

export interface ListSellerLinkPageArgs extends ReadModelConnectionArgs {
  readonly afterId: number;
  readonly limit: number;
}

export interface ProductLookupArgs extends ReadModelConnectionArgs {
  readonly productId: number;
}

export interface ReviewViewsArgs extends ReadModelConnectionArgs {
  readonly records: readonly ReviewRecord[];
}

// Stateless: SQLite errors propagate unwrapped so the caller's error mapping sees them as-is.
@Injectable()
export class CatalogReadModel {
  constructor(private readonly normalization: NormalizationService) {}

  summary(args: ReadModelConnectionArgs): SummaryCounts {
    return {
      products: readCount(args.connection, COUNT_PRODUCTS),
      sellerLinks: readCount(args.connection, COUNT_SELLER_LINKS),
      pendingReviews: readCount(args.connection, COUNT_PENDING_REVIEWS),
    };
  }

  listProducts(args: ListProductsArgs): ProductPage {
    requirePageBounds(args);
    requireProductOrdering(args);
    const normalizedQuery = args.query === null ? null : this.normalization.normalize(args.query);
    const pattern = normalizedQuery === null ? null : `%${escapeLike(normalizedQuery)}%`;
    const rows = args.connection
      .prepare(productPageSql(args))
      // One look-ahead row tells whether a next page exists without a COUNT query.
      .all(args.afterId, bindOptionalText(pattern), bindOptionalText(pattern), args.limit + 1, args.offset)
      .map((value) => toProductListRow(asRow(value)));
    const page = rows.slice(0, args.limit);
    const last = page.at(-1);
    const hasMore = rows.length > args.limit;
    return {
      rows: page,
      nextAfterId: hasMore && isKeysetOrder(args) && last !== undefined ? last.id : null,
      nextOffset: hasMore ? args.offset + page.length : null,
    };
  }

  /** Every seller link across the catalog, keyset paged by link id. */
  listSellerLinkPage(args: ListSellerLinkPageArgs): SellerLinkListPage {
    requirePageBounds(args);
    const rows = args.connection
      .prepare(SELECT_SELLER_LINK_PAGE)
      .all(args.afterId, args.limit + 1)
      .map((value) => toSellerLinkListRow(asRow(value)));
    const page = rows.slice(0, args.limit);
    const last = page.at(-1);
    return { rows: page, nextAfterId: rows.length > args.limit && last !== undefined ? last.id : null };
  }

  getProduct(args: ProductLookupArgs): ProductDetail | null {
    const value = args.connection.prepare(SELECT_PRODUCT).get(args.productId);
    return value === undefined ? null : toProductDetail(asRow(value));
  }

  /** Every registered seller, by name: the pick list for linking sellers to a product. */
  listSellers(args: ReadModelConnectionArgs): readonly SellerRow[] {
    return args.connection
      .prepare(SELECT_SELLERS)
      .all()
      .map((value) => toSellerRow(asRow(value)));
  }

  listSellerLinks(args: ProductLookupArgs): SellerLinkPage {
    const rows = args.connection
      .prepare(SELECT_SELLER_LINKS)
      .all(args.productId)
      .map((value) => toSellerLinkRow(asRow(value)));
    return { rows: rows.slice(0, SELLER_LINKS_SHOWN), hasMore: rows.length > SELLER_LINKS_SHOWN };
  }

  reviewViews(args: ReviewViewsArgs): ReviewView[] {
    const catalog = new SqliteCatalogRepository({ connection: args.connection });
    const selectCandidate = args.connection.prepare(SELECT_CANDIDATE);
    // Bounded by the review page size (at most REVIEW_PAGE_MAX_LIMIT records).
    return args.records.map(
      (record): ReviewView => ({
        record,
        candidate: readCandidate(selectCandidate, record.item.candidateProductId),
        liveCandidates: this.readLiveCandidates(catalog, record),
      }),
    );
  }

  private readLiveCandidates(catalog: SqliteCatalogRepository, record: ReviewRecord): readonly CandidateProduct[] {
    if (record.item.status !== "PENDING" || record.item.reason !== "AMBIGUOUS") {
      return [];
    }
    const normalizedName = this.normalization.normalize(record.sourceName);
    if (normalizedName === null) {
      return [];
    }
    return catalog
      .findByNormalizedName({ normalizedName, normalizedBrand: this.normalization.normalize(record.sourceBrand) })
      .map(catalogProductToCandidate);
  }
}

function readCandidate(selectCandidate: StatementSync, productId: number | null): CandidateProduct | null {
  if (productId === null) {
    return null;
  }
  const value = selectCandidate.get(productId);
  return value === undefined ? null : toCandidateProduct(asRow(value));
}

function requirePageBounds(args: { afterId: number; limit: number }): void {
  if (!(Number.isSafeInteger(args.afterId) && args.afterId >= 0)) {
    throw new RangeError(`afterId must be a non-negative integer, got ${String(args.afterId)}`);
  }
  if (!(Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= REVIEW_PAGE_MAX_LIMIT)) {
    throw new RangeError(`limit must be between 1 and ${String(REVIEW_PAGE_MAX_LIMIT)}, got ${String(args.limit)}`);
  }
}

// Callers validate first; this guards the read model's own invariants, and a sort value outside the
// vocabulary must never be looked up, let alone reach SQL.
function requireProductOrdering(args: {
  readonly afterId: number;
  readonly sort: unknown;
  readonly order: unknown;
  readonly offset: number;
}): void {
  const { afterId, sort, order, offset } = args;
  if (!isProductSortField(sort) || !isSortOrder(order)) {
    throw new RangeError("sort and order must come from the product sort vocabulary");
  }
  if (!(Number.isSafeInteger(offset) && offset >= 0 && offset <= PRODUCT_PAGE_MAX_OFFSET)) {
    throw new RangeError(`offset must be between 0 and ${String(PRODUCT_PAGE_MAX_OFFSET)}, got ${String(offset)}`);
  }
  if (afterId > 0 && !(isKeysetOrder({ sort, order }) && offset === 0)) {
    throw new RangeError("afterId is an id keyset cursor: only valid for sort id ascending without an offset");
  }
}

function productPageSql(args: { readonly sort: ProductSortField; readonly order: SortOrder }): string {
  const ordering = PRODUCT_ORDERINGS[args.sort];
  const join = ordering.joinsSellerKeys ? JOIN_SELLER_SORT_KEYS : "";
  const orderBy = `ORDER BY ${ordering.orderBy(SQL_DIRECTIONS[args.order])}`;
  return SELECT_PRODUCT_PAGE_COLUMNS + join + PRODUCT_PAGE_FILTER + orderBy + PRODUCT_PAGE_WINDOW;
}

function nullsLastNoCase(column: string, direction: string): string {
  return `${column} IS NULL, ${column} COLLATE NOCASE ${direction}, p.Id ASC`;
}

// Normalized text is [0-9a-z ] only, so this is defensive: the rule is "always escape".
function escapeLike(text: string): string {
  return text.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`);
}

function readCount(connection: DatabaseSync, sql: string): number {
  return readInteger(asRow(connection.prepare(sql).get()), COUNT_COLUMN);
}
